const axios = require('axios');
const { ComplaintSession } = require('../models/ComplaintModel');
const WhatsAppService = require('./WhatsAppService');

const CRM_API_URL = process.env.CRM_API_URL || 'https://crmapi.dialdesk.in/bot/webhook-api';
const CRM_AUTH_TOKEN = process.env.CRM_AUTH_TOKEN || 'Njg3fDBiYzc1NmIyMTVkY2NkOGE5NjBlNDhkODY2ZWQ4MDJhYTVjYzNiMmFhYmQ2NTVmZmMzYTUxODVkODI0MzkxNGM=';

const FIELD_DEFINITIONS = [
    { key: 'name', label: 'Name', prompt: 'Please share your full name.' },
    { key: 'contact_number', label: 'Contact Number', prompt: 'Please share your contact number (10 digits).' },
    { key: 'email', label: 'Email', prompt: 'Please share your email address.' },
    { key: 'pin_code', label: 'Pin Code', prompt: 'Please share your PIN code (6 digits).' },
    { key: 'city', label: 'City', prompt: 'Please share your city.' },
    { key: 'state', label: 'State', prompt: 'Please share your state.' }
];

const CANCEL_PATTERN = /^(cancel|cancel karo|cancel kar do)$/i;
const RETRY_PATTERN = /^r$/i;
const COMPLAINT_PATTERN = /\bcomplai[a-z]*\b|\bshikayat\b|\bshikayt\b/i;

class ComplaintService {
    constructor() {
        this.crmApiUrl = CRM_API_URL;
        this.crmAuthToken = CRM_AUTH_TOKEN;
    }

    async handleMessage(vendor, phoneNumber, messageText) {
        const vendorId = vendor.vendor_id;
        const session = await this.getActiveSession(vendorId, phoneNumber);
        const isCancel = CANCEL_PATTERN.test(messageText.trim());
        const isComplaint = COMPLAINT_PATTERN.test(messageText);

        let handled = false;

        if (!session) {
            if (isComplaint) {
                const newSession = await this.startComplaint(vendorId, phoneNumber);
                await this.sendFirstPrompt(newSession);
                handled = true;
            }
        } else if (session.status === 'collecting') {
            handled = true;
            if (isCancel) {
                await this.cancelSession(session);
            } else {
                await this.processField(session, messageText);
            }
        } else if (session.status === 'ready') {
            handled = true;
            if (isCancel) {
                await this.cancelSession(session);
            } else if (RETRY_PATTERN.test(messageText.trim())) {
                await this.submitComplaint(session);
            } else {
                await this.send(vendorId, phoneNumber, 'Sorry, the complaint could not be registered earlier. Please reply R to try again.');
            }
        }

        if (handled) {
            await this.logMessage(vendorId, phoneNumber, 'user', messageText);
        }
        return handled;
    }

    async getActiveSession(vendorId, phoneNumber) {
        return ComplaintSession.findOne({
            vendor_id: vendorId,
            phone_number: phoneNumber,
            status: { $in: ['collecting', 'ready'] }
        }).sort({ createdAt: -1 });
    }

    async startComplaint(vendorId, phoneNumber) {
        await ComplaintSession.updateMany(
            { vendor_id: vendorId, phone_number: phoneNumber, status: { $in: ['collecting', 'ready'] } },
            { status: 'cancelled', cancelled_at: new Date() }
        );

        const session = new ComplaintSession({
            vendor_id: vendorId,
            phone_number: phoneNumber,
            status: 'collecting',
            current_step: 0
        });
        await session.save();
        return session;
    }

    async cancelSession(session) {
        session.status = 'cancelled';
        session.cancelled_at = new Date();
        await session.save();
        await this.send(session.vendor_id, session.phone_number, 'Complaint registration has been cancelled.');
    }

    async sendFirstPrompt(session) {
        const field = this.getCurrentField(session);
        const message = `I'm sorry to hear about the issue. Let me register your complaint.\n\n${field.prompt}`;
        await this.send(session.vendor_id, session.phone_number, message);
    }

