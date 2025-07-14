const openaiService = require('./openaiService');
const dataValidationService = require('./dataValidationService');
const databaseIntegrityService = require('./databaseIntegrityService');
const propertyParsingService = require('./propertyParsingService');
const searchService = require('./searchService');
const propertyManagementService = require('./propertyManagementService');
const displayService = require('./displayService');
const appointmentService = require('./appointmentService');
const User = require('../models/User');
const UserRole = require('../models/UserRole');
const Property = require('../models/Property');
const twilioService = require('./twilioService');
const ViewingAppointment = require('../models/ViewingAppointment');
const { ROLES } = require('../models/UserRole');
const { UserRoleClass } = require('../models/UserRole');

// Add a new constant for conversation states
const CONVERSATION_STATE = {
  AWAITING_ROLE: 'awaiting_role_selection',
  AWAITING_DELETION_CONFIRMATION: 'awaiting_deletion_confirmation',
  AWAITING_AVAILABILITY_PROPERTY_SELECTION: 'awaiting_availability_property_selection',
  AWAITING_AVAILABILITY_TEXT: 'awaiting_availability_text',
  // Appointment booking states
  AWAITING_SLOT_SELECTION: 'awaiting_appointment_slot_selection',
  AWAITING_TIME_PREFERENCES: 'awaiting_buyer_time_preferences',
  AWAITING_APPOINTMENT_CONFIRMATION: 'awaiting_appointment_confirmation',
  APPOINTMENT_COORDINATING: 'appointment_coordinating'
};

class ConversationService {
  constructor() {
    // Track conversation states for users
    this.conversationStates = new Map();
  }

