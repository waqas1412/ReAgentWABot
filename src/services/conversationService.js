const openaiService = require('./openaiService');
const dataValidationService = require('./dataValidationService');
const databaseIntegrityService = require('./databaseIntegrityService');
const propertyParsingService = require('./propertyParsingService');
const searchService = require('./searchService');
const propertyManagementService = require('./propertyManagementService');
const displayService = require('./displayService');
const User = require('../models/User');
const UserRole = require('../models/UserRole');
const Property = require('../models/Property');
const twilioService = require('./twilioService');

class ConversationService {
  constructor() {
    // Track conversation states for users
    this.conversationStates = new Map();
  }

  /**
   * Process user messages and route to appropriate handlers
   * @param {string} message - User's message
   * @param {object} user - User object with role information
   * @returns {Promise<Array>} - Response messages
   */
  async processMessage(message, user) {
    try {
      console.log(`🤖 [CONVERSATION] Processing message from ${user.phone_number}: "${message}"`);

      // Check for context-dependent requests (property details, contact info)
      const contextRequest = this.parseContextRequest(message, user);
      if (contextRequest.isContextRequest) {
        return await this.handleContextRequest(message, user, contextRequest);
      }

      // Step 1: Classify the intent using OpenAI
      const intent = await openaiService.classifyPropertyIntent(message, user);
      console.log(`🧠 [CONVERSATION] Classified intent:`, intent);

      // Step 2: Route to appropriate handler based on intent
      switch (intent.intent) {
        case 'search':
          return await this.handleSearch(message, user);

        case 'view_own_listings':
          return await this.handleViewOwnListings(user);

        case 'update_property':
        case 'manage_property':
          return await this.handlePropertyManagement(message, user);

        case 'add_property':
          return await this.handleAddProperty(message, user);

        case 'unclear':
        default:
          return await this.handleUnclearIntent(message, user, intent);
      }

    } catch (error) {
      console.error('❌ [CONVERSATION] Error processing message:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'message_processing');
    }
  }

  /**
   * Handle property search requests
   * @param {string} message - Search query
   * @param {object} user - User object
   * @returns {Promise<Array>} - Search results
   */
  async handleSearch(message, user) {
    try {
      console.log(`🔍 [CONVERSATION] Handling search request: "${message}"`);

      // Perform the search
      const searchResults = await searchService.searchProperties(message, user);
      
      // Store search results in conversation state for context
      this.setConversationState(user.phone_number, {
        lastSearchResults: searchResults,
        lastSearchTime: new Date(),
        lastQuery: message
      });
      
      // Format results for WhatsApp display
      const formattedMessages = displayService.formatSearchResults(searchResults, false);
      
      // Add intelligent follow-up suggestions based on search
      if (searchResults.totalCount > 0) {
        const followUp = this.generateIntelligentFollowUp(searchResults, message, user);
        formattedMessages.push(followUp);
      } else {
        // Use AI to provide intelligent no-results response
        const intelligentSuggestions = await this.generateIntelligentNoResultsResponse(searchResults, message, user);
        formattedMessages.push(intelligentSuggestions);
      }

      return formattedMessages;

    } catch (error) {
      console.error('❌ [CONVERSATION] Search error:', error);
      
      // Use AI to generate intelligent error response instead of hardcoded messages
      return await this.generateIntelligentErrorResponse(message, error, user, 'search');
    }
  }

  /**
   * Generate intelligent follow-up suggestions based on search results
   * @param {object} searchResults - Search results object
   * @param {string} originalQuery - User's original query
   * @param {object} user - User object
   * @returns {string} - Intelligent follow-up message
   */
  generateIntelligentFollowUp(searchResults, originalQuery, user) {
    const { totalCount, filters } = searchResults;
    
    let followUp = '';
    
    if (totalCount <= 5) {
      followUp = '🎯 Great! Here are your options.\n\n';
    } else if (totalCount <= 15) {
      followUp = '👍 Found some good matches!\n\n';
    } else {
      followUp = '🔍 Many options available! You might want to narrow down:\n\n';
    }
    
    // Add contextual suggestions based on what they searched for
    const suggestions = [];
    
    if (totalCount > 15) {
      // Too many results - suggest narrowing down
      if (!filters?.price) {
        suggestions.push('💰 "Show me properties under €2000"');
      }
      if (!filters?.bedrooms) {
        suggestions.push('🛏️ "Only 2-bedroom apartments"');
      }
      if (!filters?.property_type) {
        suggestions.push('🏠 "Only houses" or "Only apartments"');
      }
    } else {
      // Good number of results - suggest actions
      suggestions.push('📋 "Details of property 1"');
      if (filters?.location?.city) {
        suggestions.push(`🗺️ "Similar properties near ${filters.location.city}"`);
      }
      suggestions.push('⭐ "Show me the cheapest options"');
    }
    
    // Add role-specific suggestions
    if (user?.user_roles?.role === 'renter') {
      if (!originalQuery.toLowerCase().includes('rent')) {
        suggestions.push('🏡 "Show rental properties only"');
      }
    }
    
    if (suggestions.length > 0) {
      followUp += '💡 *Quick actions:*\n';
      followUp += suggestions.slice(0, 3).map(s => `• ${s}`).join('\n');
    }
    
    return followUp;
  }

  /**
   * Handle viewing user's own listings
   * @param {object} user - User object
   * @returns {Promise<Array>} - User's property listings
   */
  async handleViewOwnListings(user) {
    try {
      console.log(`📋 [CONVERSATION] Showing listings for user ${user.phone_number}`);

      // Check if user has permission to view listings
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        // Use AI for intelligent permission response
        return await this.generateIntelligentPermissionResponse('view_listings', user);
      }

      // Get user's properties
      const properties = await propertyManagementService.getUserProperties(user);
      
      // Format for display
      const formattedMessages = displayService.formatUserProperties(properties, user);

      return formattedMessages;

    } catch (error) {
      console.error('❌ [CONVERSATION] Error viewing listings:', error);
      return await this.generateIntelligentErrorResponse('show my properties', error, user, 'view_listings');
    }
  }

