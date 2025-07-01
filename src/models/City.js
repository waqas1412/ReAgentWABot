const BaseModel = require('./BaseModel');

/**
 * City Model
 * Represents cities in the system
 */
class City extends BaseModel {
  constructor() {
    super('cities');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      city: 'text',
      country_id: 'uuid (foreign key to countries)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Find city by name
   * @param {string} city - City name
   * @param {string} countryId - Optional country ID filter
   * @returns {Object|null} - City record
   */
  async findByName(city, countryId = null) {
    const filters = { city };
    if (countryId) {
      filters.country_id = countryId;
    }
    return await this.findOne(filters);
  }

  /**
   * Get all cities with optional country filter
   * @param {string} countryId - Optional country ID filter
   * @returns {Array} - Array of cities
   */
  async getAllCities(countryId = null) {
    const filters = countryId ? { country_id: countryId } : {};
    return await this.findAll(filters, '*', { 
      orderBy: { column: 'city', ascending: true } 
    });
  }

  /**
   * Get cities with country information
   * @param {string} countryId - Optional country ID filter
   * @returns {Array} - Array of cities with country data
   */
  async getCitiesWithCountry(countryId = null) {
    let query = this.db
      .from('cities')
      .select(`
        *,
        countries:country_id (
          id,
          country
        )
      `)
      .order('city');

    if (countryId) {
      query = query.eq('country_id', countryId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Create city if it doesn't exist
   * @param {string} city - City name
   * @param {string} countryId - Country ID
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object} - City record
   */
  async createIfNotExists(city, countryId, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    
    const existing = await this.findByName(city, countryId);
    if (existing) {
      if (useAdmin) this.useUserDb();
      return existing;
    }
    const created = await this.create({ city, country_id: countryId });
    
    if (useAdmin) this.useUserDb();
    return created;
  }

  /**
   * Get cities by country name
   * @param {string} countryName - Country name
   * @returns {Array} - Array of cities
   */
  async getCitiesByCountryName(countryName) {
    const { data, error } = await this.db
      .from('cities')
      .select(`
        *,
        countries!inner (
          id,
          country
        )
      `)
      .eq('countries.country', countryName)
      .order('city');

    if (error) {
      throw error;
    }

    return data || [];
  }
}

module.exports = new City(); 