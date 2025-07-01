const BaseModel = require('./BaseModel');

/**
 * ApartmentType Model
 * Represents apartment types (e.g., studio, 1BR, 2BR, etc.)
 */
class ApartmentType extends BaseModel {
  constructor() {
    super('apartment_types');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      type: 'text (required)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Find apartment type by type name
   * @param {string} type - Apartment type name
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object|null} - Apartment type record
   */
  async findByType(type, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findOne({ type });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Get all apartment types ordered by type name
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Array} - Array of apartment types
   */
  async getAllTypes(useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findAll({}, '*', { 
      orderBy: { column: 'type', ascending: true } 
    });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Create apartment type if it doesn't exist
   * @param {string} type - Apartment type name
   * @returns {Object} - Apartment type record
   */
  async createIfNotExists(type) {
    // Use admin db for checking existing types to bypass RLS
    const existing = await this.findByType(type, true);
    if (existing) {
      return existing;
    }
    
    this.useAdminDb();
    const created = await this.create({ type });
    this.useUserDb(); // Reset to user db
    return created;
  }
}

module.exports = new ApartmentType(); 