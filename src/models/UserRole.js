const BaseModel = require('./BaseModel');

/**
 * UserRole Model
 * Represents user roles in the system
 */
class UserRole extends BaseModel {
  constructor() {
    super('user_roles');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      role: 'text (required)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Valid user roles
   */
  static get ROLES() {
    return {
      RENTER: 'renter',
      AGENT: 'agent',
      OWNER: 'owner'
    };
  }

  /**
   * Find role by role name
   * @param {string} role - Role name
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object|null} - Role record
   */
  async findByRole(role, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findOne({ role });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Get all roles ordered by role name
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Array} - Array of roles
   */
  async getAllRoles(useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findAll({}, '*', { 
      orderBy: { column: 'role', ascending: true } 
    });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Create role if it doesn't exist
   * @param {string} role - Role name
   * @returns {Object} - Role record
   */
  async createIfNotExists(role) {
    // Use admin db for checking existing roles to bypass RLS
    const existing = await this.findByRole(role, true);
    if (existing) {
      return existing;
    }
    
    this.useAdminDb();
    const created = await this.create({ role });
    this.useUserDb(); // Reset to user db
    return created;
  }

  /**
   * Initialize default roles
   * @returns {Array} - Created roles
   */
  async initializeDefaultRoles() {
    const roles = ['renter', 'agent', 'owner'];
    const createdRoles = [];
    
    for (const role of roles) {
      try {
        const created = await this.createIfNotExists(role);
        createdRoles.push(created);
      } catch (error) {
        console.error(`Error creating role ${role}:`, error.message);
      }
    }

    return createdRoles;
  }

  /**
   * Validate if role is valid
   * @param {string} role - Role to validate
   * @returns {boolean} - True if valid
   */
  isValidRole(role) {
    const validRoles = ['renter', 'agent', 'owner', 'buyer'];
    return validRoles.includes(role);
  }
}

module.exports = new UserRole(); 