  /**
   * Handle property management (updates, status changes)
   * @param {string} message - Management request
   * @param {object} user - User object
   * @returns {Promise<Array>} - Update results
   */
  async handlePropertyManagement(message, user) {
    try {
      console.log(`🔄 [CONVERSATION] Handling property management: "${message}"`);

      // Check permissions
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        return await this.generateIntelligentPermissionResponse('manage_properties', user);
      }

      // Process the update request
      const updateResult = await propertyManagementService.updatePropertyViaMessage(message, user);

      if (!updateResult.success) {
        // Use AI to generate intelligent response for management failures
        return await this.generateIntelligentManagementFailureResponse(message, updateResult, user);
      }

      // Format successful update confirmation
      const confirmationMessage = displayService.formatUpdateConfirmation(updateResult);
      
      return [
        confirmationMessage,
        '🎉 Property updated successfully! Your listing is now live with the new details.'
      ];

    } catch (error) {
      console.error('❌ [CONVERSATION] Property management error:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'property_management');
    }
  }

  /**
   * Handle adding new properties
   * @param {string} message - Property details
   * @param {object} user - User object
   * @returns {Promise<Array>} - Add property results
   */
  async handleAddProperty(message, user) {
    try {
      console.log(`➕ [CONVERSATION] Handling add property request`);

      // Check if user can add properties
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        return await this.generateIntelligentPermissionResponse('add_properties', user);
      }

      // Use existing property addition logic
      const result = await propertyParsingService.processPropertyListings(user.phone_number, message, user);
      return Array.isArray(result) ? result : [result];

    } catch (error) {
      console.error('❌ [CONVERSATION] Add property error:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'add_property');
    }
  }

