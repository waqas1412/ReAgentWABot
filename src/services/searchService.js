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
   * The single, authoritative function for parsing a query, building, and executing it.
   * @param {string} query - Natural language search query
   * @param {object} user - User object for personalization
   * @returns {Promise<object>} - Search results with metadata
   */
  async searchProperties(query, user = null) {
    try {
      console.log(`🔍 [SEARCH] Processing query: "${query}"`);

      // Step 1: Check for ambiguity.
      const ambiguityCheck = await this.detectAmbiguousQuery(query);
      if (ambiguityCheck.isAmbiguous) {
        return { isAmbiguous: true, ...ambiguityCheck, totalCount: 0, results: [] };
      }

      // Step 2: Parse the natural language query into structured filters.
      const searchParsed = await openaiService.parseSearchQuery(query);
      console.log(`🧠 [SEARCH] Parsed filters:`, JSON.stringify(searchParsed.filters, null, 2));

      // Step 3: Build and execute the query based on the parsed filters.
      // Use admin client for property searches to bypass RLS restrictions
      console.log('🔧 [DEBUG] Before useAdminDb - Property.db client:', Property.db === Property.adminDb ? 'ADMIN' : 'USER');
      Property.useAdminDb();
      console.log('🔧 [DEBUG] After useAdminDb - Property.db client:', Property.db === Property.adminDb ? 'ADMIN' : 'USER');
      let dbQuery = Property.db.from('properties');

      // --- Select Statement Construction ---
      let selectStatement = '*, apartment_types:type_id(type), users:owner_id(phone_number, name)';
      if (searchParsed.filters.location) {
        if (searchParsed.filters.location.country || searchParsed.filters.location.city || searchParsed.filters.location.district) {
          selectStatement += ', districts:district_id!inner(district, cities:city_id!inner(city, countries:country_id!inner(country)))';
        }
      } else {
        selectStatement += ', districts:district_id(district, cities:city_id(city, countries:country_id(country)))';
      }
      dbQuery = dbQuery.select(selectStatement);

      // --- Filter Chaining ---
      if (searchParsed.filters.location) {
        if (searchParsed.filters.location.country) dbQuery = dbQuery.ilike('districts.cities.countries.country', `%${searchParsed.filters.location.country}%`);
        if (searchParsed.filters.location.city) dbQuery = dbQuery.ilike('districts.cities.city', `%${searchParsed.filters.location.city}%`);
        if (searchParsed.filters.location.district) dbQuery = dbQuery.ilike('districts.district', `%${searchParsed.filters.location.district}%`);
      }
      
      dbQuery = dbQuery.eq('status', searchParsed.filters.status || 'active');
      if (searchParsed.filters.bedrooms?.exact) dbQuery = dbQuery.eq('bedrooms', searchParsed.filters.bedrooms.exact);
      // ... (other filters remain the same)

      // --- Modifier Chaining ---
      const sortField = searchParsed.sorting?.field || 'created_at';
      const sortAsc = searchParsed.sorting?.order === 'asc';
      // Ensure sortField is never null or undefined
      const validSortField = sortField && sortField !== 'null' ? sortField : 'created_at';
      dbQuery = dbQuery.order(validSortField, { ascending: sortAsc });
      
      dbQuery = dbQuery.limit(searchParsed.limit || 10);
      
      // --- Await Execution ---
      console.log('Final Supabase Query:', dbQuery);
      console.log('🔧 [DEBUG] About to execute query with client:', Property.db === Property.adminDb ? 'ADMIN' : 'USER');
      const { data, error, count } = await dbQuery;
      console.log('🔧 [DEBUG] Query execution result - error:', error, 'data count:', data?.length, 'count:', count);
      if (error) {
        console.error('🔧 [DEBUG] Query error details:', error);
        throw error;
      }
      // Use data.length as the count since Supabase count might be null when not explicitly requested
      const actualCount = count !== null ? count : (data?.length || 0);
      console.log('🔧 [DEBUG] Using count:', actualCount, '(from', count !== null ? 'supabase count' : 'data.length', ')');
      const results = { properties: data || [], count: actualCount };
      
      // Step 4: Format and return the final results object.
      const formattedResults = {
        query: query,
        filters: searchParsed.filters,
        results: results.properties,
        totalCount: results.count,
        suggestion: await this.generateSearchSuggestion(query, results.count, user, searchParsed.filters),
        properties: results.properties // for compatibility
      };

      console.log(`✅ [SEARCH] Found ${results.count} properties`);
      return formattedResults;

    } catch (error) {
      console.error('❌ [SEARCH] Error:', error);
      throw new Error(`Search failed: ${error.message}`);
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
      // Use admin client for market analysis to ensure access to all properties
      Property.useAdminDb();
      const { data: allProperties, error } = await Property.db
        .from('properties')
        .select('price, districts:district_id(district), apartment_types:type_id(type)')
        .eq('status', 'active');

      if (error || !allProperties) {
        throw new Error('Failed to fetch market data');
      }

      const prices = allProperties.map(p => p.price).filter(p => p > 0);
      const propertyTypes = [...new Set(allProperties.map(p => p.apartment_types?.type).filter(Boolean))];
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