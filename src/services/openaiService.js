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
      const systemPrompt = `You are an advanced AI assistant for an intelligent real estate WhatsApp bot. Your role is to classify user intents with high accuracy to automate real estate transactions for both buyers/renters and sellers/agents.

Return a JSON response with this structure:
{
  "intent": "greeting|buyer|renter|owner|agent|unclear",
  "hasPropertyLink": boolean,
  "isAddingProperty": boolean,
  "confidence": 0.0-1.0
}

ENHANCED CLASSIFICATION RULES:
- "greeting": General greetings like "Hi", "Hello", "Hey" without specific real estate intent
- "buyer": User wants to purchase property (keywords: buy, purchase, buying, looking to buy, investment)
- "renter": User wants to rent property (keywords: rent, rental, looking to rent, lease, tenant)
- "owner": User owns property and wants to list/sell it (keywords: sell my house, list my property, I own, my apartment)
- "agent": User is a real estate agent (keywords: I'm an agent, real estate agent, broker, property manager)
- "unclear": Cannot determine intent clearly - be conservative with this classification

INTELLIGENT DETECTION:
- "hasPropertyLink": true if message contains URLs, property listings, or specific property references
- "isAddingProperty": true if user wants to add/list/sell a property with clear intent indicators

AUTOMATION FOCUS:
Your accurate classification enables seamless automation between parties. High confidence (0.8+) enables immediate automated responses, medium confidence (0.5-0.7) triggers clarifying questions, low confidence (<0.5) requires human-like conversation.`;

      const userPrompt = `Message: "${message}"
${isFirstMessage ? 'Note: This is the user\'s first message to the bot.' : ''}

Analyze this message with enhanced intelligence for real estate automation.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 250
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
   * Extract property details from a message (enhanced with GPT-4o-mini)
   * @param {string} message 
   * @returns {Promise<object>}
   */
  async extractPropertyDetails(message) {
    try {
      const systemPrompt = `You are an intelligent property detail extractor for a real estate automation system. Extract comprehensive property information and return JSON:

{
  "propertyType": "apartment|house|commercial|land|other",
  "location": "extracted location if mentioned",
  "priceRange": "extracted price if mentioned",
  "bedrooms": number or null,
  "bathrooms": number or null,
  "features": ["list", "of", "mentioned", "features"],
  "urgency": "high|medium|low",
  "investmentIntent": boolean
}

ENHANCED EXTRACTION RULES:
- Detect implicit property types from context
- Extract approximate locations from neighborhood descriptions
- Identify investment vs. personal use intent
- Recognize urgency indicators (ASAP, urgent, flexible timing)
- Capture amenity preferences comprehensively

