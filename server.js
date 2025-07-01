const app = require('./src/app');
const { config, validateConfig } = require('./src/config/environment');

// Validate environment configuration
validateConfig();

// Start server
const server = app.listen(config.port, () => {
  console.log(`
🚀 ReAgentBot WhatsApp API Server is running!

📊 Server Info:
   • Port: ${config.port}
   • Environment: ${config.nodeEnv}
   • Twilio WhatsApp Number: ${config.twilio.whatsappNumber}

🌐 API Endpoints:
   • Health Check: http://localhost:${config.port}/health
   • API Documentation: http://localhost:${config.port}/
   • Send Message: POST http://localhost:${config.port}/api/whatsapp/send
   • WhatsApp Webhook: POST http://localhost:${config.port}/webhook/whatsapp

🔗 For webhook setup with Local Tunnel:
   1. Install localtunnel: npm install -g localtunnel
   2. Start with fixed subdomain: lt --port ${config.port} --subdomain your-fixed-subdomain
   3. Set webhook URL in Twilio Console: https://your-fixed-subdomain.loca.lt/webhook/whatsapp

📱 WhatsApp Sandbox Setup:
   1. Go to Twilio Console > Messaging > Try it Out > WhatsApp
   2. Send "join ${config.twilio.sandboxKeyword}" to ${config.twilio.whatsappNumber}
   3. You should receive a confirmation message

💡 Fixed Domain Benefits:
   • Same URL every time you restart
   • No need to update webhook URL repeatedly
   • Better for development workflow

Ready to receive WhatsApp messages! 🎉
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server; 