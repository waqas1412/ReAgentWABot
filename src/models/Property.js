const BaseModel = require('./BaseModel');

/**
 * Property Model
 * Represents properties in the system
 */
class Property extends BaseModel {
  constructor() {
    super('properties');
  }

  /**
   * Schema definition
   */
  static get schema() {
    return {
      id: 'uuid (primary key)',
      owner_id: 'uuid (foreign key to users)',
      agent_id: 'uuid (foreign key to users)',
      address: 'varchar(255) (required)',
      description: 'text',
      price: 'numeric (required)',
      bedrooms: 'int',
      bathrooms: 'int',
      availability: 'jsonb',
      status: 'varchar(50) (required)',
      area: 'numeric',
      price_per_sqm: 'numeric (computed)',
      neighborhood: 'text',
      district_id: 'uuid (foreign key to districts)',
      floor: 'varchar(50)',
      elevator: 'boolean',
      furnished: 'boolean',
      air_conditioning: 'boolean',
      work_room: 'boolean',
      property_link: 'varchar(1000)',
      remarks: 'text',
      renter_comments: 'text',
      agent_comments: 'text',
      built_year: 'varchar(50)',
      available_from: 'date',
      type_id: 'uuid (foreign key to apartment_types)',
      created_at: 'timestamptz',
      updated_at: 'timestamptz'
    };
  }

  /**
   * Property status constants
   */
  static get STATUS() {
    return {
      ACTIVE: 'active',
      PENDING: 'pending',
      RENTED: 'rented',
      SOLD: 'sold',
      UNAVAILABLE: 'unavailable'
    };
  }

