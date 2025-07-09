const openaiService = require('./openaiService');
const Property = require('../models/Property');
const Country = require('../models/Country');
const City = require('../models/City');
const District = require('../models/District');
const ApartmentType = require('../models/ApartmentType');

/**
 * Property Search Service
 * Handles all property search operations with natural language support
 */
class SearchService {
  /**
   * Search properties based on natural language query
   * @param {string} query - Natural language search query
   * @param {object} user - User object for personalization
   * @returns {Promise<object>} - Search results with metadata
   */
  async searchProperties(query, user = null) {
    try {
      console.log(`🔍 [SEARCH] Processing query: "${query}"`);
      
      // First, check for ambiguous queries that need clarification
      const ambiguityCheck = await this.detectAmbiguousQuery(query);
      if (ambiguityCheck.isAmbiguous) {
        console.log(`🤔 [SEARCH] Ambiguous query detected:`, ambiguityCheck);
        return {
          query: query,
          isAmbiguous: true,
          clarificationNeeded: true,
          clarificationMessage: ambiguityCheck.clarificationMessage,
          possibleInterpretations: ambiguityCheck.interpretations,
          totalCount: 0,
          results: [],
          filters: {}
        };
      }
      
      // Parse natural language query using OpenAI
      const searchParsed = await openaiService.parseSearchQuery(query);
      console.log(`🧠 [SEARCH] Parsed filters:`, JSON.stringify(searchParsed.filters, null, 2));
      
      // Convert parsed filters to database query
      const dbQuery = await this.buildDatabaseQuery(searchParsed.filters);
      console.log(`💾 [SEARCH] Database query:`, dbQuery);
      
      // Execute search
      const results = await this.executeSearch(dbQuery, searchParsed.sorting, searchParsed.limit);
      
      // Format results for display
      const formattedResults = {
        query: query,
        filters: searchParsed.filters,
        searchTerms: searchParsed.searchTerms,
        results: results.properties,
        totalCount: results.count,
        limit: searchParsed.limit,
        hasMore: results.count > searchParsed.limit,
        suggestion: await this.generateSearchSuggestion(query, results.count, user, searchParsed.filters),
        properties: results.properties // Add this for appointment booking compatibility
      };

      console.log(`✅ [SEARCH] Found ${results.count} properties`);
      return formattedResults;
    } catch (error) {
      console.error('❌ [SEARCH] Error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Build Supabase database query from parsed filters
   * @param {object} filters - Parsed search filters
   * @returns {Promise<object>} - Database query object
   */
  async buildDatabaseQuery(filters) {
    const query = {
      select: `
        *,
        districts:district_id(district, cities:city_id(city, countries:country_id(country))),
        apartment_types:type_id(type),
        users:owner_id(phone_number, name)
      `,
      filters: [],
      joins: []
    };

    // Status filter (default to active properties)
    query.filters.push(['status', 'eq', filters.status || 'active']);

    // Property type filter (via apartment_types relationship)
    if (filters.property_type) {
      const apartmentTypeId = await this.resolveApartmentType(filters.property_type);
      if (apartmentTypeId) {
        query.filters.push(['type_id', 'eq', apartmentTypeId]);
      }
    }

    // Bedroom filters
    if (filters.bedrooms) {
      if (filters.bedrooms.exact) {
        query.filters.push(['bedrooms', 'eq', filters.bedrooms.exact]);
      } else {
        if (filters.bedrooms.min) {
          query.filters.push(['bedrooms', 'gte', filters.bedrooms.min]);
        }
        if (filters.bedrooms.max) {
          query.filters.push(['bedrooms', 'lte', filters.bedrooms.max]);
        }
      }
    }

    // Price filters
    if (filters.price) {
      if (filters.price.min) {
        query.filters.push(['price', 'gte', filters.price.min]);
      }
      if (filters.price.max) {
        query.filters.push(['price', 'lte', filters.price.max]);
      }
    }

    // Area filters
    if (filters.area) {
      if (filters.area.min) {
        query.filters.push(['area', 'gte', filters.area.min]);
      }
      if (filters.area.max) {
        query.filters.push(['area', 'lte', filters.area.max]);
      }
    }

    // Location filters
    if (filters.location) {
      const locationIds = await this.resolveLocationFilters(filters.location);
      if (locationIds.districts && locationIds.districts.length > 0) {
        query.filters.push(['district_id', 'in', `(${locationIds.districts.map(id => `'${id}'`).join(',')})`]);
      }
    }

    // Floor filter - Check for valid, non-null value
    if (filters.floor && filters.floor !== 'null' && filters.floor.trim() !== '') {
      query.filters.push(['floor', 'ilike', `%${filters.floor}%`]);
    }

    // Built year filter
    if (filters.built_year) {
      if (filters.built_year.exact) {
        query.filters.push(['built_year', 'eq', filters.built_year.exact]);
      } else {
        if (filters.built_year.min) {
          query.filters.push(['built_year', 'gte', filters.built_year.min]);
        }
        if (filters.built_year.max) {
          query.filters.push(['built_year', 'lte', filters.built_year.max]);
        }
      }
    }

    // Available From filter - Check for valid, non-null value
    if (filters.available_from && filters.available_from !== 'null' && filters.available_from.trim() !== '') {
      query.filters.push(['available_from', 'gte', filters.available_from]);
    }

    // Full-text search on address and description
    if (filters.searchTerms && filters.searchTerms.length > 0) {
      const searchTerm = filters.searchTerms.join(' & '); // Combine terms for tsquery
      query.filters.push(['fts', 'or', `(address.plfts.%${searchTerm}%,description.plfts.%${searchTerm}%)`]);
    }

    // Amenities filters
    if (filters.amenities) {
      for (const [amenity, value] of Object.entries(filters.amenities)) {
        if (value === true) {
          // Ensure the amenity is a valid column in the properties table
          const validAmenities = ['elevator', 'furnished', 'air_conditioning', 'work_room'];
          if (validAmenities.includes(amenity)) {
            query.filters.push([amenity, 'eq', true]);
          }
        }
      }
    }

    // Note: apartment_type filter is handled above with property_type

    return query;
  }

  /**
   * Resolve location filters to database IDs
   * @param {object} location - Location filters
   * @returns {Promise<object>} - Location IDs
   */
  async resolveLocationFilters(location) {
    const result = { districts: [] };

    try {
      let countryId = null;
      let cityIds = [];

      // Start with the most specific filter and move up
      // Case 1: A specific district is mentioned
      if (location.district) {
        // We need a city or country to find a district reliably.
        // This part of the logic may need to be smarter, i.e. search districts globally.
        // For now, we assume if a district is mentioned, a city/country will be too.
        const districts = await District.db.from('districts').select('id').ilike('district', `%${location.district}%`);
        if (districts.data) {
          result.districts = districts.data.map(d => d.id);
          return result; // Found specific districts, no need to go further
        }
      }

      // Case 2: A specific city is mentioned
      if (location.city) {
        const cities = await City.db.from('cities').select('id').ilike('city', `%${location.city}%`);
        if (cities.data) {
          cityIds = cities.data.map(c => c.id);
        }
      }
      // Case 3: A country is mentioned (and no city was)
      else if (location.country) {
        const country = await Country.findByName(location.country);
        if (country) {
          countryId = country.id;
          const cities = await City.findAll({ country_id: countryId });
          cityIds = cities.map(c => c.id);
        }
      }

      // If we have found cities (either directly or via country), get all their districts
      if (cityIds.length > 0) {
        const districts = await District.db.from('districts').select('id').in('city_id', cityIds);
        if (districts.data) {
          result.districts = districts.data.map(d => d.id);
        }
      }

    } catch (error) {
      console.error('Error resolving location filters:', error);
    }

    return result;
  }

  /**
   * Find districts by area description (downtown, center, etc.)
   * @param {string} areaDescription - Area description
   * @returns {Promise<Array>} - Matching districts
   */
  async findDistrictsByAreaDescription(areaDescription) {
    try {
      // Common mappings for area descriptions
      const areaKeywords = {
        'downtown': ['centro', 'baixa', 'downtown', 'city center'],
        'center': ['centro', 'central', 'center'],
        'suburban': ['suburban', 'residential', 'quiet'],
        'historic': ['historic', 'old town', 'antiga'],
        'business': ['business', 'commercial', 'financial']
      };

      const keywords = areaKeywords[areaDescription.toLowerCase()] || [areaDescription];
      
      // Search districts by name containing these keywords
      const matchingDistricts = [];
      for (const keyword of keywords) {
        const { data, error } = await District.db
          .from('districts')
          .select('*')
          .ilike('district', `%${keyword}%`)
          .limit(10);
        
        if (!error && data) {
          matchingDistricts.push(...data);
        }
      }

      // Remove duplicates
      const uniqueDistricts = matchingDistricts.filter((district, index, self) => 
        index === self.findIndex(d => d.id === district.id)
      );

      return uniqueDistricts;
    } catch (error) {
      console.error('Error finding districts by area description:', error);
      return [];
    }
  }

  /**
   * Resolve apartment type to database ID
   * @param {string} apartmentType - Apartment type
   * @returns {Promise<string|null>} - Apartment type ID
   */
  async resolveApartmentType(apartmentType) {
    try {
      // Handle various property type mappings
      const typeMapping = {
        'apartment': ['apartment', 'flat', '1 bedroom', '2 bedroom', '3 bedroom', '4+ bedroom'],
        'house': ['house', 'villa', 'townhouse'],
        'commercial': ['commercial', 'office', 'retail'],
        'land': ['land', 'plot'],
        'studio': ['studio']
      };

      // Find which category the input type belongs to
      let mappedType = apartmentType.toLowerCase();
      
      for (const [category, variants] of Object.entries(typeMapping)) {
        if (variants.includes(mappedType) || category === mappedType) {
          mappedType = category;
          break;
        }
      }

      // Try to find exact match first
      const { data, error } = await ApartmentType.db
        .from('apartment_types')
        .select('*')
        .ilike('type', mappedType)
        .limit(1);

      if (!error && data && data.length > 0) {
        return data[0].id;
      }

      // If no exact match, try partial match
      const { data: partialData, error: partialError } = await ApartmentType.db
        .from('apartment_types')
        .select('*')
        .ilike('type', `%${mappedType}%`)
        .limit(1);

      if (!partialError && partialData && partialData.length > 0) {
        return partialData[0].id;
      }

      return null;
    } catch (error) {
      console.error('Error resolving apartment type:', error);
      return null;
    }
  }

  /**
   * Execute the database search
   * @param {object} dbQuery - Database query object
   * @param {object} sorting - Sorting configuration
   * @param {number} limit - Result limit
   * @returns {Promise<object>} - Search results
   */
  async executeSearch(dbQuery, sorting, limit) {
    try {
      // Build the Supabase query
      let query = Property.db
        .from('properties')
        .select(dbQuery.select, { count: 'exact' });

      // Apply filters
      for (const [field, operator, value] of dbQuery.filters) {
        if (operator === 'eq') {
          query = query.eq(field, value);
        } else if (operator === 'gte') {
          query = query.gte(field, value);
        } else if (operator === 'lte') {
          query = query.lte(field, value);
        } else if (operator === 'in') {
          query = query.in(field, value);
        } else if (operator === 'ilike') {
          query = query.ilike(field, value);
        }
      }

      // Apply sorting
      if (sorting && sorting.field) {
        query = query.order(sorting.field, { ascending: sorting.order === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply limit
      query = query.limit(limit || 10);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        properties: data || [],
        count: count || 0
      };
    } catch (error) {
      console.error('Database search execution error:', error);
      throw error;
    }
  }

  /**
   * Generate intelligent search suggestions based on results and market analysis
   * @param {string} originalQuery - Original search query
   * @param {number} resultCount - Number of results found
   * @param {object} user - User object
   * @param {object} searchFilters - Applied search filters
   * @returns {Promise<string|null>} - Intelligent search suggestion
   */
  async generateSearchSuggestion(originalQuery, resultCount, user, searchFilters = null) {
    try {
      if (resultCount === 0) {
        // Analyze why no results were found and provide intelligent suggestions
        return await this.generateIntelligentZeroResultsSuggestion(originalQuery, searchFilters);
      }

      if (resultCount > 50) {
        return "Many properties found! Try adding more specific criteria to narrow down your search.";
      }

      // For moderate results, suggest refinements
      if (resultCount > 10 && resultCount <= 50) {
        return "Good results! You can refine further by specifying price range, number of bedrooms, or specific neighborhoods.";
      }

      return null; // No suggestion needed for good result count
    } catch (error) {
      console.error('Error generating search suggestion:', error);
      return null;
    }
  }

  /**
   * Generate intelligent suggestions for zero results based on market analysis
   * @param {string} originalQuery - Original search query
   * @param {object} searchFilters - Applied search filters  
   * @returns {Promise<string>} - Intelligent suggestion
   */
  async generateIntelligentZeroResultsSuggestion(originalQuery, searchFilters) {
    try {
      // Get market analysis to understand why no results
      const marketAnalysis = await this.analyzeMarketForFilters(searchFilters);
      
      const systemPrompt = `You are an intelligent real estate market analyst. A user's search found zero results. Analyze why and provide a helpful, realistic suggestion.

User's search: "${originalQuery}"
Applied filters: ${JSON.stringify(searchFilters, null, 2)}

Market Analysis:
- Available price range: €${marketAnalysis.minPrice.toLocaleString()} - €${marketAnalysis.maxPrice.toLocaleString()}
- Most common price range: €${marketAnalysis.commonPriceMin.toLocaleString()} - €${marketAnalysis.commonPriceMax.toLocaleString()}
- Available property types: ${marketAnalysis.propertyTypes.join(', ')}
- Available locations: ${marketAnalysis.locations.join(', ')}
- Total properties in market: ${marketAnalysis.totalProperties}

Generate a concise, helpful response (max 80 words) that:
1. Briefly explains why no results were found (be specific)
2. Suggests realistic alternatives based on actual market data  
3. Provides actionable next steps

Examples:
- If price too low: "No apartments found under €300. Available apartments start at €2,500. Try 'apartments under €3000' to see options."
- If location issue: "No properties in [location]. Try nearby areas like [suggestions] or remove location filter."
- If too specific: "No 5-bedroom apartments found. Available: 1-3 bedrooms. Try 'apartments with 3 bedrooms'."

Be helpful, realistic, and actionable. Use the actual market data to guide suggestions.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate intelligent zero results suggestion` }
        ],
        temperature: 0.2,
        max_tokens: 150
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating intelligent zero results suggestion:', error);
      return "No properties found. Try broadening your search criteria or searching in different areas.";
    }
  }

  /**
   * Analyze market data to understand available options
   * @param {object} searchFilters - Search filters that returned zero results
   * @returns {Promise<object>} - Market analysis
   */
  async analyzeMarketForFilters(searchFilters) {
    try {
      // Get basic market statistics
      const { data: allProperties, error } = await Property.db
        .from('properties')
        .select('price, property_type, districts:district_id(district), apartment_types:type_id(type)')
        .eq('status', 'active');

      if (error || !allProperties) {
        throw new Error('Failed to fetch market data');
      }

      const prices = allProperties.map(p => p.price).filter(p => p > 0);
      const propertyTypes = [...new Set(allProperties.map(p => p.property_type).filter(Boolean))];
      const locations = [...new Set(allProperties.map(p => p.districts?.district).filter(Boolean))];

      // Calculate price statistics
      const sortedPrices = prices.sort((a, b) => a - b);
      const minPrice = sortedPrices[0] || 0;
      const maxPrice = sortedPrices[sortedPrices.length - 1] || 0;
      
      // Get 25th and 75th percentile for common price range
      const q1Index = Math.floor(sortedPrices.length * 0.25);
      const q3Index = Math.floor(sortedPrices.length * 0.75);
      const commonPriceMin = sortedPrices[q1Index] || minPrice;
      const commonPriceMax = sortedPrices[q3Index] || maxPrice;

      return {
        totalProperties: allProperties.length,
        minPrice,
        maxPrice,
        commonPriceMin,
        commonPriceMax,
        averagePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        propertyTypes,
        locations: locations.slice(0, 5), // Top 5 locations
        priceDistribution: {
          under1000: prices.filter(p => p < 1000).length,
          under2000: prices.filter(p => p < 2000).length,
          under3000: prices.filter(p => p < 3000).length,
          over3000: prices.filter(p => p >= 3000).length
        }
      };
    } catch (error) {
      console.error('Error analyzing market:', error);
      // Return basic fallback data
      return {
        totalProperties: 0,
        minPrice: 500,
        maxPrice: 5000,
        commonPriceMin: 1500,
        commonPriceMax: 3500,
        averagePrice: 2500,
        propertyTypes: ['apartment', 'house'],
        locations: ['Lisbon', 'Porto'],
        priceDistribution: { under1000: 0, under2000: 0, under3000: 0, over3000: 0 }
      };
    }
  }

  /**
   * Get popular searches and suggestions
   * @param {object} user - User object
   * @returns {Promise<Array>} - Popular search suggestions
   */
  async getPopularSearches(user) {
    const suggestions = [
      "2-bedroom apartments in Lisbon under €2000",
      "Houses in Porto with garden",
      "Commercial spaces downtown",
      "T1 apartments for rent",
      "Properties under €500k",
      "Furnished apartments",
      "Houses with 3+ bedrooms",
      "Commercial properties over 100m²"
    ];

    // Personalize based on user role
    if (user?.user_roles?.role === 'renter') {
      return suggestions.filter(s => s.includes('rent') || s.includes('apartment') || !s.includes('Commercial'));
    }

    return suggestions;
  }

  /**
   * Save user search preferences
   * @param {string} userId - User ID
   * @param {object} searchFilters - Search filters to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveSearchPreferences(userId, searchFilters) {
    try {
      // This would integrate with a user preferences system
      // For now, just log the preferences
      console.log(`💾 [SEARCH] Saving preferences for user ${userId}:`, searchFilters);
      return true;
    } catch (error) {
      console.error('Error saving search preferences:', error);
      return false;
    }
  }

  /**
   * Detect ambiguous queries that need clarification using GPT-4o-mini
   * @param {string} query - Search query
   * @returns {Promise<object>} - Ambiguity analysis
   */
  async detectAmbiguousQuery(query) {
    try {
      const systemPrompt = `You are an intelligent ambiguity detector for a real estate search system. You MUST be extremely conservative - only flag queries as ambiguous if they have GENUINELY multiple plausible interpretations that would lead to completely different search results.

CRITICAL: 95% of queries are NOT ambiguous. Real estate terminology is generally clear:

DEFINITELY NOT AMBIGUOUS (never flag these):
- "apartment" → clear property type
- "budget" → clearly price-related
- "lisbon" → clear location
- "looking for apartment" → clear search intent
- "houses in porto" → clear location + type
- "under 2000" → clear price when in real estate context
- "2 bedroom" → clear bedroom requirement
- "around 3000" → in real estate context, clearly price
- "apartment around 300 eur" → clear (even if unrealistic)
- "oh i mean 3000" → clear price correction
- "3000" → in context of price discussion, clearly price

ONLY AMBIGUOUS if genuinely unclear AND context-dependent:
- "apartment in 3000" → ONLY if no prior price context (could be €3000 OR postal code 3000)
- "2 bedroom 1500" → ONLY if could be €1500 OR 1500 sqm (rare)
- "in 4000" with no context → could be price or location

CONTEXT MATTERS:
- If user just mentioned prices/budget → numbers are likely prices
- If user just mentioned locations → numbers might be postal codes
- Real estate context makes most queries clear

Return JSON:
{
  "isAmbiguous": boolean,
  "confidence": 0.0-1.0,
  "shouldAskClarification": boolean,
  "reasoning": "why flagged or not flagged"
}

DEFAULT: isAmbiguous=false unless you're 90%+ confident it's genuinely ambiguous.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze for genuine ambiguity: "${query}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      // Be EXTREMELY conservative - only flag if AI is very confident AND explicitly says to ask
      const shouldClarify = result.isAmbiguous && result.shouldAskClarification && (result.confidence > 0.9);
      
      console.log(`🤔 [SEARCH] Ambiguity check for "${query}": ambiguous=${result.isAmbiguous}, confidence=${result.confidence}, shouldClarify=${shouldClarify}, reasoning: ${result.reasoning}`);
      
      return {
        isAmbiguous: shouldClarify,
        confidence: result.confidence || 0.0,
        ambiguousTerms: [],
        interpretations: [],
        clarificationMessage: shouldClarify ? `I want to make sure I understand - could you clarify what you mean by "${query}"?` : ''
      };
    } catch (error) {
      console.error('Error detecting ambiguous query:', error);
      // Default to NOT ambiguous if AI fails - never block users unnecessarily
      return { isAmbiguous: false, confidence: 0.0, ambiguousTerms: [], interpretations: [], clarificationMessage: '' };
    }
  }
}

module.exports = new SearchService(); 