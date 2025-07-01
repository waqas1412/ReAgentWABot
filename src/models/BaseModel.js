const { supabase, supabaseAdmin } = require('../config/database');

/**
 * Base Model class providing common database operations
 * All model classes should extend this base class
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = supabase;      // Default to user client
    this.adminDb = supabaseAdmin; // Admin client for privileged operations
  }

  /**
   * Use admin database client for operations that bypass RLS
   */
  useAdminDb() {
    this.db = this.adminDb;
    return this;
  }

  /**
   * Use regular database client for normal operations
   */
  useUserDb() {
    this.db = supabase;
    return this;
  }

  /**
   * Find a record by ID
   * @param {string} id - Record ID
   * @param {string} select - Columns to select (default: '*')
   * @returns {Object|null} - Record or null if not found
   */
  async findById(id, select = '*') {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select(select)
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error(`Error finding ${this.tableName} by ID:`, error);
      throw error;
    }
  }

  /**
   * Find all records with optional filtering
   * @param {Object} filters - Filter conditions
   * @param {string} select - Columns to select (default: '*')
   * @param {Object} options - Query options (limit, order, etc.)
   * @returns {Array} - Array of records
   */
  async findAll(filters = {}, select = '*', options = {}) {
    try {
      let query = this.db.from(this.tableName).select(select);

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      // Apply options
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      if (options.orderBy) {
        const { column, ascending = true } = options.orderBy;
        query = query.order(column, { ascending });
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(`Error finding ${this.tableName} records:`, error);
      throw error;
    }
  }

  /**
   * Find one record with optional filtering
   * @param {Object} filters - Filter conditions
   * @param {string} select - Columns to select (default: '*')
   * @returns {Object|null} - Record or null if not found
   */
  async findOne(filters = {}, select = '*') {
    try {
      let query = this.db.from(this.tableName).select(select);

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error(`Error finding one ${this.tableName} record:`, error);
      throw error;
    }
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {string} select - Columns to return (default: '*')
   * @returns {Object} - Created record
   */
  async create(data, select = '*') {
    try {
      const { data: created, error } = await this.db
        .from(this.tableName)
        .insert(data)
        .select(select)
        .single();

      if (error) {
        throw error;
      }

      return created;
    } catch (error) {
      console.error(`Error creating ${this.tableName} record:`, error);
      throw error;
    }
  }

  /**
   * Update a record by ID
   * @param {string} id - Record ID
   * @param {Object} data - Updated data
   * @param {string} select - Columns to return (default: '*')
   * @returns {Object|null} - Updated record or null if not found
   */
  async updateById(id, data, select = '*') {
    try {
      const { data: updated, error } = await this.db
        .from(this.tableName)
        .update(data)
        .eq('id', id)
        .select(select)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return updated || null;
    } catch (error) {
      console.error(`Error updating ${this.tableName} record:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   * @param {string} id - Record ID
   * @returns {boolean} - True if deleted, false if not found
   */
  async deleteById(id) {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error(`Error deleting ${this.tableName} record:`, error);
      throw error;
    }
  }

  /**
   * Count records with optional filtering
   * @param {Object} filters - Filter conditions
   * @returns {number} - Number of records
   */
  async count(filters = {}) {
    try {
      let query = this.db.from(this.tableName).select('*', { count: 'exact', head: true });

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      console.error(`Error counting ${this.tableName} records:`, error);
      throw error;
    }
  }

  /**
   * Check if a record exists
   * @param {Object} filters - Filter conditions
   * @returns {boolean} - True if exists, false otherwise
   */
  async exists(filters = {}) {
    try {
      const count = await this.count(filters);
      return count > 0;
    } catch (error) {
      console.error(`Error checking ${this.tableName} existence:`, error);
      throw error;
    }
  }
}

module.exports = BaseModel; 