  /**
   * Handle unclear intents with AI-powered suggestions
   * @param {string} message - Original message
   * @param {object} user - User object
   * @param {object} intent - Intent classification
   * @returns {Promise<Array>} - Intelligent help messages
   */
  async handleUnclearIntent(message, user, intent) {
    try {
      return await this.generateIntelligentUnclearResponse(message, user, intent);
    } catch (error) {
      console.error('❌ [CONVERSATION] Error handling unclear intent:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'unclear_intent');
    }
  }

  /**
   * Handle contact information requests
   * @param {string} message - Contact request
   * @param {object} user - User object
   * @returns {Promise<Array>} - Contact information
   */
  async handleContactRequest(message, user) {
    try {
      // Most contact requests should be handled by parseContextRequest
      // This handles general contact inquiries
      return await this.generateIntelligentContactResponse(message, user);
      
    } catch (error) {
      console.error('❌ [CONVERSATION] Contact request error:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'contact_request');
    }
  }

  /**
   * Conversation state management
   */
  getConversationState(phone) {
    return this.conversationStates.get(phone) || {};
  }

  setConversationState(phone, state) {
    this.conversationStates.set(phone, state);
    
    // Auto-clear state after 10 minutes to prevent memory leaks
    setTimeout(() => {
      if (this.conversationStates.has(phone)) {
        this.conversationStates.delete(phone);
      }
    }, 10 * 60 * 1000);
  }

  clearConversationState(phone) {
    this.conversationStates.delete(phone);
  }

  /**
   * Format a rich text message with emojis and formatting
   * @param {string} message - Plain message
   * @returns {string} - Formatted message
   */
  formatRichMessage(message) {
    // WhatsApp supports basic formatting
    return message
      .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert **bold** to *bold*
      .replace(/__(.*?)__/g, '_$1_')     // Convert __italic__ to _italic_
      .replace(/```(.*?)```/g, '```$1```'); // Keep code blocks as is
  }

  /**
   * Get emoji for user role
   * @param {string} role - User role
   * @returns {string} - Corresponding emoji
   */
  getRoleEmoji(role) {
    const roleEmojis = {
      'renter': '🏡',
      'owner': '🏢',
      'agent': '🏘️',
      'buyer': '🏠'
    };
    return roleEmojis[role] || '👤';
  }

  /**
   * Generate intelligent error response using GPT-4o-mini
   * @param {string} originalMessage - User's original message
   * @param {Error} error - The error that occurred  
   * @param {object} user - User object
   * @param {string} operationType - Type of operation that failed
   * @returns {Promise<Array>} - Intelligent error response
   */
  async generateIntelligentErrorResponse(originalMessage, error, user, operationType) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user's ${operationType} operation failed. Generate a helpful, contextual response that:

1. Acknowledges what they were trying to do specifically
2. Explains what might have gone wrong in simple terms
3. Provides relevant, actionable alternatives based on their query
4. Maintains a helpful, encouraging tone

User query: "${originalMessage}"
Error context: ${error.message}
User role: ${user?.user_roles?.role || 'renter'}
Operation: ${operationType}

IMPORTANT: Return ONLY a pure JSON array of 1-2 short WhatsApp messages. No markdown, no code blocks, just clean JSON.

Format: ["message1", "message2"]`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate intelligent error response for: "${originalMessage}"` }
        ],
        temperature: 0.3,
        max_tokens: 400
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses from GPT-4o-mini
      let jsonContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        jsonContent = content.slice(7, -3).trim(); // Remove ```json and ```
      } else if (content.startsWith('```') && content.endsWith('```')) {
        jsonContent = content.slice(3, -3).trim(); // Remove ``` and ```
      }
      
      const messages = JSON.parse(jsonContent);
      return Array.isArray(messages) ? messages : [messages];
    } catch (aiError) {
      console.error('AI error response generation failed:', aiError);
      // Fallback only if AI fails
      return [`🤖 I understand you're looking for "${originalMessage}". Let me help you find what you need. Could you try being more specific about the location or property type?`];
    }
  }

  /**
   * Generate intelligent no-results response using GPT-4o-mini
   * @param {object} searchResults - Search results with filters
   * @param {string} originalMessage - User's original search query
   * @param {object} user - User object
   * @returns {Promise<string>} - Intelligent no-results response
   */
  async generateIntelligentNoResultsResponse(searchResults, originalMessage, user) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user searched for properties but found no results. Generate a helpful response that:

1. Acknowledges their specific search request
2. Suggests intelligent alternatives based on what they searched for
3. Offers to expand search criteria or suggest similar areas
4. Provides 2-3 specific, actionable suggestions

User query: "${originalMessage}"
Search filters applied: ${JSON.stringify(searchResults.filters)}
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY a pure JSON string (not array) with your response. No markdown, no code blocks, just clean JSON.

