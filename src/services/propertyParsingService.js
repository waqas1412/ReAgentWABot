const openaiService = require('./openaiService');
const dataValidationService = require('./dataValidationService');
const Property = require('../models/Property');
const User = require('../models/User');
const Country = require('../models/Country');
const City = require('../models/City');
const District = require('../models/District');
const ApartmentType = require('../models/ApartmentType');

class PropertyParsingService {
  /**
   * Process a message that potentially contains property listings
   * @param {string} from - WhatsApp number of sender
   * @param {string} message - Message content
   * @param {object} user - User object
   * @returns {Promise<string>} - Response message with rich formatting
   */
  async processPropertyListings(from, message, user) {
    try {
      console.log(`[PROPERTY_PARSING] Processing property listings for user ${from}`);
      
      // First check if the message contains property listings
      const classification = await openaiService.classifyPropertyAddition(message);
      
      if (!classification.containsProperties || classification.confidence < 0.6) {
        console.log(`[PROPERTY_PARSING] Low confidence (${classification.confidence}) or no properties detected`);
        return this.formatRichMessage("🤔 I don't see any property listings in your message. Could you please provide property details in a structured format?");
      }

      console.log(`[PROPERTY_PARSING] Properties detected with confidence ${classification.confidence}`);

      // Convert natural language to rigid database format using OpenAI
      const rigidPropertyData = await openaiService.convertToRigidFormat(message);
      
      if (rigidPropertyData.length === 0) {
        console.log(`[PROPERTY_PARSING] No property data extracted from OpenAI`);
        return this.formatRichMessage("❌ I couldn't extract property details from your message. Please try again with clearer formatting.");
      }

      console.log(`[PROPERTY_PARSING] Extracted ${rigidPropertyData.length} properties from OpenAI`);

      // Validate properties using data validation service
      const bulkValidation = dataValidationService.validateBulkProperties(rigidPropertyData);
      
      if (bulkValidation.invalidProperties.length > 0) {
        console.log(`[PROPERTY_PARSING] ${bulkValidation.invalidProperties.length} properties failed validation`);
        bulkValidation.invalidProperties.forEach((invalid, index) => {
          console.log(`[PROPERTY_PARSING] Invalid property ${index + 1}: ${invalid.errors.join(', ')}`);
        });
      }

      console.log(`[PROPERTY_PARSING] ${bulkValidation.validProperties.length} properties passed validation`);

      // Process only valid properties
      const results = [];
      for (const validProperty of bulkValidation.validProperties) {
        try {
          console.log(`[PROPERTY_PARSING] Adding property ${validProperty.index + 1} to database`);
          const result = await this.addValidatedPropertyToDatabase(validProperty.data, user);
          results.push({
            success: true,
            propertyIndex: validProperty.index + 1,
            property: result,
            warnings: validProperty.warnings
          });
          console.log(`[PROPERTY_PARSING] Successfully added property ${validProperty.index + 1}: ${result.id}`);
        } catch (error) {
          console.error(`[PROPERTY_PARSING] Error adding property ${validProperty.index + 1}:`, error);
          results.push({
            success: false,
            propertyIndex: validProperty.index + 1,
            error: error.message
          });
        }
      }

      // Add validation failures to results
      for (const invalidProperty of bulkValidation.invalidProperties) {
        results.push({
          success: false,
          propertyIndex: invalidProperty.index + 1,
          error: `Validation failed: ${invalidProperty.errors.join(', ')}`
        });
      }

      console.log(`[PROPERTY_PARSING] Processing complete. ${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`);

      const response = this.formatPropertyAdditionResponse(results);
      console.log(`[PROPERTY_PARSING] Response length: ${response.length} characters`);
      
      // Check if response is too long for WhatsApp (1600 char limit)
      if (response.length > 1600) {
        console.log(`[PROPERTY_PARSING] Response too long, chunking message`);
        return this.chunkLongResponse(response);
      }
      
      return response;
    } catch (error) {
      console.error('[PROPERTY_PARSING] Error processing property listings:', error);
      return this.formatRichMessage("❌ Sorry, I encountered an error processing your property listings. Please try again.");
    }
  }