  /**
   * Starts the onboarding process for a new user.
   * @param {object} user - The newly created user object.
   * @param {string} initialMessage - The first message the user sent.
   * @returns {Promise<Array>} - Welcome and role selection messages.
   */
  async startNewUserOnboarding(user, initialMessage) {
    console.log(`👋 [CONVERSATION] Starting onboarding for new user: ${user.phone_number}`);
    
    // Set the state to indicate we're waiting for them to select a role
    this.setConversationState(user.phone_number, {
      state: CONVERSATION_STATE.AWAITING_ROLE,
      initialMessage: initialMessage // Save their first message
    });

    const welcomeMessage = "Welcome to ReAgentBot! I'm your intelligent real estate assistant.";
    const roleList = ROLES.map(r => `- *${displayService.capitalizeFirst(r)}*`).join('\n');
    const roleQuestion = `To get started, could you let me know your primary goal? Please reply with one of the following roles:\n\n${roleList}`;

    return [welcomeMessage, roleQuestion];
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
        const conversationState = this.getConversationState(user.phone_number);
        
      // If the user has no role and we are not already asking for it, start the onboarding flow.
      // This is the new, correct entry point for the "Handshake."
      if (!user.onboarded && conversationState.state !== CONVERSATION_STATE.AWAITING_ROLE) {
        return await this.startNewUserOnboarding(user, message);
        }
        
      // Handle the role selection from the onboarding flow
      if (conversationState.state === CONVERSATION_STATE.AWAITING_ROLE) {
        return await this.handleRoleSelection(message, user, conversationState);
          }
          
      // Handle property deletion confirmation
      if (conversationState.state === CONVERSATION_STATE.AWAITING_DELETION_CONFIRMATION) {
        return await this.handleDeletionResponse(message, user, conversationState);
      }

      // Handle availability setting
      if (conversationState.state === CONVERSATION_STATE.AWAITING_AVAILABILITY_PROPERTY_SELECTION) {
        return await this.handleAvailabilityPropertySelection(message, user, conversationState);
      }
      if (conversationState.state === CONVERSATION_STATE.AWAITING_AVAILABILITY_TEXT) {
        return await this.handleAvailabilityResponse(message, user, conversationState);
      }

      // Handle appointment booking states
      if (conversationState.state === CONVERSATION_STATE.AWAITING_SLOT_SELECTION) {
        return await this.handleSlotSelection(message, user, conversationState);
      }
      if (conversationState.state === CONVERSATION_STATE.AWAITING_TIME_PREFERENCES) {
        return await this.handleTimePreferences(message, user, conversationState);
      }
      if (conversationState.state === CONVERSATION_STATE.AWAITING_APPOINTMENT_CONFIRMATION) {
        return await this.handleAppointmentConfirmation(message, user, conversationState);
      }
      if (conversationState.state === CONVERSATION_STATE.APPOINTMENT_COORDINATING) {
        return await this.handleAppointmentCoordination(message, user, conversationState);
          }

      // Check for owner responses to appointment requests before anything else
      const ownerResponse = await this.handleOwnerAppointmentResponse(message, user);
      if (ownerResponse) {
        return ownerResponse;
      }
      
      // For existing users, add a personalized greeting if they send a simple "Hi"
      const greetingResponse = this.handleGreeting(message, user);
      if (greetingResponse) {
        // This is a simple greeting, return the personalized welcome back message.
        return greetingResponse;
      }

      // Check for direct appointment requests
      const appointmentCheck = await appointmentService.isAppointmentRequest(message);
      if (appointmentCheck.isAppointmentRequest) {
        console.log(`📅 [CONVERSATION] Appointment request detected with confidence: ${appointmentCheck.confidence}`);
        
        // CRITICAL FIX: Check if this is an owner/agent providing availability
        if (user.user_roles?.role === 'owner' || user.user_roles?.role === 'agent') {
          console.log(`🏠 [CONVERSATION] Owner/agent providing availability: "${message}"`);
          return await this.handleOwnerAvailabilityResponse(message, user);
        }
        
        // This is a high-level intent. Let the contextual handler manage it
        // to see if it applies to a recent search.
        const contextualResult = await this.handleContextualRequest(message, user);
        if (contextualResult) return contextualResult;
        
        // If contextual handler didn't handle it, provide intelligent guidance
        const conversationState = this.getConversationState(user.phone_number);
        const hasRecentSearch = conversationState.lastSearchResults?.results?.length > 0;
        
        if (hasRecentSearch) {
          return [`🤔 I can see you're interested in booking a viewing! \n\n💡 To help you book an appointment, please be more specific:\n• "I want to book property 1"\n• "I'm interested in viewing the first property"\n• "Book viewing for the apartment in [location]"\n\n📋 Or say "show me properties again" to see your search results.`];
          } else {
          return [`🏠 I'd love to help you book a property viewing!\n\n🔍 First, let me help you find properties. Try searching like:\n• "Show me 2-bedroom apartments in Lisbon"\n• "Properties under €2000 in Porto"\n• "Houses for sale in Cascais"\n\n💡 Once you find something you like, I can arrange the viewing!`];
        }
      }

      // Check for other context-dependent requests (property details, etc.)
      const contextRequest = await this.parseContextRequest(message, user);
      if (contextRequest.isPropertyRequest || contextRequest.isPropertyInterest || contextRequest.isSearchRefinement) {
        const contextualResult = await this.handleContextualRequest(message, user, contextRequest);
        if (contextualResult) return contextualResult;
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
          // Start the async process and immediately return an acknowledgement.
          this.handleAddProperty(message, user);
          return ["Got it! I'm processing your listings now. This may take a moment..."];

        case 'delete_property':
          return await this.handleDeleteProperty(user);

        case 'set_availability':
          return await this.handleSetAvailability(user);

        case 'unclear':
        default:
          // Fallback: If intent is unclear, check if it's a property link
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const foundUrl = message.match(urlRegex);
          if (foundUrl) {
            return await this.handlePropertyLink(user, foundUrl[0]);
          }
          return await this.handleUnclearIntent(message, user, intent);
      }

    } catch (error) {
      console.error('❌ [CONVERSATION] Error processing message:', error);
      return await this.generateIntelligentErrorResponse(message, error, user, 'message_processing');
    }
  }

  /**
   * Handles the user's response during the role selection phase of onboarding.
   * @param {string} message - The user's message (their chosen role).
   * @param {object} user - The user object.
   * @param {object} conversationState - The current conversation state.
   * @returns {Promise<Array>} - Confirmation and follow-up messages.
   */
  async handleRoleSelection(message, user, conversationState) {
    const requestedRoleRaw = message.trim().toLowerCase();
    // Normalize roles using a robust mapping
    const roleMap = {};
    for (const role of ROLES) {
      roleMap[role] = role;
      if (role === 'renter') {
        roleMap['rent'] = 'renter';
      }
      if (role === 'buyer') {
        roleMap['buy'] = 'buyer';
      }
      if (role === 'owner') {
        roleMap['sell'] = 'owner';
        roleMap['manage'] = 'owner';
      }
      if (role === 'agent') {
        roleMap['broker'] = 'agent';
      }
    }
    let role = roleMap[requestedRoleRaw];
    // Try to match partials (e.g., "i want to buy" -> "buyer")
    if (!role) {
      for (const key of Object.keys(roleMap)) {
        if (requestedRoleRaw.includes(key)) {
          role = roleMap[key];
          break;
        }
      }
    }
    if (!role || !UserRoleClass.isValidRole(role)) {
      const roleList = ROLES.map(r => `*${displayService.capitalizeFirst(r)}*`).join(', ');
      return [
        `I'm sorry, I didn't understand that role. Please choose one of the following options: ${roleList}.`
      ];
    }
    // Update the user's role in the database and set onboarded: true
    await User.updateRole(user.id, role);
    // Fetch fresh user with role info
    const updatedUser = await User.getUserByPhoneWithRole(user.phone_number);
    console.log(`✅ [CONVERSATION] User ${user.phone_number} role set to: ${role}`);
    this.clearConversationState(user.phone_number);
    let followUpMessages = [`Great! You're all set up as a ${displayService.capitalizeFirst(role)}. Let's get started.`];
    const { initialMessage } = conversationState;
    if (initialMessage && initialMessage.trim().toLowerCase() !== requestedRoleRaw) {
      console.log(`▶️ [CONVERSATION] Processing initial message for ${user.phone_number}: "${initialMessage}"`);
      followUpMessages.push("Now, let's see about your first message...");
      const subsequentMessages = await this.processMessage(initialMessage, updatedUser);
      followUpMessages = followUpMessages.concat(subsequentMessages);
    }
    return followUpMessages;
  }

  /**
   * Handles a direct property link sent by a user.
   * @param {object} user The user object.
   * @param {string} url The property URL sent by the user.
   * @returns {Promise<Array>} A message initiating the viewing process or an error.
   */
  async handlePropertyLink(user, url) {
    console.log(`🔗 [CONVERSATION] Handling property link: ${url}`);
    try {
      const property = await Property.findOne({ property_link: url });

      if (!property) {
        return ["I don't recognize that property link. Please ensure it's a valid link from our listings."];
      }

      // Found the property, now kick off the viewing interest flow
      return await appointmentService.handleViewingInterest(`I'm interested in the property from the link.`, user, property.id);

    } catch (error) {
      console.error(`❌ [CONVERSATION] Error handling property link:`, error);
      return ["There was an error processing that link. Please try again."];
    }
  }

  /**
   * Handle basic greetings
   * @param {string} message - User's message
   * @param {object} user - User object
   * @returns {Array|null} - Greeting response or null if not a greeting
   */
  handleGreeting(message, user) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check for common greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'hola', 'bonjour'];
    const isGreeting = greetings.some(greeting => 
      lowerMessage === greeting || 
      lowerMessage.startsWith(greeting + ' ') ||
      lowerMessage.startsWith(greeting + '!')
    );
    
    if (isGreeting && lowerMessage.length < 20) {
      const role = user.user_roles?.role;

      if (role === 'owner' || role === 'agent') {
        return [`Welcome back, ${user.name || role}! What would you like to do today?\n\n- View my listings\n- Add a new property\n- Set my availability`];
      }

      const roleName = role ? displayService.capitalizeFirst(role) : 'User';
      const name = user.name ? `, ${user.name}` : '';

      return [`Welcome back${name}! As a ${roleName}, how can I assist you with your property needs today?`];
    }
    
    return null;
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
      
      // Check if the query is ambiguous and needs clarification
      if (searchResults.isAmbiguous && searchResults.clarificationNeeded) {
        console.log(`🤔 [CONVERSATION] Ambiguous query detected, asking for clarification`);
        
        let clarificationResponse = `🤔 *I need clarification about your search:*\n\n`;
        clarificationResponse += `${searchResults.clarificationMessage}\n\n`;
        
        if (searchResults.possibleInterpretations && searchResults.possibleInterpretations.length > 0) {
          clarificationResponse += `💡 *Did you mean:*\n`;
          searchResults.possibleInterpretations.forEach((interpretation, index) => {
            clarificationResponse += `${index + 1}. ${interpretation.value}\n`;
          });
          clarificationResponse += `\n`;
        }
        
        clarificationResponse += `Please be more specific so I can find exactly what you're looking for! 🎯`;
        
        return [clarificationResponse];
      }
      
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
        
        // Add proactive appointment booking suggestions
        if (searchResults.totalCount === 1) {
          formattedMessages.push("💡 To book a viewing for this property, just say:\n• \"I am interested in this\"\n• \"Book a viewing\"\n• \"I want to see this property\"");
        } else if (searchResults.totalCount <= 5) {
          formattedMessages.push("💡 To book a viewing, say:\n• \"I am interested in property 1\"\n• \"Book viewing for property 2\"\n• \"I want to see the first apartment\"");
        } else {
          formattedMessages.push("Would you like to narrow down these results? You can change the price, add a feature, or specify a different area.");
        }
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
      
      // Format for display using the dedicated display service
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
   * Handle adding new properties using the intelligent parsing service.
   * This function now runs asynchronously and sends a follow-up message.
   * @param {string} message - Property details
   * @param {object} user - User object
   */
  async handleAddProperty(message, user) {
    try {
      console.log(`➕ [CONVERSATION] Starting async property add for ${user.phone_number}`);

      // Check permissions first.
      if (!user || (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent')) {
        await twilioService.sendWhatsAppMessage(user.phone_number, "You don't have permission to add properties.");
        return;
      }

      // Perform the long-running parsing and database insertion.
      const result = await propertyParsingService.processPropertyListings(user.phone_number, message, user);
      
      // Format the final result message.
      const finalMessage = propertyParsingService.formatPropertyAdditionResponse(result);

      // Send the final result as a new, outbound message.
      await twilioService.sendWhatsAppMessage(user.phone_number, finalMessage);

    } catch (error) {
      console.error('❌ [CONVERSATION] Async add property error:', error);
      // Notify the user of the failure in a new message.
      await twilioService.sendWhatsAppMessage(user.phone_number, "I'm sorry, I encountered an error while trying to add your properties. Please try again.");
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user's request failed. Generate a short, friendly response (max 2 sentences) that:

1. Acknowledges what they tried to do
2. Suggests a simple alternative

User tried: "${originalMessage}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown, no formatting. Keep it conversational and under 100 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalMessage }
        ],
        temperature: 0.3,
        max_tokens: 150
      });

      return [response.choices[0].message.content.trim()];
    } catch (aiError) {
      console.error('AI error response generation failed:', aiError);
      return [`🤖 I understand you're looking for "${originalMessage}". Could you try being more specific?`];
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user found no properties. Generate a short, encouraging response (max 2 sentences) that suggests alternatives.

User searched: "${originalMessage}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown. Keep it friendly and under 80 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalMessage }
        ],
        temperature: 0.3,
        max_tokens: 120
      });

      return response.choices[0].message.content.trim();
    } catch (aiError) {
      console.error('AI no-results response generation failed:', aiError);
      return `🔍 No matches for "${originalMessage}". Try nearby areas or different criteria?`;
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user's message isn't clear. Generate a short, friendly response (max 2 sentences) asking for clarification.

User said: "${message}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown. Keep it conversational and under 80 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 120
      });

      return [response.choices[0].message.content.trim()];
    } catch (aiError) {
      console.error('AI unclear response generation failed:', aiError);
      return [`🤔 I want to help with "${message}" but need more context. Are you looking to search properties or something else?`];
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user tried something they can't do. Generate a short, polite response (max 2 sentences) explaining and suggesting alternatives.

They tried: ${operation}
User role: ${user?.user_roles?.role || 'none'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown. Keep it friendly and under 80 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: operation }
        ],
        temperature: 0.3,
        max_tokens: 120
      });

      return [response.choices[0].message.content.trim()];
    } catch (aiError) {
      console.error('AI permission response generation failed:', aiError);
      return [`🤔 I'd love to help with that! Let me suggest some things I can help you with instead.`];
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user wants contact info. Generate a short, helpful response (max 2 sentences) explaining how to get it.

User asked: "${message}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown. Keep it friendly and under 80 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 120
      });

      return [response.choices[0].message.content.trim()];
    } catch (aiError) {
      console.error('AI contact response generation failed:', aiError);
      return [`📞 I'd love to help you get contact info! First search for properties, then ask for specific contact details.`];
    }
  }

  /**
   * Parse context-dependent requests using AI intelligence instead of regex patterns
   * @param {string} message - User's message
   * @param {object} user - User object
   * @returns {Promise<object>} - Context request analysis
   */
  async parseContextRequest(message, user) {
    try {
      // Get conversation context for AI
      const conversationState = this.getConversationState(user.phone_number);
      const hasRecentSearch = conversationState.lastSearchResults?.results?.length > 0;
      const lastViewedProperty = conversationState.lastViewedProperty;
      const hasLastSearchQuery = conversationState.lastQuery;
      
      const systemPrompt = `You are an intelligent context analyzer for a real estate assistant. Analyze the user's message to determine their intent.

CONVERSATION CONTEXT:
- Has recent search results: ${hasRecentSearch}
- Last viewed property: ${lastViewedProperty ? `Property #${lastViewedProperty.index}` : 'none'}
- Last search query: "${hasLastSearchQuery || 'none'}"

INTELLIGENT ANALYSIS RULES:
1. CONTEXTUAL REFERENCES to recent properties should be recognized:
   - "i am interested in this" → PROPERTY INTEREST (if recent search exists)
   - "i want to see this" → PROPERTY INTEREST (if recent search exists)
   - "book a viewing for this" → PROPERTY INTEREST (if recent search exists)
   - "contact details for this" → PROPERTY DETAILS (if recent search exists)
   - "this property" → PROPERTY INTEREST (if recent search exists)
   - "i am interested in number 5" → PROPERTY INTEREST for property #5
   - "i am interested in property 3" → PROPERTY INTEREST for property #3
   - "book viewing for number 2" → PROPERTY INTEREST for property #2
   - "i want to see property 1" → PROPERTY INTEREST for property #1

2. PRICE CORRECTIONS are common and should trigger new searches:
   - "oh i mean 3000" → NEW SEARCH for €3000 properties
   - "budget" → NEW SEARCH for budget properties  
   - "3000" (after price discussion) → NEW SEARCH for €3000 properties
   - "actually 2500" → NEW SEARCH for €2500 properties

3. PROPERTY DETAIL REQUESTS need specific property references:
   - "details of property 1" → PROPERTY DETAILS for #1
   - "tell me more about 5" → PROPERTY DETAILS for #5
   - "i want info on property 3" → PROPERTY DETAILS for #3

4. SEARCH REFINEMENTS should trigger new searches:
   - "only above 4000" → NEW SEARCH with price filter
   - "properties above price 4000" → NEW SEARCH with price filter
   - "in lisbon" → NEW SEARCH with location filter

Return JSON:
{
  "intent": "property_details|property_interest|search_refinement|other",
  "propertyNumber": number or null,
  "isSearchRefinement": boolean,
  "isPropertyInterest": boolean,
  "searchTerms": "extracted search terms if search refinement",
  "confidence": 0.0-1.0
}

CRITICAL ANALYSIS RULES:
- "i am interested in this" = property_interest (contextual reference with recent search)
- "i want to see this" = property_interest (contextual reference)
- "book viewing for this" = property_interest (contextual reference)
- "i am interested in number 5" = property_interest (propertyNumber: 5)
- "i am interested in property 3" = property_interest (propertyNumber: 3)
- "book viewing for number 2" = property_interest (propertyNumber: 2)
- "i want to see property 1" = property_interest (propertyNumber: 1)
- "oh i mean 3000" = search_refinement (price correction)
- "budget" = search_refinement (budget search)  
- "only above 4000" = search_refinement (price filter)
- "details of property 4" = property_details (specific request)
- "tell me more about 3" = property_details (specific request)

Message to analyze: "${message}"`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze context: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);

      console.log(`🧠 [CONVERSATION] Context analysis for "${message}":`, result);

      return {
        isPropertyRequest: result.intent === 'property_details',
        isPropertyInterest: result.isPropertyInterest || result.intent === 'property_interest',
        propertyNumber: result.propertyNumber,
        isSearchRefinement: result.isSearchRefinement || result.intent === 'search_refinement',
        searchTerms: result.searchTerms,
        confidence: result.confidence || 0.8
      };
    } catch (error) {
      console.error('Error parsing context request:', error);
      return {
        isPropertyRequest: false,
        isPropertyInterest: false,
        propertyNumber: null,
        isSearchRefinement: false,
        searchTerms: null,
        confidence: 0.0
      };
    }
  }

  /**
   * Handles all context-dependent requests, such as "details of property 1"
   * or "book a viewing for number 2".
   * @param {string} message The user's message.
   * @param {object} user The user object.
   * @param {object} [contextRequest=null] Pre-parsed context, if available.
   * @returns {Promise<Array|null>} A response if the context can be handled, otherwise null.
   */
  async handleContextualRequest(message, user, contextRequest = null) {
    // If we don't have a pre-parsed request, parse it now.
    if (!contextRequest) {
      contextRequest = await this.parseContextRequest(message, user);
    }
    
    // If it's a search refinement, use the already-extracted search term.
    if (contextRequest.isSearchRefinement) {
      // The context parser has already identified the core search term (e.g., "Rato").
      // We should use that directly instead of the whole sentence.
      const searchQuery = contextRequest.searchTerms || message;
      console.log(`🔍 [CONTEXT] Search refinement detected. Passing search term: "${searchQuery}"`);
      return await this.handleSearch(searchQuery, user);
    }

    // Handle property interest (like "i am interested in this" or "i am interested in number 5")
    if (contextRequest.isPropertyInterest) {
      console.log(`🎯 [CONTEXT] Property interest detected. Checking recent search results.`);
        const conversationState = this.getConversationState(user.phone_number);
        const lastSearchResults = conversationState.lastSearchResults;

      if (!lastSearchResults || !lastSearchResults.results || lastSearchResults.results.length === 0) {
        return ["I don't have any recent search results. Please search for properties first."];
        }

      // CRITICAL FIX: Check if user specified a property number
      if (contextRequest.propertyNumber) {
        console.log(`🎯 [CONTEXT] Specific property number detected: ${contextRequest.propertyNumber}`);
        const propertyIndex = contextRequest.propertyNumber - 1; // Convert to 0-based index
        const property = lastSearchResults.results[propertyIndex];

        if (!property) {
          return [`❌ I don't see a property with number ${contextRequest.propertyNumber} in your search results. Please choose a number from 1 to ${lastSearchResults.results.length}.`];
        }

        console.log(`📅 [CONTEXT] Initiating viewing for property #${contextRequest.propertyNumber}: ${property.address}`);
        
        // Set up appointment booking state and delegate to appointment service
        const appointmentResult = await appointmentService.handleViewingInterest(message, user, property.id);
        
        // Check if appointment service is expecting slot selection or time preferences
        const pendingRequest = appointmentService.pendingRequests.get(user.phone_number);
        if (pendingRequest) {
          if (pendingRequest.type === 'slot_selection') {
            this.setConversationState(user.phone_number, {
              ...conversationState,
              state: CONVERSATION_STATE.AWAITING_SLOT_SELECTION,
              property: property,
              availableSlots: pendingRequest.availableSlots
            });
          } else if (pendingRequest.type === 'preference_collection') {
            this.setConversationState(user.phone_number, {
              ...conversationState,
              state: CONVERSATION_STATE.AWAITING_TIME_PREFERENCES,
              property: property,
              originalMessage: message
            });
          }
        }
        
        return appointmentResult;
      }

      // If there's only one property from recent search, use that
      if (lastSearchResults.results.length === 1) {
        const property = lastSearchResults.results[0];
        console.log(`📅 [CONTEXT] Single property from recent search. Initiating viewing for: ${property.address}`);
        
        // Set up appointment booking state and delegate to appointment service
        const appointmentResult = await appointmentService.handleViewingInterest(message, user, property.id);
        
        // Check if appointment service is expecting slot selection or time preferences
        const pendingRequest = appointmentService.pendingRequests.get(user.phone_number);
        if (pendingRequest) {
          if (pendingRequest.type === 'slot_selection') {
            this.setConversationState(user.phone_number, {
              ...conversationState,
              state: CONVERSATION_STATE.AWAITING_SLOT_SELECTION,
              property: property,
              availableSlots: pendingRequest.availableSlots
            });
          } else if (pendingRequest.type === 'preference_collection') {
            this.setConversationState(user.phone_number, {
              ...conversationState,
              state: CONVERSATION_STATE.AWAITING_TIME_PREFERENCES,
              property: property,
              originalMessage: message
            });
          }
        }
        
        return appointmentResult;
      }

      // If multiple properties and no specific number mentioned, ask which one they mean
      return this.askWhichPropertyToView(lastSearchResults.results);
    }

    // If it's not a property request, we can't handle it here.
    if (!contextRequest.isPropertyRequest || contextRequest.propertyNumber === null) {
      return null;
    }
    
    // Get the user's last search results from the conversation state.
        const conversationState = this.getConversationState(user.phone_number);
        const lastSearchResults = conversationState.lastSearchResults;

    if (!lastSearchResults || !lastSearchResults.results || lastSearchResults.results.length === 0) {
      return ["I don't have any recent search results to get details from. Please try a new search first."];
        }

    const propertyIndex = contextRequest.propertyNumber - 1; // Convert to 0-based index
        const property = lastSearchResults.results[propertyIndex];

        if (!property) {
      return [`I don't see a property with the number ${contextRequest.propertyNumber} in your last search. Please choose a number from 1 to ${lastSearchResults.results.length}.`];
        }

    // Now, determine the specific action: view details or book appointment.
        const appointmentCheck = await appointmentService.isAppointmentRequest(message);
        if (appointmentCheck.isAppointmentRequest) {
      console.log(`📅 [CONTEXT] Initiating viewing for property #${contextRequest.propertyNumber}`);
          return await appointmentService.handleViewingInterest(message, user, property.id);
    } else {
      // Default action is to show details.
      console.log(`📋 [CONTEXT] Showing details for property #${contextRequest.propertyNumber}`);
      return await this.generateDetailedPropertyInfo(property, user);
    }
  }

  /**
   * Generate detailed property information
   * @param {object} property - Property object
   * @param {string} requestType - Type of request (details or contact)
   * @param {object} user - User object
   * @returns {Promise<Array>} - Detailed property info
   */
  async generateDetailedPropertyInfo(property, user) {
    try {
      // Store this property as the last viewed for context in future messages
      const currentState = this.getConversationState(user.phone_number);
      this.setConversationState(user.phone_number, {
        ...currentState,
        lastViewedProperty: property,
        lastViewedTime: new Date()
      });
      
      const typeEmoji = displayService.getPropertyEmoji(property.property_type || 'apartment');
      const statusEmoji = displayService.getStatusEmoji(property.status);

      let response = `${typeEmoji} *Property Details*\n\n`;
      response += `📍 *Address:* ${property.address}\n`;
      response += `💰 *Price:* €${displayService.formatPrice(property.price)}\n`;
      
      if (property.bedrooms) response += `🛏️ *Bedrooms:* ${property.bedrooms}\n`;
      if (property.bathrooms) response += `🚿 *Bathrooms:* ${property.bathrooms}\n`;
      if (property.area_sqm) response += `📐 *Area:* ${property.area_sqm}m²\n`;
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
      if (property.users) {
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
      const systemPrompt = `You are a helpful WhatsApp real estate assistant. A user wants property details but hasn't searched yet. Generate a short, friendly response (max 2 sentences) explaining they need to search first.

User asked: "${message}"
User role: ${user?.user_roles?.role || 'renter'}

IMPORTANT: Return ONLY plain text - no JSON, no markdown. Keep it friendly and under 80 words.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 120
      });

      return [response.choices[0].message.content.trim()];
    } catch (aiError) {
      console.error('AI no-search-context response generation failed:', aiError);
      return [
        '🔍 Please search for properties first, then I can show you details!'
      ];
    }
  }

  /**
   * Ask user which property they want to view from recent search
   * @param {Array} properties - Recent search properties
   * @returns {Array} - Selection message
   */
  askWhichPropertyToView(properties) {
    let response = `📅 *Which property would you like to view?*\n\n`;
    
    properties.slice(0, 10).forEach((property, index) => {
      const emoji = this.getPropertyEmoji(property.property_type);
      response += `${index + 1}. ${emoji} ${property.address}\n   €${property.price} - ${property.bedrooms}BR\n\n`;
    });
    
    response += `💡 Reply with: "Book viewing for property 3" or "View property 1"`;
    
    return [response];
  }

  /**
   * Extract property number from viewing request
   * @param {string} message - User's message
   * @returns {number|null} - Property number or null
   */
  extractPropertyNumberFromViewingRequest(message) {
    // Patterns like "view property 5", "book viewing for property 3", "I want to see property 2"
    const patterns = [
      /(?:view|book|see|visit)\s+(?:property\s+)?(\d+)/i,
      /property\s+(\d+)/i,
      /number\s+(\d+)/i,
      /^(\d+)$/  // Just a number
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return null;
  }

  /**
   * Get property emoji based on type
   * @param {string} propertyType - Property type
   * @returns {string} - Emoji
   */
  getPropertyEmoji(propertyType) {
    const emojis = {
      'apartment': '🏢',
      'house': '🏠',
      'commercial': '🏢',
      'land': '🌳'
    };
    return emojis[propertyType] || '🏠';
  }

  /**
   * Starts the process for an owner/agent to set their viewing availability.
   * @param {object} user The user object.
   * @returns {Promise<Array>} A message listing properties to choose from.
   */
  async handleSetAvailability(user) {
    console.log(`🗓️ [CONVERSATION] Starting 'set availability' for ${user.phone_number}`);
    const userProperties = await propertyManagementService.getUserProperties(user);

    if (!userProperties || userProperties.length === 0) {
      return ["You don't have any properties for which to set availability. Please add a property first."];
    }

    if (userProperties.length === 1) {
      // If they only have one property, skip selection
      this.setConversationState(user.phone_number, {
        state: CONVERSATION_STATE.AWAITING_AVAILABILITY_TEXT,
        property: userProperties[0]
      });
      return [`Let's set the availability for your property at *${userProperties[0].address}*.\n\nPlease describe your available viewing times (e.g., "Mondays 9am-12pm and Wednesdays 2-5pm").`];
    }

    let response = "For which property would you like to set the availability? Please reply with the number.\n\n";
    userProperties.forEach((prop, index) => {
      response += `${index + 1}. ${prop.address}\n`;
    });

    this.setConversationState(user.phone_number, {
      state: CONVERSATION_STATE.AWAITING_AVAILABILITY_PROPERTY_SELECTION,
      properties: userProperties
    });

    return [response];
  }

  /**
   * Handles the user's property selection for setting availability.
   * @param {string} message The user's message (property number).
   * @param {object} user The user object.
   * @param {object} conversationState The current conversation state.
   * @returns {Promise<Array>} A prompt asking for their availability text.
   */
  async handleAvailabilityPropertySelection(message, user, conversationState) {
    const propertyNumber = parseInt(message.trim());
    const { properties } = conversationState;

    if (isNaN(propertyNumber) || propertyNumber < 1 || propertyNumber > properties.length) {
      return ["That's not a valid number. Please reply with the number of the property."];
    }

    const selectedProperty = properties[propertyNumber - 1];
    
    this.setConversationState(user.phone_number, {
      state: CONVERSATION_STATE.AWAITING_AVAILABILITY_TEXT,
      property: selectedProperty
    });

    return [`Great. Let's set the availability for *${selectedProperty.address}*.\n\nPlease describe your available viewing times (e.g., "Weekdays from 10am to 1pm").`];
  }

  /**
   * Handles the user's availability text, parses it, and saves it.
   * @param {string} message The user's availability text.
   * @param {object} user The user object.
   * @param {object} conversationState The current conversation state.
   * @returns {Promise<Array>} A confirmation message.
   */
  async handleAvailabilityResponse(message, user, conversationState) {
    console.log(`🗓️ [CONVERSATION] Parsing availability: "${message}"`);
    const { property } = conversationState;

    const result = await openaiService.parseAvailability(message);

    if (!result.success || !result.schedule || result.schedule.length === 0) {
      return ["I'm sorry, I couldn't understand that schedule. Please try again, for example: *Mondays and Fridays 10am - 1pm*."];
    }

    try {
      // Save the structured schedule to the property's `availability` field
      await Property.updateById(property.id, { availability: result.schedule });
      
      this.clearConversationState(user.phone_number);

      let confirmationMessage = `✅ Availability for *${property.address}* has been updated successfully.\n\nI will now offer the following slots to interested users:\n`;
      result.schedule.forEach(slot => {
        confirmationMessage += `\n- *${slot.day}:* ${slot.startTime} - ${slot.endTime}`;
      });

      return [confirmationMessage];
    } catch (error) {
      console.error(`❌ [CONVERSATION] Error saving availability for property ${property.id}:`, error);
      this.clearConversationState(user.phone_number);
      return ["I'm sorry, there was an error saving the availability. Please try again later."];
    }
  }

  /**
   * Handle slot selection during appointment booking
   * @param {string} message - User's slot selection
   * @param {object} user - User object
   * @param {object} conversationState - Current conversation state
   * @returns {Promise<Array>} - Response messages
   */
  async handleSlotSelection(message, user, conversationState) {
    try {
      console.log(`📅 [APPOINTMENT] Processing slot selection: "${message}"`);
      
      const { property, availableSlots } = conversationState;
      
      // Use appointment service to process the selection
      const result = await appointmentService.processSlotSelection(message, user);
      
      // Clear the conversation state since appointment service handles it
      this.clearConversationState(user.phone_number);
      
      return result;
    } catch (error) {
      console.error('Error handling slot selection:', error);
      this.clearConversationState(user.phone_number);
      return ['❌ Error processing your selection. Please try again.'];
    }
  }

  /**
   * Handle time preferences collection for appointment booking
   * @param {string} message - User's time preferences
   * @param {object} user - User object  
   * @param {object} conversationState - Current conversation state
   * @returns {Promise<Array>} - Response messages
   */
  async handleTimePreferences(message, user, conversationState) {
    try {
      console.log(`📅 [APPOINTMENT] Processing time preferences: "${message}"`);
      
      // Use appointment service to process preferences
      const result = await appointmentService.processBuyerPreferences(message, user);
      
      // Update conversation state to coordinating
      this.setConversationState(user.phone_number, {
        ...conversationState,
        state: CONVERSATION_STATE.APPOINTMENT_COORDINATING,
        lastPreferences: message,
        lastPreferencesTime: new Date()
      });
      
      return result;
    } catch (error) {
      console.error('Error handling time preferences:', error);
      this.clearConversationState(user.phone_number);
      return ['❌ Error processing your preferences. Please try again.'];
    }
  }

  /**
   * Handle appointment confirmation responses
   * @param {string} message - User's confirmation
   * @param {object} user - User object
   * @param {object} conversationState - Current conversation state
   * @returns {Promise<Array>} - Response messages
   */
  async handleAppointmentConfirmation(message, user, conversationState) {
    try {
      console.log(`📅 [APPOINTMENT] Processing confirmation: "${message}"`);
      
      // Use appointment service to process confirmation
      const result = await appointmentService.processCoordinationResponse(message, user);
      
      if (result) {
        // Clear conversation state if appointment is confirmed
        this.clearConversationState(user.phone_number);
        return result;
      }
      
      // If appointment service didn't handle it, treat as general message
      this.clearConversationState(user.phone_number);
      return await this.processMessage(message, user);
    } catch (error) {
      console.error('Error handling appointment confirmation:', error);
      this.clearConversationState(user.phone_number);
      return ['❌ Error processing your confirmation. Please try again.'];
    }
  }

  /**
   * Handle coordination messages during appointment booking
   * @param {string} message - User's coordination message
   * @param {object} user - User object
   * @param {object} conversationState - Current conversation state
   * @returns {Promise<Array>} - Response messages
   */
  async handleAppointmentCoordination(message, user, conversationState) {
    try {
      console.log(`📅 [APPOINTMENT] Processing coordination: "${message}"`);
      
      // Check if this is a time/date response using AI
      const isTimeResponse = await this.isTimeRelatedMessage(message);
      
      if (isTimeResponse.isTimeRelated) {
        // Use appointment service to handle the time response
        const result = await appointmentService.processCoordinationResponse(message, user);
        
        if (result) {
          // Update conversation state based on result
          if (result[0].includes('confirmed') || result[0].includes('Confirmed')) {
            this.clearConversationState(user.phone_number);
          }
          return result;
        }
      }
      
      // If not time-related, treat as general conversation but maintain state
      const intent = await openaiService.classifyPropertyIntent(message, user);
      
      if (intent.intent === 'search') {
        // User wants to search while coordinating - allow but maintain appointment context
        const searchResult = await this.handleSearch(message, user);
        searchResult.push("\n💡 Your appointment booking is still in progress. I'll update you once the owner responds!");
        return searchResult;
      }
      
      // For other messages, provide context-aware response
      return [`📝 I'm still coordinating your viewing appointment. The owner/agent will respond soon.\n\n💭 Your message: "${message}"\n\n💡 In the meantime, you can search for other properties or ask me anything else!`];
      
    } catch (error) {
      console.error('Error handling appointment coordination:', error);
      return ['❌ Error processing your message. Your appointment booking is still active.'];
    }
  }

  /**
   * Handle owner/agent availability responses
   * @param {string} message - Owner's availability message
   * @param {object} user - Owner/agent user object
   * @returns {Promise<Array>} - Response messages
   */
  async handleOwnerAvailabilityResponse(message, user) {
    try {
      console.log(`🏠 [CONVERSATION] Processing owner availability: "${message}"`);
      
      // Parse the availability using OpenAI to extract structured date/time
      const availability = await this.parseOwnerAvailabilityWithDates(message);
      
      // Find pending coordination requests for this owner's properties
      const ownerId = user.id;
      const pendingCoordinations = this.findPendingCoordinationsForOwner(ownerId);
      
      if (pendingCoordinations.length === 0) {
        return [`📅 Thank you for providing your availability!\n\n🤔 However, I don't currently have any pending viewing requests that need coordination.\n\n💡 If someone shows interest in your properties, I'll contact you again to arrange viewings.`];
      }
      
      // For now, handle the most recent pending coordination
      const coordination = pendingCoordinations[0];
      
      // Create proposed appointment details with proper date/time structure
      const proposedAppointment = {
        property: coordination.property,
        buyer: coordination.buyer,
        ownerAvailability: availability,
        date: availability.parsedDate || new Date().toISOString().split('T')[0], // Default to today if no specific date
        dateFormatted: availability.dateFormatted || 'As discussed',
        timeFormatted: availability.timeFormatted || availability.summary,
        startTime: availability.startTime,
        endTime: availability.endTime
      };
      
      // Notify the buyer about owner's availability
      await this.notifyBuyerOfOwnerAvailability(coordination.buyer, proposedAppointment);
      
      return [
        `✅ Perfect! I've noted your availability: *${availability.summary}*\n\n📞 I'm now coordinating with the interested party.\n\n🔔 I'll let you know once they confirm the viewing time!\n\n💡 You can also say "show my properties" to see all your listings.`
      ];
      
    } catch (error) {
      console.error('Error handling owner availability response:', error);
      return [`✅ Thank you for providing your availability!\n\n📞 I'll coordinate with interested parties and get back to you soon.\n\n💡 You can say "show my properties" to see your listings.`];
    }
  }

  /**
   * Parse owner availability message to extract structured date/time information
   * @param {string} message - Owner's availability message (e.g., "Saturday at 10am")
   * @returns {Promise<object>} - Parsed availability with date/time components
   */
  async parseOwnerAvailabilityWithDates(message) {
    try {
      // Get current date/time context
      const now = new Date();
      const lisbon = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Lisbon"}));
      const currentDate = lisbon.toISOString().split('T')[0];
      const currentTime = lisbon.toTimeString().slice(0, 5);
      const dayOfWeek = lisbon.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Calculate next week dates for reference
      const tomorrow = new Date(lisbon);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(lisbon);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const systemPrompt = `Parse owner/agent availability message to extract structured date and time information for property viewings.

CURRENT CONTEXT:
- Current Date: ${currentDate} (${dayOfWeek})
- Current Time: ${currentTime}
- Tomorrow: ${tomorrow.toISOString().split('T')[0]}
- Next Week: ${nextWeek.toISOString().split('T')[0]}

INTERPRET RELATIVE REFERENCES:
- "tomorrow" = ${tomorrow.toISOString().split('T')[0]}
- "today" = ${currentDate}
- "Saturday" = next upcoming Saturday
- "next Monday" = upcoming Monday after current week
- "this weekend" = upcoming Saturday/Sunday

EXTRACT:
- Specific date (if mentioned) or calculate from day name
- Start time (required)
- End time (estimate +1 hour if not specified)
- Summary text

EXAMPLES:
"Saturday at 10am" → {
  "parsedDate": "${(() => {
    const sat = new Date(lisbon);
    const daysSinceMonday = (sat.getDay() + 6) % 7;
    const daysUntilSaturday = (6 - daysSinceMonday) % 7;
    if (daysUntilSaturday === 0 && sat.getHours() >= 10) {
      sat.setDate(sat.getDate() + 7);
    } else {
      sat.setDate(sat.getDate() + daysUntilSaturday);
    }
    return sat.toISOString().split('T')[0];
  })()}",
  "dateFormatted": "Saturday, ${(() => {
    const sat = new Date(lisbon);
    const daysSinceMonday = (sat.getDay() + 6) % 7;
    const daysUntilSaturday = (6 - daysSinceMonday) % 7;
    if (daysUntilSaturday === 0 && sat.getHours() >= 10) {
      sat.setDate(sat.getDate() + 7);
    } else {
      sat.setDate(sat.getDate() + daysUntilSaturday);
    }
    return sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })()}",
  "startTime": "10:00",
  "endTime": "11:00", 
  "timeFormatted": "10:00 - 11:00",
  "summary": "Saturday at 10am"
}

"Tuesday 2-4 PM" → {
  "parsedDate": "${(() => {
    const tue = new Date(lisbon);
    const daysSinceMonday = (tue.getDay() + 6) % 7;
    const daysUntilTuesday = (1 - daysSinceMonday + 7) % 7;
    if (daysUntilTuesday === 0 && tue.getHours() >= 14) {
      tue.setDate(tue.getDate() + 7);
    } else {
      tue.setDate(tue.getDate() + daysUntilTuesday);
    }
    return tue.toISOString().split('T')[0];
  })()}",
  "dateFormatted": "Tuesday, ${(() => {
    const tue = new Date(lisbon);
    const daysSinceMonday = (tue.getDay() + 6) % 7;
    const daysUntilTuesday = (1 - daysSinceMonday + 7) % 7;
    if (daysUntilTuesday === 0 && tue.getHours() >= 14) {
      tue.setDate(tue.getDate() + 7);
    } else {
      tue.setDate(tue.getDate() + daysUntilTuesday);
    }
    return tue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })()}",
  "startTime": "14:00",
  "endTime": "16:00",
  "timeFormatted": "14:00 - 16:00",
  "summary": "Tuesday 2-4 PM"
}

"Tomorrow at 3pm" → {
  "parsedDate": "${tomorrow.toISOString().split('T')[0]}",
  "dateFormatted": "Tomorrow, ${tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}",
  "startTime": "15:00", 
  "endTime": "16:00",
  "timeFormatted": "15:00 - 16:00",
  "summary": "Tomorrow at 3pm"
}

Return JSON with these exact fields. Use 24-hour format for times. If no end time specified, add 1 hour to start time.
Always calculate dates relative to current context.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse availability: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 400
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      // Validate required fields
      if (!result.startTime) {
        throw new Error('No start time extracted');
      }
      
      console.log('📅 [CONVERSATION] Parsed owner availability:', result);
      return result;
      
    } catch (error) {
      console.error('Error parsing owner availability with dates:', error);
      
      // Fallback to simple parsing with current date context
      const availability = await appointmentService.parseTimePreferences(message);
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + 1); // Default to tomorrow
      
      return {
        parsedDate: fallbackDate.toISOString().split('T')[0],
        dateFormatted: 'As discussed',
        startTime: '10:00',
        endTime: '11:00',
        timeFormatted: '10:00 - 11:00',
        summary: availability.summary || message
      };
    }
  }

  /**
   * Find pending appointment coordinations for an owner
   * @param {string} ownerId - Owner's user ID
   * @returns {Array} - Pending coordinations
   */
  findPendingCoordinationsForOwner(ownerId) {
    const pendingCoordinations = [];
    
    // Check appointment service pending requests for coordination involving this owner's properties
    for (const [buyerPhone, request] of appointmentService.pendingRequests.entries()) {
      if (request.type === 'coordinating' && request.property?.owner_id === ownerId) {
        pendingCoordinations.push({
          buyerPhone: buyerPhone,
          buyer: { phone_number: buyerPhone },
          property: request.property,
          preferences: request.buyerPreferences
        });
      }
    }
    
    return pendingCoordinations;
  }

  /**
   * Notify buyer about owner's availability
   * @param {object} buyer - Buyer user object
   * @param {object} proposedAppointment - Appointment details
   */
  async notifyBuyerOfOwnerAvailability(buyer, proposedAppointment) {
    try {
      const propertyEmoji = this.getPropertyEmoji(proposedAppointment.property.property_type);
      const message = `${propertyEmoji} *Great News!*\n\n📍 Property: ${proposedAppointment.property.address}\n\n🗓️ The owner/agent is available: *${proposedAppointment.ownerAvailability.summary}*\n\n💡 Does this time work for you?\n\n✅ Reply "Yes" to confirm\n❌ Reply "No" to suggest a different time\n\n📅 I'll finalize the viewing once you confirm!`;

      await twilioService.sendWhatsAppMessage(buyer.phone_number, message);
      
      // Update buyer's pending request to await confirmation
      const pendingRequest = appointmentService.pendingRequests.get(buyer.phone_number);
      if (pendingRequest) {
        pendingRequest.type = 'awaiting_buyer_confirmation';
        pendingRequest.proposedAppointment = proposedAppointment;
        appointmentService.pendingRequests.set(buyer.phone_number, pendingRequest);
        
        // CRITICAL FIX: Update conversation state to match appointment service state
        this.setConversationState(buyer.phone_number, {
          state: CONVERSATION_STATE.AWAITING_APPOINTMENT_CONFIRMATION,
          property: proposedAppointment.property,
          proposedAppointment: proposedAppointment,
          lastOwnerResponse: new Date()
        });
        
        console.log(`📅 [CONVERSATION] Updated buyer ${buyer.phone_number} state to AWAITING_APPOINTMENT_CONFIRMATION`);
      }
    } catch (error) {
      console.error('Error notifying buyer of owner availability:', error);
    }
  }

  /**
   * Check if a message is time/date related using AI
   * @param {string} message - User's message
   * @returns {Promise<object>} - Time analysis result
   */
  async isTimeRelatedMessage(message) {
    try {
      const systemPrompt = `Analyze if a message contains time, date, or scheduling-related information.

TIME/DATE INDICATORS:
- Specific times: "2 PM", "14:00", "at 3", "around noon"
- Days: "Monday", "Tuesday", "tomorrow", "next week"
- Dates: "July 12", "12th", "on the 15th"
- Time ranges: "afternoon", "morning", "evening"
- Scheduling words: "available", "can do", "works for me", "schedule"
- Confirmations: "yes", "okay", "sounds good" (in scheduling context)

NON-TIME INDICATORS:
- General conversation: "how are you", "tell me about"
- Property questions: "what's the price", "show me properties"
- Other topics: unrelated to scheduling

Return JSON:
{
  "isTimeRelated": boolean,
  "confidence": 0.0-1.0,
  "timeComponents": ["detected", "time", "elements"],
  "type": "specific_time|general_availability|confirmation"
}`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      return {
        isTimeRelated: result.isTimeRelated || false,
        confidence: result.confidence || 0.0,
        timeComponents: result.timeComponents || [],
        type: result.type || 'unknown'
      };
    } catch (error) {
      console.error('Error analyzing time-related message:', error);
      
      // Fallback regex check
      const timePatterns = [
        /\b(\d{1,2})\s*(am|pm|:\d{2})\b/i,
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /\b(morning|afternoon|evening|noon|tonight|today|tomorrow)\b/i,
        /\b(available|can\s+do|works?\s+for|schedule|confirm)\b/i,
        /\b(yes|okay|ok|sure|sounds?\s+good)\b/i
      ];
      
      const isTimeRelated = timePatterns.some(pattern => pattern.test(message));
      
      return {
        isTimeRelated: isTimeRelated,
        confidence: isTimeRelated ? 0.7 : 0.3,
        timeComponents: [],
        type: 'unknown'
      };
    }
  }

  async handleOwnerAppointmentResponse(message, user) {
    // This is not a state-based handler, but a proactive one.
    // It checks if any incoming message from an owner/agent matches the response format.
    if (user.user_roles?.role !== 'owner' && user.user_roles?.role !== 'agent') {
      return null;
    }

    const parsedResponse = await openaiService.parseOwnerResponse(message);

    if (parsedResponse.intent === 'unclear' || !parsedResponse.appointmentId) {
      return null; // Not a valid response to an appointment request
    }

    // Find the appointment by its full ID, using the short ID to search
    const appointment = await ViewingAppointment.findOne({ 'id::text': { like: `${parsedResponse.appointmentId}%` } });

    if (!appointment) {
      return [`I couldn't find an appointment matching the ID "${parsedResponse.appointmentId}". Please check the ID and try again.`];
    }

    const property = await Property.findById(appointment.property_id);
    if (!property) {
      return ["There was an error finding the property for this appointment."];
    }

    // Get the buyer's user object to send them notifications
    const buyer = await User.findById(appointment.user_id);
    if (!buyer) {
      return ["There was an error finding the buyer for this appointment."];
    }

    switch (parsedResponse.intent) {
      case 'confirm':
        await ViewingAppointment.updateById(appointment.id, { status: 'confirmed' });
        
        // Notify the buyer
        await twilioService.sendWhatsAppMessage(buyer.phone_number, `Great news! Your viewing for the property at *${property.address}* has been confirmed for *${appointment.appointment_date}* at *${appointment.start_time}*.`);

        // Generate and send calendar invites
        const calendarInvite = await appointmentService.generateCalendarInviteForAppointment(appointment);
        await twilioService.sendWhatsAppMessage(buyer.phone_number, calendarInvite);
        await twilioService.sendWhatsAppMessage(user.phone_number, calendarInvite);

        return [`You have confirmed the appointment. I have notified the buyer.`];

      case 'decline':
        await ViewingAppointment.updateById(appointment.id, { status: 'declined' });
        await twilioService.sendWhatsAppMessage(buyer.phone_number, `Unfortunately, the owner is not available for the viewing at *${property.address}* on *${appointment.appointment_date}*. Please feel free to request another time.`);
        return [`You have declined the appointment. I have notified the buyer.`];

      case 'suggest_new_time':
        // Notify the buyer of the new suggestion
        await twilioService.sendWhatsAppMessage(
          buyer.phone_number,
          `The owner has suggested a new time for the viewing at *${property.address}*: *${parsedResponse.newTimeSuggestion}*. \n\nDoes this time work for you? Please reply to confirm or suggest another time for appointment ID ${appointment.id.substring(0,4)}.`
        );
        return [`I have sent your suggestion of *${parsedResponse.newTimeSuggestion}* to the buyer. I will let you know when they respond.`];
    }

    return null;
  }
}

module.exports = new ConversationService();