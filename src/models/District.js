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
      district: 'varchar(255) (required)',
      city_id: 'uuid (foreign key to cities)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Find district by name within a specific city
   * @param {string} districtName - District name
   * @param {string} cityId - The ID of the city to search within
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object|null} - District record
   */
  async findByName(districtName, cityId, useAdmin = false) {
    if (!cityId) return null;
    if (useAdmin) this.useAdminDb();
    const result = await this.findOne({ 
      district: districtName,
      city_id: cityId 
    });
    if (useAdmin) this.useUserDb();
    return result;
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
   * @param {string} districtName - District name
   * @param {string} cityId - The ID of the city it belongs to
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object} - District record
   */
  async createIfNotExists(districtName, cityId, useAdmin = false) {
    if (!cityId) {
      throw new Error("Cannot create a district without a city_id.");
    }
    // Use admin db for checking existing to bypass RLS
    const existing = await this.findByName(districtName, cityId, true);
    if (existing) {
      return existing;
    }
    
    this.useAdminDb();
    const created = await this.create({ 
      district: districtName,
      city_id: cityId
    });
    this.useUserDb(); // Reset to user db
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