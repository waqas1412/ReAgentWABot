# ReAgentBot WhatsApp API

A complete Express.js application with Twilio WhatsApp integration for sending and receiving messages through WhatsApp Business API.

## Features

- ✅ Send WhatsApp messages programmatically
- ✅ Receive and respond to incoming WhatsApp messages
- ✅ Handle media messages (images, documents, etc.)
- ✅ Template message support for notifications
- ✅ Message status tracking
- ✅ Webhook validation and security
- ✅ Proper error handling and logging
- ✅ Health check endpoints
- ✅ Local tunnel support for development

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Twilio account with WhatsApp sandbox access
- localtunnel for local development with fixed domains

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here

# WhatsApp Sandbox Configuration
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
SANDBOX_KEYWORD=your_sandbox_keyword

# Server Configuration
PORT=3000
NODE_ENV=development

# Webhook Configuration  
WEBHOOK_BASE_URL=https://your-fixed-subdomain.loca.lt
```

### 3. Get Twilio Credentials

1. Sign up for a [Twilio account](https://www.twilio.com/try-twilio)
2. Go to [Twilio Console](https://console.twilio.com)
3. Find your Account SID and Auth Token on the dashboard
4. Go to Messaging > Try it Out > WhatsApp to activate the sandbox

### 4. Set Up WhatsApp Sandbox

1. In Twilio Console, navigate to Messaging > Try it Out > WhatsApp
2. Note your sandbox number and keyword
3. Send `join your-sandbox-keyword` to the sandbox number via WhatsApp
4. You should receive a confirmation message

### 5. Start the Application

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

### 6. Set Up Local Tunnel with Fixed Domain

In a separate terminal, install and start localtunnel:

```bash
# Install localtunnel globally
npm install -g localtunnel

# Start with your fixed subdomain
lt --port 3000 --subdomain your-fixed-subdomain
```

Copy the HTTPS URL (e.g., `https://your-fixed-subdomain.loca.lt`) and:

1. Update your `.env` file with the localtunnel URL
2. Set the webhook URL in Twilio Console:
   - Go to Messaging > Try it Out > WhatsApp
   - Set "When a message comes in" to: `https://your-fixed-subdomain.loca.lt/webhook/whatsapp`
   - Set HTTP method to POST

## API Documentation

### Send a WhatsApp Message

```http
POST /api/whatsapp/send
Content-Type: application/json

{
  "to": "+1234567890",
  "message": "Hello from WhatsApp API!",
  "mediaUrl": "https://example.com/image.jpg" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "SM...",
    "status": "queued",
    "to": "whatsapp:+1234567890",
    "from": "whatsapp:+14155238886"
  },
  "message": "WhatsApp message sent successfully"
}
```

### Send a Template Message

```http
POST /api/whatsapp/send-template
Content-Type: application/json

{
  "to": "+1234567890",
  "template": "verification_code",
  "parameters": ["MyApp", "123456"]
}
```

**Available Templates (Sandbox):**
- `verification_code`: "Your {{1}} code is {{2}}"
- `appointment_reminder`: "Your appointment is coming up on {{1}} at {{2}}"
- `order_notification`: "Your {{1}} order of {{2}} has shipped and should be delivered on {{3}}. Details: {{4}}"

### Get Message Status

```http
GET /api/whatsapp/status/:messageSid
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sid": "SM...",
    "status": "delivered",
    "errorCode": null,
    "errorMessage": null,
    "dateCreated": "2023-01-01T12:00:00Z",
    "dateSent": "2023-01-01T12:00:01Z",
    "dateUpdated": "2023-01-01T12:00:05Z"
  }
}
```

### Health Check

```http
GET /health
```

## Webhook Endpoints

### Receive WhatsApp Messages

```http
POST /webhook/whatsapp
```

This endpoint receives incoming WhatsApp messages from Twilio and responds with TwiML.

### Message Status Updates

```http
POST /webhook/whatsapp/status
```

This endpoint receives message delivery status updates from Twilio.

## Usage Examples

### Sending a Simple Message

