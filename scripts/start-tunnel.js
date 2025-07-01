#!/usr/bin/env node

/**
 * LocalTunnel Helper Script
 * Starts localtunnel with the configured subdomain from .env file
 */

require('dotenv').config();
const { spawn } = require('child_process');
const { config } = require('../src/config/environment');

const subdomain = process.env.LOCAL_TUNNEL_SUBDOMAIN || 'reagentbot-whatsapp';
const port = config.port;

console.log(`
🚇 Starting LocalTunnel...

📊 Configuration:
   • Port: ${port}
   • Subdomain: ${subdomain}
   • URL: https://${subdomain}.loca.lt

🔗 Webhook URL for Twilio:
   https://${subdomain}.loca.lt/webhook/whatsapp

💡 Make sure to update your Twilio Console webhook URL!
`);

// Start localtunnel
const lt = spawn('npx', ['localtunnel', '--port', port, '--subdomain', subdomain], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

lt.on('close', (code) => {
  console.log(`\n🚇 LocalTunnel exited with code ${code}`);
});

lt.on('error', (err) => {
  console.error('❌ Error starting LocalTunnel:', err.message);
  console.log('\n💡 Make sure localtunnel is installed:');
  console.log('   npm install -g localtunnel');
  console.log('   or use: npx localtunnel --port 3000 --subdomain your-subdomain');
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping LocalTunnel...');
  lt.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Stopping LocalTunnel...');
  lt.kill('SIGTERM');
  process.exit(0);
}); 