If information is not clearly mentioned, use null or empty array. Be intelligent about inferring details from context.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract property details from: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 400
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
   * Convert natural language property message to rigid database format (enhanced)
   * @param {string} message - Message containing property listings
   * @returns {Promise<Array>} - Array of database-ready property objects
   */
  async convertToRigidFormat(message) {
    try {
      const systemPrompt = `You are an expert property data converter for an intelligent real estate automation system. Your accuracy directly impacts the automation quality for both property owners and potential buyers/renters.

CRITICAL: Extract ALL property information with maximum precision and convert to our rigid database format.

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

ENHANCED PROCESSING INTELLIGENCE:
1. Handle ANY communication style with superior understanding
2. Extract properties from complex, unstructured messages
3. Intelligent price conversion: "2.5k" → 2500, "450k" → 450000, "two thousand" → 2000
4. Smart location inference with context understanding
5. Advanced contact extraction from any format
6. Multi-language support (Portuguese/English mix)
7. Infer property types from subtle context clues
8. Handle incomplete information with intelligent defaults

INTELLIGENT DEFAULTS (when information missing):
- Country: "Portugal" (primary market)
- City: "Lisbon" (major market center)
- Area: null (system will ask for clarification)
- Contact: null (system will request details)
- Status: "active" (new listings are active)

AUTOMATION-FOCUSED EXTRACTION:
Your output enables immediate automation between property owners and interested parties. Accuracy is critical for seamless transactions.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Convert to rigid database format with maximum accuracy:\n\n${message}` }
        ],
        temperature: 0.1,
        max_tokens: 2500
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
   * Classify if a message contains property listings to add (enhanced)
   * @param {string} message 
   * @returns {Promise<object>}
   */
  async classifyPropertyAddition(message) {
    try {
      const systemPrompt = `You are analyzing messages for an intelligent real estate automation system. Detect property addition intent with high precision to enable seamless automation.

Return JSON:
{
  "containsProperties": boolean,
  "propertiesCount": number,
  "isStructuredListing": boolean,
  "confidence": 0.0-1.0,
  "automationReady": boolean
}

ENHANCED PROPERTY ADDITION DETECTION:
- Direct intent: "add property", "list my place", "want to sell", "for rent"
- Property details with clear intent: price + location + property info
- Multiple property listings in any format
- Commercial property listings
- Investment property discussions
- Even minimal info like "selling house Porto" counts

ADVANCED DETECTION CAPABILITIES:
- Understand context and implicit intent
- Handle multilingual expressions
- Detect structured vs. unstructured listings
- Assess if data is complete enough for automation

CONFIDENCE & AUTOMATION SCORING:
- 0.9+: Clear intent, ready for immediate automation
- 0.7-0.8: Likely intent, minor clarification needed
- 0.5-0.6: Possible intent, requires confirmation
- <0.5: Unlikely property addition

"automationReady": true if the message contains enough information for immediate processing without additional clarification.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze for property addition with automation intelligence: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 250
      });

      const content = response.choices[0].message.content.trim();
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanedContent);
      
      // Fallback for missing automationReady field
      if (result.automationReady === undefined) {
        result.automationReady = result.confidence >= 0.8 && result.containsProperties;
      }
      
      return result;
    } catch (error) {
      console.error('Property addition classification error:', error);
      return {
        containsProperties: false,
        propertiesCount: 0,
        isStructuredListing: false,
        confidence: 0,
        automationReady: false
      };
    }
  }

  /**
   * Classify user intent for property operations (enhanced)
   * @param {string} message - User's message
   * @param {object} user - User object with role information
   * @returns {Promise<object>} - Intent classification
   */
  async classifyPropertyIntent(message, user) {
    try {
      const userRole = user?.user_roles?.role || 'renter';
      
      const systemPrompt = `You are the intelligence engine for a real estate automation system. Your accurate classification enables seamless automation between property seekers and property providers.

Return JSON:
{
  "intent": "search|view_own_listings|update_property|manage_property|add_property|delete_property|set_availability|unclear",
  "operation": "search|list|update|delete|create|status_change|set_schedule",
  "confidence": 0.0-1.0,
  "requiresSearch": boolean,
  "requiresManagement": boolean,
  "urgency": "high|medium|low",
  "automationLevel": "full|partial|manual"
}

User role: ${userRole}

ENHANCED INTENT CLASSIFICATION:
- "search": User wants to find/browse available properties (any role)
- "view_own_listings": Owner/agent wants to see their properties
- "update_property": Owner/agent wants to modify property details
- "manage_property": Owner/agent wants to change status (sold/active/inactive)
- "add_property": User wants to list new property
- "unclear": Cannot determine intent clearly

INTELLIGENT INDICATORS:
SEARCH: "show me properties", "looking for", "find apartments", "interested in", "need details"
MANAGEMENT: "my listings", "my properties", "show my apartments", "update price", "mark as sold"
DELETE: "delete property", "remove my listing", "delist my apartment"
SET AVAILABILITY: "set viewing times", "update my availability", "i am available on", "change schedule"

AUTOMATION LEVELS:
- "full": Can be completely automated without human intervention
- "partial": Requires minimal clarification or confirmation
- "manual": Needs human assistance or complex decision making

Your classification directly impacts the user experience and automation efficiency.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classify with automation intelligence: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanedContent);
      
      // Add default values for new fields if missing
      if (!result.urgency) result.urgency = 'medium';
      if (!result.automationLevel) {
        result.automationLevel = result.confidence >= 0.8 ? 'full' : result.confidence >= 0.6 ? 'partial' : 'manual';
      }
      
      return result;
    } catch (error) {
      console.error('Property intent classification error:', error);
      return {
        intent: 'unclear',
        operation: 'search',
        confidence: 0.0,
        requiresSearch: false,
        requiresManagement: false,
        urgency: 'medium',
        automationLevel: 'manual'
      };
    }
  }

  /**
   * Parse natural language search query into database filters (enhanced)
   * @param {string} message - User's search message
   * @returns {Promise<object>} - Database filter object
   */
  async parseSearchQuery(message) {
    try {
      const systemPrompt = `You are an intelligent search query parser for a real estate automation system. Convert natural language into precise database filters to enable automated property matching.

CRITICAL: Be VERY careful with ambiguous numbers. When in doubt, DO NOT make assumptions.

Return JSON:
{
  "filters": {
    "property_type": "apartment|house|commercial|land|null",
    "bedrooms": {"min": number, "max": number, "exact": number},
    "bathrooms": {"min": number, "max": number, "exact": number},
    "price": {"min": number, "max": number, "currency": "EUR"},
    "area": {"min": number, "max": number},
    "status": "active|inactive|sold|rented",
    "listing_type": "rent|sale",
    "floor": "string (e.g., 'ground', 'top', 'penthouse')",
    "built_year": {"min": number, "max": number},
    "available_from": "YYYY-MM-DD",
    "location": {
      "country": "string or null",
      "city": "string or null", 
      "district": "string or null",
      "area_description": "downtown|center|suburban|etc"
    },
    "amenities": {
      "elevator": "boolean",
      "furnished": "boolean",
      "air_conditioning": "boolean",
      "work_room": "boolean"
    },
    "apartment_type": "T1|T2|T3|T4|T5|Studio"
  },
  "sorting": {
    "field": "price|area|bedrooms|created_at",
    "order": "asc|desc"
  },
  "limit": 10,
  "searchTerms": ["keywords for full-text search on address/description"],
  "userIntent": "buying|renting|browsing|investment",
  "priorityFeatures": ["must-have", "features"],
  "confidence": 0.0-1.0,
  "ambiguityWarnings": ["warning1", "warning2"]
}

ENHANCED INTELLIGENCE WITH AMBIGUITY AWARENESS:
- Numbers with clear context: "under €2000" → price.max: 2000
- Numbers without context: "apartment in 3000" → DO NOT assume location, flag as ambiguous
- Price indicators: "€", "euro", "budget", "under", "up to", "max" → price
- Location indicators: "in [city]", "near [place]", "postal code" → location
- Area indicators: "sqm", "m²", "square meters" → area
- If standalone number without context → flag as potentially ambiguous
- "new construction" -> built_year: {"min": <current_year - 1>}
- "available now" -> available_from: <today's_date>

INTELLIGENT DEFAULTS:
- If a location term is provided (e.g., "Rato", "Lisbon"), aggressively attempt to classify it as a district, city, or country. Prioritize district, then city.
- If no location is mentioned, do not default country or city. Set them to null.
- Status: "active"
- DO NOT guess location from standalone numbers

SMART INTERPRETATION RULES:
1. If number has currency symbol or price words → price
2. If number with clear location context → location
3. If number with area units → area
4. If standalone number without context → flag as potentially ambiguous

Your parsing should enable precise automation while avoiding incorrect assumptions.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse with enhanced intelligence and ambiguity awareness: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const content = response.choices[0].message.content.trim();
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanedContent);
      
      // Add default values for new fields
      if (!result.userIntent) result.userIntent = 'browsing';
      if (!result.priorityFeatures) result.priorityFeatures = [];
      if (!result.confidence) result.confidence = 0.8;
      if (!result.ambiguityWarnings) result.ambiguityWarnings = [];
      
      return result;
    } catch (error) {
      console.error('Search query parsing error:', error);
      return {
        filters: { status: 'active' },
        sorting: { field: 'created_at', order: 'desc' },
        limit: 10,
        searchTerms: [],
        userIntent: 'browsing',
        priorityFeatures: [],
        confidence: 0.3,
        ambiguityWarnings: ['Failed to parse query intelligently']
      };
    }
  }

  /**
   * Parse property update requests from natural language (enhanced)
   * @param {string} message - Update request message
   * @param {Array} userProperties - User's properties for context
   * @returns {Promise<object>} - Update instruction object
   */
  async parseUpdateRequest(message, userProperties = []) {
    try {
      const propertiesContext = userProperties.length > 0 
        ? `User's properties: ${userProperties.map(p => `ID: ${p.id}, Address: ${p.address}, Type: ${p.property_type}, Price: €${p.price}`).join('; ')}`
        : 'No properties provided for context';

      const systemPrompt = `You are an intelligent property update parser for a real estate automation system. Parse natural language update requests with high accuracy to enable automated property management.

Return JSON:
{
  "propertyIdentification": {
    "method": "single|address|type|id|selection_needed",
    "criteria": "identification criteria",
    "propertyId": "specific ID if identifiable",
    "ambiguous": boolean,
    "confidence": 0.0-1.0
  },
  "updates": {
    "price": number,
    "bedrooms": number,
    "bathrooms": number,
    "area": number,
    "status": "active|inactive|sold|rented",
    "description": "string",
    "property_link": "url",
    "contact_info": "json string"
  },
  "action": "update|status_change|delete",
  "confidence": 0.0-1.0,
  "needsConfirmation": boolean,
  "automationReady": boolean
}

ENHANCED PROPERTY IDENTIFICATION:
- "single": User has only one property (automatic)
- "address": Identified by location/address mentions
- "type": Identified by property type with disambiguation
- "id": Specific property ID or number mentioned
- "selection_needed": Ambiguous, requires user selection

INTELLIGENT UPDATE EXTRACTION:
- Price updates: "€2200", "2.2k", "increase by 10%", "reduce to market rate"
- Status changes: "sold", "rented", "off market", "back on market"
- Description updates: extract new description content
- Contact updates: extract new contact information

AUTOMATION ASSESSMENT:
"automationReady": true if the update can be processed immediately without additional confirmation.
"needsConfirmation": true for critical changes (large price changes, status changes)

CONTEXT AWARENESS:
Use the provided properties context to resolve ambiguities intelligently.

${propertiesContext}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse update request with automation intelligence: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      const content = response.choices[0].message.content.trim();
      const cleanedContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanedContent);
      
      // Add default values for new fields
      if (result.automationReady === undefined) {
        result.automationReady = result.confidence >= 0.8 && !result.needsConfirmation;
      }
      
      return result;
    } catch (error) {
      console.error('Update request parsing error:', error);
      return {
        propertyIdentification: { method: 'selection_needed', ambiguous: true, confidence: 0.0 },
        updates: {},
        action: 'update',
        confidence: 0.0,
        needsConfirmation: true,
        automationReady: false
      };
    }
  }

  /**
   * Parses natural language availability into a structured schedule.
   * @param {string} message - The user's message about their availability.
   * @returns {Promise<object>} - A structured availability object.
   */
  async parseAvailability(message) {
    try {
      const systemPrompt = `You are an expert schedule parser for a real estate bot. Convert natural language availability into a structured JSON array.

The output must be an array of objects, each with "day" (full weekday name, capitalized), "startTime" (HH:MM), and "endTime" (HH:MM).

- Infer weekdays: "weekdays" -> Monday-Friday.
- Handle time ranges: "10 to 2", "14:00-17:00".
- Handle AM/PM. Assume PM for ambiguous times like "2-5" unless morning is specified.
- Handle multiple rules in one sentence.

Example 1: "I'm free on Mondays and Wednesdays from 2 PM to 5 PM"
Output:
[
  {"day": "Monday", "startTime": "14:00", "endTime": "17:00"},
  {"day": "Wednesday", "startTime": "14:00", "endTime": "17:00"}
]

Example 2: "Weekdays 9am-12pm and 2pm-5pm"
Output:
[
  {"day": "Monday", "startTime": "09:00", "endTime": "12:00"},
  {"day": "Monday", "startTime": "14:00", "endTime": "17:00"},
  {"day": "Tuesday", "startTime": "09:00", "endTime": "12:00"},
  {"day": "Tuesday", "startTime": "14:00", "endTime": "17:00"},
  {"day": "Wednesday", "startTime": "09:00", "endTime": "12:00"},
  {"day": "Wednesday", "startTime": "14:00", "endTime": "17:00"},
  {"day": "Thursday", "startTime": "09:00", "endTime": "12:00"},
  {"day": "Thursday", "startTime": "14:00", "endTime": "17:00"},
  {"day": "Friday", "startTime": "09:00", "endTime": "12:00"},
  {"day": "Friday", "startTime": "14:00", "endTime": "17:00"}
]

Example 3: "Tuesday 10:00 - 13:00"
Output:
[
  {"day": "Tuesday", "startTime": "10:00", "endTime": "13:00"}
]
`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this schedule: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      const result = JSON.parse(content);

      // The prompt might return an object with a key, let's extract the array.
      const availabilityArray = Array.isArray(result) ? result : result[Object.keys(result)[0]];

      if (!Array.isArray(availabilityArray)) {
        throw new Error("Parsed availability is not an array.");
      }

      return { success: true, schedule: availabilityArray };
    } catch (error) {
      console.error('Availability parsing error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parses an owner's response to a viewing request.
   * @param {string} message - The owner's response message.
   * @returns {Promise<object>} - A structured object with the owner's intent.
   */
  async parseOwnerResponse(message) {
    try {
      const systemPrompt = `You are an expert at parsing responses from property owners/agents about viewing requests. Extract the intent and any relevant details.

The user is responding to a request for a viewing. Their message will contain a short appointment ID (e.g., "Confirm ab12").

The possible intents are: "confirm", "decline", "suggest_new_time".

- "confirm": The owner agrees to the time.
- "decline": The owner rejects the time.
- "suggest_new_time": The owner proposes a different time. If so, extract the new time suggestion.

Return JSON:
{
  "intent": "confirm|decline|suggest_new_time|unclear",
  "appointmentId": "the short ID, e.g., ab12",
  "newTimeSuggestion": "The new time if suggested, e.g., Tuesday at 3pm"
}

Example 1: "Confirm ab12"
Output:
{ "intent": "confirm", "appointmentId": "ab12", "newTimeSuggestion": null }

Example 2: "Decline ab12, I am not available"
Output:
{ "intent": "decline", "appointmentId": "ab12", "newTimeSuggestion": null }

Example 3: "Suggest Tuesday at 3pm for ab12"
Output:
{ "intent": "suggest_new_time", "appointmentId": "ab12", "newTimeSuggestion": "Tuesday at 3pm" }

Example 4: "I can't do that time for ab12. How about Friday morning?"
Output:
{ "intent": "suggest_new_time", "appointmentId": "ab12", "newTimeSuggestion": "Friday morning" }
`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this owner response: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content.trim();
      return JSON.parse(content);

    } catch (error) {
      console.error('Owner response parsing error:', error);
      return { intent: 'unclear' };
    }
  }
}

module.exports = new OpenAIService(); 