    async processField(session, messageText) {
        const field = this.getCurrentField(session);
        const validation = this.validateField(field.key, messageText.trim());

        if (!validation.valid) {
            await this.send(session.vendor_id, session.phone_number, validation.message);
            return;
        }

        session.fields[field.key] = validation.value;
        session.current_step += 1;

        if (session.current_step >= FIELD_DEFINITIONS.length) {
            session.status = 'ready';
            await session.save();
            await this.submitComplaint(session);
        } else {
            await session.save();
            await this.sendFieldPrompt(session);
        }
    }

    validateField(key, value) {
        switch (key) {
            case 'contact_number': {
                const digits = value.replace(/\D/g, '');
                const normalized = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
                if (normalized.length !== 10 || !/^[6-9]\d{9}$/.test(normalized)) {
                    return { valid: false, message: 'Please enter a valid 10-digit mobile number.' };
                }
                return { valid: true, value: normalized };
            }
            case 'email': {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
                    return { valid: false, message: 'Please enter a valid email address.' };
                }
                return { valid: true, value };
            }
            case 'pin_code': {
                const digits = value.replace(/\D/g, '');
                if (digits.length !== 6) {
                    return { valid: false, message: 'Please enter a valid 6-digit PIN code.' };
                }
                return { valid: true, value: digits };
            }
            default:
                if (!value) {
                    return { valid: false, message: 'This field cannot be empty. Please try again.' };
                }
                return { valid: true, value };
        }
    }

    getCurrentField(session) {
        return FIELD_DEFINITIONS[session.current_step] || FIELD_DEFINITIONS[FIELD_DEFINITIONS.length - 1];
    }

    async sendFieldPrompt(session) {
        const field = this.getCurrentField(session);
        await this.send(session.vendor_id, session.phone_number, field.prompt);
    }

    async submitComplaint(session) {
        try {
            await this.send(session.vendor_id, session.phone_number, 'Please wait, registering your complaint...');

            const payload = {
                'Name': session.fields.name,
                'Contact Number': session.fields.contact_number,
                'Email': session.fields.email,
                'Pin Code': session.fields.pin_code,
                'City': session.fields.city,
                'State': session.fields.state
            };

            const response = await axios.post(this.crmApiUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Auth-Token': this.crmAuthToken
                },
                timeout: 30000
            });

            const data = response.data;
            const srNumber = data['In Call Id'] || data.in_call_id || data.inCallId || data.sr_number || '';

            session.status = 'submitted';
            session.in_call_id = String(srNumber);
            session.crm_response = data;
            session.error_message = null;
            session.submitted_at = new Date();
            await session.save();

            let reply = '✅ Your complaint has been raised successfully.';
            if (srNumber) {
                reply += `\n\nYour SR number is: ${srNumber}`;
            }
            reply += '\nOur team will contact you shortly.';
            await this.send(session.vendor_id, session.phone_number, reply);

            console.log(`[COMPLAINT] Complaint raised for ${session.phone_number}, SR number: ${srNumber}`);
        } catch (error) {
            session.status = 'ready';
            session.error_message = error.message;
            await session.save();
            console.error('[COMPLAINT] CRM submission failed:', error.message);

            await this.send(
                session.vendor_id,
                session.phone_number,
                'Sorry, we could not register your complaint right now. Please reply R to try again.'
            );
        }
    }

    async send(vendorId, phoneNumber, text) {
        await WhatsAppService.sendMessage(phoneNumber, text, vendorId);
        await this.logMessage(vendorId, phoneNumber, 'bot', text);
    }

    async logMessage(vendorId, phoneNumber, messageType, content) {
        try {
            const { createOrGetChatroom, saveMessage } = require('../models/database');
            const chatroom = await createOrGetChatroom(vendorId, 1, 1, phoneNumber, phoneNumber);
            await saveMessage(vendorId, chatroom._id, messageType, content, phoneNumber);
        } catch (error) {
            console.error('[COMPLAINT] Error logging message:', error.message);
        }
    }
}

module.exports = new ComplaintService();