Format: "Your helpful response message"`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate intelligent no-results response for: "${originalMessage}"` }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses from GPT-4o-mini
      let cleanContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        cleanContent = content.slice(7, -3).trim(); // Remove ```json and ```
      } else if (content.startsWith('```') && content.endsWith('```')) {
        cleanContent = content.slice(3, -3).trim(); // Remove ``` and ```
      } else if (content.startsWith('"') && content.endsWith('"')) {
        cleanContent = JSON.parse(content); // Parse if it's a JSON string
      }

      return cleanContent;
    } catch (aiError) {
      console.error('AI no-results response generation failed:', aiError);
      return `🔍 I couldn't find exact matches for "${originalMessage}", but let me suggest some alternatives that might interest you. Would you like me to search nearby areas or similar properties?`;
    }
  }

  /**
   * Generate intelligent response for unclear intents using GPT-4o-mini
   * @param {string} message - Original message
   * @param {object} user - User object  
   * @param {object} intent - Intent classification
   * @returns {Promise<Array>} - Intelligent help messages
   */
  async generateIntelligentUnclearResponse(message, user, intent) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user sent a message but their intent isn't clear. Generate a helpful response that:

1. Acknowledges their message specifically
2. Asks clarifying questions based on context clues in their message
3. Provides relevant options based on their likely intent
4. Maintains a conversational, helpful tone

User message: "${message}"
User role: ${user?.user_roles?.role || 'renter'}
Intent confidence: ${intent.confidence}

IMPORTANT: Return ONLY a pure JSON string with your response. No markdown, no code blocks, just clean JSON.

Format: "Your helpful response message"`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate intelligent unclear response for: "${message}"` }
        ],
        temperature: 0.3,
        max_tokens: 250
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses and parse if needed
      let cleanContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        cleanContent = content.slice(7, -3).trim(); // Remove ```json and ```
      } else if (content.startsWith('```') && content.endsWith('```')) {
        cleanContent = content.slice(3, -3).trim(); // Remove ``` and ```
      }
      if (cleanContent.startsWith('"') && cleanContent.endsWith('"')) {
        cleanContent = JSON.parse(cleanContent); // Parse if it's a JSON string
      }

      return [cleanContent];
    } catch (aiError) {
      console.error('AI unclear response generation failed:', aiError);
      return [`🤔 I want to help you with "${message}" but need a bit more context. Are you looking to search for properties, manage your listings, or something else?`];
    }
  }

  /**
   * Generate intelligent permission response using GPT-4o-mini
   * @param {string} operation - Operation they tried to perform
   * @param {object} user - User object
   * @returns {Promise<Array>} - Intelligent permission response
   */
  async generateIntelligentPermissionResponse(operation, user) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user tried to perform an operation they don't have permission for. Generate a helpful response that:

1. Politely explains why they can't perform this action
2. Suggests relevant alternatives they CAN do based on their role
3. Offers to help them with appropriate actions
4. Maintains an encouraging, helpful tone

Operation attempted: ${operation}
User role: ${user?.user_roles?.role || 'none'}

IMPORTANT: Return ONLY a pure JSON array of 1-2 short WhatsApp messages. No markdown, no code blocks, just clean JSON.

Format: ["message1", "message2"]`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate permission response for: ${operation}` }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses from GPT-4o-mini
      let jsonContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        jsonContent = content.slice(7, -3).trim(); // Remove ```json and ```
      } else if (content.startsWith('```') && content.endsWith('```')) {
        jsonContent = content.slice(3, -3).trim(); // Remove ``` and ```
      }
      
      const messages = JSON.parse(jsonContent);
      return Array.isArray(messages) ? messages : [messages];
    } catch (aiError) {
      console.error('AI permission response generation failed:', aiError);
      return [`🤔 I'd love to help you with that! Based on your current access, let me suggest some things I can help you with instead.`];
    }
  }

  /**
   * Generate intelligent management failure response using GPT-4o-mini
   * @param {string} originalMessage - User's original request
   * @param {object} updateResult - Failed update result
   * @param {object} user - User object
   * @returns {Promise<Array>} - Intelligent failure response
   */
  async generateIntelligentManagementFailureResponse(originalMessage, updateResult, user) {
    try {
      if (updateResult.needsAction === 'property_selection') {
        let response = updateResult.message + '\n\n';
        response += '🏠 Your Properties:\n';
        updateResult.properties.forEach((prop, index) => {
          response += `${index + 1}. ${prop.address} - €${prop.price} (${prop.type})\n`;
        });
        response += '\n💡 Reply with: "Update property 1 price to €2200"';
        return [response];
      } else if (updateResult.needsAction === 'add_property') {
        const systemPrompt = `Generate a helpful response for a user who tried to update a property but needs to add one first. Be encouraging and provide specific guidance.

User request: "${originalMessage}"
Context: ${updateResult.message}

Return a single WhatsApp message.`;

        const response = await openaiService.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: originalMessage }
          ],
          temperature: 0.3,
          max_tokens: 200
        });

        return [response.choices[0].message.content.trim()];
      } else {
        return [updateResult.message];
      }
    } catch (aiError) {
      console.error('AI management failure response generation failed:', aiError);
      return [updateResult.message || `I had trouble with "${originalMessage}". Could you try rephrasing your request?`];
    }
  }

  /**
   * Generate intelligent contact response using GPT-4o-mini
   * @param {string} message - Contact request message
   * @param {object} user - User object
   * @returns {Promise<Array>} - Intelligent contact response
   */
  async generateIntelligentContactResponse(message, user) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user is asking about contact information for properties. Generate a helpful response that:

