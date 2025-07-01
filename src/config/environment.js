require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
    sandboxKeyword: process.env.SANDBOX_KEYWORD || 'join'
  },
  
  // Webhook Configuration
  webhook: {
    baseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'
  },
  
  // Local Tunnel Configuration
  localTunnel: {
    subdomain: process.env.LOCAL_TUNNEL_SUBDOMAIN || 'reagentbot-whatsapp'
  }
};

// Validate required environment variables
const validateConfig = () => {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Please create a .env file with the following variables:');
    console.error('TWILIO_ACCOUNT_SID=your_account_sid');
    console.error('TWILIO_AUTH_TOKEN=your_auth_token');
    console.error('TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886');
    console.error('SANDBOX_KEYWORD=your_sandbox_keyword');
    console.error('LOCAL_TUNNEL_SUBDOMAIN=your-fixed-subdomain');
    process.exit(1);
  }
};

module.exports = { config, validateConfig }; 