  /**
   * Add a property using validated data (already validated and normalized)
   * @param {object} validatedData - Validated property data from validation service
   * @param {object} user - User object
   * @returns {Promise<object>} - Created property object
   */
  async addValidatedPropertyToDatabase(validatedData, user) {
    try {
      console.log(`[DB_INSERT] Adding property: ${validatedData.address}`);
      
      // Get or create location data using the validated location names
      const locationData = await this.getOrCreateLocationFromNamesWithDuplicatePrevention(
        validatedData.locationData
      );
      console.log(`[DB_INSERT] Location data:`, locationData);
      
      // Get or create apartment type if specified
      const apartmentType = validatedData.apartment_type 
        ? await this.getOrCreateApartmentTypeWithDuplicatePrevention(validatedData.apartment_type)
        : null;
      console.log(`[DB_INSERT] Apartment type:`, apartmentType);

      // Prepare database property data with proper schema mapping
      const dbPropertyData = {
        // Core validated fields
        address: validatedData.address,
        price: validatedData.price,
        bedrooms: validatedData.bedrooms,
        bathrooms: validatedData.bathrooms,
        area: validatedData.area, // Already mapped from area_sqm
        status: validatedData.status,
        description: validatedData.description,
        
        // Already mapped from external_url
        property_link: validatedData.property_link,
        
        // Contact info as structured JSON
        remarks: validatedData.contact_info || null,
        
        // Foreign key relationships
        district_id: locationData.district?.id || null,
        type_id: apartmentType?.id || null,
        owner_id: user.id
      };

      console.log(`[DB_INSERT] Final property data:`, dbPropertyData);

      // Create the property using admin client for consistent access
      Property.useAdminDb();
      const property = await Property.create(dbPropertyData);
      Property.useUserDb();

      console.log(`[DB_INSERT] Property created with ID: ${property.id}`);
      return property;
    } catch (error) {
      Property.useUserDb(); // Ensure we reset on error
      console.error(`[DB_INSERT] Failed to add property:`, error);
      throw new Error(`Failed to add property: ${error.message}`);
    }
  }

  /**
   * Add a property using rigid format data (deprecated - use addValidatedPropertyToDatabase)
   * @param {object} propertyData - Rigid format property data from OpenAI
   * @param {object} user - User object
   * @returns {Promise<object>} - Created property object
   */
  async addRigidPropertyToDatabase(propertyData, user) {
    // Validate the data first
    const validation = dataValidationService.validateAndNormalizeProperty(propertyData);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Use the new validated method
    return await this.addValidatedPropertyToDatabase(validation.data, user);
  }

  /**
   * Get or create location data using structured names with duplicate prevention
   * @param {object} locationData - Location data with normalized names
   * @returns {Promise<object>} - Location data with IDs
   */
  async getOrCreateLocationFromNamesWithDuplicatePrevention(locationData) {
    const result = {};

    try {
      // Get or create country with proper duplicate prevention
      if (locationData.country_name) {
        result.country = await this.findOrCreateCountryNoDuplicates(locationData.country_name);
      }

      // Get or create city with proper duplicate prevention
      if (locationData.city_name && result.country?.id) {
        result.city = await this.findOrCreateCityNoDuplicates(locationData.city_name, result.country.id);
      }

      // Get or create district with proper duplicate prevention
      if (locationData.district_name && result.country?.id) {
        result.district = await this.findOrCreateDistrictNoDuplicates(locationData.district_name, result.country.id);
      }

      return result;
    } catch (error) {
      console.error('[LOCATION_CREATE] Error with location data:', error);
      throw new Error(`Failed to process location data: ${error.message}`);
    }
  }

