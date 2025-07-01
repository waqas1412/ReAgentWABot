const BaseModel = require('./BaseModel');

/**
 * District Model
 * Represents districts/neighborhoods in the system
 */
class District extends BaseModel {
  constructor() {
    super('districts');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      district: 'text',
      country_id: 'uuid (foreign key to countries)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Find district by name
   * @param {string} district - District name
   * @param {string} countryId - Optional country ID filter
   * @returns {Object|null} - District record
   */
  async findByName(district, countryId = null) {
    const filters = { district };
    if (countryId) {
      filters.country_id = countryId;
    }
    return await this.findOne(filters);
  }

  /**
   * Get all districts with optional country filter
   * @param {string} countryId - Optional country ID filter
   * @returns {Array} - Array of districts
   */
  async getAllDistricts(countryId = null) {
    const filters = countryId ? { country_id: countryId } : {};
    return await this.findAll(filters, '*', { 
      orderBy: { column: 'district', ascending: true } 
    });
  }

  /**
   * Get districts with country information
   * @param {string} countryId - Optional country ID filter
   * @returns {Array} - Array of districts with country data
   */
  async getDistrictsWithCountry(countryId = null) {
    let query = this.db
      .from('districts')
      .select(`
        *,
        countries:country_id (
          id,
          country
        )
      `)
      .order('district');

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
   * Create district if it doesn't exist
   * @param {string} district - District name
   * @param {string} countryId - Country ID
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object} - District record
   */
  async createIfNotExists(district, countryId, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    
    const existing = await this.findByName(district, countryId);
    if (existing) {
      if (useAdmin) this.useUserDb();
      return existing;
    }
    const created = await this.create({ district, country_id: countryId });
    
    if (useAdmin) this.useUserDb();
    return created;
  }

  /**
   * Get districts by country name
   * @param {string} countryName - Country name
   * @returns {Array} - Array of districts
   */
  async getDistrictsByCountryName(countryName) {
    const { data, error } = await this.db
      .from('districts')
      .select(`
        *,
        countries!inner (
          id,
          country
        )
      `)
      .eq('countries.country', countryName)
      .order('district');

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Search districts by partial name
   * @param {string} searchTerm - Search term
   * @param {string} countryId - Optional country ID filter
   * @returns {Array} - Array of matching districts
   */
  async searchByName(searchTerm, countryId = null) {
    let query = this.db
      .from('districts')
      .select('*')
      .ilike('district', `%${searchTerm}%`)
      .order('district');

    if (countryId) {
      query = query.eq('country_id', countryId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }
}

module.exports = new District(); 