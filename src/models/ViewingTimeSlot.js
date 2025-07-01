const BaseModel = require('./BaseModel');

/**
 * ViewingTimeSlot Model
 * Represents available time slots for property viewings
 */
class ViewingTimeSlot extends BaseModel {
  constructor() {
    super('viewing_time_slots');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      start_time: 'time',
      end_time: 'time',
      created_at: 'timestamptz'
    };
  }

  /**
   * Get all time slots ordered by start time
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Array} - Array of time slots
   */
  async getAllTimeSlots(useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findAll({}, '*', { 
      orderBy: { column: 'start_time', ascending: true } 
    });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Find time slot by time range
   * @param {string} startTime - Start time (HH:MM format)
   * @param {string} endTime - End time (HH:MM format)
   * @param {boolean} useAdmin - Whether to use admin client
   * @returns {Object|null} - Time slot record
   */
  async findByTimeRange(startTime, endTime, useAdmin = false) {
    if (useAdmin) this.useAdminDb();
    const result = await this.findOne({ 
      start_time: startTime, 
      end_time: endTime 
    });
    if (useAdmin) this.useUserDb();
    return result;
  }

  /**
   * Create time slot if it doesn't exist
   * @param {string} startTime - Start time (HH:MM format)
   * @param {string} endTime - End time (HH:MM format)
   * @returns {Object} - Time slot record
   */
  async createIfNotExists(startTime, endTime) {
    // Use admin db for checking existing slots to bypass RLS
    const existing = await this.findByTimeRange(startTime, endTime, true);
    if (existing) {
      return existing;
    }
    
    this.useAdminDb();
    const created = await this.create({ 
      start_time: startTime, 
      end_time: endTime 
    });
    this.useUserDb(); // Reset to user db
    return created;
  }

  /**
   * Get time slots that overlap with given time range
   * @param {string} startTime - Start time to check
   * @param {string} endTime - End time to check
   * @returns {Array} - Array of overlapping time slots
   */
  async getOverlappingSlots(startTime, endTime) {
    const { data, error } = await this.db
      .from('viewing_time_slots')
      .select('*')
      .or(`start_time.lt.${endTime},end_time.gt.${startTime}`)
      .order('start_time');

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get available time slots for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} - Array of available time slots with booking status
   */
  async getAvailableSlotsForDate(date) {
    const { data, error } = await this.db
      .from('viewing_time_slots')
      .select(`
        *,
        viewing_appointments!left (
          id,
          appointment_date,
          users:user_id (
            id,
            name,
            phone_number
          )
        )
      `)
      .not('viewing_appointments.appointment_date', 'eq', date)
      .order('start_time');

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get time slots with appointments for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} - Array of time slots with appointment details
   */
  async getSlotsWithAppointmentsForDate(date) {
    const { data, error } = await this.db
      .from('viewing_time_slots')
      .select(`
        *,
        viewing_appointments!inner (
          id,
          appointment_date,
          users:user_id (
            id,
            name,
            phone_number,
            user_roles:role_id (role)
          )
        )
      `)
      .eq('viewing_appointments.appointment_date', date)
      .order('start_time');

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Check if time slot is available on a specific date
   * @param {string} timeSlotId - Time slot ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {boolean} - True if available
   */
  async isSlotAvailable(timeSlotId, date) {
    const { data, error } = await this.db
      .from('viewing_appointments')
      .select('id')
      .eq('viewing_time_slot_id', timeSlotId)
      .eq('appointment_date', date)
      .limit(1);

    if (error) {
      throw error;
    }

    return !data || data.length === 0;
  }

  /**
   * Get popular time slots (most frequently booked)
   * @param {number} limit - Number of slots to return
   * @returns {Array} - Array of popular time slots with booking count
   */
  async getPopularTimeSlots(limit = 10) {
    const { data, error } = await this.db
      .from('viewing_time_slots')
      .select(`
        *,
        viewing_appointments (count)
      `)
      .order('viewing_appointments.count', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Initialize default time slots
   * @returns {Array} - Created time slots
   */
  async initializeDefaultSlots() {
    const defaultSlots = [
      { start_time: '09:00', end_time: '10:00' },
      { start_time: '10:00', end_time: '11:00' },
      { start_time: '11:00', end_time: '12:00' },
      { start_time: '12:00', end_time: '13:00' },
      { start_time: '13:00', end_time: '14:00' },
      { start_time: '14:00', end_time: '15:00' },
      { start_time: '15:00', end_time: '16:00' },
      { start_time: '16:00', end_time: '17:00' },
      { start_time: '17:00', end_time: '18:00' },
      { start_time: '18:00', end_time: '19:00' }
    ];

    const createdSlots = [];
    
    for (const slot of defaultSlots) {
      try {
        const created = await this.createIfNotExists(slot.start_time, slot.end_time);
        createdSlots.push(created);
      } catch (error) {
        console.error(`Error creating time slot ${slot.start_time}-${slot.end_time}:`, error.message);
      }
    }

    return createdSlots;
  }

  /**
   * Format time slot for display
   * @param {Object} timeSlot - Time slot object
   * @returns {string} - Formatted time range
   */
  static formatTimeSlot(timeSlot) {
    if (!timeSlot.start_time || !timeSlot.end_time) {
      return 'Unknown time';
    }
    return `${timeSlot.start_time} - ${timeSlot.end_time}`;
  }

  /**
   * Validate time range
   * @param {string} startTime - Start time
   * @param {string} endTime - End time
   * @returns {Array} - Array of validation errors
   */
  static validateTimeRange(startTime, endTime) {
    const errors = [];

    if (!startTime || !endTime) {
      errors.push('Both start time and end time are required');
      return errors;
    }

    // Convert to comparable format
    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    if (start >= end) {
      errors.push('Start time must be before end time');
    }

    // Check if times are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push('Invalid time format. Use HH:MM format');
    }

    return errors;
  }
}

module.exports = new ViewingTimeSlot(); 