  /**
   * Get or create location data using structured names (deprecated)
   * @param {string} countryName - Country name
   * @param {string} cityName - City name
   * @param {string} districtName - District name (optional)
   * @returns {Promise<object>} - Location data with IDs
   */
  async getOrCreateLocationFromNames(countryName, cityName, districtName) {
    return await this.getOrCreateLocationFromNamesWithDuplicatePrevention({
      country_name: countryName,
      city_name: cityName,
      district_name: districtName
    });
  }



  /**
   * Find or create country with proper duplicate prevention
   * @param {string} countryName - Country name
   * @returns {Promise<object>} - Country record
   */
  async findOrCreateCountryNoDuplicates(countryName) {
    const normalizedName = this.normalizeLocationName(countryName);
    
    try {
      console.log(`[COUNTRY_CREATE] Processing: ${normalizedName}`);
      
      // First try to find existing record (case-insensitive)
      Country.useAdminDb();
      const { data: existingCountries, error: searchError } = await Country.adminDb
        .from('countries')
        .select('*')
        .ilike('country', normalizedName)
        .limit(1);
      
      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }
      
      if (existingCountries && existingCountries.length > 0) {
        console.log(`[COUNTRY_CREATE] Found existing: ${existingCountries[0].country} (ID: ${existingCountries[0].id})`);
        Country.useUserDb();
        return existingCountries[0];
      }

      // Create new record
      console.log(`[COUNTRY_CREATE] Creating new: ${normalizedName}`);
      const { data: created, error: createError } = await Country.adminDb
        .from('countries')
        .insert({ country: normalizedName })
        .select()
        .single();
      
      Country.useUserDb();
      
      if (createError) {
        // Handle duplicate key error
        if (createError.message && createError.message.includes('duplicate key')) {
          console.log(`[COUNTRY_CREATE] Duplicate key error, searching again for: ${normalizedName}`);
          return await this.findOrCreateCountryNoDuplicates(countryName);
        }
        throw createError;
      }
      
      console.log(`[COUNTRY_CREATE] Created: ${created.country} (ID: ${created.id})`);
      return created;
    } catch (error) {
      Country.useUserDb();
      console.error(`[COUNTRY_CREATE] Error with country ${normalizedName}:`, error);
      throw new Error(`Failed to find or create country: ${error.message}`);
    }
  }

  /**
   * Get or create country (using admin DB to bypass RLS) - deprecated
   */
  async getOrCreateCountry(countryName) {
    return await this.findOrCreateCountryNoDuplicates(countryName);
  }

  /**
   * Get or create city (using admin DB to bypass RLS)
   */
  async getOrCreateCity(cityName, countryId) {
    try {
      if (!countryId) return null;

      // First try to find existing with regular client
      const existing = await City.findByName(cityName, countryId);
      if (existing) return existing;

      // Create using admin client to bypass RLS
      City.useAdminDb();
      const created = await City.create({
        city: cityName,
        country_id: countryId
      });
      City.useUserDb(); // Reset to user client
      
      return created;
    } catch (error) {
      console.error('Error with city:', error);
      City.useUserDb(); // Ensure we reset on error
      return null;
    }
  }

  /**
   * Get or create district (using admin DB to bypass RLS)
   */
  async getOrCreateDistrict(districtName, countryId) {
    try {
      if (!countryId) return null;

      // First try to find existing with regular client
      const existing = await District.findByName(districtName, countryId);
      if (existing) return existing;

      // Create using admin client to bypass RLS
      District.useAdminDb();
      const created = await District.create({
        district: districtName,
        country_id: countryId
      });
      District.useUserDb(); // Reset to user client
      
      return created;
    } catch (error) {
      console.error('Error with district:', error);
      District.useUserDb(); // Ensure we reset on error
      return null;
    }
  }

  /**
   * Get or create apartment type (using admin DB to bypass RLS)
   */
  async getOrCreateApartmentType(typingDetails) {
    try {
      if (!typingDetails) return null;

      // First try to find existing with regular client
      const existing = await ApartmentType.findByType(typingDetails);
      if (existing) return existing;

      // Create using admin client to bypass RLS
      ApartmentType.useAdminDb();
      const created = await ApartmentType.create({
        type: typingDetails
        // Removed description field as it doesn't exist in schema
      });
      ApartmentType.useUserDb(); // Reset to user client
      
      return created;
    } catch (error) {
      console.error('Error with apartment type:', error);
      ApartmentType.useUserDb(); // Ensure we reset on error
      return null;
    }
  }



  /**
   * Format response for property addition results
   * @param {Array} results - Array of addition results
   * @returns {string} - Formatted response with rich text
   */
  formatPropertyAdditionResponse(results) {
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    let response = `🏠 **Property Addition Results**\n\n`;

    if (successCount > 0) {
      response += `✅ **Successfully added ${successCount} propert${successCount === 1 ? 'y' : 'ies'}:**\n\n`;
      
      results.filter(r => r.success).forEach((result, index) => {
        const property = result.property;
        response += `${index + 1}. 🏢 ${property.address}\n`;
        response += `   💰 €${property.price}\n`; // Default to EUR since currency is in remarks
        response += `   🛏️ ${property.bedrooms || 0} bed${(property.bedrooms || 0) !== 1 ? 's' : ''} • 🛁 ${property.bathrooms || 0} bath${(property.bathrooms || 0) !== 1 ? 's' : ''}\n`;
        if (property.area) {
          response += `   📐 ${property.area}m²\n`;
        }
        if (property.property_link) {
          response += `   🔗 ${property.property_link}\n`;
        }
        response += `   🆔 Database ID: ${property.id}\n\n`;
      });
    }

    if (failureCount > 0) {
      response += `❌ **Failed to add ${failureCount} propert${failureCount === 1 ? 'y' : 'ies'}:**\n\n`;
      
      results.filter(r => !r.success).forEach((result, index) => {
        response += `${index + 1}. Property ${result.propertyIndex || 'Unknown'}\n`;
        response += `   Error: ${result.error}\n\n`;
      });
    }

    response += `📊 **Summary:** ${successCount} added, ${failureCount} failed out of ${results.length} total properties\n\n`;
    response += `💡 Use "search properties" to view your listings or "my properties" to manage them.`;

    return this.formatRichMessage(response);
  }

  /**
   * Format contact information for storage in remarks field
   * @param {object} propertyData - Property data with contact info
   * @returns {string} - Formatted contact information
   */
  formatContactInfo(propertyData) {
    let contactInfo = '';
    
    if (propertyData.contact_name || propertyData.contact_phone) {
      contactInfo += 'Contact Information:\n';
      if (propertyData.contact_name) {
        contactInfo += `Name: ${propertyData.contact_name}\n`;
      }
      if (propertyData.contact_phone) {
        contactInfo += `Phone: ${propertyData.contact_phone}\n`;
      }
    }
    
    if (propertyData.currency && propertyData.currency !== 'EUR') {
      contactInfo += `Currency: ${propertyData.currency}\n`;
    }
    
    if (propertyData.listing_type && propertyData.listing_type !== 'rent') {
      contactInfo += `Listing Type: ${propertyData.listing_type}\n`;
    }
    
    return contactInfo.trim();
  }

  /**
   * Chunk long response into multiple messages for WhatsApp
   * @param {string} response - Long response message
   * @returns {string} - First chunk with indication of more messages
   */
  chunkLongResponse(response) {
    const maxLength = 1500; // Leave some buffer
    
    if (response.length <= maxLength) {
      return response;
    }

    // Try to find a good break point (after a property summary)
    const lines = response.split('\n');
    let currentChunk = '';
    let breakPoint = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (currentChunk.length + line.length + 1 > maxLength) {
        break;
      }
      currentChunk += (currentChunk ? '\n' : '') + line;
      breakPoint = i;
    }

    // Add indication that there's more
    currentChunk += '\n\n📨 *Message continues...*\nDue to length limits, this summary shows the first properties. All properties have been processed and saved to the database.';

    return this.formatRichMessage(currentChunk);
  }

  /**
   * Normalize location name for consistent storage
   * @param {string} name - Location name
   * @returns {string} - Normalized name
   */
  normalizeLocationName(name) {
    if (!name) return '';
    return name.toString().trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Find or create city with duplicate prevention
   * @param {string} cityName - City name
   * @param {string} countryId - Country ID
   * @returns {Promise<object>} - City record
   */
  async findOrCreateCityNoDuplicates(cityName, countryId) {
    const normalizedName = this.normalizeLocationName(cityName);
    
    try {
      console.log(`[CITY_CREATE] Processing: ${normalizedName} in country ${countryId}`);
      
      City.useAdminDb();
      const { data: existingCities, error: searchError } = await City.adminDb
        .from('cities')
        .select('*')
        .ilike('city', normalizedName)
        .eq('country_id', countryId)
        .limit(1);
      
      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }
      
      if (existingCities && existingCities.length > 0) {
        console.log(`[CITY_CREATE] Found existing: ${existingCities[0].city} (ID: ${existingCities[0].id})`);
        City.useUserDb();
        return existingCities[0];
      }

      console.log(`[CITY_CREATE] Creating new: ${normalizedName}`);
      const { data: created, error: createError } = await City.adminDb
        .from('cities')
        .insert({ city: normalizedName, country_id: countryId })
        .select()
        .single();
      
      City.useUserDb();
      
      if (createError) {
        if (createError.message && createError.message.includes('duplicate key')) {
          console.log(`[CITY_CREATE] Duplicate key error, searching again for: ${normalizedName}`);
          return await this.findOrCreateCityNoDuplicates(cityName, countryId);
        }
        throw createError;
      }
      
      console.log(`[CITY_CREATE] Created: ${created.city} (ID: ${created.id})`);
      return created;
    } catch (error) {
      City.useUserDb();
      console.error(`[CITY_CREATE] Error with city ${normalizedName}:`, error);
      throw new Error(`Failed to find or create city: ${error.message}`);
    }
  }

  /**
   * Find or create district with duplicate prevention
   * @param {string} districtName - District name
   * @param {string} countryId - Country ID
   * @returns {Promise<object>} - District record
   */
  async findOrCreateDistrictNoDuplicates(districtName, countryId) {
    const normalizedName = this.normalizeLocationName(districtName);
    
    try {
      console.log(`[DISTRICT_CREATE] Processing: ${normalizedName} in country ${countryId}`);
      
      District.useAdminDb();
      const { data: existingDistricts, error: searchError } = await District.adminDb
        .from('districts')
        .select('*')
        .ilike('district', normalizedName)
        .eq('country_id', countryId)
        .limit(1);
      
      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }
      
      if (existingDistricts && existingDistricts.length > 0) {
        console.log(`[DISTRICT_CREATE] Found existing: ${existingDistricts[0].district} (ID: ${existingDistricts[0].id})`);
        District.useUserDb();
        return existingDistricts[0];
      }

      console.log(`[DISTRICT_CREATE] Creating new: ${normalizedName}`);
      const { data: created, error: createError } = await District.adminDb
        .from('districts')
        .insert({ district: normalizedName, country_id: countryId })
        .select()
        .single();
      
      District.useUserDb();
      
      if (createError) {
        if (createError.message && createError.message.includes('duplicate key')) {
          console.log(`[DISTRICT_CREATE] Duplicate key error, searching again for: ${normalizedName}`);
          return await this.findOrCreateDistrictNoDuplicates(districtName, countryId);
        }
        throw createError;
      }
      
      console.log(`[DISTRICT_CREATE] Created: ${created.district} (ID: ${created.id})`);
      return created;
    } catch (error) {
      District.useUserDb();
      console.error(`[DISTRICT_CREATE] Error with district ${normalizedName}:`, error);
      throw new Error(`Failed to find or create district: ${error.message}`);
    }
  }

  /**
   * Find or create apartment type with duplicate prevention
   * @param {string} typeName - Apartment type name
   * @returns {Promise<object>} - Apartment type record
   */
  async findOrCreateApartmentTypeWithDuplicatePrevention(typeName) {
    const normalizedName = typeName.toString().trim().toUpperCase();
    
    try {
      console.log(`[APARTMENT_TYPE_CREATE] Processing: ${normalizedName}`);
      
      ApartmentType.useAdminDb();
      const { data: existingTypes, error: searchError } = await ApartmentType.adminDb
        .from('apartment_types')
        .select('*')
        .ilike('type', normalizedName)
        .limit(1);
      
      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }
      
      if (existingTypes && existingTypes.length > 0) {
        console.log(`[APARTMENT_TYPE_CREATE] Found existing: ${existingTypes[0].type} (ID: ${existingTypes[0].id})`);
        ApartmentType.useUserDb();
        return existingTypes[0];
      }

      console.log(`[APARTMENT_TYPE_CREATE] Creating new: ${normalizedName}`);
      const { data: created, error: createError } = await ApartmentType.adminDb
        .from('apartment_types')
        .insert({ type: normalizedName })
        .select()
        .single();
      
      ApartmentType.useUserDb();
      
      if (createError) {
        if (createError.message && createError.message.includes('duplicate key')) {
          console.log(`[APARTMENT_TYPE_CREATE] Duplicate key error, searching again for: ${normalizedName}`);
          return await this.findOrCreateApartmentTypeWithDuplicatePrevention(typeName);
        }
        throw createError;
      }
      
      console.log(`[APARTMENT_TYPE_CREATE] Created: ${created.type} (ID: ${created.id})`);
      return created;
    } catch (error) {
      ApartmentType.useUserDb();
      console.error(`[APARTMENT_TYPE_CREATE] Error with apartment type ${normalizedName}:`, error);
      throw new Error(`Failed to find or create apartment type: ${error.message}`);
    }
  }

  /**
   * Format a rich text message with emojis and formatting
   * @param {string} message - Plain message
   * @returns {string} - Formatted message
   */
  formatRichMessage(message) {
    // WhatsApp supports basic formatting
    return message
      .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert **bold** to *bold*
      .replace(/__(.*?)__/g, '_$1_')     // Convert __italic__ to _italic_
      .replace(/```(.*?)```/g, '```$1```'); // Keep code blocks as is
  }

  /**
   * Create a formatted property summary
   * @param {object} property - Property object
   * @returns {string} - Formatted property summary
   */
  formatPropertySummary(property) {
    let summary = `🏢 **${property.address}**\n`;
    summary += `💰 ${property.currency || 'EUR'} ${property.price}/${property.listing_type === 'rent' ? 'month' : 'sale'}\n`;
    summary += `🛏️ ${property.bedrooms} bedroom${property.bedrooms !== 1 ? 's' : ''} • 🛁 ${property.bathrooms} bathroom${property.bathrooms !== 1 ? 's' : ''}\n`;
    
    if (property.area_sqm) {
      summary += `📐 ${property.area_sqm}m²\n`;
    }
    
    if (property.external_url) {
      summary += `🔗 ${property.external_url}\n`;
    }
    
    if (property.contact_name || property.contact_phone) {
      summary += `📞 ${property.contact_name || 'Contact'}: ${property.contact_phone || 'N/A'}\n`;
    }

    return this.formatRichMessage(summary);
  }
}

module.exports = new PropertyParsingService(); 