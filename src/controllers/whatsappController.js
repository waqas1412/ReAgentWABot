const { MessagingResponse } = require('twilio').twiml;
const twilioService = require('../services/twilioService');
const databaseService = require('../services/databaseService');

class WhatsAppController {
  /**
   * Send a WhatsApp message
   * POST /api/whatsapp/send
   */
  sendMessage = async (req, res) => {
    try {
      const { to, message, mediaUrl } = req.body;

      if (!to || !message) {
        return res.status(400).json({
          error: 'Missing required parameters: to and message'
        });
      }

      const result = await twilioService.sendWhatsAppMessage(to, message, mediaUrl);
      
      res.json({
        success: true,
        data: result,
        message: 'WhatsApp message sent successfully'
      });
    } catch (error) {
      console.error('Error in sendMessage:', error);
      res.status(500).json({
        error: 'Failed to send message',
        details: error.message
      });
    }
  }

  /**
   * Send a template message
   * POST /api/whatsapp/send-template
   */
  sendTemplateMessage = async (req, res) => {
    try {
      const { to, template, parameters } = req.body;

      if (!to || !template) {
        return res.status(400).json({
          error: 'Missing required parameters: to and template'
        });
      }

      const result = await twilioService.sendTemplateMessage(to, template, parameters || []);
      
      res.json({
        success: true,
        data: result,
        message: 'Template message sent successfully'
      });
    } catch (error) {
      console.error('Error in sendTemplateMessage:', error);
      res.status(500).json({
        error: 'Failed to send template message',
        details: error.message
      });
    }
  }

