const { MessagingResponse } = require('twilio').twiml;
const twilioService = require('../services/twilioService');
const databaseService = require('../services/databaseService');
const conversationService = require('../services/conversationService');

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
      console.log(`Processing message from ${from} (${profileName}): ${body}`);

      // Get or create user
      const user = await databaseService.getOrCreateUserFromWhatsApp(from, profileName);
      
      // Handle media messages
      if (numMedia > 0) {
        console.log(`Received media: ${mediaContentType} - ${mediaUrl}`);
        return {
          type: 'text',
          content: 'Thank you for sending media! I can help you with property listings and viewings. Send "help" to see what I can do.'
        };
      }

      // Handle empty messages
      if (!body || !body.trim()) {
        return {
          type: 'text',
          content: 'Hello! I\'m your AI real estate assistant. Send me a message and I\'ll help you with properties!'
        };
      }

      // Handle sandbox join messages
      const message = body.toLowerCase().trim();
      if (message.startsWith('join')) {
        return {
          type: 'text',
          content: `Welcome to ReAgentBot! 🏠\n\nI'm your AI real estate assistant. I can help you:\n• Search and find properties\n• List your properties\n• Update your listings\n• And much more!\n\nJust tell me what you're looking for in natural language!`
        };
      }

      // The controller is now simplified. It just passes the message and user
      // to the conversation service, which holds all the complex logic.
      const responseMessages = await conversationService.processMessage(body, user);
      
      // Join multiple messages if needed (for WhatsApp we'll send the first one via TwiML)
      const responseText = Array.isArray(responseMessages) ? responseMessages[0] : responseMessages;
      
      // Send additional messages via API if there are multiple responses
      if (Array.isArray(responseMessages) && responseMessages.length > 1) {
        // Send additional messages asynchronously via Twilio API
        this.sendAdditionalMessages(from, responseMessages.slice(1));
      }
      
      return {
        type: 'text',
        content: responseText
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        type: 'text',
        content: 'Sorry, I encountered an error processing your message. Please try again.'
      };
    }
  }

  /**
   * Send additional messages asynchronously
   * @param {string} to - Phone number to send to
   * @param {Array} messages - Additional messages to send
   */
  sendAdditionalMessages = async (to, messages) => {
    try {
      for (let i = 0; i < messages.length; i++) {
        // Add a small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        await twilioService.sendWhatsAppMessage(to, messages[i]);
      }
    } catch (error) {
      console.error('Error sending additional messages:', error);
    }
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