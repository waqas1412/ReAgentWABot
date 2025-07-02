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
        // Clean the response - remove code blocks if present
        const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
        const result = JSON.parse(cleanedContent);
        
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

      const content = response.choices[0].message.content.trim();
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(cleanedContent);
    } catch (error) {
      console.error('Property details extraction error:', error);
      return null;
    }
  }

  /**
   * Convert natural language property message to rigid database format
   * @param {string} message - Message containing property listings
   * @returns {Promise<Array>} - Array of database-ready property objects
   */
  async convertToRigidFormat(message) {
    try {
      const systemPrompt = `You are an expert property data converter for a WhatsApp real estate bot. Users send messages in ANY natural language format - casual, formal, mixed languages, incomplete info, etc. Your job is to extract ALL property information and convert it to our rigid database format.

REQUIRED OUTPUT FORMAT (return as JSON array):
[
  {
    "address": "complete address string",
    "price": number (just the number, no currency symbols),
    "currency": "EUR|USD|GBP",
    "property_type": "apartment|house|commercial|land",
    "bedrooms": number,
    "bathrooms": number,
    "area_sqm": number (area in square meters),
    "status": "active",
    "listing_type": "rent|sale",
    "description": "property description text",
    "external_url": "full URL if provided",
    "contact_name": "contact person name",
    "contact_phone": "phone with country code",
    "apartment_type": "T1|T2|T3|T4|T5|Studio|Other",
    "country_name": "Portugal|Spain|France|etc",
    "city_name": "Lisbon|Madrid|Paris|etc", 
    "district_name": "district/neighborhood name if mentioned"
  }
]

FLEXIBLE NATURAL LANGUAGE PROCESSING RULES:
1. Handle ANY communication style (casual, formal, broken English, mixed Portuguese/English)
2. Extract properties from: lists, paragraphs, one-liners, structured formats, emoji-heavy messages
3. Convert colloquial terms: "place" → apartment, "cheap" → estimate reasonable price, "big" → estimate area
4. Handle abbreviations: "2br" → 2 bedrooms, "1ba" → 1 bathroom, "80m" → 80 area_sqm
5. Parse prices flexibly: "€2500", "2500 euros", "2.5k", "450k" → convert to numbers
6. Smart location inference: "downtown" → central district, "near metro" → mention in description
7. Handle incomplete info gracefully with reasonable defaults
8. Extract contact info from any format: names, phone numbers (add +351 if Portuguese and missing)
9. Multi-property messages: extract each property separately
10. Property type inference: T1/T2 → apartment, "house" → house, "commercial space" → commercial

INTELLIGENT DEFAULTS FOR MISSING INFO:
- No country mentioned? Default "Portugal" (most users are Portuguese)
- No city mentioned? If Portuguese location clues → "Lisbon", otherwise → "Lisbon" 
- No district mentioned? Extract from context or use null
- No price mentioned? Set to 1 (user can be asked to clarify)
- Vague price like "cheap"? Estimate based on property type and location
- No contact? Use null (system will ask user)
- No area mentioned? Use null
- No bedrooms? Try to infer from T1/T2 or use 1 as default

CONTACT INFO PROCESSING:
- Extract names from any format ("Call João", "Contact: Maria", "ask for Pedro")
- Normalize phone numbers: add +351 if Portuguese context and no country code
- Handle partial contact info gracefully

EXAMPLES OF FLEXIBLE EXTRACTION:
"Hey, got this nice place downtown" → apartment, Lisbon, downtown area
"Selling house Porto 3 beds 450k" → house, Porto, 3 bedrooms, 450000 price
"T2 Cascais €1800/month" → apartment T2, Cascais, 1800 rent
"Commercial space 200m² restaurant" → commercial, 200 area_sqm

Extract ALL properties and convert to EXACT format above. Be creative but accurate!`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Convert to rigid database format:\n\n${message}` }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const content = response.choices[0].message.content.trim();
      
      // Clean the response - remove code blocks if present
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      
      const properties = JSON.parse(cleanedContent);
      
      // Validate that we have an array
      const propertiesArray = Array.isArray(properties) ? properties : [properties];
      
      // Validate each property has required fields
      return propertiesArray.map(property => this.validatePropertyFormat(property));
      
    } catch (error) {
      console.error('Property format conversion error:', error);
      return [];
    }
  }

  /**
   * Validate and ensure property has all required database fields
   * @param {object} property - Property object from OpenAI
   * @returns {object} - Validated property object
   */
  validatePropertyFormat(property) {
    return {
      // Required fields with defaults
      address: property.address || 'Address not specified',
      price: Number(property.price) || 0,
      currency: property.currency || 'EUR',
      property_type: property.property_type || 'apartment',
      bedrooms: Number(property.bedrooms) || 1,
      bathrooms: Number(property.bathrooms) || 1,
      area_sqm: Number(property.area_sqm) || null,
      status: property.status || 'active',
      listing_type: property.listing_type || 'rent',
      
      // Optional fields
      description: property.description || '',
      external_url: property.external_url || null,
      contact_name: property.contact_name || null,
      contact_phone: property.contact_phone || null,
      apartment_type: property.apartment_type || null,
      
      // Location fields
      country_name: property.country_name || 'Portugal',
      city_name: property.city_name || 'Lisbon',
      district_name: property.district_name || null
    };
  }

  /**
   * Classify if a message contains property listings to add
   * @param {string} message 
   * @returns {Promise<object>}
   */
  async classifyPropertyAddition(message) {
    try {
      const systemPrompt = `You're analyzing messages for a WhatsApp real estate bot. Users send property listings in ANY natural language format. Detect if they want to ADD/LIST/SELL properties to the database. Return JSON:

{
  "containsProperties": boolean,
  "propertiesCount": number,
  "isStructuredListing": boolean,
  "confidence": 0.0-1.0
}

PROPERTY ADDITION INDICATORS (look for ANY):
- Direct intent: "add property", "list my place", "want to sell", "for rent"
- Property details with selling/rental intent: price + location + property info
- Multiple property listings in structured/unstructured format
- Any combination of: property type, location, price, bedrooms, contact info
- Commercial property listings
- Even minimal info like "selling house Porto" counts as property addition

FLEXIBLE DETECTION RULES:
- Be generous with classification - users express intent casually
- "Got this apartment..." with price/location = property addition
- Mixed languages okay: "Tenho apartment for rent"
- Incomplete info still counts if intent is clear
- One-liners like "selling house" = property addition
- Emoji-heavy structured listings = property addition
- Multiple properties in paragraph form = property addition

CONFIDENCE SCORING:
- 0.9+: Clear property addition intent with details
- 0.7-0.8: Some property info, likely addition intent
- 0.5-0.6: Vague but probable property addition
- <0.5: Unlikely to be property addition

Count ALL properties mentioned, even if details are incomplete.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this message: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

             const content = response.choices[0].message.content.trim();
       const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
       return JSON.parse(cleanedContent);
    } catch (error) {
      console.error('Property addition classification error:', error);
      return {
        containsProperties: false,
        propertiesCount: 0,
        isStructuredListing: false,
        confidence: 0
      };
    }
  }
}

module.exports = new OpenAIService(); 