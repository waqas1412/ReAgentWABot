const ViewingAppointment = require('../models/ViewingAppointment');
const ViewingTimeSlot = require('../models/ViewingTimeSlot');
const Property = require('../models/Property');
const User = require('../models/User');
const twilioService = require('./twilioService');
const openaiService = require('./openaiService');

/**
 * Appointment Booking Service
 * Handles privacy-first, bot-mediated property viewing appointments
 */
class AppointmentService {
  constructor() {
    // Track pending appointment requests
    this.pendingRequests = new Map();
  }

  /**
   * Handle viewing interest from buyer/renter
   * @param {string} message - User's message expressing interest
   * @param {object} user - Buyer/renter user object
   * @param {string} propertyId - Property ID they're interested in
   * @returns {Promise<Array>} - Response messages
   */
  async handleViewingInterest(message, user, propertyId) {
    try {
      console.log(`📅 [APPOINTMENT] Handling viewing interest for property ${propertyId} from user ${user.phone_number}`);

      // Get property details with owner/agent info
      const property = await Property.getPropertyWithDetails(propertyId);
      if (!property) {
        return ['❌ Property not found. Please try searching again.'];
      }

      // Check if property owner/agent has set availability
      const availableSlots = await this.getAvailableSlotsForProperty(propertyId);
      
      if (availableSlots.length > 0) {
        // Scenario A: Owner/agent has pre-set availability
        return await this.showAvailableSlots(property, availableSlots, user);
      } else {
        // Scenario B: No pre-set availability - collect buyer preferences
        return await this.collectBuyerPreferences(property, user, message);
      }

    } catch (error) {
      console.error('❌ [APPOINTMENT] Error handling viewing interest:', error);
      return ['❌ Error processing your viewing request. Please try again.'];
    }
  }

  /**
   * Get available viewing slots for a property
   * @param {string} propertyId - Property ID
   * @param {number} daysAhead - Days to look ahead (default 7)
   * @returns {Promise<Array>} - Available slots
   */
  async getAvailableSlotsForProperty(propertyId, daysAhead = 7) {
    try {
      const property = await Property.findById(propertyId);
      if (!property) return [];
      
      const availableSlots = [];
      const today = new Date();
      
      // Scenario 1: Owner has set specific availability rules
      if (property.availability && property.availability.length > 0) {
        console.log(`[APPOINTMENT] Using owner-defined availability for property ${propertyId}`);
        const availabilityRules = property.availability; // e.g., [{day: "Monday", startTime: "14:00", endTime: "17:00"}]

        for (let i = 1; i <= daysAhead; i++) {
          const checkDate = new Date();
          checkDate.setDate(today.getDate() + i);
          const dayOfWeek = checkDate.toLocaleString('en-US', { weekday: 'long' });

          const rulesForDay = availabilityRules.filter(rule => rule.day === dayOfWeek);

          for (const rule of rulesForDay) {
            // Here, we would ideally break the rule's time range into smaller, bookable slots (e.g., 1-hour increments).
            // For simplicity in this step, we will treat the entire rule as a single bookable slot.
            // A more advanced implementation would generate slots like 14:00-15:00, 15:00-16:00, etc.
            
            const isBooked = await this.isTimeRangeBooked(propertyId, checkDate, rule.startTime, rule.endTime);

            if (!isBooked) {
              availableSlots.push({
                date: checkDate.toISOString().split('T')[0],
                dateFormatted: checkDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                timeSlot: { start_time: rule.startTime, end_time: rule.endTime, id: `${rule.day}-${rule.startTime}` }, // Create a synthetic ID
                timeFormatted: `${rule.startTime} - ${rule.endTime}`
              });
            }
          }
        }
      } else {
        // Scenario 2: Fallback to generic time slots if no specific availability is set
        console.log(`[APPOINTMENT] No owner-defined availability for property ${propertyId}, using generic slots.`);
      const timeSlots = await ViewingTimeSlot.getAllTimeSlots();
      
      for (let i = 1; i <= daysAhead; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateStr = checkDate.toISOString().split('T')[0];
        
        if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
        
        for (const slot of timeSlots) {
            const isAvailable = await ViewingTimeSlot.isSlotAvailable(slot.id, dateStr, propertyId);
          if (isAvailable) {
            availableSlots.push({
              date: dateStr,
                dateFormatted: checkDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
              timeSlot: slot,
              timeFormatted: ViewingTimeSlot.formatTimeSlot(slot)
            });
            }
          }
        }
      }
      
      return availableSlots.slice(0, 15); // Limit to first 15 slots
    } catch (error) {
      console.error('Error getting available slots:', error);
      return [];
    }
  }

