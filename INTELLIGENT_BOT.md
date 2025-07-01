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
- Provides fallback keyword-based classification if OpenAI fails
- Includes property detail extraction for future features

#### 2. Conversation Service (`src/services/conversationService.js`)
- Manages conversation flows and user interactions
- Handles user registration and role assignment
- Maintains conversation state and context
- Bridges OpenAI classification with database operations

#### 3. Updated WhatsApp Controller (`src/controllers/whatsappController.js`)
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
✅ "Hi" → Welcome message asking for role
✅ "I want to buy a house" → Register as buyer/renter
✅ "Looking to rent apartment" → Register as renter
✅ "I want to sell my property" → Ask if owner or agent
✅ "I'm a real estate agent" → Register as agent
✅ "Check this listing: [URL]" → Ask if buying or renting
✅ "I need to list my house" → Property listing flow
```

## Testing

To test the intelligent features:

1. **Start the bot**: `npm run dev`
2. **Send messages** to your WhatsApp sandbox number
3. **Try different intents**:
   - "Hi" (greeting)
   - "I want to buy a house" (buyer intent)
   - "I'm looking to rent" (renter intent)
   - "I want to sell my property" (owner intent)
   - "I'm a real estate agent" (agent intent)

## Future Enhancements

The system is designed to be extensible for:
- **Property detail extraction** from natural language descriptions
- **Advanced search queries** using natural language
- **Multi-step property listing** with guided conversations
- **Appointment scheduling** through natural language
- **Property recommendations** based on user preferences

## Error Handling

- **OpenAI API failures**: Falls back to keyword-based classification
- **Low confidence scores**: Asks for user clarification
- **Database errors**: Graceful error messages to users
- **Invalid roles**: Prompts user to specify valid role

## Performance Considerations

- **Rate limiting**: Built-in delays between OpenAI API calls
- **Memory management**: Conversation states auto-expire
- **Fallback systems**: Multiple layers of error handling
- **Efficient queries**: Optimized database operations 