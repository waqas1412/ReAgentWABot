const BaseModel = require('./BaseModel');

/**
 * UserPreference Model
 * Represents user search preferences for properties
 */
class UserPreference extends BaseModel {
  constructor() {
    super('user_preferences');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      user_id: 'uuid (foreign key to users)',
      preferred_location: 'text',
      budget_min: 'numeric',
      budget_max: 'numeric',
      bedrooms_min: 'int',
      bedrooms_max: 'int',
      bathrooms_min: 'int',
      bathrooms_max: 'int',
      area_min: 'numeric',
      area_max: 'numeric',
      preferred_neighborhood: 'text',
      urgency_in_weeks: 'numeric',
      created_at: 'timestamptz',
      updated_at: 'timestamp'
    };
  }

  /**
   * Get user preferences by user ID
   * @param {string} userId - User ID
   * @returns {Object|null} - User preferences
   */
  async getByUserId(userId) {
    return await this.findOne({ user_id: userId });
  }

  /**
   * Get user preferences with user information
   * @param {string} userId - User ID
   * @returns {Object|null} - Preferences with user data
   */
  async getPreferencesWithUser(userId) {
    const { data, error } = await this.db
      .from('user_preferences')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  }

  /**
   * Create or update user preferences
   * @param {string} userId - User ID
   * @param {Object} preferencesData - Preferences data
   * @returns {Object} - Created/updated preferences
   */
  async createOrUpdatePreferences(userId, preferencesData) {
    const existing = await this.getByUserId(userId);

    if (existing) {
      // Update existing preferences
      return await this.updateById(existing.id, preferencesData);
    } else {
      // Create new preferences
      return await this.create({
        user_id: userId,
        ...preferencesData
      });
    }
  }

  /**
   * Update user preferences by user ID
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} - Updated preferences
   */
  async updateByUserId(userId, updates) {
    const existing = await this.getByUserId(userId);
    if (!existing) {
      return null;
    }
    return await this.updateById(existing.id, updates);
  }

  /**
   * Delete user preferences by user ID
   * @param {string} userId - User ID
   * @returns {boolean} - True if deleted
   */
  async deleteByUserId(userId) {
    const existing = await this.getByUserId(userId);
    if (!existing) {
      return false;
    }
    return await this.deleteById(existing.id);
  }

  /**
   * Get users with similar preferences
   * @param {Object} preferences - Reference preferences
   * @param {Object} options - Search options
   * @returns {Array} - Array of users with similar preferences
   */
  async getUsersWithSimilarPreferences(preferences, options = {}) {
    const { 
      budget_min, 
      budget_max, 
      bedrooms_min, 
      bedrooms_max,
      preferred_location,
      preferred_neighborhood
    } = preferences;

    let query = this.db
      .from('user_preferences')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        )
      `);

    // Apply similarity filters
    if (budget_min !== undefined && budget_max !== undefined) {
      // Find overlapping budget ranges
      query = query.or(`budget_min.lte.${budget_max},budget_max.gte.${budget_min}`);
    }

    if (bedrooms_min !== undefined && bedrooms_max !== undefined) {
      // Find overlapping bedroom ranges
      query = query.or(`bedrooms_min.lte.${bedrooms_max},bedrooms_max.gte.${bedrooms_min}`);
    }

    if (preferred_location) {
      query = query.ilike('preferred_location', `%${preferred_location}%`);
    }

    if (preferred_neighborhood) {
      query = query.ilike('preferred_neighborhood', `%${preferred_neighborhood}%`);
    }

    // Apply options
    if (options.limit) {
      query = query.limit(options.limit);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get urgent users (with urgency_in_weeks set)
   * @param {number} maxWeeks - Maximum urgency in weeks
   * @returns {Array} - Array of urgent users
   */
  async getUrgentUsers(maxWeeks = 4) {
    const { data, error } = await this.db
      .from('user_preferences')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        )
      `)
      .not('urgency_in_weeks', 'is', null)
      .lte('urgency_in_weeks', maxWeeks)
      .order('urgency_in_weeks', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Convert preferences to property search filters
   * @param {Object} preferences - User preferences
   * @returns {Object} - Property search filters
   */
  static preferencesToSearchFilters(preferences) {
    const filters = {};

    if (preferences.budget_min !== undefined) {
      filters.minPrice = preferences.budget_min;
    }

    if (preferences.budget_max !== undefined) {
      filters.maxPrice = preferences.budget_max;
    }

    if (preferences.bedrooms_min !== undefined) {
      filters.minBedrooms = preferences.bedrooms_min;
    }

    if (preferences.bedrooms_max !== undefined) {
      filters.maxBedrooms = preferences.bedrooms_max;
    }

    if (preferences.bathrooms_min !== undefined) {
      filters.minBathrooms = preferences.bathrooms_min;
    }

    if (preferences.bathrooms_max !== undefined) {
      filters.maxBathrooms = preferences.bathrooms_max;
    }

    if (preferences.area_min !== undefined) {
      filters.minArea = preferences.area_min;
    }

    if (preferences.area_max !== undefined) {
      filters.maxArea = preferences.area_max;
    }

    if (preferences.preferred_neighborhood) {
      filters.neighborhood = preferences.preferred_neighborhood;
    }

    return filters;
  }

  /**
   * Validate preference ranges
   * @param {Object} preferences - Preferences to validate
   * @returns {Array} - Array of validation errors
   */
  static validatePreferences(preferences) {
    const errors = [];

    if (preferences.budget_min !== undefined && preferences.budget_max !== undefined) {
      if (preferences.budget_min > preferences.budget_max) {
        errors.push('Budget minimum cannot be greater than maximum');
      }
    }

    if (preferences.bedrooms_min !== undefined && preferences.bedrooms_max !== undefined) {
      if (preferences.bedrooms_min > preferences.bedrooms_max) {
        errors.push('Bedrooms minimum cannot be greater than maximum');
      }
    }

    if (preferences.bathrooms_min !== undefined && preferences.bathrooms_max !== undefined) {
      if (preferences.bathrooms_min > preferences.bathrooms_max) {
        errors.push('Bathrooms minimum cannot be greater than maximum');
      }
    }

    if (preferences.area_min !== undefined && preferences.area_max !== undefined) {
      if (preferences.area_min > preferences.area_max) {
        errors.push('Area minimum cannot be greater than maximum');
      }
    }

    if (preferences.urgency_in_weeks !== undefined && preferences.urgency_in_weeks < 0) {
      errors.push('Urgency in weeks cannot be negative');
    }

    return errors;
  }
}

module.exports = new UserPreference(); 