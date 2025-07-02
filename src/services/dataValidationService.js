/**
 * Data Validation Service
 * Handles all data validation, normalization, and schema mapping
 * for reliable and scalable data operations
 */

class DataValidationService {
  /**
   * Validate and normalize property data from OpenAI format to database schema
   * @param {object} propertyData - Raw property data from OpenAI
   * @returns {object} - Validated and normalized property data
   */
  validateAndNormalizeProperty(propertyData) {
    const errors = [];
    const normalized = {};

    try {
      // Required fields validation
      if (!propertyData.address || typeof propertyData.address !== 'string') {
        errors.push('Address is required and must be a string');
      } else {
        normalized.address = this.normalizeString(propertyData.address);
      }

      if (!propertyData.price || !this.isValidNumber(propertyData.price)) {
        errors.push('Price is required and must be a positive number');
      } else {
        normalized.price = this.normalizeNumber(propertyData.price);
        if (normalized.price <= 0) {
          errors.push('Price must be greater than 0');
        }
      }

      // Schema mapping: area_sqm -> area
      if (propertyData.area_sqm !== undefined) {
        normalized.area = this.validateNumber(propertyData.area_sqm, 'area', 1, 10000);
      }

      // Schema mapping: external_url -> property_link
      if (propertyData.external_url) {
        normalized.property_link = this.validateUrl(propertyData.external_url);
      }

      normalized.bedrooms = this.validateNumber(propertyData.bedrooms, 'bedrooms', 0, 20);
      normalized.bathrooms = this.validateNumber(propertyData.bathrooms, 'bathrooms', 0, 20);
      normalized.status = this.validateEnum(
        propertyData.status, 
        ['active', 'inactive', 'pending', 'sold', 'rented'], 
        'active'
      );

      if (propertyData.description) {
        normalized.description = this.normalizeString(propertyData.description);
      }

      // Location validation
      const locationData = this.validateLocationData(propertyData);
      if (locationData.errors.length > 0) {
        errors.push(...locationData.errors);
      }
      normalized.locationData = locationData.data;

      return {
        isValid: errors.length === 0,
        errors,
        data: normalized,
        warnings: this.generateWarnings(propertyData, normalized)
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
        data: {},
        warnings: []
      };
    }
  }

  /**
   * Validate location data
   * @param {object} propertyData - Property data containing location info
   * @returns {object} - Validation result with location data
   */
  validateLocationData(propertyData) {
    const errors = [];
    const locationData = {};

    // Country validation
    if (propertyData.country_name) {
      locationData.country_name = this.normalizeLocationName(propertyData.country_name);
    }

    // City validation
    if (propertyData.city_name) {
      locationData.city_name = this.normalizeLocationName(propertyData.city_name);
    } else {
      errors.push('City name is required for location');
    }

    // District validation (optional)
    if (propertyData.district_name) {
      locationData.district_name = this.normalizeLocationName(propertyData.district_name);
    }

    return {
      errors,
      data: locationData
    };
  }

  /**
   * Validate and normalize a number
   * @param {any} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @param {number} min - Minimum value (optional)
   * @param {number} max - Maximum value (optional)
   * @returns {number|null} - Normalized number or null
   */
  validateNumber(value, fieldName, min = null, max = null) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const num = this.normalizeNumber(value);
    if (!this.isValidNumber(num)) {
      throw new Error(`${fieldName} must be a valid number`);
    }

    if (min !== null && num < min) {
      throw new Error(`${fieldName} must be at least ${min}`);
    }

    if (max !== null && num > max) {
      throw new Error(`${fieldName} must be at most ${max}`);
    }

    return num;
  }

  /**
   * Validate enum value
   * @param {any} value - Value to validate
   * @param {array} validValues - Array of valid values
   * @param {any} defaultValue - Default value if invalid
   * @returns {any} - Valid enum value
   */
  validateEnum(value, validValues, defaultValue) {
    if (!value) return defaultValue;
    
    const normalized = value.toString().toLowerCase().trim();
    return validValues.includes(normalized) ? normalized : defaultValue;
  }

  /**
   * Validate URL
   * @param {string} url - URL to validate
   * @returns {string|null} - Valid URL or null
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    const trimmedUrl = url.trim();
    try {
      new URL(trimmedUrl);
      return trimmedUrl;
    } catch {
      // Try adding https:// if missing
      try {
        new URL(`https://${trimmedUrl}`);
        return `https://${trimmedUrl}`;
      } catch {
        return null;
      }
    }
  }

  /**
   * Normalize string value
   * @param {any} value - Value to normalize
   * @returns {string} - Normalized string
   */
  normalizeString(value) {
    if (!value) return '';
    return value.toString().trim();
  }

  /**
   * Normalize location name (consistent casing and trimming)
   * @param {string} name - Location name
   * @returns {string} - Normalized location name
   */
  normalizeLocationName(name) {
    if (!name) return '';
    return name.toString().trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize number value
   * @param {any} value - Value to normalize
   * @returns {number} - Normalized number
   */
  normalizeNumber(value) {
    if (typeof value === 'number') return value;
    
    // Remove commas, spaces, and other formatting
    const cleaned = value.toString().replace(/[,\s]/g, '');
    return parseFloat(cleaned);
  }

  /**
   * Check if value is a valid number
   * @param {any} value - Value to check
   * @returns {boolean} - True if valid number
   */
  isValidNumber(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  /**
   * Generate warnings for data quality issues
   * @param {object} original - Original data
   * @param {object} normalized - Normalized data
   * @returns {array} - Array of warning messages
   */
  generateWarnings(original, normalized) {
    const warnings = [];

    if (original.external_url && !normalized.property_link) {
      warnings.push('Invalid URL format detected, property link was not saved');
    }

    if (normalized.price > 50000) {
      warnings.push('Very high price detected, please verify');
    }

    if (!normalized.area) {
      warnings.push('No area information provided');
    }

    return warnings;
  }

  /**
   * Validate bulk property data
   * @param {array} propertiesData - Array of property data
   * @returns {object} - Bulk validation result
   */
  validateBulkProperties(propertiesData) {
    if (!Array.isArray(propertiesData)) {
      return {
        isValid: false,
        errors: ['Property data must be an array'],
        validProperties: [],
        invalidProperties: []
      };
    }

    const validProperties = [];
    const invalidProperties = [];
    const globalErrors = [];

    propertiesData.forEach((propertyData, index) => {
      const validation = this.validateAndNormalizeProperty(propertyData);
      
      if (validation.isValid) {
        validProperties.push({
          index,
          data: validation.data,
          warnings: validation.warnings
        });
      } else {
        invalidProperties.push({
          index,
          data: propertyData,
          errors: validation.errors
        });
      }
    });

    return {
      isValid: invalidProperties.length === 0,
      errors: globalErrors,
      validProperties,
      invalidProperties,
      summary: {
        total: propertiesData.length,
        valid: validProperties.length,
        invalid: invalidProperties.length
      }
    };
  }
}

module.exports = new DataValidationService(); 