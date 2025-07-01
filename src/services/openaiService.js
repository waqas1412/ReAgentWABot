const OpenAI = require('openai');
const { config } = require('../config/environment');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }

  /**
   * Classify user intent from their message
   * @param {string} message - User's message
   * @param {boolean} isFirstMessage - Whether this is the user's first message
   * @returns {Promise<{intent: string, hasPropertyLink: boolean, isAddingProperty: boolean, confidence: number}>}
   */
  async classifyIntent(message, isFirstMessage = false) {
    try {
      const systemPrompt = `You are an intent classifier for a real estate WhatsApp bot. Analyze the user's message and return a JSON response with the following structure:

{
  "intent": "greeting|buyer|renter|owner|agent|unclear",
  "hasPropertyLink": boolean,
  "isAddingProperty": boolean,
  "confidence": 0.0-1.0
}

Classification rules:
- "greeting": General greetings like "Hi", "Hello", "Hey" without specific intent
- "buyer": User wants to purchase property (keywords: buy, purchase, buying, looking to buy)
- "renter": User wants to rent property (keywords: rent, rental, looking to rent, lease)
- "owner": User owns property and wants to list/sell it (keywords: sell my house, list my property, I own)
- "agent": User is a real estate agent (keywords: I'm an agent, real estate agent, broker)
- "unclear": Cannot determine intent clearly

Additional detection:
- "hasPropertyLink": true if message contains URLs, property listings, or references to specific properties
- "isAddingProperty": true if user wants to add/list/sell a property (keywords: list, sell, add property, want to sell)

Be strict with classifications. If uncertain, use "unclear" and lower confidence.`;

      const userPrompt = `Message: "${message}"
${isFirstMessage ? 'Note: This is the user\'s first message to the bot.' : ''}

Analyze this message and classify the user's intent.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      
      try {
        const result = JSON.parse(content);
        
        // Validate the response structure
        if (!result.intent || typeof result.hasPropertyLink !== 'boolean' || 
            typeof result.isAddingProperty !== 'boolean' || typeof result.confidence !== 'number') {
          throw new Error('Invalid response structure');
        }

        return result;
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', content);
        // Return a safe default
        return {
          intent: 'unclear',
          hasPropertyLink: false,
          isAddingProperty: false,
          confidence: 0.0
        };
      }

    } catch (error) {
      console.error('OpenAI classification error:', error);
      
      // Fallback to simple keyword-based classification
      return this.fallbackClassification(message);
    }
  }

  /**
   * Fallback classification using simple keyword matching
   * @param {string} message 
   * @returns {object}
   */
  fallbackClassification(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
    if (greetings.some(greeting => lowerMessage.includes(greeting)) && lowerMessage.length < 20) {
      return {
        intent: 'greeting',
        hasPropertyLink: false,
        isAddingProperty: false,
        confidence: 0.8
      };
    }

    // Check for property links (URLs)
    const hasPropertyLink = /https?:\/\/|www\.|\.com|\.org|property|listing/.test(lowerMessage);

    // Check for adding property
    const addingKeywords = ['list', 'sell', 'add property', 'want to sell', 'selling'];
    const isAddingProperty = addingKeywords.some(keyword => lowerMessage.includes(keyword));

    // Intent classification
    let intent = 'unclear';
    let confidence = 0.6;

    if (lowerMessage.includes('buy') || lowerMessage.includes('purchase') || lowerMessage.includes('buying')) {
      intent = 'buyer';
    } else if (lowerMessage.includes('rent') || lowerMessage.includes('rental') || lowerMessage.includes('lease')) {
      intent = 'renter';
    } else if (lowerMessage.includes('agent') || lowerMessage.includes('broker')) {
      intent = 'agent';
    } else if (isAddingProperty) {
      intent = 'owner';
    }

    return {
      intent,
      hasPropertyLink,
      isAddingProperty,
      confidence
    };
  }

  /**
   * Extract property details from a message (if needed for future features)
   * @param {string} message 
   * @returns {Promise<object>}
   */
  async extractPropertyDetails(message) {
    try {
      const systemPrompt = `Extract property details from the user's message and return a JSON response:

{
  "propertyType": "apartment|house|commercial|land|other",
  "location": "extracted location if mentioned",
  "priceRange": "extracted price if mentioned",
  "bedrooms": number or null,
  "bathrooms": number or null,
  "features": ["list", "of", "mentioned", "features"]
}

If information is not clearly mentioned, use null or empty array.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract property details from: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      return JSON.parse(response.choices[0].message.content.trim());
    } catch (error) {
      console.error('Property details extraction error:', error);
      return null;
    }
  }
}

module.exports = new OpenAIService(); 