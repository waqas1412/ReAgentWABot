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
   * Formats search results for WhatsApp display.
   * @param {object} searchResults - The search results object from searchService.
   * @param {boolean} isRefinement - Whether this is a refinement search.
   * @returns {Array} An array of formatted messages.
   */
  formatSearchResults(searchResults, isRefinement = false) {
    if (searchResults.totalCount === 0) {
      return ["I couldn't find any properties matching your search. Try broadening your criteria!"];
    }

    const header = `🔍 Found *${searchResults.totalCount}* properties for your search! Here are the top ${searchResults.results.length}:`;
    const messages = [header];

    searchResults.results.forEach((property, index) => {
      // Main details
      let message = `*${index + 1}. ${property.address}*\n\n`;
      message += `💰 *Price:* €${this.formatPrice(property.price)}\n`;
      
      // Location
      if (property.districts) {
        let location = property.districts.district;
        if (property.districts.cities) {
          location += `, ${property.districts.cities.city}`;
        }
        message += `📍 *Location:* ${location}\n`;
      }
      message += '\n'; // Extra space

      // Core stats
      let stats = [];
      if (property.bedrooms) stats.push(`🛏️ *Beds:* ${property.bedrooms}`);
      if (property.bathrooms) stats.push(`🛁 *Baths:* ${property.bathrooms}`);
      if (property.area) stats.push(`📐 *Area:* ${property.area}m²`);
      if (property.floor) stats.push(`🏢 *Floor:* ${this.capitalizeFirst(property.floor)}`);
      if(stats.length > 0) message += stats.join(' | ') + '\n\n';
      
      // Features
      let features = [];
      if (property.furnished) features.push('Furnished');
      if (property.elevator) features.push('Elevator');
      if (property.air_conditioning) features.push('AC');
      if (property.work_room) features.push('Work Room');
      if (features.length > 0) {
        message += `✨ *Features:* _${features.join(', ')}_\n`;
      }

      // Extra details
      if (property.built_year) message += `🏗️ *Built:* ${property.built_year}\n`;
      if (property.available_from) message += `🗓️ *Available:* ${new Date(property.available_from).toLocaleDateString()}\n`;

      // Link
      if (property.property_link) {
        message += `\n🔗 *Link:* ${property.property_link}\n`;
      }
      
      message += `\n_To see details or book a viewing, reference property ID: *${property.id.substring(0, 4)}*_`;
      
      messages.push(message);
    });

    return messages;
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
   * Formats a user's property listings for display on WhatsApp.
   * @param {Array} properties - The array of property objects.
   * @param {object} user - The user object.
   * @returns {Array} An array of formatted messages.
   */
  formatUserProperties(properties, user) {
    if (!properties || properties.length === 0) {
      return ["You don't have any properties listed yet."];
    }

    const role = user.user_roles?.role || 'user';
    const header = `🏠 *Your Properties (${this.capitalizeFirst(role)})*\n\nHere are the properties you have listed with us:`;
    
    const messages = [header];

    properties.forEach((property, index) => {
      let message = `*${index + 1}. ${property.address}*\n`;
      message += `Status: _${this.capitalizeFirst(property.status || 'N/A')}_\n`;
      message += `Price: €${this.formatPrice(property.price)}\n`;
      if (property.bedrooms) {
        message += `Beds: ${property.bedrooms} | `;
      }
      if (property.bathrooms) {
        message += `Baths: ${property.bathrooms} | `;
      }
      if (property.area) {
        message += `Area: ${property.area}m²\n`;
      }
      message += `\n_To manage this property, reference ID: ${property.id.substring(0, 4)}_`;
      
      messages.push(message);
    });

    messages.push("You can *update*, *delete*, or set the *availability* for any of your properties by sending a message with the property ID.");

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

  /**
   * Formats a price with commas for readability.
   * @param {number} price - The price to format.
   * @returns {string} The formatted price.
   */
  formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Capitalizes the first letter of a string.
   * @param {string} str - The string to capitalize.
   * @returns {string} The capitalized string.
   */
  capitalizeFirst(str) {
    if (!str) return '';
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