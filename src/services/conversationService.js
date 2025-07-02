const openaiService = require('./openaiService');
const propertyParsingService = require('./propertyParsingService');
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

      // Check if this is a property listing message first (enhanced with natural language flexibility)
      const propertyClassification = await openaiService.classifyPropertyAddition(message);
      
      if (propertyClassification.containsProperties && propertyClassification.confidence > 0.6) {
        console.log(`🏠 Property detected for ${from}:`, {
          confidence: propertyClassification.confidence,
          propertiesCount: propertyClassification.propertiesCount,
          userRole: existingUser?.user_roles?.role || 'none'
        });
        
        // Check if user exists and has proper role
        if (!existingUser) {
          console.log(`📝 New user ${from} adding properties, asking for role`);
          this.setConversationState(from, {
            awaitingResponse: 'property_addition_role',
            context: { message, classification: propertyClassification }
          });
          return this.formatRichMessage(`🏠 Great! I can help you add ${propertyClassification.propertiesCount > 1 ? 'those properties' : 'that property'} to our database.\n\nFirst, are you the property *owner* or a *real estate agent*?`);
        }
        
        const userRole = existingUser.user_roles?.role;
        if (!userRole || (userRole !== 'owner' && userRole !== 'agent')) {
          console.log(`👤 User ${from} role clarification needed: ${userRole}`);
          this.setConversationState(from, {
            awaitingResponse: 'property_addition_role',
            context: { message, classification: propertyClassification }
          });
          return this.formatRichMessage(`🏠 I understand you want to add ${propertyClassification.propertiesCount > 1 ? 'properties' : 'a property'}!\n\nTo proceed, please confirm: Are you the property *owner* or a *real estate agent*?`);
        }
        
        console.log(`✅ User ${from} (${userRole}) adding ${propertyClassification.propertiesCount} properties`);
        return await propertyParsingService.processPropertyListings(from, message, existingUser);
      }

      // Classify intent using OpenAI
      const classification = await openaiService.classifyIntent(message, isFirstMessage);
      
      console.log(`Intent classification for ${from}:`, classification);

      // Process based on intent
      return await this.handleIntent(from, message, classification, existingUser);

    } catch (error) {
      console.error('Error processing message:', error);
      return this.formatRichMessage("❌ Sorry, I encountered an error. Please try again.");
    }
  }

  /**
   * Handle different intents
   */
  async handleIntent(from, message, classification, existingUser) {
    const { intent, hasPropertyLink, isAddingProperty, confidence } = classification;

    // If confidence is too low, ask for clarification
    if (confidence < 0.5) {
      return this.formatRichMessage("🤔 I'm not sure I understand. Could you please clarify what you're looking for? Are you interested in *buying*, *renting*, or *listing* a property?");
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
        
        return this.formatRichMessage("🏠 I'm here to help with real estate! Are you looking to *buy*, *rent*, or *list* a property?");
    }
  }

  /**
   * Handle greeting messages
   */
  async handleGreeting(from, existingUser) {
    if (existingUser) {
      const roleName = existingUser.user_roles?.role || 'unknown';
      const roleEmoji = this.getRoleEmoji(roleName);
      return this.formatRichMessage(`👋 Welcome back! I see you're registered as: ${roleEmoji} *${roleName}*. How can I help you today?`);
    } else {
      return this.formatRichMessage("👋 *Welcome!* Are you a 🏠 *buyer*, 🏡 *renter*, 🏢 *owner*, or 🏘️ *agent*?");
    }
  }

  /**
   * Handle buyer/renter intents
   */
  async handleBuyerRenter(from, intent, hasPropertyLink, existingUser) {
    // Convert buyer to renter (our system uses renter for both buyers and renters)
    const role = intent === 'buyer' ? 'renter' : 'renter';
    const emoji = intent === 'buyer' ? '🏠' : '🏡';
    
    // Register user if new
    if (!existingUser) {
      await this.registerUser(from, role);
      const linkResponse = hasPropertyLink ? ' I see you shared a property link. Let me help you with that! 🔗' : ' How can I help you find the perfect property? 🔍';
      return this.formatRichMessage(`✅ Great! I've registered you as a ${emoji} *${intent}*.${linkResponse}`);
    } else {
      // Update role if different
      if (existingUser.user_roles?.role !== role) {
        await User.updateRole(existingUser.id, role);
      }
      const actionText = intent === 'buyer' ? 'find properties to buy' : 'find rental properties';
      return this.formatRichMessage(`${emoji} I'm here to help you *${actionText}*. What are you looking for?`);
    }
  }

  /**
   * Handle owner/agent intents
   */
  async handleOwnerAgent(from, intent, existingUser) {
    const emoji = intent === 'owner' ? '🏢' : '🏘️';
    
    if (!existingUser) {
      await this.registerUser(from, intent);
      return this.formatRichMessage(`✅ Welcome! I've registered you as a ${emoji} *${intent}*. Are you looking to list a property? 📝`);
    } else {
      // Update role if different
      if (existingUser.user_roles?.role !== intent) {
        await User.updateRole(existingUser.id, intent);
      }
      return this.formatRichMessage(`${emoji} Hello! As a *${intent}*, how can I assist you today? Would you like to list a property? 📝`);
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
      return this.formatRichMessage("🏠 I can help you list your property! Are you the *owner* or a *real estate agent*?");
    } else {
      // Check existing role
      const currentRole = existingUser.user_roles?.role;
      
      if (currentRole === 'owner' || currentRole === 'agent') {
        return await this.initiatePropertyListing(existingUser);
      } else {
        return this.formatRichMessage("🏠 Are you the *owner* of this property or a *real estate agent*?");
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

    return this.formatRichMessage("🔗 I see you shared a property! Are you interested in *buying* 🏠 or *renting* 🏡?");
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
      
      case 'property_addition_role':
        return await this.handlePropertyAdditionRoleResponse(from, message, context);
      
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
      return this.formatRichMessage("🤔 Please clarify: Are you the property *owner* or a *real estate agent*?");
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
      return this.formatRichMessage("🤔 Please clarify: Are you looking to *buy* 🏠 or *rent* 🏡 this property?");
    }

    // Clear conversation state
    this.clearConversationState(from);

    // Register user with appropriate role
    const user = await User.getUserByPhoneWithRole(from) || await this.registerUser(from, intent);
    const emoji = intent === 'buyer' ? '🏠' : '🏡';

    return this.formatRichMessage(`✅ Perfect! I've registered you as a ${emoji} *${intent}*. I can help you with information about the property you shared. What would you like to know?`);
  }

  /**
   * Handle property addition role clarification response
   */
  async handlePropertyAdditionRoleResponse(from, message, context) {
    const lowerMessage = message.toLowerCase();
    let role = null;

    if (lowerMessage.includes('owner')) {
      role = 'owner';
    } else if (lowerMessage.includes('agent')) {
      role = 'agent';
    }

    if (!role) {
      return this.formatRichMessage("🤔 Please clarify: Are you the property *owner* or a *real estate agent*?");
    }

    // Clear conversation state
    this.clearConversationState(from);

    // Get existing user or create new one
    let user = await User.getUserByPhoneWithRole(from);
    
    if (user) {
      // Update existing user's role
      console.log(`Updating user ${from} role from ${user.user_roles?.role} to ${role}`);
      user = await User.updateRole(user.id, role);
    } else {
      // Create new user with role
      console.log(`Creating new user ${from} with role ${role}`);
      user = await this.registerUser(from, role);
    }

    // Now process the original property message with enhanced natural language support
    console.log(`🔄 Processing delayed property addition for ${from} with role ${role}`);
    return await propertyParsingService.processPropertyListings(from, context.message, user);
  }

  /**
   * Initiate property listing process
   */
  async initiatePropertyListing(user) {
    // For now, return a simple response
    // In the future, this could start a multi-step property listing process
    const response = `🏠 *Great!* I can help you list your property. Please provide the following details:

📝 *Property Information:*
1. 🏢 Property type (house, apartment, etc.)
2. 📍 Location
3. 💰 Price
4. 🛏️ Number of bedrooms and bathrooms
5. 📐 Area (m²)
6. ✨ Key features

📞 *Contact Information:*
7. Contact name
8. Phone number

🔗 *Optional:*
9. Property URL/listing link

You can send all these details in your next message, or send them in a structured format like:

*T2 apartment in Lisbon with 2 bathrooms and 100m²*
💰 €3000/month
📍 Av. da Liberdade, Lisbon
🛏️ 2 bedrooms
📞 Your Name (+351123456789)`;

    return this.formatRichMessage(response);
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
}

module.exports = new ConversationService(); 