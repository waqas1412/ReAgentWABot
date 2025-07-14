const BaseModel = require('./BaseModel');
const UserRole = require('./UserRole');
const { ROLES } = require('./UserRole');

/**
 * User Model
 * Represents users in the system (renters, agents, owners)
 */
class User extends BaseModel {
  constructor() {
    super('users');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      phone_number: 'varchar(50) (unique, required)',
      name: 'varchar(255)',
      role_id: 'uuid (foreign key to user_roles)',
      created_at: 'timestamptz',
      updated_at: 'timestamptz'
    };
  }

  /**
   * Find user by phone number
   * @param {string} phoneNumber - Phone number (with or without whatsapp: prefix)
   * @returns {Object|null} - User record
   */
  async findByPhoneNumber(phoneNumber) {
    // Clean phone number (remove whatsapp: prefix if present)
    const cleanNumber = phoneNumber.replace('whatsapp:', '');
    return await this.findOne({ phone_number: cleanNumber });
  }

  /**
   * Find user by phone (alias for findByPhoneNumber for compatibility)
   * @param {string} phoneNumber - Phone number (with or without whatsapp: prefix)
   * @returns {Object|null} - User record
   */
  async findByPhone(phoneNumber) {
    return await this.findByPhoneNumber(phoneNumber);
  }

  /**
   * Get user with role information
   * @param {string} userId - User ID
   * @returns {Object|null} - User with role data
   */
  async getUserWithRole(userId) {
    // Use admin client for role queries to bypass RLS
    const { data, error } = await this.adminDb
      .from('users')
      .select(`
        *,
        user_roles!role_id (
          id,
          role
        )
      `)
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  }

  /**
   * Get user by phone number with role information
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} - User with role data
   */
  async getUserByPhoneWithRole(phoneNumber) {
    const cleanNumber = phoneNumber.replace('whatsapp:', '');
    
    // Use admin client for role queries to bypass RLS
    const { data, error } = await this.adminDb
      .from('users')
      .select(`
        *,
        user_roles!role_id (
          id,
          role
        )
      `)
      .eq('phone_number', cleanNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  }

  /**
   * Create user with role
   * @param {Object} userData - User data
   * @param {string} userData.phone_number - Phone number
   * @param {string} userData.name - User name (optional)
   * @param {string} userData.role - Role name (renter, agent, owner)
   * @returns {Object} - Created user with role
   */
  async createUserWithRole(userData) {
    const { phone_number, name, role } = userData;
    const cleanNumber = phone_number.replace('whatsapp:', '');
    let roleRecord = null;
    if (role) {
      if (!ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}`);
      }
      roleRecord = await UserRole.findByRole(role, true);
      if (!roleRecord) {
        throw new Error(`Role not found: ${role}`);
      }
    }
    // Always set onboarded: false unless role is provided
    const user = await this.create({
      phone_number: cleanNumber,
      name,
      onboarded: !!role, // If role is provided, mark as onboarded
      ...(roleRecord ? { role_id: roleRecord.id } : {})
    });
    return await this.getUserWithRole(user.id);
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} - Updated user
   */
  async updateProfile(userId, updates) {
    // Remove role from updates (use updateRole method instead)
    const { role, ...userUpdates } = updates;
    
    if (Object.keys(userUpdates).length === 0) {
      return await this.getUserWithRole(userId);
    }

    return await this.updateById(userId, userUpdates);
  }

  /**
   * Update user role
   * @param {string} userId - User ID
   * @param {string} newRole - New role name
   * @returns {Object|null} - Updated user with role
   */
  async updateRole(userId, newRole) {
    if (!ROLES.includes(newRole)) {
      throw new Error(`Invalid role: ${newRole}`);
    }
    const roleRecord = await UserRole.findByRole(newRole, true);
    if (!roleRecord) {
      throw new Error(`Role not found: ${newRole}`);
    }
    // Set onboarded: true when role is set
    await this.updateById(userId, { role_id: roleRecord.id, onboarded: true });
    return await this.getUserWithRole(userId);
  }

  /**
   * Get users by role
   * @param {string} role - Role name
   * @returns {Array} - Array of users with that role
   */
  async getUsersByRole(role) {
    const { data, error } = await this.db
      .from('users')
      .select(`
        *,
        user_roles!inner (
          id,
          role
        )
      `)
      .eq('user_roles.role', role)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Search users by name or phone
   * @param {string} searchTerm - Search term
   * @param {string} role - Optional role filter
   * @returns {Array} - Array of matching users
   */
  async searchUsers(searchTerm, role = null) {
    let query = this.db
      .from('users')
      .select(`
        *,
        user_roles!role_id (
          id,
          role
        )
      `)
      .or(`name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (role) {
      query = query.eq('user_roles.role', role);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get or create user by phone number
   * @param {string} phoneNumber - Phone number
   * @param {Object} defaultData - Default user data if creating
   * @returns {Object} - User record
   */
  async getOrCreateUser(phoneNumber, defaultData = {}) {
    const existingUser = await this.getUserByPhoneWithRole(phoneNumber);
    if (existingUser) {
      return existingUser;
    }
    // Create new user without a role unless provided
    const userData = {
      phone_number: phoneNumber,
      name: defaultData.name || null,
      role: defaultData.role || null
    };
    return await this.createUserWithRole(userData);
  }

  /**
   * Check if user exists by phone number
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} - True if user exists
   */
  async userExists(phoneNumber) {
    const user = await this.findByPhoneNumber(phoneNumber);
    return !!user;
  }
}

module.exports = new User(); 