  /**
   * Checks if a specific time range is already booked for a property on a given date.
   * @param {string} propertyId - The ID of the property.
   * @param {Date} date - The date to check.
   * @param {string} startTime - The start time of the range (HH:MM).
   * @param {string} endTime - The end time of the range (HH:MM).
   * @returns {Promise<boolean>} - True if the time range is booked.
   */
  async isTimeRangeBooked(propertyId, date, startTime, endTime) {
    const dateStr = date.toISOString().split('T')[0];
    
    // This check handles overlapping time ranges.
    const { data, error } = await ViewingAppointment.db
      .from('viewing_appointments')
      .select('id')
      .eq('property_id', propertyId)
      .eq('appointment_date', dateStr)
      .lt('start_time', endTime) // An existing appointment starts before the new one ends
      .gt('end_time', startTime)   // And it ends after the new one starts
      .limit(1);

    if (error) {
      console.error('Error checking if time range is booked:', error);
      return true; // Fail safe
    }

    return data && data.length > 0;
  }

  /**
   * Show available viewing slots to buyer/renter
   * @param {object} property - Property object
   * @param {Array} availableSlots - Available time slots
   * @param {object} user - User object
   * @returns {Promise<Array>} - Response messages
   */
  async showAvailableSlots(property, availableSlots, user) {
    try {
      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      
      let response = `${propertyEmoji} *Property Viewing - ${property.address}*\n\n`;
      response += `🗓️ *Available Viewing Times:*\n\n`;
      
      // Group slots by date
      const slotsByDate = this.groupSlotsByDate(availableSlots);
      
      let slotNumber = 1;
      for (const [date, slots] of Object.entries(slotsByDate)) {
        response += `📅 *${slots[0].dateFormatted}*\n`;
        for (const slot of slots) {
          response += `${slotNumber}. ${slot.timeFormatted}\n`;
          slotNumber++;
        }
        response += '\n';
      }
      
      response += `💡 *Reply with the number* of your preferred time slot\n`;
      response += `Example: "I want slot 3" or just "3"`;
      
      // Store the context for follow-up
      this.pendingRequests.set(user.phone_number, {
        type: 'slot_selection',
        property: property,
        availableSlots: availableSlots,
        timestamp: new Date()
      });
      
      return [response];
    } catch (error) {
      console.error('Error showing available slots:', error);
      return ['❌ Error displaying available times. Please try again.'];
    }
  }

  /**
   * Collect buyer/renter preferences when no pre-set availability
   * @param {object} property - Property object
   * @param {object} user - User object
   * @param {string} originalMessage - Original interest message
   * @returns {Promise<Array>} - Response messages
   */
  async collectBuyerPreferences(property, user, originalMessage) {
    try {
      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      
      let response = `${propertyEmoji} *Property Viewing - ${property.address}*\n\n`;
      response += `🤔 The property owner/agent hasn't set specific viewing times yet.\n\n`;
      response += `📋 *When would you like to view this property?*\n\n`;
      response += `Please let me know your preferred:\n`;
      response += `• Day(s): Monday, Tuesday, etc.\n`;
      response += `• Time(s): Morning, afternoon, evening, or specific times\n\n`;
      response += `Example: "Tuesday or Wednesday afternoon" or "Tomorrow at 2 PM"\n\n`;
      response += `💼 I'll coordinate with the owner/agent and get back to you!`;
      
      // Store the context for follow-up
      this.pendingRequests.set(user.phone_number, {
        type: 'preference_collection',
        property: property,
        originalMessage: originalMessage,
        timestamp: new Date()
      });
      
      return [response];
    } catch (error) {
      console.error('Error collecting buyer preferences:', error);
      return ['❌ Error processing your request. Please try again.'];
    }
  }

