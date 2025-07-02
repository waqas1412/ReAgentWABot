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
        suggestion: await this.generateSearchSuggestion(query, results.count, user)
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
        districts:district_id(district, country_id),
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
      // If specific district mentioned
      if (location.district) {
        const districts = await District.findByName(location.district);
        if (districts) {
          result.districts.push(districts.id);
        }
      }

      // If city mentioned but no specific district
      if (location.city && result.districts.length === 0) {
        const city = await City.findByName(location.city);
        if (city) {
          // Get all districts in this city
          const cityDistricts = await District.findAll({ country_id: city.country_id });
          result.districts = cityDistricts.map(d => d.id);
        }
      }

      // If country mentioned but no city/district
      if (location.country && result.districts.length === 0) {
        const country = await Country.findByName(location.country);
        if (country) {
          // Get all districts in this country
          const countryDistricts = await District.findAll({ country_id: country.id });
          result.districts = countryDistricts.map(d => d.id);
        }
      }

      // Handle area descriptions like "downtown", "center"
      if (location.area_description && result.districts.length === 0) {
        // Get districts that match common area descriptions
        const areaDistricts = await this.findDistrictsByAreaDescription(location.area_description);
        result.districts = areaDistricts.map(d => d.id);
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
   * Generate search suggestions based on results
   * @param {string} originalQuery - Original search query
   * @param {number} resultCount - Number of results found
   * @param {object} user - User object
   * @returns {Promise<string|null>} - Search suggestion
   */
  async generateSearchSuggestion(originalQuery, resultCount, user) {
    try {
      if (resultCount === 0) {
        return "No properties found. Try broadening your search criteria or searching in different areas.";
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
}

module.exports = new SearchService(); 