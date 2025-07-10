const BaseModel = require('./BaseModel');

/**
 * ViewingAppointment Model
 * Represents viewing appointments for properties
 */
class ViewingAppointment extends BaseModel {
  constructor() {
    super('viewing_appointments');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      user_id: 'uuid (foreign key to users)',
      property_id: 'uuid (foreign key to properties)',
      viewing_time_slot_id: 'uuid (foreign key to viewing_time_slots)',
      appointment_date: 'date (required)',
      start_time: 'time',
      end_time: 'time',
      status: 'varchar(50)',
      created_at: 'timestamptz'
    };
  }

  /**
   * Get appointment with full details
   * @param {string} appointmentId - Appointment ID
   * @returns {Object|null} - Appointment with relationships
   */
  async getAppointmentWithDetails(appointmentId) {
    const { data, error } = await this.db
      .from('viewing_appointments')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        viewing_time_slots:viewing_time_slot_id (
          id,
          start_time,
          end_time
        )
      `)
      .eq('id', appointmentId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  }

  /**
   * Get appointments by user ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of appointments
   */
  async getAppointmentsByUser(userId, options = {}) {
    let query = this.db
      .from('viewing_appointments')
      .select(`
        *,
        viewing_time_slots:viewing_time_slot_id (
          id,
          start_time,
          end_time
        )
      `)
      .eq('user_id', userId);

    // Apply date filter if provided
    if (options.fromDate) {
      query = query.gte('appointment_date', options.fromDate);
    }

    if (options.toDate) {
      query = query.lte('appointment_date', options.toDate);
    }

    // Default ordering by date and time
    query = query.order('appointment_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get appointments for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} - Array of appointments for the date
   */
  async getAppointmentsByDate(date) {
    const { data, error } = await this.db
      .from('viewing_appointments')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        viewing_time_slots:viewing_time_slot_id (
          id,
          start_time,
          end_time
        )
      `)
      .eq('appointment_date', date)
      .order('viewing_time_slots.start_time', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Create appointment with validation
   * @param {Object} appointmentData - Appointment data
   * @returns {Object} - Created appointment with details
   */
  async createAppointment(appointmentData) {
    const { user_id, property_id, appointment_date, start_time, end_time } = appointmentData;

    // Validate required fields
    if (!user_id || !property_id || !appointment_date || !start_time || !end_time) {
      throw new Error('Missing required fields for appointment creation.');
    }

    // Use admin database to bypass RLS policies for appointment creation
    const originalDb = this.db;
    this.useAdminDb();

    try {
      // Check if user already has an appointment for this property at this time
      const { data: existingAppointment, error: findError } = await this.db
        .from('viewing_appointments')
        .select('id')
        .eq('user_id', user_id)
        .eq('property_id', property_id)
        .eq('appointment_date', appointment_date)
        .lt('start_time', end_time)
        .gt('end_time', start_time)
        .single();

      if (findError && findError.code !== 'PGRST116') { // Ignore "No rows found"
        throw findError;
      }

      if (existingAppointment) {
        throw new Error('User already has an overlapping appointment for this property.');
      }

      // Create the appointment using admin privileges
      const appointment = await this.create(appointmentData);
      
      // Get appointment details using admin privileges as well
      const { data: appointmentWithDetails, error: detailsError } = await this.db
        .from('viewing_appointments')
        .select(`
          *,
          users:user_id (
            id,
            name,
            phone_number,
            user_roles:role_id (role)
          ),
          viewing_time_slots:viewing_time_slot_id (
            id,
            start_time,
            end_time
          )
        `)
        .eq('id', appointment.id)
        .single();
      
      // Restore original database connection
      this.db = originalDb;
      
      if (detailsError && detailsError.code !== 'PGRST116') {
        throw detailsError;
      }
      
      return appointmentWithDetails || appointment;
      
    } catch (error) {
      // Restore original database connection on error
      this.db = originalDb;
      throw error;
    }
  }

  /**
   * Check if time slot is available for a date
   * @param {string} timeSlotId - Time slot ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {boolean} - True if available
   */
  async isSlotAvailable(timeSlotId, date) {
    const existing = await this.findOne({
      viewing_time_slot_id: timeSlotId,
      appointment_date: date
    });
    return !existing;
  }

  /**
   * Cancel appointment
   * @param {string} appointmentId - Appointment ID
   * @param {string} userId - User ID (for authorization)
   * @returns {boolean} - True if cancelled
   */
  async cancelAppointment(appointmentId, userId = null) {
    // If userId provided, verify the appointment belongs to the user
    if (userId) {
      const appointment = await this.findById(appointmentId);
      if (!appointment || appointment.user_id !== userId) {
        throw new Error('Appointment not found or unauthorized');
      }
    }

    return await this.deleteById(appointmentId);
  }

  /**
   * Reschedule appointment
   * @param {string} appointmentId - Appointment ID
   * @param {string} newTimeSlotId - New time slot ID
   * @param {string} newDate - New date
   * @param {string} userId - User ID (for authorization)
   * @returns {Object|null} - Updated appointment
   */
  async rescheduleAppointment(appointmentId, newTimeSlotId, newDate, userId = null) {
    // Get existing appointment
    const appointment = await this.findById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    // Verify authorization if userId provided
    if (userId && appointment.user_id !== userId) {
      throw new Error('Unauthorized to reschedule this appointment');
    }

    // Check if new slot is available
    const isAvailable = await this.isSlotAvailable(newTimeSlotId, newDate);
    if (!isAvailable) {
      throw new Error('New time slot is not available');
    }

    // Update appointment
    const updated = await this.updateById(appointmentId, {
      viewing_time_slot_id: newTimeSlotId,
      appointment_date: newDate
    });

    if (updated) {
      return await this.getAppointmentWithDetails(appointmentId);
    }
    return null;
  }

  /**
   * Get upcoming appointments
   * @param {string} userId - Optional user ID filter
   * @param {number} days - Number of days ahead to look
   * @returns {Array} - Array of upcoming appointments
   */
  async getUpcomingAppointments(userId = null, days = 7) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    let query = this.db
      .from('viewing_appointments')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        viewing_time_slots:viewing_time_slot_id (
          id,
          start_time,
          end_time
        )
      `)
      .gte('appointment_date', today.toISOString().split('T')[0])
      .lte('appointment_date', futureDate.toISOString().split('T')[0]);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    query = query.order('appointment_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get past appointments
   * @param {string} userId - Optional user ID filter
   * @param {number} days - Number of days back to look
   * @returns {Array} - Array of past appointments
   */
  async getPastAppointments(userId = null, days = 30) {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - days);

    let query = this.db
      .from('viewing_appointments')
      .select(`
        *,
        users:user_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        viewing_time_slots:viewing_time_slot_id (
          id,
          start_time,
          end_time
        )
      `)
      .lt('appointment_date', today.toISOString().split('T')[0])
      .gte('appointment_date', pastDate.toISOString().split('T')[0]);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    query = query.order('appointment_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get appointment statistics
   * @param {Object} filters - Optional filters
   * @returns {Object} - Appointment statistics
   */
  async getStatistics(filters = {}) {
    let query = this.db
      .from('viewing_appointments')
      .select('appointment_date, created_at');

    // Apply date range filters
    if (filters.fromDate) {
      query = query.gte('appointment_date', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.lte('appointment_date', filters.toDate);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const today = new Date().toISOString().split('T')[0];
    const stats = {
      total: data.length,
      upcoming: 0,
      past: 0,
      today: 0
    };

    data.forEach(appointment => {
      if (appointment.appointment_date === today) {
        stats.today++;
      } else if (appointment.appointment_date > today) {
        stats.upcoming++;
      } else {
        stats.past++;
      }
    });

    return stats;
  }

  /**
   * Format appointment for display
   * @param {Object} appointment - Appointment object with relationships
   * @returns {string} - Formatted appointment string
   */
  static formatAppointment(appointment) {
    if (!appointment.viewing_time_slots || !appointment.appointment_date) {
      return 'Invalid appointment data';
    }

    const timeSlot = appointment.viewing_time_slots;
    const date = new Date(appointment.appointment_date).toLocaleDateString();
    const time = `${timeSlot.start_time} - ${timeSlot.end_time}`;
    
    return `${date} at ${time}`;
  }
}

module.exports = new ViewingAppointment(); 