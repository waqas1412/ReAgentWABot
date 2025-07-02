# Intelligent WhatsApp Bot Documentation

## Overview

This WhatsApp bot now uses OpenAI's GPT-3.5-turbo for intelligent intent classification and conversation management. The bot can understand natural language and automatically:

1. **Classify user intent** (buyer, renter, owner, agent)
2. **Detect property links** in messages
3. **Identify property listing requests**
4. **Manage conversation flows** with context awareness
5. **Register users automatically** based on their intent

## How It Works

### Intent Classification

The bot uses OpenAI to analyze each message and determine:
- **Intent**: greeting, buyer, renter, owner, agent, or unclear
- **Property Link Detection**: whether the message contains property URLs or listings
- **Property Listing Intent**: whether the user wants to add/list a property
- **Confidence Score**: how certain the AI is about the classification

### Rich Text Support

The bot now supports rich text responses with:
- **Emojis**: Context-appropriate emojis for better visual communication
- **Text Formatting**: Bold text using WhatsApp's *bold* syntax
- **Structured Messages**: Well-organized responses with clear sections
- **Role-based Emojis**: Different emojis for different user roles (🏠 buyer, 🏡 renter, 🏢 owner, 🏘️ agent)

### Intelligent Property Parsing (Rigid Format Approach)

The bot uses OpenAI to convert natural language property listings into a rigid, database-ready format:
- **Natural Language Input**: Users can send properties in any natural language format
- **Rigid Output**: OpenAI converts everything to exact database schema format
- **No Manual Parsing**: Zero custom parsing logic - OpenAI handles all conversions
- **Type Safety**: Ensures correct data types (numbers, strings, enums)
- **Database Ready**: Data can be inserted directly without transformation
- **Multiple Properties**: Processes multiple properties from a single message
- **Complete Validation**: Automatic validation and default value assignment

### Conversation Flows

#### 1. General Greeting
**User Input**: "Hi", "Hello", "Hey"
**Bot Response**: "Welcome! Are you a buyer, renter, owner, or agent?"

#### 2. Property Interest with Link
**User Input**: "Check out this property: https://example.com/listing/123"
**Bot Response**: "I see you shared a property! Are you interested in buying or renting?"
**Follow-up**: Bot registers user as buyer or renter based on response

#### 3. Direct Intent Declaration
**User Input**: "I want to buy a house"
**Bot Response**: Registers user as buyer/renter and offers to help find properties

**User Input**: "I want to rent an apartment"
**Bot Response**: Registers user as renter and offers property search assistance

#### 4. Property Listing Request
**User Input**: "I want to list my house for sale"
**Bot Response**: "I can help you list your property! Are you the owner or an agent?"
**Follow-up**: Registers user with appropriate role and starts listing process

#### 5. Agent/Owner Identification
**User Input**: "I'm a real estate agent"
**Bot Response**: Registers user as agent and asks if they want to list properties

#### 6. Bulk Property Addition
**User Input**: Complex property listing message (like the sample below)
**Bot Response**: Parses all properties, registers user as owner/agent if needed, and adds properties to database with rich formatted confirmation

**Sample Input**:
```
Add properties:
1. T3 apartment in Príncipe Real with 2 bathrooms and 119m² (ID: prop1)
   💰 €3900/month
   📍 Príncipe Real, Santo António
   🛏️ 3 bedrooms
   🔗 https://www.idealista.pt/en/imovel/33520037/
   📞 Monica Cruz (+351000000001)
2. T2 apartment in Santo António with 2 bathrooms and 129.5m² (ID: prop4)
   💰 €3680/month
   📍 Santo António
   🛏️ 2 bedrooms
```

**Bot Response**: 
```
🏠 Property Addition Results

✅ Successfully added 2 properties:

1. 🏢 Príncipe Real, Santo António
   💰 EUR 3900/month
   🛏️ 3 beds • 🛁 2 baths
   📐 119m²
   🆔 Database ID: abc123

2. 🏢 Santo António
   💰 EUR 3680/month
   🛏️ 2 beds • 🛁 2 baths
   📐 129.5m²
   🆔 Database ID: def456

📊 Summary: 2 added, 0 failed out of 2 total properties

💡 Use "search properties" to view your listings
```

## Rigid Format Approach

### How It Works

Instead of manually parsing various property formats, the bot uses OpenAI to convert any natural language property description into a rigid, database-ready format:

**Input (Natural Language)**:
```
T3 apartment in Príncipe Real with 2 bathrooms and 119m²
💰 €3900/month
📍 Príncipe Real, Santo António
🛏️ 3 bedrooms
🔗 https://www.idealista.pt/en/imovel/33520037/
📞 Monica Cruz (+351000000001)
```

**Output (Rigid Database Format)**:
```json
{
  "address": "Príncipe Real, Santo António",
  "price": 3900,
  "currency": "EUR",
  "property_type": "apartment",
  "bedrooms": 3,
  "bathrooms": 2,
  "area_sqm": 119,
  "status": "active",
  "listing_type": "rent",
  "description": "",
  "external_url": "https://www.idealista.pt/en/imovel/33520037/",
  "contact_name": "Monica Cruz",
  "contact_phone": "+351000000001",
  "apartment_type": "T3",
  "country_name": "Portugal",
  "city_name": "Lisbon",
  "district_name": "Príncipe Real"
}
```

### Benefits

