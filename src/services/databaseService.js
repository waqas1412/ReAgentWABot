const {
  User,
  UserRole,
  Property,
  UserPreference,
  ApartmentType,
  Country,
  City,
  District,
  ViewingTimeSlot,
  ViewingAppointment
} = require('../models');

/**
 * Database Service
 * Provides high-level business logic operations using models
 */
class DatabaseService {
  
  /**
   * Initialize default reference data
   */
  async initializeReferenceData() {
    try {
      console.log('Initializing reference data...');
      
      // Initialize default user roles
      await UserRole.initializeDefaultRoles();
      console.log('✅ User roles initialized');
      
      // Initialize default time slots
      await ViewingTimeSlot.initializeDefaultSlots();
      console.log('✅ Viewing time slots initialized');
      
      // Initialize default apartment types (using admin client)
      const apartmentTypes = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom', 'Penthouse'];
      for (const type of apartmentTypes) {
        try {
          await ApartmentType.createIfNotExists(type);
        } catch (error) {
          console.error(`Error creating apartment type ${type}:`, error.message);
        }
      }
      console.log('✅ Apartment types initialized');
      
      console.log('✅ Reference data initialization complete');
      return true;
    } catch (error) {
      console.error('❌ Reference data initialization failed:', error.message);
      return false;
    }
  }

  /**
   * User Management Operations
   */
  
  /**
   * Get or create user from WhatsApp phone number
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} name - Optional user name
   * @returns {Object} - User object with role
   */
  async getOrCreateUserFromWhatsApp(phoneNumber, name = null) {
    const cleanNumber = phoneNumber.replace('whatsapp:', '');
    return await User.getOrCreateUser(cleanNumber, { name });
  }

