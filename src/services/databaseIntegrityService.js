const Country = require('../models/Country');
const City = require('../models/City');
const District = require('../models/District');
const ApartmentType = require('../models/ApartmentType');

/**
 * Database Integrity Service
 * Handles proper find-or-create operations with duplicate prevention
 * and data consistency for reliable database operations
 */
class DatabaseIntegrityService {
  /**
   * Find or create country with proper duplicate prevention
   * @param {string} countryName - Country name
   * @returns {Promise<object>} - Country record
   */
  async findOrCreateCountry(countryName) {
    if (!countryName || typeof countryName !== 'string') {
      throw new Error('Country name is required and must be a string');
    }

    const normalizedName = this.normalizeLocationName(countryName);
    
    try {
      // First try to find existing record (case-insensitive)
      const existing = await this.findCountryByNormalizedName(normalizedName);
      if (existing) {
        console.log(`Found existing country: ${existing.country} (ID: ${existing.id})`);
        return existing;
      }

      // Create new record using admin client to bypass RLS
      console.log(`Creating new country: ${normalizedName}`);
      Country.useAdminDb();
      
      const created = await Country.create({
        country: normalizedName
      });
      
      Country.useUserDb(); // Reset to user client
      console.log(`Created country: ${created.country} (ID: ${created.id})`);
      return created;

    } catch (error) {
      Country.useUserDb(); // Ensure we reset on error
      
      // Check if error is due to unique constraint violation
      if (error.message && error.message.includes('duplicate key')) {
        console.log(`Duplicate key error for country ${normalizedName}, attempting to find existing record`);
        // Try to find the existing record again
        const existing = await this.findCountryByNormalizedName(normalizedName);
        if (existing) {
          return existing;
        }
      }
      
      console.error(`Error creating country ${normalizedName}:`, error);
      throw new Error(`Failed to find or create country: ${error.message}`);
    }
  }

  /**
   * Find or create city with proper duplicate prevention
   * @param {string} cityName - City name
   * @param {string} countryId - Country ID
   * @returns {Promise<object>} - City record
   */
  async findOrCreateCity(cityName, countryId) {
    if (!cityName || typeof cityName !== 'string') {
      throw new Error('City name is required and must be a string');
    }
    
    if (!countryId) {
      throw new Error('Country ID is required');
    }

    const normalizedName = this.normalizeLocationName(cityName);
    
    try {
      // First try to find existing record
      const existing = await this.findCityByNormalizedName(normalizedName, countryId);
      if (existing) {
        console.log(`Found existing city: ${existing.city} (ID: ${existing.id})`);
        return existing;
      }

      // Create new record using admin client
      console.log(`Creating new city: ${normalizedName} in country ${countryId}`);
      City.useAdminDb();
      
      const created = await City.create({
        city: normalizedName,
        country_id: countryId
      });
      
      City.useUserDb(); // Reset to user client
      console.log(`Created city: ${created.city} (ID: ${created.id})`);
      return created;

    } catch (error) {
      City.useUserDb(); // Ensure we reset on error
      
      // Handle duplicate key error
      if (error.message && error.message.includes('duplicate key')) {
        console.log(`Duplicate key error for city ${normalizedName}, attempting to find existing record`);
        const existing = await this.findCityByNormalizedName(normalizedName, countryId);
        if (existing) {
          return existing;
        }
      }
      
      console.error(`Error creating city ${normalizedName}:`, error);
      throw new Error(`Failed to find or create city: ${error.message}`);
    }
  }

  /**
   * Find or create district with proper duplicate prevention
   * @param {string} districtName - District name
   * @param {string} countryId - Country ID
   * @returns {Promise<object>} - District record
   */
  async findOrCreateDistrict(districtName, countryId) {
    if (!districtName || typeof districtName !== 'string') {
      throw new Error('District name is required and must be a string');
    }
    
    if (!countryId) {
      throw new Error('Country ID is required');
    }

    const normalizedName = this.normalizeLocationName(districtName);
    
    try {
      // First try to find existing record
      const existing = await this.findDistrictByNormalizedName(normalizedName, countryId);
      if (existing) {
        console.log(`Found existing district: ${existing.district} (ID: ${existing.id})`);
        return existing;
      }

      // Create new record using admin client
      console.log(`Creating new district: ${normalizedName} in country ${countryId}`);
      District.useAdminDb();
      
      const created = await District.create({
        district: normalizedName,
        country_id: countryId
      });
      
      District.useUserDb(); // Reset to user client
      console.log(`Created district: ${created.district} (ID: ${created.id})`);
      return created;

    } catch (error) {
      District.useUserDb(); // Ensure we reset on error
      
      // Handle duplicate key error
      if (error.message && error.message.includes('duplicate key')) {
        console.log(`Duplicate key error for district ${normalizedName}, attempting to find existing record`);
        const existing = await this.findDistrictByNormalizedName(normalizedName, countryId);
        if (existing) {
          return existing;
        }
      }
      
      console.error(`Error creating district ${normalizedName}:`, error);
      throw new Error(`Failed to find or create district: ${error.message}`);
    }
  }