  /**
   * Process slot selection from buyer/renter
   * @param {string} message - Slot selection message
   * @param {object} user - User object
   * @returns {Promise<Array>} - Response messages
   */
  async processSlotSelection(message, user) {
    try {
      const pendingRequest = this.pendingRequests.get(user.phone_number);
      if (!pendingRequest || pendingRequest.type !== 'slot_selection') {
        return ['🤔 I don\'t have any pending viewing requests from you. Please search for a property first.'];
      }

      // Extract slot number from message
      const slotMatch = message.match(/(\d+)/);
      if (!slotMatch) {
        return ['💡 Please specify the slot number. Example: "I want slot 3" or just "3"'];
      }

      const slotNumber = parseInt(slotMatch[1]);
      const selectedSlot = pendingRequest.availableSlots[slotNumber - 1];

      if (!selectedSlot) {
        return [`❌ Invalid slot number. Please choose between 1 and ${pendingRequest.availableSlots.length}`];
      }

      // Book the appointment
      const appointment = await this.bookAppointment({
        userId: user.id,
        propertyId: pendingRequest.property.id,
        date: selectedSlot.date,
        startTime: selectedSlot.timeSlot.start_time,
        endTime: selectedSlot.timeSlot.end_time,
        timeSlotId: selectedSlot.timeSlot.id // Will be synthetic for dynamic slots
      });

      if (appointment.success) {
        // Notify the owner/agent to get their confirmation
        await this.notifyOwnerAgentForConfirmation(pendingRequest.property, selectedSlot, user, appointment.appointment);

        // Clear pending request from the buyer's side
        this.pendingRequests.delete(user.phone_number);

        return [
          `👍 Great! I've sent your request to the property owner/agent for confirmation.\n\nI will let you know as soon as they respond!`
        ];
      } else {
        return ['❌ Sorry, that time slot is no longer available. Please choose another time.'];
      }

    } catch (error) {
      console.error('Error processing slot selection:', error);
      return ['❌ Error booking your appointment. Please try again.'];
    }
  }

  /**
   * Process buyer time preferences and coordinate with owner/agent
   * @param {string} message - Preference message
   * @param {object} user - User object
   * @returns {Promise<Array>} - Response messages
   */
  async processBuyerPreferences(message, user) {
    try {
      const pendingRequest = this.pendingRequests.get(user.phone_number);
      if (!pendingRequest || pendingRequest.type !== 'preference_collection') {
        return ['🤔 I don\'t have any pending viewing requests from you. Please search for a property first.'];
      }

      // Parse preferences using AI
      const preferences = await this.parseTimePreferences(message);
      
      // Store buyer preferences
      pendingRequest.buyerPreferences = preferences;
      pendingRequest.type = 'coordinating';
      this.pendingRequests.set(user.phone_number, pendingRequest);

      // Contact owner/agent
      await this.contactOwnerAgentForAvailability(pendingRequest.property, preferences, user);

      return [
        `📝 Got it! You prefer: *${preferences.summary}*\n\n⏳ I'm now coordinating with the property owner/agent.\n\n🔔 I'll get back to you within a few hours with available times!\n\n💡 In the meantime, feel free to search for other properties.`
      ];

    } catch (error) {
      console.error('Error processing buyer preferences:', error);
      return ['❌ Error processing your preferences. Please try again.'];
    }
  }