  /**
   * Update user profile information
   * @param {string} phoneNumber - User phone number
   * @param {Object} updates - Profile updates
   * @returns {Object|null} - Updated user
   */
  async updateUserProfile(phoneNumber, updates) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }
      
      return await User.updateProfile(user.id, updates);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Property Management Operations
   */
  
  /**
   * Search properties based on user preferences or custom filters
   * @param {Object} searchParams - Search parameters
   * @param {Object} options - Query options
   * @returns {Array} - Array of matching properties
   */
  async searchProperties(searchParams = {}, options = {}) {
    try {
      return await Property.searchProperties(searchParams, options);
    } catch (error) {
      console.error('Error searching properties:', error);
      throw error;
    }
  }

  /**
   * Get properties matching user preferences
   * @param {string} userId - User ID
   * @returns {Array} - Array of matching properties
   */
  async getPropertiesForUser(userId) {
    try {
      const preferences = await UserPreference.getByUserId(userId);
      if (!preferences) {
        // Return all active properties if no preferences set
        return await Property.getAvailableProperties();
      }

      const searchFilters = UserPreference.preferencesToSearchFilters(preferences);
      return await Property.searchProperties(searchFilters);
    } catch (error) {
      console.error('Error getting properties for user:', error);
      throw error;
    }
  }

  /**
   * Create new property listing
   * @param {Object} propertyData - Property data
   * @returns {Object} - Created property
   */
  async createProperty(propertyData) {
    try {
      return await Property.createProperty(propertyData);
    } catch (error) {
      console.error('Error creating property:', error);
      throw error;
    }
  }

  /**
   * User Preferences Operations
   */
  
  /**
   * Set user preferences
   * @param {string} phoneNumber - User phone number
   * @param {Object} preferences - User preferences
   * @returns {Object} - Saved preferences
   */
  async setUserPreferences(phoneNumber, preferences) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate preferences
      const validationErrors = UserPreference.validatePreferences(preferences);
      if (validationErrors.length > 0) {
        throw new Error(`Invalid preferences: ${validationErrors.join(', ')}`);
      }

      return await UserPreference.createOrUpdatePreferences(user.id, preferences);
    } catch (error) {
      console.error('Error setting user preferences:', error);
      throw error;
    }
  }

  /**
   * Get user preferences
   * @param {string} phoneNumber - User phone number
   * @returns {Object|null} - User preferences
   */
  async getUserPreferences(phoneNumber) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        return null;
      }

      return await UserPreference.getByUserId(user.id);
    } catch (error) {
      console.error('Error getting user preferences:', error);
      throw error;
    }
  }

  /**
   * Viewing Appointments Operations
   */
  
  /**
   * Book viewing appointment
   * @param {string} phoneNumber - User phone number
   * @param {string} timeSlotId - Time slot ID
   * @param {string} date - Appointment date (YYYY-MM-DD)
   * @returns {Object} - Created appointment
   */
  async bookViewingAppointment(phoneNumber, timeSlotId, date) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      return await ViewingAppointment.createAppointment({
        user_id: user.id,
        viewing_time_slot_id: timeSlotId,
        appointment_date: date
      });
    } catch (error) {
      console.error('Error booking appointment:', error);
      throw error;
    }
  }

  /**
   * Get user appointments
   * @param {string} phoneNumber - User phone number
   * @param {Object} options - Query options
   * @returns {Array} - Array of appointments
   */
  async getUserAppointments(phoneNumber, options = {}) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        return [];
      }

      return await ViewingAppointment.getAppointmentsByUser(user.id, options);
    } catch (error) {
      console.error('Error getting user appointments:', error);
      throw error;
    }
  }

  /**
   * Cancel appointment
   * @param {string} phoneNumber - User phone number
   * @param {string} appointmentId - Appointment ID
   * @returns {boolean} - True if cancelled
   */
  async cancelAppointment(phoneNumber, appointmentId) {
    try {
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      return await ViewingAppointment.cancelAppointment(appointmentId, user.id);
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      throw error;
    }
  }

  /**
   * Get available time slots for a date
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Array} - Available time slots
   */
  async getAvailableTimeSlots(date) {
    try {
      return await ViewingTimeSlot.getAvailableSlotsForDate(date);
    } catch (error) {
      console.error('Error getting available time slots:', error);
      throw error;
    }
  }

  /**
   * Location Management Operations
   */
  
  /**
   * Get or create location entities
   * @param {Object} locationData - Location data
   * @param {boolean} useAdmin - Whether to use admin client for creation
   * @returns {Object} - Location IDs
   */
  async getOrCreateLocation(locationData, useAdmin = false) {
    try {
      const { country, city, district } = locationData;
      const result = {};

      if (country) {
        const countryRecord = await Country.createIfNotExists(country, useAdmin);
        result.countryId = countryRecord.id;

        if (city) {
          const cityRecord = await City.createIfNotExists(city, result.countryId, useAdmin);
          result.cityId = cityRecord.id;
        }

        if (district) {
          const districtRecord = await District.createIfNotExists(district, result.countryId, useAdmin);
          result.districtId = districtRecord.id;
        }
      }

      return result;
    } catch (error) {
      console.error('Error creating location:', error);
      throw error;
    }
  }

  /**
   * Analytics and Statistics
   */
  
  /**
   * Get system statistics
   * @returns {Object} - System statistics
   */
  async getSystemStatistics() {
    try {
      const [
        userStats,
        propertyStats,
        appointmentStats
      ] = await Promise.all([
        this.getUserStatistics(),
        Property.getStatistics(),
        ViewingAppointment.getStatistics()
      ]);

      return {
        users: userStats,
        properties: propertyStats,
        appointments: appointmentStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting system statistics:', error);
      throw error;
    }
  }

  /**
   * Get user statistics by role
   * @returns {Object} - User statistics
   */
  async getUserStatistics() {
    try {
      const [renters, agents, owners] = await Promise.all([
        User.getUsersByRole('renter'),
        User.getUsersByRole('agent'),
        User.getUsersByRole('owner')
      ]);

      return {
        total: renters.length + agents.length + owners.length,
        renters: renters.length,
        agents: agents.length,
        owners: owners.length
      };
    } catch (error) {
      console.error('Error getting user statistics:', error);
      throw error;
    }
  }

  /**
   * Utility Methods
   */
  
  /**
   * Format property for WhatsApp display
   * @param {Object} property - Property object
   * @returns {string} - Formatted property string
   */
  formatPropertyForWhatsApp(property) {
    const lines = [];
    
    lines.push(`🏠 *${property.address}*`);
    
    if (property.price) {
      lines.push(`💰 Price: $${property.price.toLocaleString()}`);
    }
    
    if (property.bedrooms || property.bathrooms) {
      const rooms = [];
      if (property.bedrooms) rooms.push(`${property.bedrooms} bed`);
      if (property.bathrooms) rooms.push(`${property.bathrooms} bath`);
      lines.push(`🛏️ ${rooms.join(', ')}`);
    }
    
    if (property.area) {
      lines.push(`📐 Area: ${property.area} sqm`);
      if (property.price_per_sqm) {
        lines.push(`📊 Price/sqm: $${property.price_per_sqm.toFixed(2)}`);
      }
    }
    
    if (property.neighborhood) {
      lines.push(`📍 ${property.neighborhood}`);
    }
    
    if (property.apartment_types?.type) {
      lines.push(`🏢 Type: ${property.apartment_types.type}`);
    }
    
    const features = [];
    if (property.furnished) features.push('Furnished');
    if (property.elevator) features.push('Elevator');
    if (property.air_conditioning) features.push('AC');
    if (property.work_room) features.push('Work Room');
    
    if (features.length > 0) {
      lines.push(`✨ Features: ${features.join(', ')}`);
    }
    
    if (property.description) {
      lines.push(`📝 ${property.description}`);
    }
    
    if (property.property_link) {
      lines.push(`🔗 View Details: ${property.property_link}`);
    }
    
    return lines.join('\n');
  }
}

module.exports = new DatabaseService(); 