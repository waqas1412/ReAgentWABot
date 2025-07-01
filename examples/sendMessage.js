/**
 * Example script to send WhatsApp messages
 * Run with: node examples/sendMessage.js
 */

require('dotenv').config();

async function sendMessage() {
  const serverUrl = 'http://localhost:3000';
  
  try {
    // Replace with your recipient's phone number (must be joined to sandbox)
    const recipientNumber = '+1234567890'; // Change this to your phone number
    
    console.log('🚀 Sending WhatsApp message...');
    
    // Send a simple text message
    const response = await fetch(`${serverUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipientNumber,
        message: 'Hello! This is a test message from the WhatsApp API bot. 🤖'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Message sent successfully!');
      console.log('📄 Message details:', result.data);
      
      // Wait a moment then send a template message
      console.log('\n⏳ Waiting 3 seconds before sending template message...');
      setTimeout(async () => {
        await sendTemplateMessage(recipientNumber);
      }, 3000);
      
    } else {
      console.error('❌ Failed to send message:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure your server is running: npm run dev');
  }
}

async function sendTemplateMessage(recipientNumber) {
  const serverUrl = 'http://localhost:3000';
  
  try {
    console.log('📋 Sending template message...');
    
    // Send a verification code template
    const response = await fetch(`${serverUrl}/api/whatsapp/send-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipientNumber,
        template: 'verification_code',
        parameters: ['ReAgentBot', '123456']
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Template message sent successfully!');
      console.log('📄 Message details:', result.data);
    } else {
      console.error('❌ Failed to send template message:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error sending template:', error.message);
  }
}

async function sendMediaMessage(recipientNumber) {
  const serverUrl = 'http://localhost:3000';
  
  try {
    console.log('🖼️ Sending media message...');
    
    // Send a message with an image
    const response = await fetch(`${serverUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipientNumber,
        message: 'Here\'s an image for you!',
        mediaUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Media message sent successfully!');
      console.log('📄 Message details:', result.data);
    } else {
      console.error('❌ Failed to send media message:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error sending media:', error.message);
  }
}

// Instructions for the user
console.log(`
📱 WhatsApp Message Sender Example

Before running this script:
1. Make sure your server is running: npm run dev
2. Make sure you've joined the WhatsApp sandbox
3. Update the recipientNumber variable with your phone number
4. Your phone number should be in E.164 format (+1234567890)

Note: The recipient must have joined your Twilio WhatsApp sandbox.
`);

// Prompt user for confirmation
if (process.argv.includes('--send')) {
  sendMessage();
} else {
  console.log('To send the message, run: node examples/sendMessage.js --send');
}

module.exports = { sendMessage, sendTemplateMessage, sendMediaMessage }; 