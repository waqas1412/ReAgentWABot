const openaiService = require('./openaiService');
const dataValidationService = require('./dataValidationService');
const Property = require('../models/Property');
const User = require('../models/User');

/**
 * Property Management Service
 * Handles property CRUD operations for owners and agents
 */
class PropertyManagementService {
  /**
   * Get all properties for a specific user (owner/agent)
   * @param {object} user - User object
   * @returns {Promise<Array>} - User's properties
   */
  async getUserProperties(user) {
    try {
      console.log(`📋 [PROPERTY_MGMT] Getting properties for user ${user.phone_number}`);
      
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        throw new Error('Only owners and agents can view property listings');
      }

      // Get properties with related data
      const { data, error } = await Property.adminDb
        .from('properties')
        .select(`
          *,
          districts:district_id(district, cities:city_id(city, countries:country_id(country))),
          apartment_types:type_id(type)
        `)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      console.log(`✅ [PROPERTY_MGMT] Found ${data?.length || 0} properties for user`);
      return data || [];
    } catch (error) {
      console.error('❌ [PROPERTY_MGMT] Error getting user properties:', error);
      throw new Error(`Failed to get properties: ${error.message}`);
    }
  }

  /**
   * Update property via natural language request
   * @param {string} updateMessage - Natural language update request
   * @param {object} user - User object
   * @returns {Promise<object>} - Update result
   */
  async updatePropertyViaMessage(updateMessage, user) {
    try {
      console.log(`🔄 [PROPERTY_MGMT] Processing update request: "${updateMessage}"`);

      // Verify user permissions
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        throw new Error('Only owners and agents can update properties');
      }

      // Get user's properties for context
      const userProperties = await this.getUserProperties(user);
      
      if (userProperties.length === 0) {
        return {
          success: false,
          message: "You don't have any properties to update. Add a property first!",
          needsAction: 'add_property'
        };
      }

      // Parse the update request using OpenAI
      const updateParsed = await openaiService.parseUpdateRequest(updateMessage, userProperties);
      console.log(`🧠 [PROPERTY_MGMT] Parsed update:`, updateParsed);

      // Handle different identification methods
      const identificationResult = await this.identifyProperty(updateParsed.propertyIdentification, userProperties);
      
      if (!identificationResult.success) {
        return identificationResult;
      }

      // Validate updates
      const validationResult = this.validateUpdates(updateParsed.updates);
      if (!validationResult.valid) {
        return {
          success: false,
          message: `Invalid update data: ${validationResult.errors.join(', ')}`,
          needsAction: 'clarify_update'
        };
      }

      // Perform the update
      const updateResult = await this.performPropertyUpdate(
        identificationResult.property.id,
        updateParsed.updates,
        user
      );

      return {
        success: true,
        message: updateResult.message,
        property: updateResult.property,
        changedFields: Object.keys(updateParsed.updates)
      };

    } catch (error) {
      console.error('❌ [PROPERTY_MGMT] Error updating property:', error);
      return {
        success: false,
        message: `Update failed: ${error.message}`,
        needsAction: 'retry'
      };
    }
  }

  /**
   * Identify which property the user wants to update
   * @param {object} identification - Property identification from OpenAI
   * @param {Array} userProperties - User's properties
   * @returns {Promise<object>} - Identification result
   */
  async identifyProperty(identification, userProperties) {
    try {
      console.log(`🎯 [PROPERTY_MGMT] Identifying property:`, identification);

      switch (identification.method) {
        case 'single':
          if (userProperties.length === 1) {
            return {
              success: true,
              property: userProperties[0]
            };
          } else {
            return {
              success: false,
              message: `You have ${userProperties.length} properties. Please specify which one to update.`,
              needsAction: 'property_selection',
              properties: userProperties.map(p => ({
                id: p.id,
                address: p.address,
                type: p.property_type,
                price: p.price
              }))
            };
          }

        case 'address':
          const addressMatches = userProperties.filter(p => 
            p.address.toLowerCase().includes(identification.criteria.toLowerCase())
          );
          if (addressMatches.length === 1) {
            return { success: true, property: addressMatches[0] };
          } else if (addressMatches.length > 1) {
            return {
              success: false,
              message: `Found ${addressMatches.length} properties matching "${identification.criteria}". Please be more specific.`,
              needsAction: 'property_selection',
              properties: addressMatches.map(p => ({
                id: p.id,
                address: p.address,
                type: p.property_type,
                price: p.price
              }))
            };
          }
          break;

        case 'type':
          const typeMatches = userProperties.filter(p => 
            p.property_type === identification.criteria
          );
          if (typeMatches.length === 1) {
            return { success: true, property: typeMatches[0] };
          } else if (typeMatches.length > 1) {
            return {
              success: false,
              message: `You have ${typeMatches.length} ${identification.criteria} properties. Please specify which one.`,
              needsAction: 'property_selection',
              properties: typeMatches.map(p => ({
                id: p.id,
                address: p.address,
                type: p.property_type,
                price: p.price
              }))
            };
          }
          break;
      }

      // Default case - need selection
      return {
        success: false,
        message: "I couldn't identify which property to update. Please choose from your listings:",
        needsAction: 'property_selection',
        properties: userProperties.map(p => ({
          id: p.id,
          address: p.address,
          type: p.property_type,
          price: p.price,
          status: p.status
        }))
      };

    } catch (error) {
      console.error('Error identifying property:', error);
      return {
        success: false,
        message: 'Error identifying property to update',
        needsAction: 'retry'
      };
    }
  }

  /**
   * Validate update data
   * @param {object} updates - Updates to validate
   * @returns {object} - Validation result
   */
  validateUpdates(updates) {
    const errors = [];

    if (updates.price !== undefined) {
      if (typeof updates.price !== 'number' || updates.price < 0) {
        errors.push('Price must be a positive number');
      }
    }

    if (updates.bedrooms !== undefined) {
      if (!Number.isInteger(updates.bedrooms) || updates.bedrooms < 0) {
        errors.push('Bedrooms must be a non-negative integer');
      }
    }

    if (updates.bathrooms !== undefined) {
      if (!Number.isInteger(updates.bathrooms) || updates.bathrooms < 0) {
        errors.push('Bathrooms must be a non-negative integer');
      }
    }

    if (updates.area !== undefined) {
      if (typeof updates.area !== 'number' || updates.area < 0) {
        errors.push('Area must be a positive number');
      }
    }

    if (updates.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'sold', 'rented'];
      if (!validStatuses.includes(updates.status)) {
        errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Perform the actual property update
   * @param {string} propertyId - Property ID
   * @param {object} updates - Updates to apply
   * @param {object} user - User object
   * @returns {Promise<object>} - Update result
   */
  async performPropertyUpdate(propertyId, updates, user) {
    try {
      console.log(`💾 [PROPERTY_MGMT] Updating property ${propertyId}:`, updates);

      // Filter out null/undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== null && value !== undefined)
      );

      if (Object.keys(cleanUpdates).length === 0) {
        throw new Error('No valid updates provided');
      }

      // Add update timestamp
      cleanUpdates.updated_at = new Date().toISOString();

      // Perform the update
      const { data, error } = await Property.adminDb
        .from('properties')
        .update(cleanUpdates)
        .eq('id', propertyId)
        .eq('owner_id', user.id) // Ensure user owns the property
        .select(`
          *,
          districts:district_id(district, cities:city_id(city, countries:country_id(country))),
          apartment_types:type_id(type)
        `)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Property not found or you do not have permission to update it');
      }

      const changesSummary = Object.keys(cleanUpdates)
        .filter(key => key !== 'updated_at')
        .map(key => `${key}: ${cleanUpdates[key]}`)
        .join(', ');

      console.log(`✅ [PROPERTY_MGMT] Property updated successfully`);

      return {
        property: data,
        message: `Property updated successfully! Changes: ${changesSummary}`
      };

    } catch (error) {
      console.error('❌ [PROPERTY_MGMT] Error performing update:', error);
      throw error;
    }
  }

  /**
   * Delete a property
   * @param {string} propertyId - Property ID
   * @param {object} user - User object
   * @returns {Promise<object>} - Delete result
   */
  async deleteProperty(propertyId, user) {
    try {
      console.log(`🗑️ [PROPERTY_MGMT] Deleting property ${propertyId}`);

      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        throw new Error('Only owners and agents can delete properties');
      }

      const { data, error } = await Property.adminDb
        .from('properties')
        .delete()
        .eq('id', propertyId)
        .eq('owner_id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Property not found or you do not have permission to delete it');
      }

      console.log(`✅ [PROPERTY_MGMT] Property deleted successfully`);

      return {
        success: true,
        message: `Property "${data.address}" has been deleted successfully`,
        deletedProperty: data
      };

    } catch (error) {
      console.error('❌ [PROPERTY_MGMT] Error deleting property:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Get property analytics for user
   * @param {object} user - User object
   * @returns {Promise<object>} - Analytics data
   */
  async getPropertyAnalytics(user) {
    try {
      const properties = await this.getUserProperties(user);
      
      const analytics = {
        totalProperties: properties.length,
        activeProperties: properties.filter(p => p.status === 'active').length,
        soldProperties: properties.filter(p => p.status === 'sold').length,
        rentedProperties: properties.filter(p => p.status === 'rented').length,
        avgPrice: properties.length > 0 ? Math.round(properties.reduce((sum, p) => sum + p.price, 0) / properties.length) : 0,
        propertyTypes: this.groupByPropertyType(properties),
        recentActivity: properties.slice(0, 5).map(p => ({
          address: p.address,
          status: p.status,
          price: p.price,
          updated: p.updated_at || p.created_at
        }))
      };

      return analytics;
    } catch (error) {
      console.error('Error getting property analytics:', error);
      throw error;
    }
  }

  /**
   * Group properties by type for analytics
   * @param {Array} properties - Properties array
   * @returns {object} - Grouped properties
   */
  groupByPropertyType(properties) {
    return properties.reduce((acc, property) => {
      const type = property.property_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }
}

module.exports = new PropertyManagementService(); 