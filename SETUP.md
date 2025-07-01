# Setup Guide

## Step-by-Step Setup Instructions

### 1. Environment Configuration

Create a `.env` file in the root directory and add your Twilio credentials:

```env
# Copy this content to your .env file and replace with your actual values

# Twilio Configuration (Required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# WhatsApp Sandbox Configuration
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
SANDBOX_KEYWORD=your_sandbox_keyword

# Server Configuration
PORT=3000
NODE_ENV=development

# Webhook Configuration (Update after starting ngrok)
WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
```

### 2. Get Your Twilio Credentials

1. **Sign up for Twilio**: Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. **Access Console**: Go to [https://console.twilio.com](https://console.twilio.com)
3. **Find Credentials**: Copy your Account SID and Auth Token from the dashboard
4. **Activate WhatsApp Sandbox**: 
   - Navigate to Messaging > Try it Out > WhatsApp
   - Note your sandbox number and keyword

### 3. Set Up WhatsApp Sandbox

1. **Join Sandbox**: Send `join your-sandbox-keyword` to the sandbox number via WhatsApp
2. **Confirm**: You should receive a confirmation message
3. **Test Numbers**: Only numbers that have joined can receive messages

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the Application

```bash
# Development mode (recommended)
npm run dev

# Or production mode
npm start
```

### 6. Set Up Local Tunnel with Fixed Domain

1. **Install localtunnel**: `npm install -g localtunnel`
2. **Start tunnel with fixed subdomain**: 
   ```bash
   lt --port 3000 --subdomain your-fixed-subdomain
   ```
3. **Copy URL**: Copy the HTTPS URL (e.g., `https://your-fixed-subdomain.loca.lt`)
4. **Update .env**: Replace `WEBHOOK_BASE_URL` with your localtunnel URL

### 7. Configure Webhook in Twilio

1. Go to Twilio Console > Messaging > Try it Out > WhatsApp
2. Set "When a message comes in" to: `https://your-fixed-subdomain.loca.lt/webhook/whatsapp`
3. Set HTTP method to "POST"
4. Save configuration

## Testing Your Setup

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2023-12-07T10:00:00.000Z",
  "uptime": 123.456,
  "version": "1.0.0"
}
```

### Test 2: Send a Message

1. Update `examples/sendMessage.js` with your phone number
2. Run:
   ```bash
   node examples/sendMessage.js --send
   ```

### Test 3: Receive Messages

1. Send any message to your sandbox WhatsApp number
2. Check your terminal logs for incoming webhook
3. You should receive an automatic reply

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Check your `.env` file exists and has correct variable names
   - Verify Account SID starts with "AC"

2. **"Failed to send message"**
   - Ensure recipient joined your sandbox
   - Check phone number format (+1234567890)
   - Verify Twilio credentials

3. **"Webhook not working"**
   - Confirm localtunnel is running
   - Check webhook URL is HTTPS
   - Verify webhook URL in Twilio Console

4. **"Sandbox expired"**
   - Re-send join message to sandbox
   - Sandbox sessions last 3 days

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npm run dev
```

### Verify Webhook

Test webhook manually:

```bash
curl -X POST https://your-fixed-subdomain.loca.lt/webhook/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=test&From=whatsapp:+1234567890&To=whatsapp:+14155238886"
```

## Next Steps

Once everything is working:

1. Customize message responses in `src/controllers/whatsappController.js`
2. Add your business logic
3. Consider database integration for message history
4. Set up production deployment

## Production Checklist

- [ ] Use real domain instead of localtunnel
- [ ] Set `NODE_ENV=production`
- [ ] Enable webhook signature validation
- [ ] Set up proper CORS origins
- [ ] Use process manager (PM2)
- [ ] Set up logging and monitoring
- [ ] Apply for WhatsApp Business account approval 