1. Acknowledges their specific contact request
2. Explains how to get contact information (search first, then request contact for specific property)
3. Provides relevant examples based on their query
4. Maintains a helpful, guiding tone

User message: "${message}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY a pure JSON array of 1-2 short WhatsApp messages. No markdown, no code blocks, just clean JSON.

Format: ["message1", "message2"]`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate intelligent contact response for: "${message}"` }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses from GPT-4o-mini
      let jsonContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        jsonContent = content.slice(7, -3).trim(); // Remove ```json and ```
      } else if (content.startsWith('```') && content.endsWith('```')) {
        jsonContent = content.slice(3, -3).trim(); // Remove ``` and ```
      }
      
      const messages = JSON.parse(jsonContent);
      return Array.isArray(messages) ? messages : [messages];
    } catch (aiError) {
      console.error('AI contact response generation failed:', aiError);
      return [`📞 I'd love to help you get contact info! First, let me show you some properties, then you can ask for specific contact details.`];
    }
  }

  /**
   * Parse context-dependent requests (property details, contact info)
   * @param {string} message - User's message
   * @param {object} user - User object
   * @returns {object} - Context request analysis
   */
  parseContextRequest(message, user) {
    const lowercaseMessage = message.toLowerCase();
    
    // Patterns for property details/contact requests
    const detailPatterns = [
      /(?:more\s+)?details?\s+(?:of|for|about)\s+(?:property\s+)?(\d+)/i,
      /(?:tell\s+me\s+more\s+about\s+)?(?:property\s+)?(\d+)/i,
      /contact\s+(?:info\s+)?(?:for\s+)?(?:property\s+)?(\d+)/i,
      /(\d+)\s+(?:details?|info|contact)/i,
      /need\s+more\s+details?\s+of\s+(\d+)/i,
      /show\s+me\s+(?:property\s+)?(\d+)/i
    ];

    for (const pattern of detailPatterns) {
      const match = message.match(pattern);
      if (match) {
        const propertyIndex = parseInt(match[1]);
        return {
          isContextRequest: true,
          type: 'property_details',
          propertyIndex: propertyIndex,
          requestType: lowercaseMessage.includes('contact') ? 'contact' : 'details'
        };
      }
    }

    return { isContextRequest: false };
  }

  /**
   * Handle context-dependent requests
   * @param {string} message - User's message
   * @param {object} user - User object
   * @param {object} contextRequest - Parsed context request
   * @returns {Promise<Array>} - Response messages
   */
  async handleContextRequest(message, user, contextRequest) {
    try {
      console.log(`🔍 [CONVERSATION] Handling context request:`, contextRequest);

      if (contextRequest.type === 'property_details') {
        // Get the most recent search from conversation state
        const conversationState = this.getConversationState(user.phone_number);
        const lastSearchResults = conversationState.lastSearchResults;

        if (!lastSearchResults || !lastSearchResults.results) {
          return await this.generateIntelligentNoSearchContextResponse(message, user);
        }

        const propertyIndex = contextRequest.propertyIndex - 1; // Convert to 0-based index
        const property = lastSearchResults.results[propertyIndex];

        if (!property) {
          return [
            `🤔 I don't see a property ${contextRequest.propertyIndex} in your recent search.`,
            `💡 You searched for ${lastSearchResults.results.length} properties. Try: "details of property 1" to "details of property ${lastSearchResults.results.length}"`
          ];
        }

        // Generate detailed property information
        return await this.generateDetailedPropertyInfo(property, contextRequest.requestType, user);
      }

      // Fallback for other context types
      return await this.generateIntelligentErrorResponse(message, new Error('Unknown context request'), user, 'context_request');

    } catch (error) {
      console.error('❌ [CONVERSATION] Context request error:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'context_request');
    }
  }

  /**
   * Generate detailed property information
   * @param {object} property - Property object
   * @param {string} requestType - Type of request (details or contact)
   * @param {object} user - User object
   * @returns {Promise<Array>} - Detailed property info
   */
  async generateDetailedPropertyInfo(property, requestType, user) {
    try {
      const typeEmoji = displayService.getPropertyEmoji(property.property_type || 'apartment');
      const statusEmoji = displayService.getStatusEmoji(property.status);

      let response = `${typeEmoji} *Property Details*\n\n`;
      response += `📍 *Address:* ${property.address}\n`;
      response += `💰 *Price:* €${displayService.formatPrice(property.price)}\n`;
      
      if (property.bedrooms) response += `🛏️ *Bedrooms:* ${property.bedrooms}\n`;
      if (property.bathrooms) response += `🚿 *Bathrooms:* ${property.bathrooms}\n`;
      if (property.area) response += `📐 *Area:* ${property.area}m²\n`;
      if (property.floor) response += `🏢 *Floor:* ${property.floor}\n`;
      
      response += `${statusEmoji} *Status:* ${displayService.capitalizeFirst(property.status)}\n`;
      
      if (property.description) {
        response += `\n📝 *Description:*\n${property.description}\n`;
      }

      // Features
      const features = [];
      if (property.furnished) features.push('🪑 Furnished');
      if (property.elevator) features.push('🛗 Elevator');
      if (property.air_conditioning) features.push('❄️ AC');
      if (property.work_room) features.push('💼 Work Room');
      
      if (features.length > 0) {
        response += `\n✨ *Features:* ${features.join(', ')}\n`;
      }

      // Location details
      if (property.districts?.district) {
        response += `\n🗺️ *District:* ${property.districts.district}`;
        if (property.districts.countries?.country) {
          response += `, ${property.districts.countries.country}`;
        }
        response += '\n';
      }

      const messages = [response];

      // Add contact information if requested or if it's available
      if (requestType === 'contact' || property.users) {
        let contactMsg = '📞 *Contact Information:*\n\n';
        
        if (property.users?.name) {
          contactMsg += `👤 *Contact:* ${property.users.name}\n`;
        }
        if (property.users?.phone_number) {
          contactMsg += `📱 *Phone:* ${property.users.phone_number}\n`;
        }
        
        if (property.property_link) {
          contactMsg += `🔗 *Listing:* ${property.property_link}\n`;
        }

        if (property.users?.name || property.users?.phone_number || property.property_link) {
          messages.push(contactMsg);
        } else {
          messages.push('📞 Contact information not available for this property. You can try contacting our support for assistance.');
        }
      }

      return messages;

    } catch (error) {
      console.error('Error generating detailed property info:', error);
      return ['❌ Error getting property details. Please try again.'];
    }
  }

  /**
   * Generate response when no search context is available
   * @param {string} message - User's message
   * @param {object} user - User object
   * @returns {Promise<Array>} - Response messages
   */
  async generateIntelligentNoSearchContextResponse(message, user) {
    try {
      const systemPrompt = `You are an intelligent real estate assistant. A user is asking for property details but there are no recent search results to reference. Generate a helpful response that:

1. Explains they need to search for properties first
2. Provides an example of how to search
3. Offers to help them find what they're looking for
4. Maintains a helpful, encouraging tone

User message: "${message}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY a pure JSON array of 1-2 short WhatsApp messages. No markdown, no code blocks, just clean JSON.

Format: ["message1", "message2"]`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate no-search-context response for: "${message}"` }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      
      // Handle markdown-wrapped JSON responses
      let jsonContent = content;
      if (content.startsWith('```json') && content.endsWith('```')) {
        jsonContent = content.slice(7, -3).trim();
      } else if (content.startsWith('```') && content.endsWith('```')) {
        jsonContent = content.slice(3, -3).trim();
      }
      
      const messages = JSON.parse(jsonContent);
      return Array.isArray(messages) ? messages : [messages];
    } catch (aiError) {
      console.error('AI no-search-context response generation failed:', aiError);
      return [
        '🔍 To get property details, please search for properties first!',
        '💡 Try: "Show me apartments in Lisbon" then ask for "details of property 1"'
      ];
    }
  }
}

module.exports = new ConversationService(); 