  /**
   * Process buyer response to owner/agent counter-offer during coordination
   * @param {string} message - Buyer's response message
   * @param {object} user - Buyer user object
   * @returns {Promise<Array>} - Response messages
   */
  async processCoordinationResponse(message, user) {
    try {
      const pendingRequest = this.pendingRequests.get(user.phone_number);
      if (!pendingRequest || (pendingRequest.type !== 'awaiting_buyer_confirmation' && pendingRequest.type !== 'coordinating')) {
        return null; // Not in coordination state
      }

      // If still in 'coordinating' state, this might be a response to owner's counter-offer
      // Check if this looks like a confirmation or new preference
      const isConfirmation = await this.isConfirmationMessage(message);
      
      if (isConfirmation.isConfirmation && pendingRequest.type === 'coordinating') {
        // Buyer seems to be confirming something during coordination
        // This could be agreement to a counter-offer from the owner
        // For now, we'll parse this as new preferences and let coordination continue
        const preferences = await this.parseTimePreferences(message);
        
        // Update buyer preferences
        pendingRequest.buyerPreferences = {
          ...pendingRequest.buyerPreferences,
          latestResponse: message,
          summary: `${pendingRequest.buyerPreferences.summary} (confirmed: ${message})`
        };
        pendingRequest.type = 'coordinating';
        this.pendingRequests.set(user.phone_number, pendingRequest);

        // Re-contact owner/agent with confirmation
        await this.contactOwnerAgentForAvailability(pendingRequest.property, pendingRequest.buyerPreferences, user);

        return [
          `✅ Perfect! I've confirmed your availability with the property owner/agent.\n\n📞 They'll get back to us soon with the final confirmation.\n\n💡 I'll let you know as soon as the viewing is confirmed!`
        ];
      }
      
      if (isConfirmation.isConfirmation && pendingRequest.type === 'awaiting_buyer_confirmation') {
        // Buyer confirmed - proceed to book the appointment
        const appointmentDetails = pendingRequest.proposedAppointment;
        
        // Book the appointment using the confirmed details
        const appointment = await this.bookAppointment({
          userId: user.id,
          propertyId: pendingRequest.property.id,
          date: appointmentDetails.date,
          startTime: appointmentDetails.timeFormatted.split(' - ')[0],
          endTime: appointmentDetails.timeFormatted.split(' - ')[1],
          status: 'confirmed' // This booking is pre-confirmed by the agent
        });

        if (appointment.success) {
          // Notify owner/agent of confirmation
          await this.notifyAppointmentConfirmed(pendingRequest.property, appointmentDetails, user);
          
          // Clear pending request
          this.pendingRequests.delete(user.phone_number);

          return [
            `✅ *Viewing Confirmed!*\n\n📍 ${pendingRequest.property.address}\n📅 ${appointmentDetails.dateFormatted}\n⏰ ${appointmentDetails.timeFormatted}\n\n🎉 Great! The property owner/agent has been notified.\n\n📧 You'll both receive calendar invites shortly!`
          ];
        } else {
          return ['❌ Sorry, there was an issue booking the appointment. Please try again.'];
        }
      } else {
        // Check if this is providing new time preferences during coordination
        const hasTimeReference = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:am|pm)|morning|afternoon|evening|noon|\d+\s*(?:am|pm))\b/i.test(message);
        
        if (hasTimeReference) {
          // Treat as new preferences
          const preferences = await this.parseTimePreferences(message);
          
          // Update buyer preferences
          pendingRequest.buyerPreferences = preferences;
          pendingRequest.type = 'coordinating';
          this.pendingRequests.set(user.phone_number, pendingRequest);

          // Contact owner/agent again
          await this.contactOwnerAgentForAvailability(pendingRequest.property, preferences, user);

          return [
            `📝 Got your updated preferences: *${preferences.summary}*\n\n⏳ I'm coordinating with the property owner/agent again.\n\n🔔 I'll get back to you with their availability!`
          ];
        } else {
          // Not a time preference or confirmation - let general conversation handle it
          return null;
        }
      }
    } catch (error) {
      console.error('Error processing coordination response:', error);
      return ['❌ Error processing your response. Please try again.'];
    }
  }

  /**
   * Check if a message is a confirmation (yes, ok, sounds good, etc.)
   * @param {string} message - User's message
   * @returns {Promise<object>} - Confirmation analysis
   */
  async isConfirmationMessage(message) {
    try {
      const systemPrompt = `Analyze if a message is a confirmation/agreement in the context of scheduling a property viewing.

CONFIRMATION INDICATORS:
- "yes", "yeah", "yep", "ok", "okay", "sure", "sounds good"
- "that works", "perfect", "great", "fine with me"
- "confirmed", "confirm", "I agree", "agreed"
- "let's do it", "book it", "schedule it"

REJECTION/NEGOTIATION INDICATORS:
- "no", "not really", "can't do", "doesn't work"
- "actually", "instead", "how about", "prefer"
- "change", "different time", "another time"

Return JSON:
{
  "isConfirmation": boolean,
  "confidence": 0.0-1.0,
  "type": "confirmation|rejection|negotiation"
}

Examples:
- "yeah" → {"isConfirmation": true, "confidence": 0.9, "type": "confirmation"}
- "sounds good" → {"isConfirmation": true, "confidence": 0.85, "type": "confirmation"}  
- "actually 4 PM" → {"isConfirmation": false, "confidence": 0.8, "type": "negotiation"}`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 150
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      return {
        isConfirmation: result.isConfirmation || false,
        confidence: result.confidence || 0.0,
        type: result.type || 'unknown'
      };
    } catch (error) {
      console.error('Error analyzing confirmation message:', error);
      
      // Fallback regex patterns
      const confirmationPatterns = [
        /^(yes|yeah|yep|ok|okay|sure|fine|good|great|perfect|sounds good|that works|confirmed?|agreed?|let'?s do it)$/i,
        /^(👍|✅)$/
      ];
      
      const message_trimmed = message.trim();
      const isConfirmation = confirmationPatterns.some(pattern => pattern.test(message_trimmed));
      
      return {
        isConfirmation: isConfirmation,
        confidence: isConfirmation ? 0.8 : 0.2,
        type: isConfirmation ? 'confirmation' : 'unknown'
      };
    }
  }

  /**
   * Notify owner/agent that appointment has been confirmed
   * @param {object} property - Property object
   * @param {object} appointmentDetails - Appointment details
   * @param {object} buyer - Buyer user object
   */
  async notifyAppointmentConfirmed(property, appointmentDetails, buyer) {
    try {
      const ownerAgent = property.owner || property.agent;
      if (!ownerAgent || !ownerAgent.phone_number) {
        console.warn('No owner/agent contact info for property', property.id);
        return;
      }

      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      const message = `${propertyEmoji} *Viewing Confirmed!*\n\n📍 Property: ${property.address}\n👤 Visitor: Potential buyer/renter\n📅 Date: ${appointmentDetails.dateFormatted}\n⏰ Time: ${appointmentDetails.timeFormatted}\n\n✅ The interested party has confirmed the viewing time.\n\n📧 You'll receive a calendar invite shortly!\n\n💡 Reply "DETAILS" for visitor contact info.`;

      await twilioService.sendWhatsAppMessage(ownerAgent.phone_number, message);
    } catch (error) {
      console.error('Error notifying appointment confirmation:', error);
    }
  }

  /**
   * Book an appointment. Can handle fixed time slots or dynamic time ranges.
   * @param {object} details - The appointment details.
   * @param {string} details.userId - The user's ID.
   * @param {string} details.propertyId - The property's ID.
   * @param {string} details.date - The appointment date.
   * @param {string} details.startTime - The start time.
   * @param {string} details.endTime - The end time.
   * @param {string} [details.timeSlotId] - The optional fixed time slot ID.
   * @returns {Promise<object>} - Booking result
   */
  async bookAppointment({ userId, propertyId, date, startTime, endTime, timeSlotId = null, status = 'pending_owner_approval' }) {
    try {
      // For dynamic slots, the timeSlotId might be synthetic (e.g., 'Monday-14:00') and not a real UUID.
      // We only pass it to the create function if it looks like a real UUID.
      const realTimeSlotId = timeSlotId && timeSlotId.includes('-') && timeSlotId.length > 10 ? timeSlotId : null;

      const appointment = await ViewingAppointment.createAppointment({
        user_id: userId,
        property_id: propertyId,
        appointment_date: date,
        start_time: startTime,
        end_time: endTime,
        viewing_time_slot_id: realTimeSlotId,
        status: status
      });

      return { success: true, appointment };
    } catch (error) {
      console.error('Error booking appointment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generates a calendar invite from a confirmed appointment object.
   * @param {object} appointment - The confirmed appointment object.
   * @returns {string} - The formatted calendar invite message.
   */
  async generateCalendarInviteForAppointment(appointment) {
    try {
      if (!appointment.property_id || !appointment.user_id) {
        throw new Error("Appointment is missing property or user details.");
      }
      
      const property = await Property.findById(appointment.property_id);
      const user = await User.findById(appointment.user_id);
      
      if (!property || !user) {
        throw new Error("Could not retrieve property or user for calendar invite.");
      }

      const now = new Date();
      const appointmentDate = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
      const endDate = new Date(`${appointment.appointment_date}T${appointment.end_time}`);

      const formatICSDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ReAgent Bot//Property Viewing//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${now.getTime()}@reagentbot.com
DTSTAMP:${formatICSDate(now)}
DTSTART:${formatICSDate(appointmentDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:Property Viewing - ${property.address}
DESCRIPTION:Property viewing appointment for ${property.address}.
LOCATION:${property.address}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

      const inviteMessage = `📅 *Calendar Invite*\n\nHere is the data for your calendar event. You can copy the text below and save it as an ".ics" file to add it to your calendar.\n\n\`\`\`\n${icsContent}\n\`\`\``;
      
      return inviteMessage;

    } catch (error) {
      console.error('Error generating calendar invite from appointment:', error);
      return '📅 Could not generate calendar invite data for this appointment.';
    }
  }

  /**
   * Asks the owner/agent to confirm a new viewing request.
   * @param {object} property - Property object
   * @param {object} slot - Selected time slot
   * @param {object} buyer - Buyer user object
   * @param {object} appointment - The created appointment object
   */
  async notifyOwnerAgentForConfirmation(property, slot, buyer, appointment) {
    try {
      const ownerAgent = property.owner || property.agent;
      if (!ownerAgent || !ownerAgent.phone_number) {
        console.warn('No owner/agent contact info for property', property.id);
        return;
      }

      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      const message = `${propertyEmoji} *New Viewing Request*\n\n📍 Property: ${property.address}\n👤 A potential buyer/renter is interested.\n📅 Date: ${slot.dateFormatted}\n⏰ Time: ${slot.timeFormatted}\n\n*Please reply to this message to confirm, decline, or suggest a new time.*\n\nExamples:\n- "Confirm ${appointment.id.substring(0, 4)}"\n- "Decline ${appointment.id.substring(0, 4)}"\n- "Suggest Tuesday at 3pm for ${appointment.id.substring(0, 4)}"`;

      await twilioService.sendWhatsAppMessage(ownerAgent.phone_number, message);
    } catch (error) {
      console.error('Error notifying owner/agent for confirmation:', error);
    }
  }

  /**
   * Notify owner/agent about viewing request
   * @param {object} property - Property object
   * @param {object} slot - Selected time slot
   * @param {object} buyer - Buyer user object
   */
  async notifyOwnerAgent(property, slot, buyer) {
    try {
      const ownerAgent = property.owner || property.agent;
      if (!ownerAgent || !ownerAgent.phone_number) {
        console.warn('No owner/agent contact info for property', property.id);
        return;
      }

      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      const message = `${propertyEmoji} *New Viewing Request*\n\n📍 Property: ${property.address}\n👤 Interested Party: Potential buyer/renter\n📅 Date: ${slot.dateFormatted}\n⏰ Time: ${slot.timeFormatted}\n\n✅ The viewing has been confirmed automatically.\n📧 You'll receive a calendar invite shortly.\n\n💡 Reply "CANCEL" if you need to reschedule.`;

      await twilioService.sendWhatsAppMessage(ownerAgent.phone_number, message);
    } catch (error) {
      console.error('Error notifying owner/agent:', error);
    }
  }

  /**
   * Contact owner/agent for availability when no pre-set times
   * @param {object} property - Property object
   * @param {object} preferences - Buyer preferences
   * @param {object} buyer - Buyer user object
   */
  async contactOwnerAgentForAvailability(property, preferences, buyer) {
    try {
      const ownerAgent = property.owner || property.agent;
      if (!ownerAgent || !ownerAgent.phone_number) {
        console.warn('No owner/agent contact info for property', property.id);
        return;
      }

      const propertyEmoji = this.getPropertyEmoji(property.property_type);
      const message = `${propertyEmoji} *Viewing Request*\n\n📍 Property: ${property.address}\n👤 Interested Party: Potential buyer/renter\n\n🗓️ *Their Preferences:*\n${preferences.summary}\n\n❓ *When are you available for a viewing?*\n\nPlease reply with your available times, for example:\n"Tuesday 2-4 PM" or "Wednesday morning"\n\n⏰ I'll coordinate with the interested party!`;

      await twilioService.sendWhatsAppMessage(ownerAgent.phone_number, message);
    } catch (error) {
      console.error('Error contacting owner/agent:', error);
    }
  }

  /**
   * Generate ICS calendar invite
   * @param {object} property - Property object
   * @param {object} slot - Time slot object
   * @param {object} attendee1 - First attendee
   * @param {object} attendee2 - Second attendee
   * @returns {string} - ICS calendar content
   */
  async generateCalendarInvite(property, slot, attendee1, attendee2) {
    try {
      const now = new Date();
      const appointmentDate = new Date(slot.date + 'T' + slot.timeSlot.start_time);
      const endDate = new Date(slot.date + 'T' + slot.timeSlot.end_time);
      
      // Format dates for ICS (YYYYMMDDTHHMMSSZ)
      const formatICSDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };

      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ReAgent Bot//Property Viewing//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${now.getTime()}@reagentbot.com
DTSTAMP:${formatICSDate(now)}
DTSTART:${formatICSDate(appointmentDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:Property Viewing - ${property.address}
DESCRIPTION:Property viewing appointment\\n\\nProperty: ${property.address}\\nType: ${property.property_type}\\nPrice: €${property.price}\\n\\nAttendees: Potential buyer/renter and property representative
LOCATION:${property.address}
STATUS:CONFIRMED
TRANSP:OPAQUE
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Property viewing in 15 minutes
END:VALARM
END:VEVENT
END:VCALENDAR`;

      const inviteMessage = `📅 *Calendar Invite Details*\n\nHere is the calendar event data. You can copy the text below and save it as an ".ics" file to import it into your calendar.\n\n\`\`\`\n${icsContent}\n\`\`\``;

      return inviteMessage;
      
    } catch (error) {
      console.error('Error generating calendar invite:', error);
      return '📅 Could not generate calendar invite data. The appointment is confirmed in our system.';
    }
  }

  /**
   * Parse time preferences using AI
   * @param {string} message - User's preference message
   * @returns {Promise<object>} - Parsed preferences
   */
  async parseTimePreferences(message) {
    try {
      const systemPrompt = `Parse viewing time preferences from user message. Extract:
- Preferred days (Monday, Tuesday, etc.)
- Preferred times (morning, afternoon, specific times)
- Flexibility level
- Urgency

Return JSON: {
  "days": ["monday", "tuesday"],
  "times": ["afternoon", "2pm"],
  "flexibility": "high|medium|low", 
  "urgency": "high|medium|low",
  "summary": "Tuesday or Wednesday afternoon"
}`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      console.error('Error parsing time preferences:', error);
      return {
        days: [],
        times: [],
        flexibility: 'high',
        urgency: 'medium',
        summary: message
      };
    }
  }

  /**
   * Check if message is an appointment-related request using AI intelligence
   * @param {string} message - User's message
   * @returns {Promise<object>} - Request analysis
   */
  async isAppointmentRequest(message) {
    try {
      const systemPrompt = `You are an intelligent appointment intent detector for a real estate system. Analyze if a user message expresses interest in viewing/visiting a property.

CRITICAL APPOINTMENT PATTERNS TO DETECT:
- "interested in number X" / "interest in number X" → VIEWING REQUEST for property X
- "i want to visit number X" / "visit property X" → VIEWING REQUEST  
- "i like to visit it" / "i need to visit it" → VIEWING REQUEST
- "interested in viewing/visiting/seeing" → VIEWING REQUEST
- "book a viewing", "schedule a visit", "arrange a tour" → BOOKING REQUEST
- "when can I see", "available times" → TIME INQUIRY
- "I want to visit", "can I see this property" → DIRECT REQUEST

HANDLE TYPOS & VARIATIONS INTELLIGENTLY:
- "interest" = "interested" (common typo)
- "visitng" = "visiting"  
- "intrested" = "interested"
- "vist" = "visit"
- "numbre" = "number"

CONTEXT UNDERSTANDING:
- In real estate context, ANY expression of "interest" is likely viewing intent
- "number X" clearly refers to property X in search results
- "this", "that", "it" = contextual property references

EXAMPLES THAT SHOULD BE DETECTED:
✅ "i am interest in number 3" → YES (0.9 confidence, viewing request)
✅ "interested in visiting this" → YES (0.9 confidence)
✅ "i like to visit it" → YES (0.85 confidence)
✅ "want to see property 5" → YES (0.9 confidence)
✅ "can i view this place" → YES (0.85 confidence)
✅ "book viewing for number 2" → YES (0.95 confidence)

❌ "tell me about apartments" → NO (0.1 confidence, just inquiry)
❌ "what's the price" → NO (0.1 confidence, price inquiry)

Return JSON:
{
  "isAppointmentRequest": boolean,
  "confidence": 0.0-1.0,
  "intentType": "viewing|booking|inquiry",
  "hasContextualReference": boolean,
  "keywords": ["detected", "keywords"]
}

IMPORTANT: Be liberal with appointment detection in real estate context. If someone expresses ANY interest in a property, it's likely a viewing request.`;

      const response = await openaiService.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze for appointment intent: "${message}"` }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const result = JSON.parse(cleanContent);
      
      console.log(`📅 [APPOINTMENT] Intent analysis for "${message}":`, result);
      
      return {
        isAppointmentRequest: result.isAppointmentRequest || false,
        confidence: result.confidence || 0.0,
        intentType: result.intentType || 'inquiry',
        hasContextualReference: result.hasContextualReference || false,
        keywords: result.keywords || []
      };
    } catch (error) {
      console.error('Error detecting appointment intent:', error);
      
      // Enhanced fallback regex patterns for common appointment requests
      const appointmentPatterns = [
        /(?:interest|interested)\s+in\s+(?:number\s+\d+|visiting|viewing|seeing)/i,
        /(?:want|like|need)\s+to\s+(?:visit|view|see)\s+(?:it|this|that|number\s+\d+)/i,
        /(?:book|schedule)\s+(?:viewing|visit|appointment)/i,
        /(?:view|visit|see)\s+(?:property|number)\s+\d+/i,
        /can\s+i\s+(?:see|visit|view)/i,
        /interested\s+in\s+(?:this|that)/i,
        /viewing\s+appointment/i
      ];
      
      const message_lower = message.toLowerCase();
      const hasAppointmentPattern = appointmentPatterns.some(pattern => pattern.test(message_lower));
      
      return {
        isAppointmentRequest: hasAppointmentPattern,
        confidence: hasAppointmentPattern ? 0.8 : 0.1,
        intentType: hasAppointmentPattern ? 'viewing' : 'inquiry',
        hasContextualReference: /\b(this|that|it)\b/i.test(message),
        keywords: hasAppointmentPattern ? ['fallback_pattern_match'] : []
      };
    }
  }

  // Utility methods
  getPropertyEmoji(propertyType) {
    const emojis = {
      'apartment': '🏢',
      'house': '🏠',
      'commercial': '🏢',
      'land': '🌳'
    };
    return emojis[propertyType] || '🏠';
  }

  groupSlotsByDate(slots) {
    return slots.reduce((groups, slot) => {
      if (!groups[slot.date]) {
        groups[slot.date] = [];
      }
      groups[slot.date].push(slot);
      return groups;
    }, {});
  }

  /**
   * Clean up expired pending requests (called periodically)
   */
  cleanupExpiredRequests() {
    const now = new Date();
    const expiredThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [phone, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > expiredThreshold) {
        this.pendingRequests.delete(phone);
      }
    }
  }
}

module.exports = new AppointmentService(); 