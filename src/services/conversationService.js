const openaiService = require('./openaiService');
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
   * Process incoming message and determine appropriate response
   * @param {string} from - WhatsApp number of sender
   * @param {string} message - Message content
   * @returns {Promise<string>} - Response message
   */
  async processMessage(from, message) {
    try {
      // Check if user exists
      const existingUser = await User.getUserByPhoneWithRole(from);
      const isFirstMessage = !existingUser;

      // Get conversation state
      const conversationState = this.getConversationState(from);

      // Handle ongoing conversations first
      if (conversationState.awaitingResponse) {
        return await this.handleAwaitingResponse(from, message, conversationState);
      }

      // Classify intent using OpenAI
      const classification = await openaiService.classifyIntent(message, isFirstMessage);
      
      console.log(`Intent classification for ${from}:`, classification);

      // Process based on intent
      return await this.handleIntent(from, message, classification, existingUser);

    } catch (error) {
      console.error('Error processing message:', error);
      return "Sorry, I encountered an error. Please try again.";
    }
  }

  /**
   * Handle different intents
   */
  async handleIntent(from, message, classification, existingUser) {
    const { intent, hasPropertyLink, isAddingProperty, confidence } = classification;

    // If confidence is too low, ask for clarification
    if (confidence < 0.5) {
      return "I'm not sure I understand. Could you please clarify what you're looking for? Are you interested in buying, renting, or listing a property?";
    }

    switch (intent) {
      case 'greeting':
        return await this.handleGreeting(from, existingUser);

      case 'buyer':
      case 'renter':
        return await this.handleBuyerRenter(from, intent, hasPropertyLink, existingUser);

      case 'owner':
      case 'agent':
        if (isAddingProperty) {
          return await this.handlePropertyListing(from, intent, message, existingUser);
        } else {
          return await this.handleOwnerAgent(from, intent, existingUser);
        }

      case 'unclear':
      default:
        // Check if message contains property link
        if (hasPropertyLink) {
          return await this.handlePropertyLink(from, message, existingUser);
        }
        
        return "I'm here to help with real estate! Are you looking to buy, rent, or list a property?";
    }
  }

  /**
   * Handle greeting messages
   */
  async handleGreeting(from, existingUser) {
    if (existingUser) {
      const roleName = existingUser.user_roles?.role || 'unknown';
      return `Welcome back! I see you're registered as: ${roleName}. How can I help you today?`;
    } else {
      return "Welcome! Are you a buyer, renter, owner, or agent?";
    }
  }

  /**
   * Handle buyer/renter intents
   */
  async handleBuyerRenter(from, intent, hasPropertyLink, existingUser) {
    // Convert buyer to renter (our system uses renter for both buyers and renters)
    const role = intent === 'buyer' ? 'renter' : 'renter';
    
    // Register user if new
    if (!existingUser) {
      await this.registerUser(from, role);
      return `Great! I've registered you as a ${intent}. ${hasPropertyLink ? 'I see you shared a property link. Let me help you with that!' : 'How can I help you find the perfect property?'}`;
    } else {
      // Update role if different
      if (existingUser.user_roles?.role !== role) {
        await User.updateRole(existingUser.id, role);
      }
      return `I'm here to help you ${intent === 'buyer' ? 'find properties to buy' : 'find rental properties'}. What are you looking for?`;
    }
  }

  /**
   * Handle owner/agent intents
   */
  async handleOwnerAgent(from, intent, existingUser) {
    if (!existingUser) {
      await this.registerUser(from, intent);
      return `Welcome! I've registered you as a ${intent}. Are you looking to list a property?`;
    } else {
      // Update role if different
      if (existingUser.user_roles?.role !== intent) {
        await User.updateRole(existingUser.id, intent);
      }
      return `Hello! As a ${intent}, how can I assist you today? Would you like to list a property?`;
    }
  }

  /**
   * Handle property listing requests
   */
  async handlePropertyListing(from, intent, message, existingUser) {
    // Set conversation state to await role clarification
    this.setConversationState(from, {
      awaitingResponse: 'role_clarification',
      context: { intent, message }
    });

    if (!existingUser) {
      return "I can help you list your property! Are you the owner or an agent?";
    } else {
      // Check existing role
      const currentRole = existingUser.user_roles?.role;
      
      if (currentRole === 'owner' || currentRole === 'agent') {
        return await this.initiatePropertyListing(existingUser);
      } else {
        return "Are you the owner of this property or a real estate agent?";
      }
    }
  }

  /**
   * Handle property links shared by users
   */
  async handlePropertyLink(from, message, existingUser) {
    // Set conversation state to await buyer/renter clarification
    this.setConversationState(from, {
      awaitingResponse: 'buyer_renter_clarification',
      context: { message }
    });

    return "I see you shared a property! Are you interested in buying or renting?";
  }

  /**
   * Handle responses when awaiting user input
   */
  async handleAwaitingResponse(from, message, conversationState) {
    const { awaitingResponse, context } = conversationState;

    switch (awaitingResponse) {
      case 'role_clarification':
        return await this.handleRoleResponse(from, message, context);
      
      case 'buyer_renter_clarification':
        return await this.handleBuyerRenterResponse(from, message, context);
      
      default:
        // Clear state and process as new message
        this.clearConversationState(from);
        return await this.processMessage(from, message);
    }
  }

  /**
   * Handle role clarification response (owner vs agent)
   */
  async handleRoleResponse(from, message, context) {
    const lowerMessage = message.toLowerCase();
    let role = null;

    if (lowerMessage.includes('owner')) {
      role = 'owner';
    } else if (lowerMessage.includes('agent')) {
      role = 'agent';
    }

    if (!role) {
      return "Please clarify: Are you the property owner or a real estate agent?";
    }

    // Clear conversation state
    this.clearConversationState(from);

    // Register user with appropriate role
    const user = await User.getUserByPhoneWithRole(from) || await this.registerUser(from, role);

    return await this.initiatePropertyListing(user);
  }

  /**
   * Handle buyer/renter clarification response
   */
  async handleBuyerRenterResponse(from, message, context) {
    const lowerMessage = message.toLowerCase();
    let intent = null;

    if (lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      intent = 'buyer';
    } else if (lowerMessage.includes('rent') || lowerMessage.includes('rental')) {
      intent = 'renter';
    }

    if (!intent) {
      return "Please clarify: Are you looking to buy or rent this property?";
    }

    // Clear conversation state
    this.clearConversationState(from);

    // Register user with appropriate role
    const user = await User.getUserByPhoneWithRole(from) || await this.registerUser(from, intent);

    return `Perfect! I've registered you as a ${intent}. I can help you with information about the property you shared. What would you like to know?`;
  }

  /**
   * Initiate property listing process
   */
  async initiatePropertyListing(user) {
    // For now, return a simple response
    // In the future, this could start a multi-step property listing process
    return "Great! I can help you list your property. Please provide the following details:\n\n1. Property type (house, apartment, etc.)\n2. Location\n3. Price\n4. Number of bedrooms and bathrooms\n5. Key features\n\nYou can send these details in your next message.";
  }

  /**
   * Register a new user
   */
  async registerUser(phone, role) {
    try {
      const user = await User.createUserWithRole({
        phone_number: phone,
        role: role
      });

      console.log(`Registered new user ${phone} with role ${role}`);
      return user;
    } catch (error) {
      console.error('Error registering user:', error);
      throw error;
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
}

module.exports = new ConversationService(); 