1. **Zero Manual Parsing**: No custom regex or parsing logic needed
2. **Type Safety**: OpenAI ensures correct data types (numbers vs strings)
3. **Schema Compliance**: Output always matches database schema exactly
4. **Flexible Input**: Users can write in any natural language format
5. **Default Values**: Missing fields get appropriate defaults
6. **Validation**: Built-in validation ensures data integrity
7. **Scalable**: Easy to add new fields by updating OpenAI prompt

## Database Integration

### User Registration
- Users are automatically created in the database when they first interact
- Role assignment happens based on OpenAI intent classification
- Phone numbers are normalized for WhatsApp integration

### Supported User Roles
- **Renter**: Users looking to buy or rent properties (buyers are treated as renters in the system)
- **Owner**: Property owners who want to list their properties
- **Agent**: Real estate agents managing multiple properties

### Conversation State Management
- The bot remembers ongoing conversations (e.g., waiting for role clarification)
- States automatically expire after 10 minutes to prevent memory leaks
- Context is maintained across message exchanges

## Configuration

### Environment Variables Required
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Supabase Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
```

## Technical Implementation

### Core Services

#### 1. OpenAI Service (`src/services/openaiService.js`)
- Handles intent classification using GPT-3.5-turbo
- **Rigid Format Conversion**: Converts natural language to exact database schema
- **Type-Safe Output**: Ensures all data types match database requirements
- **Validation & Defaults**: Applies validation rules and default values
- Provides fallback keyword-based classification if OpenAI fails

#### 2. Conversation Service (`src/services/conversationService.js`)
- Manages conversation flows and user interactions
- Handles user registration and role assignment
- Maintains conversation state and context
- Bridges OpenAI classification with database operations

#### 3. Property Parsing Service (`src/services/propertyParsingService.js`)
- **Direct Database Insertion**: Takes rigid format data and inserts directly
- **Location Management**: Creates countries, cities, districts automatically
- **Simplified Processing**: No parsing logic - just database operations
- **Rich Response Formatting**: Provides beautiful confirmation messages
- **Error Handling**: Graceful handling of database insertion failures

#### 4. Updated WhatsApp Controller (`src/controllers/whatsappController.js`)
- Simplified to use the conversation service
- Handles media messages and sandbox join commands
- Processes all text messages through the intelligent conversation flow

### Key Features

#### Smart Responses
- **Context-aware**: Bot remembers previous interactions within a session
- **Role-based**: Different responses based on user's role (buyer/renter/owner/agent)
- **Fallback handling**: If OpenAI fails, keyword-based classification is used
- **Error resilience**: Graceful error handling with user-friendly messages

#### Intent Examples Handled
```
✅ "Hi" → Welcome message asking for role with emojis
✅ "I want to buy a house" → Register as buyer/renter with 🏠 emoji
✅ "Looking to rent apartment" → Register as renter with 🏡 emoji
✅ "I want to sell my property" → Ask if owner or agent with 🏠 emoji
✅ "I'm a real estate agent" → Register as agent with 🏘️ emoji
✅ "Check this listing: [URL]" → Ask if buying or renting with 🔗 emoji
✅ "I need to list my house" → Property listing flow with rich text
✅ Complex property listings → Parse multiple properties and add to database
✅ Structured property data → Extract all details and create formatted responses
```

## Testing

To test the intelligent features:

1. **Start the bot**: `npm run dev`
2. **Send messages** to your WhatsApp sandbox number
3. **Try different intents**:
   - "Hi" (greeting with rich text response)
   - "I want to buy a house" (buyer intent with 🏠 emoji)
   - "I'm looking to rent" (renter intent with 🏡 emoji)
   - "I want to sell my property" (owner intent with role clarification)
   - "I'm a real estate agent" (agent intent with 🏘️ emoji)
4. **Test property parsing** (as owner/agent):
   - Send complex property listings like the sample in conversation flows
   - Try variations with different formats
   - Test single vs multiple properties
   - Verify database integration and rich text responses

## Future Enhancements

The system is designed to be extensible for:
- **Property detail extraction** from natural language descriptions
- **Advanced search queries** using natural language
- **Multi-step property listing** with guided conversations
- **Appointment scheduling** through natural language
- **Property recommendations** based on user preferences

## Schema & Database Integration

### Fixed Issues

**Row-Level Security (RLS) Policy Fixes:**
- ✅ **Admin Operations**: Uses service role key for creating reference data (countries, cities, districts, apartment types)
- ✅ **Bypass RLS**: Admin client bypasses security policies when creating system data
- ✅ **User Operations**: Regular operations use anon key with proper RLS enforcement

**Database Schema Mapping:**
- ✅ **Correct Field Names**: Maps `area_sqm` → `area`, `apartment_type_id` → `type_id`
- ✅ **Contact Information**: Stores contact details in `remarks` field (schema-compliant)
- ✅ **Property Links**: Maps `external_url` → `property_link` (actual schema field)
- ✅ **Removed Invalid Fields**: Removed `property_type` (doesn't exist in schema)

### Database Operations

**Reference Data Creation** (using admin client):
- Countries, cities, districts, apartment types
- Bypasses RLS policies for system data

**Property Creation** (using user client):
- Properties associated with authenticated users
- Proper RLS enforcement for user data

## Error Handling

- **OpenAI API failures**: Falls back to keyword-based classification
- **Low confidence scores**: Asks for user clarification
- **Database errors**: Graceful error messages to users
- **Invalid roles**: Prompts user to specify valid role
- **Schema mismatches**: Proper field mapping and validation

## Performance Considerations

- **Rate limiting**: Built-in delays between OpenAI API calls
- **Memory management**: Conversation states auto-expire
- **Fallback systems**: Multiple layers of error handling
- **Efficient queries**: Optimized database operations 