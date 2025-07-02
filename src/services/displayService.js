/**
 * Display Service
 * Formats property data for optimal WhatsApp display
 */
class DisplayService {
  /**
   * Format search results for WhatsApp display
   * @param {object} searchResults - Search results from SearchService
   * @param {boolean} includeContact - Whether to include contact info
   * @returns {Array} - Array of formatted message chunks
   */
  formatSearchResults(searchResults, includeContact = false) {
    try {
      const messages = [];
      const { results, totalCount, query, filters, hasMore, suggestion } = searchResults;

      if (totalCount === 0) {
        return [this.formatNoResultsMessage(query, suggestion)];
      }

      // Create intelligent header based on search filters instead of raw query
      const header = this.formatIntelligentSearchHeader(totalCount, filters, query);
      let currentMessage = header;

      for (let i = 0; i < results.length; i++) {
        const propertyText = this.formatPropertyCard(results[i], i + 1, includeContact);
        currentMessage += propertyText;
        
        if (i < results.length - 1) {
          currentMessage += '\n' + '─'.repeat(25) + '\n\n';
        }
      }

      messages.push(currentMessage.trim());
      return messages;
    } catch (error) {
      console.error('Error formatting search results:', error);
      // Let the conversation service handle intelligent error responses
      throw error; // Re-throw so conversation service can generate intelligent response
    }
  }

  /**
   * Format a single property card
   * @param {object} property - Property object
   * @param {number} index - Property index in results
   * @param {boolean} includeContact - Include contact information
   * @returns {string} - Formatted property text
   */
  formatPropertyCard(property, index, includeContact = false) {
    const typeEmoji = this.getPropertyEmoji(property.property_type);
    const statusEmoji = this.getStatusEmoji(property.status);

    let card = `${typeEmoji} *${index}. ${this.capitalizeFirst(property.property_type || 'Property')}*\n`;
    card += `📍 ${property.address}\n`;
    card += `💰 *€${this.formatPrice(property.price)}*\n`;
    
    if (property.bedrooms || property.area) {
      const details = [];
      if (property.bedrooms) details.push(`🛏️ ${property.bedrooms}BR`);
      if (property.area) details.push(`📐 ${property.area}m²`);
      card += `📋 ${details.join(' • ')}\n`;
    }

    card += `${statusEmoji} Status: *${this.capitalizeFirst(property.status)}*\n`;

    return card;
  }

  /**
   * Format user's property listings for management
   * @param {Array} properties - User's properties
   * @param {object} user - User object
   * @returns {Array} - Formatted message chunks
   */
  formatUserProperties(properties, user) {
    if (properties.length === 0) {
      return [`🏠 *Your Property Listings*\n\n📭 You don't have any properties listed yet.`];
    }

    const messages = [];
    const analytics = this.calculateQuickAnalytics(properties);
    const summary = this.formatPropertySummary(properties.length, analytics, user);
    messages.push(summary);

    let currentMessage = '';
    for (let i = 0; i < properties.length; i++) {
      const propertyText = this.formatUserPropertyCard(properties[i], i + 1);
      currentMessage += propertyText;
      if (i < properties.length - 1) {
        currentMessage += '\n═'.repeat(25) + '\n\n';
      }
    }

    messages.push(currentMessage);
    return messages;
  }

  /**
   * Format a property card for user management view
   * @param {object} property - Property object
   * @param {number} index - Property index
   * @returns {string} - Formatted property card
   */
  formatUserPropertyCard(property, index) {
    const typeEmoji = this.getPropertyEmoji(property.property_type);
    const statusEmoji = this.getStatusEmoji(property.status);
    
    let card = `${typeEmoji} *${index}. ${this.capitalizeFirst(property.property_type)}*\n`;
    card += `📍 ${property.address}\n`;
    card += `💰 *€${this.formatPrice(property.price)}* ${statusEmoji} *${this.capitalizeFirst(property.status)}*\n`;
    card += `🆔 ID: ${property.id}\n`;

    return card;
  }

  /**
   * Format property analytics
   * @param {object} analytics - Analytics object
   * @returns {string} - Formatted analytics message
   */
  formatPropertyAnalytics(analytics) {
    const message = `📊 *Your Property Analytics*\n\n` +
                   `🏠 Total Properties: *${analytics.totalProperties}*\n` +
                   `✅ Active: ${analytics.activeProperties}\n` +
                   `💰 Sold: ${analytics.soldProperties}\n` +
                   `🏡 Rented: ${analytics.rentedProperties || 0}\n\n` +
                   `💵 Average Price: *€${this.formatPrice(analytics.avgPrice)}*\n\n` +
                   `📈 Property Types:\n${this.formatPropertyTypeBreakdown(analytics.propertyTypes)}\n\n` +
                   `📅 Recent Activity:\n${this.formatRecentActivity(analytics.recentActivity)}`;
    
    return message;
  }

  /**
   * Format update confirmation message
   * @param {object} updateResult - Update result
   * @returns {string} - Formatted confirmation
   */
  formatUpdateConfirmation(updateResult) {
    if (!updateResult.success) {
      return `❌ *Update Failed*\n\n${updateResult.message}`;
    }

    const property = updateResult.property;
    const typeEmoji = this.getPropertyEmoji(property.property_type);
    
    let message = `✅ *Property Updated Successfully!*\n\n`;
    message += `${typeEmoji} ${property.address}\n`;
    message += `${updateResult.message}`;

    return message;
  }

  // Utility methods

  getPropertyEmoji(propertyType) {
    const emojis = {
      'apartment': '🏢',
      'house': '🏠',
      'commercial': '🏢',
      'land': '🌳'
    };
    return emojis[propertyType] || '🏠';
  }

