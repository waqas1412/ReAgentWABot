const BaseModel = require('./BaseModel');

/**
 * Country Model
 * Represents countries in the system
 */
class Country extends BaseModel {
  constructor() {
    super('countries');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      country: 'text',
      created_at: 'timestamptz'
    };
  }

  /**
   * Find country by name
   * @param {string} country - Country name
   * @returns {Object|null} - Country record
   */
  async findByName(country) {
    return await this.findOne({ country });
  }

  /**
   * Get all countries ordered by name
   * @returns {Array} - Array of countries
   */
  async getAllCountries() {
    return await this.findAll({}, '*', { 
      orderBy: { column: 'country', ascending: true } 
    });
  }

  /**
   * Create country if it doesn't exist
   * @param {string} country - Country name
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object} - Country record
   */
  async createIfNotExists(country, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    
    const existing = await this.findByName(country);
    if (existing) {
      if (useAdmin) this.useUserDb();
      return existing;
    }
    const created = await this.create({ country });
    
    if (useAdmin) this.useUserDb();
    return created;
  }

  /**
   * Get cities for a country
   * @param {string} countryId - Country ID
   * @returns {Array} - Array of cities
   */
  async getCities(countryId) {
    const { data, error } = await this.db
      .from('cities')
      .select('*')
      .eq('country_id', countryId)
      .order('city');

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get districts for a country
   * @param {string} countryId - Country ID
   * @returns {Array} - Array of districts
   */
  async getDistricts(countryId) {
    const { data, error } = await this.db
      .from('districts')
      .select('*')
      .eq('country_id', countryId)
      .order('district');

    if (error) {
      throw error;
    }

    return data || [];
  }
}

module.exports = new Country(); 