```javascript
const response = await fetch('http://localhost:3000/api/whatsapp/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '+1234567890',
    message: 'Hello from the WhatsApp API!'
  })
});

const result = await response.json();
console.log(result);
```

### Sending a Message with Media

```javascript
const response = await fetch('http://localhost:3000/api/whatsapp/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '+1234567890',
    message: 'Check out this image!',
    mediaUrl: 'https://example.com/image.jpg'
  })
});
```

### Sending a Verification Code

```javascript
const response = await fetch('http://localhost:3000/api/whatsapp/send-template', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '+1234567890',
    template: 'verification_code',
    parameters: ['MyApp', '123456']
  })
});
```

## Message Flow

### Incoming Messages

When someone sends a message to your WhatsApp number:

1. Twilio receives the message
2. Twilio sends a webhook POST request to `/webhook/whatsapp`
3. Your app processes the message
4. Your app responds with TwiML instructions
5. Twilio sends the response back to the user

### Bot Commands

The bot responds to these commands:

- `help` - Shows available commands
- `info` - Shows bot information
- `contact` - Shows contact details
- Any other message gets an echo response

## Project Structure

```
ReAgentBot/
├── src/
│   ├── config/
│   │   └── environment.js       # Environment configuration
│   ├── controllers/
│   │   └── whatsappController.js # WhatsApp message handling
│   ├── middleware/
│   │   └── errorHandler.js      # Error handling middleware
│   ├── routes/
│   │   ├── whatsappRoutes.js    # API routes
│   │   └── webhookRoutes.js     # Webhook routes
│   ├── services/
│   │   └── twilioService.js     # Twilio API wrapper
│   └── app.js                   # Express app setup
├── server.js                    # Application entry point
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | Yes | - |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | Yes | - |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp-enabled number | No | `whatsapp:+14155238886` |
| `SANDBOX_KEYWORD` | Sandbox join keyword | No | `join` |
| `PORT` | Server port | No | `3000` |
| `NODE_ENV` | Environment | No | `development` |
| `WEBHOOK_BASE_URL` | Webhook base URL | No | `http://localhost:3000` |
| `ALLOWED_ORIGINS` | CORS allowed origins | No | `*` |

## Error Handling

The application includes comprehensive error handling:

- Global error handler for uncaught exceptions
- API error responses with proper HTTP status codes
- Webhook error handling with TwiML error responses
- Validation for required parameters
- Twilio API error handling

## Security Features

- Helmet.js for security headers
- CORS configuration
- Request body size limits
- Environment variable validation
- Webhook signature validation (optional)

## Deployment

### Local Development

1. Follow the Quick Start guide
2. Use localtunnel for webhook tunneling with fixed domains
3. Use `npm run dev` for auto-restart

### Production Deployment

1. Set `NODE_ENV=production`
2. Use a proper domain for webhooks
3. Enable webhook signature validation
4. Set up proper CORS origins
5. Use PM2 or similar for process management

Example PM2 ecosystem file:

```javascript
module.exports = {
  apps: [{
    name: 'whatsapp-bot',
    script: 'server.js',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure your `.env` file contains all required variables
   - Check that variable names are spelled correctly

2. **"Failed to send message"**
   - Verify your Twilio credentials
   - Ensure the recipient has joined your sandbox
   - Check that phone numbers are in E.164 format

3. **"Webhook not receiving messages"**
   - Verify localtunnel is running and URL is correct
   - Check that webhook URL is set in Twilio Console
   - Ensure webhook URL is HTTPS

4. **"Sandbox session expired"**
   - Re-send the join message to the sandbox number
   - Sandbox sessions expire after 3 days

### Debugging

Enable debug logging:

```bash
DEBUG=* npm run dev
```

Check Twilio logs in the Console for detailed error information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

- Check the troubleshooting section
- Review Twilio WhatsApp documentation
- Open an issue in this repository

## Next Steps

- [ ] Add database integration for message history
- [ ] Implement user session management
- [ ] Add more sophisticated bot logic
- [ ] Implement webhook signature validation
- [ ] Add rate limiting
- [ ] Add message templates management
- [ ] Implement conversation flows 