  getStatusEmoji(status) {
    const emojis = {
      'active': '✅',
      'inactive': '⏸️',
      'sold': '💰',
      'rented': '🔑'
    };
    return emojis[status] || '❓';
  }

  formatPrice(price) {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `${(price / 1000).toFixed(0)}k`;
    }
    return price.toString();
  }

  capitalizeFirst(str) {
    if (!str || typeof str !== 'string') return 'Property';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatNoResultsMessage(query, suggestion) {
    let message = `🔍 *Search Results*\n\n😔 No properties found for: "${query}"\n\n`;
    if (suggestion) {
      message += `💡 ${suggestion}\n\n`;
    }
    // Note: Intelligent suggestions are now handled by ConversationService
    return message;
  }

  formatPropertySummary(totalProperties, analytics, user) {
    const roleEmoji = user.user_roles?.role === 'agent' ? '🏢' : '👤';
    const roleText = user.user_roles?.role === 'agent' ? 'Agent' : 'Owner';
    
    let message = `${roleEmoji} *Your Properties (${roleText})*\n\n`;
    message += `📊 Portfolio: ${totalProperties} properties\n`;
    message += `✅ Active: ${analytics.active} • 💰 Sold: ${analytics.sold}\n\n`;
    
    return message;
  }

  calculateQuickAnalytics(properties) {
    return {
      active: properties.filter(p => p.status === 'active').length,
      sold: properties.filter(p => p.status === 'sold').length,
      inactive: properties.filter(p => p.status === 'inactive').length
    };
  }

  formatPropertyTypeBreakdown(propertyTypes) {
    return Object.entries(propertyTypes)
      .map(([type, count]) => `  ${this.getPropertyEmoji(type)} ${this.capitalizeFirst(type)}: ${count}`)
      .join('\n');
  }

  formatRecentActivity(recentActivity) {
    if (!recentActivity || recentActivity.length === 0) {
      return '  No recent activity';
    }
    
    return recentActivity
      .slice(0, 3) // Show only top 3
      .map(activity => {
        const date = new Date(activity.updated);
        return `  • ${this.truncateText(activity.address, 30)} - ${this.formatRelativeDate(date)}`;
      })
      .join('\n');
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  formatIntelligentSearchHeader(totalCount, filters, originalQuery) {
    let header = '🔍 *Search Results*\n';
    
    // Build intelligent description based on filters
    const parts = [];
    
    // Add property type if specified
    if (filters?.property_type) {
      parts.push(`${filters.property_type}s`);
    } else {
      parts.push('properties');
    }
    
    // Add location information
    if (filters?.location) {
      if (filters.location.district) {
        parts.push(`in ${filters.location.district}`);
      } else if (filters.location.city) {
        parts.push(`in ${filters.location.city}`);
      } else if (filters.location.country) {
        parts.push(`in ${filters.location.country}`);
      } else if (filters.location.area_description) {
        parts.push(`in ${filters.location.area_description} area`);
      }
    }
    
    // Add bedroom criteria if specified
    if (filters?.bedrooms) {
      if (filters.bedrooms.exact) {
        parts.push(`with ${filters.bedrooms.exact} bedroom${filters.bedrooms.exact !== 1 ? 's' : ''}`);
      } else if (filters.bedrooms.min) {
        parts.push(`with ${filters.bedrooms.min}+ bedrooms`);
      }
    }
    
    // Add price range if specified
    if (filters?.price) {
      if (filters.price.min && filters.price.max) {
        parts.push(`€${this.formatPrice(filters.price.min)}-${this.formatPrice(filters.price.max)}`);
      } else if (filters.price.max) {
        parts.push(`under €${this.formatPrice(filters.price.max)}`);
      } else if (filters.price.min) {
        parts.push(`over €${this.formatPrice(filters.price.min)}`);
      }
    }
    
    // If no meaningful filters extracted, try to extract location from original query
    if (parts.length === 1 && parts[0] === 'properties') {
      const locationMatch = this.extractLocationFromQuery(originalQuery);
      if (locationMatch) {
        parts[0] = `properties in ${locationMatch}`;
      } else {
        // Fallback to showing what user was interested in
        parts[0] = `properties matching your search`;
      }
    }
    
    const description = parts.join(' ');
    header += `Found ${totalCount} ${description}\n\n`;
    
    return header;
  }

  extractLocationFromQuery(query) {
    // Simple extraction of location words from query
    const words = query.toLowerCase().split(' ');
    
    // Common location indicators
    const locationKeywords = ['in', 'at', 'near', 'around', 'interested', 'looking'];
    
    for (let i = 0; i < words.length; i++) {
      if (locationKeywords.includes(words[i]) && i + 1 < words.length) {
        // Take the next word(s) as potential location
        const possibleLocation = words.slice(i + 1).join(' ').trim();
        // Clean up common non-location words
        const cleaned = possibleLocation.replace(/\b(properties|apartments|houses|for|rent|sale|buy)\b/g, '').trim();
        if (cleaned.length > 0) {
          return this.capitalizeWords(cleaned);
        }
      }
    }
    
    // Try to find proper nouns (capitalized words) that might be locations
    const properNouns = query.split(' ').filter(word => 
      word.length > 2 && 
      word[0] === word[0].toUpperCase() &&
      !['I', 'Am', 'The', 'A', 'An'].includes(word)
    );
    
    if (properNouns.length > 0) {
      return properNouns.join(' ');
    }
    
    return null;
  }

  capitalizeWords(str) {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

module.exports = new DisplayService();