  /**
   * Find or create apartment type with proper duplicate prevention
   * @param {string} typeName - Apartment type name
   * @returns {Promise<object>} - Apartment type record
   */
  async findOrCreateApartmentType(typeName) {
    if (!typeName || typeof typeName !== 'string') {
      throw new Error('Apartment type name is required and must be a string');
    }

    const normalizedName = this.normalizeTypeName(typeName);
    
    try {
      // First try to find existing record
      const existing = await this.findApartmentTypeByNormalizedName(normalizedName);
      if (existing) {
        console.log(`Found existing apartment type: ${existing.type} (ID: ${existing.id})`);
        return existing;
      }

      // Create new record using admin client
      console.log(`Creating new apartment type: ${normalizedName}`);
      ApartmentType.useAdminDb();
      
      const created = await ApartmentType.create({
        type: normalizedName
      });
      
      ApartmentType.useUserDb(); // Reset to user client
      console.log(`Created apartment type: ${created.type} (ID: ${created.id})`);
      return created;

    } catch (error) {
      ApartmentType.useUserDb(); // Ensure we reset on error
      
      // Handle duplicate key error
      if (error.message && error.message.includes('duplicate key')) {
        console.log(`Duplicate key error for apartment type ${normalizedName}, attempting to find existing record`);
        const existing = await this.findApartmentTypeByNormalizedName(normalizedName);
        if (existing) {
          return existing;
        }
      }
      
      console.error(`Error creating apartment type ${normalizedName}:`, error);
      throw new Error(`Failed to find or create apartment type: ${error.message}`);
    }
  }

  /**
   * Find country by normalized name (case-insensitive)
   * @param {string} normalizedName - Normalized country name
   * @returns {Promise<object|null>} - Country record or null
   */
  async findCountryByNormalizedName(normalizedName) {
    try {
      // Use admin client for consistent access
      Country.useAdminDb();
      const { data, error } = await Country.adminDb
        .from('countries')
        .select('*')
        .ilike('country', normalizedName)
        .limit(1)
        .single();
      
      Country.useUserDb();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data || null;
    } catch (error) {
      Country.useUserDb();
      if (error.code === 'PGRST116') {
        return null; // No rows found
      }
      throw error;
    }
  }

  /**
   * Find city by normalized name and country ID
   * @param {string} normalizedName - Normalized city name
   * @param {string} countryId - Country ID
   * @returns {Promise<object|null>} - City record or null
   */
  async findCityByNormalizedName(normalizedName, countryId) {
    try {
      City.useAdminDb();
      const { data, error } = await City.adminDb
        .from('cities')
        .select('*')
        .ilike('city', normalizedName)
        .eq('country_id', countryId)
        .limit(1)
        .single();
      
      City.useUserDb();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data || null;
    } catch (error) {
      City.useUserDb();
      if (error.code === 'PGRST116') {
        return null; // No rows found
      }
      throw error;
    }
  }

  /**
   * Find district by normalized name and country ID
   * @param {string} normalizedName - Normalized district name
   * @param {string} countryId - Country ID
   * @returns {Promise<object|null>} - District record or null
   */
  async findDistrictByNormalizedName(normalizedName, countryId) {
    try {
      District.useAdminDb();
      const { data, error } = await District.adminDb
        .from('districts')
        .select('*')
        .ilike('district', normalizedName)
        .eq('country_id', countryId)
        .limit(1)
        .single();
      
      District.useUserDb();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data || null;
    } catch (error) {
      District.useUserDb();
      if (error.code === 'PGRST116') {
        return null; // No rows found
      }
      throw error;
    }
  }

  /**
   * Find apartment type by normalized name
   * @param {string} normalizedName - Normalized apartment type name
   * @returns {Promise<object|null>} - Apartment type record or null
   */
  async findApartmentTypeByNormalizedName(normalizedName) {
    try {
      ApartmentType.useAdminDb();
      const { data, error } = await ApartmentType.adminDb
        .from('apartment_types')
        .select('*')
        .ilike('type', normalizedName)
        .limit(1)
        .single();
      
      ApartmentType.useUserDb();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data || null;
    } catch (error) {
      ApartmentType.useUserDb();
      if (error.code === 'PGRST116') {
        return null; // No rows found
      }
      throw error;
    }
  }

  /**
   * Normalize location name (consistent casing and trimming)
   * @param {string} name - Location name
   * @returns {string} - Normalized location name
   */
  normalizeLocationName(name) {
    if (!name) return '';
    return name.toString().trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize type name
   * @param {string} name - Type name
   * @returns {string} - Normalized type name
   */
  normalizeTypeName(name) {
    if (!name) return '';
    return name.toString().trim().toUpperCase();
  }

  /**
   * Get or create complete location data
   * @param {object} locationData - Location data with country, city, district names
   * @returns {Promise<object>} - Complete location data with IDs
   */
  async getOrCreateLocationData(locationData) {
    const result = {};

    try {
      // Get or create country
      if (locationData.country_name) {
        result.country = await this.findOrCreateCountry(locationData.country_name);
      }

      // Get or create city
      if (locationData.city_name && result.country?.id) {
        result.city = await this.findOrCreateCity(locationData.city_name, result.country.id);
      }

      // Get or create district
      if (locationData.district_name && result.country?.id) {
        result.district = await this.findOrCreateDistrict(locationData.district_name, result.country.id);
      }

      return result;
    } catch (error) {
      console.error('Error with location data:', error);
      throw new Error(`Failed to process location data: ${error.message}`);
    }
  }
}

module.exports = new DatabaseIntegrityService(); 