  /**
   * Handle incoming WhatsApp messages (Webhook)
   * POST /webhook/whatsapp
   */
  receiveMessage = async (req, res) => {
    try {
      console.log('Received WhatsApp webhook:', req.body);

      const { 
        Body, 
        From, 
        To, 
        MessageSid,
        NumMedia,
        MediaUrl0,
        MediaContentType0,
        ProfileName 
      } = req.body;

      // Log incoming message details
      console.log(`New message from ${From} (${ProfileName}): ${Body}`);

      // Process the message and generate response
      const responseMessage = await this.processIncomingMessage({
        body: Body,
        from: From,
        to: To,
        messageSid: MessageSid,
        numMedia: parseInt(NumMedia) || 0,
        mediaUrl: MediaUrl0,
        mediaContentType: MediaContentType0,
        profileName: ProfileName
      });

      // Create TwiML response
      const twiml = new MessagingResponse();
      
      if (responseMessage.type === 'text') {
        twiml.message(responseMessage.content);
      } else if (responseMessage.type === 'media') {
        const message = twiml.message(responseMessage.content);
        message.media(responseMessage.mediaUrl);
      }

      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml.toString());
    } catch (error) {
      console.error('Error in receiveMessage webhook:', error);
      
      // Send error response using TwiML
      const twiml = new MessagingResponse();
      twiml.message('Sorry, I encountered an error processing your message. Please try again later.');
      
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml.toString());
    }
  }

  /**
   * Handle message status callbacks
   * POST /webhook/whatsapp/status
   */
  messageStatus = async (req, res) => {
    try {
      console.log('Message status update:', req.body);

      const {
        MessageSid,
        MessageStatus,
        ErrorCode,
        ErrorMessage,
        To,
        From
      } = req.body;

      // Log status update
      console.log(`Message ${MessageSid} status: ${MessageStatus}`);
      
      if (ErrorCode) {
        console.error(`Message error ${ErrorCode}: ${ErrorMessage}`);
      }

      // Here you can update your database with message status
      // For now, we'll just log it
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error in messageStatus webhook:', error);
      res.status(500).send('Error');
    }
  }

  /**
   * Get message status
   * GET /api/whatsapp/status/:messageSid
   */
  getMessageStatus = async (req, res) => {
    try {
      const { messageSid } = req.params;

      if (!messageSid) {
        return res.status(400).json({
          error: 'Message SID is required'
        });
      }

      const status = await twilioService.getMessageStatus(messageSid);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error in getMessageStatus:', error);
      res.status(500).json({
        error: 'Failed to get message status',
        details: error.message
      });
    }
  }

  /**
   * Process incoming message and determine response
   * @param {Object} messageData - Incoming message data
   * @returns {Object} - Response object
   */
  processIncomingMessage = async (messageData) => {
    const { body, from, numMedia, mediaUrl, mediaContentType, profileName } = messageData;
    
    try {
      // Get or create user in database
      const user = await databaseService.getOrCreateUserFromWhatsApp(from, profileName);
      console.log(`Processing message for user: ${user.name || user.phone_number} (Role: ${user.user_roles?.role})`);

      // Convert to lowercase for easier processing
      const message = body?.toLowerCase().trim() || '';

      // Handle media messages
      if (numMedia > 0) {
        console.log(`Received media: ${mediaContentType} - ${mediaUrl}`);
        return {
          type: 'text',
          content: 'Thank you for sending media! I can help you with property listings and viewings. Send "help" to see what I can do.'
        };
      }

      // Handle different types of messages
      if (message.includes('help') || message === 'menu' || message === 'start') {
        return this.getHelpMessage(user);
      }

      if (message.includes('search') || message.includes('property') || message.includes('properties')) {
        return await this.handlePropertySearch(user, message);
      }

      if (message.includes('preferences') || message.includes('preference')) {
        return this.getPreferencesMessage(user);
      }

      if (message.includes('appointment') || message.includes('viewing') || message.includes('schedule')) {
        return await this.handleAppointmentRequest(user, message);
      }

      if (message.includes('my appointments') || message === 'appointments') {
        return await this.getUserAppointments(user);
      }

      if (message.includes('profile') || message.includes('account')) {
        return this.getProfileMessage(user);
      }

      // Handle join messages for sandbox
      if (message.startsWith('join')) {
        return {
          type: 'text',
          content: `Welcome to ReAgentBot, ${user.name || 'there'}! 🏠\n\nI'm your AI real estate assistant. I can help you:\n• Find properties\n• Schedule viewings\n• Set preferences\n• Manage appointments\n\nSend "help" to see all commands or "search" to find properties!`
        };
      }

      // Handle budget/price queries
      if (message.includes('budget') || message.includes('price') || message.includes('$')) {
        return await this.handleBudgetQuery(user, message);
      }

      // Handle location queries
      if (message.includes('location') || message.includes('area') || message.includes('district')) {
        return await this.handleLocationQuery(user, message);
      }

      // Default intelligent response
      return await this.getIntelligentResponse(user, body);

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        type: 'text',
        content: 'Sorry, I encountered an error processing your message. Please try again or send "help" for assistance.'
      };
    }
  }

  /**
   * Get help message based on user role
   */
  getHelpMessage = (user) => {
    const role = user.user_roles?.role || 'renter';
    
    let helpText = `Hello ${user.name || 'there'}! 👋\n\nI'm your AI real estate assistant. Here's what I can help you with:\n\n`;

    if (role === 'renter') {
      helpText += `🏠 *Property Search*\n• "search properties" - Find available properties\n• "set preferences" - Configure your search criteria\n\n`;
      helpText += `📅 *Viewings*\n• "schedule viewing" - Book property viewings\n• "my appointments" - See your scheduled viewings\n\n`;
    } else if (role === 'agent' || role === 'owner') {
      helpText += `🏢 *Property Management*\n• "my properties" - View your listings\n• "add property" - Create new listing\n\n`;
      helpText += `📅 *Appointments*\n• "appointments" - View scheduled viewings\n• "schedule" - Manage viewing slots\n\n`;
    }

    helpText += `👤 *Account*\n• "profile" - View/edit your profile\n• "preferences" - Set search preferences\n\n`;
    helpText += `❓ *Support*\n• "help" - Show this menu\n• "contact" - Get support info`;

    return { type: 'text', content: helpText };
  }

  /**
   * Handle property search requests
   */
  handlePropertySearch = async (user, message) => {
    try {
      const properties = await databaseService.getPropertiesForUser(user.id);
      
      if (properties.length === 0) {
        return {
          type: 'text',
          content: 'No properties found matching your criteria. Try adjusting your preferences by sending "set preferences" or search for properties in a specific area like "search properties in downtown".'
        };
      }

      // Limit to first 3 properties to avoid message length issues
      const displayProperties = properties.slice(0, 3);
      let response = `Found ${properties.length} properties for you! Here are the top ${displayProperties.length}:\n\n`;

      displayProperties.forEach((property, index) => {
        response += `${index + 1}. ${databaseService.formatPropertyForWhatsApp(property)}\n\n`;
      });

      if (properties.length > 3) {
        response += `... and ${properties.length - 3} more properties available.\n\n`;
      }

      response += `Send "schedule viewing" to book a property tour or "preferences" to refine your search!`;

      return { type: 'text', content: response };
    } catch (error) {
      console.error('Error searching properties:', error);
      return {
        type: 'text',
        content: 'Sorry, I had trouble searching for properties. Please try again or contact support.'
      };
    }
  }

  /**
   * Handle appointment requests
   */
  handleAppointmentRequest = async (user, message) => {
    try {
      // Get available time slots for today and next few days
      const today = new Date();
      const availableSlots = [];

      for (let i = 1; i <= 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const slots = await databaseService.getAvailableTimeSlots(dateStr);
        if (slots.length > 0) {
          availableSlots.push({ date: dateStr, slots: slots.slice(0, 3) }); // Limit slots per day
        }
      }

      if (availableSlots.length === 0) {
        return {
          type: 'text',
          content: 'Sorry, no viewing slots are available in the next week. Please contact our support team for assistance.'
        };
      }

      let response = '📅 *Available Viewing Slots:*\n\n';
      
      availableSlots.forEach(({ date, slots }) => {
        const dateObj = new Date(date);
        const dateString = dateObj.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric' 
        });
        
        response += `*${dateString}*\n`;
        slots.forEach(slot => {
          response += `• ${slot.start_time} - ${slot.end_time}\n`;
        });
        response += '\n';
      });

      response += 'To book a viewing, please contact our team or visit our website. Send "my appointments" to see your current bookings.';

      return { type: 'text', content: response };
    } catch (error) {
      console.error('Error handling appointment request:', error);
      return {
        type: 'text',
        content: 'Sorry, I had trouble checking available appointments. Please try again later.'
      };
    }
  }

  /**
   * Get user appointments
   */
  getUserAppointments = async (user) => {
    try {
      const appointments = await databaseService.getUserAppointments(user.phone_number);
      
      if (appointments.length === 0) {
        return {
          type: 'text',
          content: 'You have no scheduled appointments. Send "schedule viewing" to book a property tour!'
        };
      }

      let response = '📅 *Your Appointments:*\n\n';
      
      appointments.forEach((appointment, index) => {
        const date = new Date(appointment.appointment_date).toLocaleDateString();
        const timeSlot = appointment.viewing_time_slots;
        response += `${index + 1}. ${date} at ${timeSlot.start_time} - ${timeSlot.end_time}\n`;
      });

      response += '\nSend "cancel appointment" if you need to modify any bookings.';

      return { type: 'text', content: response };
    } catch (error) {
      console.error('Error getting user appointments:', error);
      return {
        type: 'text',
        content: 'Sorry, I had trouble retrieving your appointments. Please try again later.'
      };
    }
  }

  /**
   * Get preferences message
   */
  getPreferencesMessage = (user) => {
    return {
      type: 'text',
      content: 'To set your property preferences, please specify:\n\n• Budget range (e.g., "$1000-2000")\n• Number of bedrooms\n• Preferred area/district\n• Special features\n\nExample: "I want 2 bedrooms in downtown, budget $1500-2500"\n\nOr contact our team for detailed preference setup!'
    };
  }

  /**
   * Get profile message
   */
  getProfileMessage = (user) => {
    const role = user.user_roles?.role || 'user';
    let profileText = `👤 *Your Profile:*\n\n`;
    profileText += `Name: ${user.name || 'Not set'}\n`;
    profileText += `Phone: ${user.phone_number}\n`;
    profileText += `Role: ${role.charAt(0).toUpperCase() + role.slice(1)}\n`;
    profileText += `Member since: ${new Date(user.created_at).toLocaleDateString()}\n\n`;
    profileText += `To update your profile, contact our support team.`;

    return { type: 'text', content: profileText };
  }

  /**
   * Handle budget queries
   */
  handleBudgetQuery = async (user, message) => {
    // Extract budget from message (simple regex)
    const budgetMatch = message.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*-?\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)?/);
    
    if (budgetMatch) {
      const minBudget = parseFloat(budgetMatch[1].replace(/,/g, ''));
      const maxBudget = budgetMatch[2] ? parseFloat(budgetMatch[2].replace(/,/g, '')) : minBudget * 1.5;
      
      try {
        const properties = await databaseService.searchProperties({
          minPrice: minBudget,
          maxPrice: maxBudget,
          status: 'active'
        }, { limit: 5 });

        if (properties.length === 0) {
          return {
            type: 'text',
            content: `No properties found in your budget range of $${minBudget.toLocaleString()}-$${maxBudget.toLocaleString()}. Try expanding your budget or send "search" to see all available properties.`
          };
        }

        let response = `Found ${properties.length} properties in your budget ($${minBudget.toLocaleString()}-$${maxBudget.toLocaleString()}):\n\n`;
        
        properties.forEach((property, index) => {
          response += `${index + 1}. ${property.address} - $${property.price.toLocaleString()}\n`;
        });

        response += '\nSend "search properties" for detailed information!';

        return { type: 'text', content: response };
      } catch (error) {
        console.error('Error searching by budget:', error);
        return {
          type: 'text',
          content: 'Sorry, I had trouble searching properties by budget. Please try again.'
        };
      }
    }

    return {
      type: 'text',
      content: 'Please specify your budget range like "$1000-2000" or "budget $1500" and I\'ll find properties for you!'
    };
  }

  /**
   * Handle location queries
   */
  handleLocationQuery = async (user, message) => {
    return {
      type: 'text',
      content: 'I can help you find properties in specific areas! Tell me the district or neighborhood you\'re interested in, like:\n\n• "properties in downtown"\n• "search Makati area"\n• "find apartments in BGC"\n\nOr send "search" to see all available properties.'
    };
  }

  /**
   * Get intelligent response for unmatched messages
   */
  getIntelligentResponse = async (user, originalMessage) => {
    const responses = [
      `Thanks for your message! I'm here to help you with real estate needs. Send "help" to see what I can do.`,
      `I'm your AI real estate assistant! Looking for a property? Send "search" to get started.`,
      `Hello! I can help you find properties, schedule viewings, and more. Send "help" for options.`
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return {
      type: 'text',
      content: `${randomResponse}\n\nYou said: "${originalMessage}"`
    };
  }

  /**
   * Health check endpoint
   * GET /api/whatsapp/health
   */
  healthCheck = async (req, res) => {
    res.json({
      status: 'healthy',
      service: 'WhatsApp Bot',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new WhatsAppController(); 