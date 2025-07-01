const twilio = require('twilio');
const { config } = require('../config/environment');

class TwilioService {
  constructor() {
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }

  /**
   * Send a WhatsApp message
   * @param {string} to - Recipient phone number (should include country code)
   * @param {string} body - Message body
   * @param {string} mediaUrl - Optional media URL
   * @returns {Promise<Object>} - Message object
   */
  async sendWhatsAppMessage(to, body, mediaUrl = null) {
    try {
      const messageOptions = {
        body: body,
        from: config.twilio.whatsappNumber,
        to: this.formatWhatsAppNumber(to)
      };

      if (mediaUrl) {
        messageOptions.mediaUrl = [mediaUrl];
      }

      const message = await this.client.messages.create(messageOptions);
      
      console.log(`Message sent successfully. SID: ${message.sid}`);
      return {
        success: true,
        messageId: message.sid,
        status: message.status,
        to: message.to,
        from: message.from
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Send a template message (for messages outside 24-hour window)
   * @param {string} to - Recipient phone number
   * @param {string} template - Template name
   * @param {Array} parameters - Template parameters
   * @returns {Promise<Object>} - Message object
   */
  async sendTemplateMessage(to, template, parameters = []) {
    try {
      // For sandbox, we have pre-configured templates
      let body = '';
      
      switch (template) {
        case 'appointment_reminder':
          body = `Your appointment is coming up on ${parameters[0]} at ${parameters[1]}`;
          break;
        case 'order_notification':
          body = `Your ${parameters[0]} order of ${parameters[1]} has shipped and should be delivered on ${parameters[2]}. Details: ${parameters[3]}`;
          break;
        case 'verification_code':
          body = `Your ${parameters[0]} code is ${parameters[1]}`;
          break;
        default:
          throw new Error(`Unknown template: ${template}`);
      }

      return await this.sendWhatsAppMessage(to, body);
    } catch (error) {
      console.error('Error sending template message:', error);
      throw error;
    }
  }

  /**
   * Format phone number for WhatsApp
   * @param {string} phoneNumber - Phone number
   * @returns {string} - Formatted WhatsApp number
   */
  formatWhatsAppNumber(phoneNumber) {
    // Remove whatsapp: prefix if already present
    const cleanNumber = phoneNumber.replace('whatsapp:', '');
    
    // Add + if not present
    const formattedNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
    
    return `whatsapp:${formattedNumber}`;
  }

  /**
   * Validate webhook signature (for production use)
   * @param {string} authToken - Twilio auth token
   * @param {string} twilioSignature - X-Twilio-Signature header
   * @param {string} url - The full URL of your webhook
   * @param {Object} params - POST parameters
   * @returns {boolean} - Whether signature is valid
   */
  validateWebhookSignature(authToken, twilioSignature, url, params) {
    return twilio.validateRequest(authToken, twilioSignature, url, params);
  }

  /**
   * Get message status
   * @param {string} messageSid - Message SID
   * @returns {Promise<Object>} - Message status
   */
  async getMessageStatus(messageSid) {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      console.error('Error fetching message status:', error);
      throw error;
    }
  }
}

module.exports = new TwilioService(); 