  /**
   * Get property with all related data
   * @param {string} propertyId - Property ID
   * @returns {Object|null} - Property with relationships
   */
  async getPropertyWithDetails(propertyId) {
    const { data, error } = await this.db
      .from('properties')
      .select(`
        *,
        owner:owner_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        agent:agent_id (
          id,
          name,
          phone_number,
          user_roles:role_id (role)
        ),
        apartment_types:type_id (
          id,
          type
        ),
        districts:district_id (
          id,
          district,
          countries:country_id (
            id,
            country
          )
        )
      `)
      .eq('id', propertyId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  }

  /**
   * Search properties with filters
   * @param {Object} filters - Search filters
   * @param {Object} options - Query options
   * @returns {Array} - Array of properties
   */
  async searchProperties(filters = {}, options = {}) {
    const {
      status,
      minPrice,
      maxPrice,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minArea,
      maxArea,
      district,
      neighborhood,
      furnished,
      elevator,
      airConditioning,
      workRoom,
      apartmentType,
      ownerId,
      agentId,
      availableFrom
    } = filters;

    let query = this.db
      .from('properties')
      .select(`
        *,
        owner:owner_id (
          id,
          name,
          phone_number
        ),
        agent:agent_id (
          id,
          name,
          phone_number
        ),
        apartment_types:type_id (
          id,
          type
        ),
        districts:district_id (
          id,
          district
        )
      `);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (minPrice !== undefined) {
      query = query.gte('price', minPrice);
    }

    if (maxPrice !== undefined) {
      query = query.lte('price', maxPrice);
    }

    if (minBedrooms !== undefined) {
      query = query.gte('bedrooms', minBedrooms);
    }

    if (maxBedrooms !== undefined) {
      query = query.lte('bedrooms', maxBedrooms);
    }

    if (minBathrooms !== undefined) {
      query = query.gte('bathrooms', minBathrooms);
    }

    if (maxBathrooms !== undefined) {
      query = query.lte('bathrooms', maxBathrooms);
    }

    if (minArea !== undefined) {
      query = query.gte('area', minArea);
    }

    if (maxArea !== undefined) {
      query = query.lte('area', maxArea);
    }

    if (district) {
      query = query.eq('district_id', district);
    }

    if (neighborhood) {
      query = query.ilike('neighborhood', `%${neighborhood}%`);
    }

    if (furnished !== undefined) {
      query = query.eq('furnished', furnished);
    }

    if (elevator !== undefined) {
      query = query.eq('elevator', elevator);
    }

    if (airConditioning !== undefined) {
      query = query.eq('air_conditioning', airConditioning);
    }

    if (workRoom !== undefined) {
      query = query.eq('work_room', workRoom);
    }

    if (apartmentType) {
      query = query.eq('type_id', apartmentType);
    }

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    if (availableFrom) {
      query = query.gte('available_from', availableFrom);
    }

    // Apply options
    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    // Default ordering
    const orderBy = options.orderBy || { column: 'created_at', ascending: false };
    query = query.order(orderBy.column, { ascending: orderBy.ascending });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Get properties by owner
   * @param {string} ownerId - Owner user ID
   * @param {string} status - Optional status filter
   * @returns {Array} - Array of properties
   */
  async getPropertiesByOwner(ownerId, status = null) {
    const filters = { ownerId };
    if (status) {
      filters.status = status;
    }
    return await this.searchProperties(filters);
  }

  /**
   * Get properties by agent
   * @param {string} agentId - Agent user ID
   * @param {string} status - Optional status filter
   * @returns {Array} - Array of properties
   */
  async getPropertiesByAgent(agentId, status = null) {
    const filters = { agentId };
    if (status) {
      filters.status = status;
    }
    return await this.searchProperties(filters);
  }

  /**
   * Create property with validation
   * @param {Object} propertyData - Property data
   * @returns {Object} - Created property with details
   */
  async createProperty(propertyData) {
    // Validate required fields
    const { owner_id, address, price, status = Property.STATUS.ACTIVE } = propertyData;

    if (!owner_id || !address || !price) {
      throw new Error('Missing required fields: owner_id, address, price');
    }

    // Validate status
    if (!Object.values(Property.STATUS).includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const property = await this.create({
      ...propertyData,
      status
    });

    return await this.getPropertyWithDetails(property.id);
  }

  /**
   * Update property status
   * @param {string} propertyId - Property ID
   * @param {string} newStatus - New status
   * @returns {Object|null} - Updated property
   */
  async updateStatus(propertyId, newStatus) {
    if (!Object.values(Property.STATUS).includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const updated = await this.updateById(propertyId, { status: newStatus });
    if (updated) {
      return await this.getPropertyWithDetails(propertyId);
    }
    return null;
  }

  /**
   * Add agent to property
   * @param {string} propertyId - Property ID
   * @param {string} agentId - Agent user ID
   * @returns {Object|null} - Updated property
   */
  async assignAgent(propertyId, agentId) {
    const updated = await this.updateById(propertyId, { agent_id: agentId });
    if (updated) {
      return await this.getPropertyWithDetails(propertyId);
    }
    return null;
  }

  /**
   * Remove agent from property
   * @param {string} propertyId - Property ID
   * @returns {Object|null} - Updated property
   */
  async removeAgent(propertyId) {
    const updated = await this.updateById(propertyId, { agent_id: null });
    if (updated) {
      return await this.getPropertyWithDetails(propertyId);
    }
    return null;
  }

  /**
   * Get available properties (active status)
   * @param {Object} filters - Additional filters
   * @param {Object} options - Query options
   * @returns {Array} - Array of available properties
   */
  async getAvailableProperties(filters = {}, options = {}) {
    return await this.searchProperties({
      ...filters,
      status: Property.STATUS.ACTIVE
    }, options);
  }

  /**
   * Get property statistics
   * @returns {Object} - Property statistics
   */
  async getStatistics() {
    const { data, error } = await this.db
      .from('properties')
      .select('status')
      .not('status', 'is', null);

    if (error) {
      throw error;
    }

    const stats = {
      total: data.length,
      active: 0,
      pending: 0,
      rented: 0,
      sold: 0,
      unavailable: 0
    };

    data.forEach(property => {
      if (stats.hasOwnProperty(property.status)) {
        stats[property.status]++;
      }
    });

    return stats;
  }

  /**
   * Check if property status is valid
   * @param {string} status - Status to validate
   * @returns {boolean} - True if valid
   */
  static isValidStatus(status) {
    return Object.values(Property.STATUS).includes(status);
  }
}

module.exports = new Property(); 