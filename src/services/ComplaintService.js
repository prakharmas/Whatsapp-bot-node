// 🔴 CRM API (HTTP) disabled — using direct MySQL insert instead
// const axios = require('axios');
const mysql = require('mysql2/promise');
const { ComplaintSession } = require('../models/ComplaintModel');
const WhatsAppService = require('./WhatsAppService');

// 🔴 CRM API HTTP endpoint (commented out — kept for reference)
// const CRM_API_URL = process.env.CRM_API_URL || 'https://crmapi.dialdesk.in/bot/webhook-api';
const CRM_AUTH_TOKEN = process.env.CRM_AUTH_TOKEN || 'Njg3fDBiYzc1NmIyMTVkY2NkOGE5NjBlNDhkODY2ZWQ4MDJhYTVjYzNiMmFhYmQ2NTVmZmMzYTUxODVkODI0MzkxNGM=';

// 🔥 Direct MySQL connection (replaces CRM webhook API)
const SQL_DB_URL = process.env.SQL_DB_URL || 'mysql+pymysql://root:dial%40mas123@192.168.10.12/db_dialdesk?charset=utf8mb4';

function parseSqlDbUrl(url) {
    const match = url.match(/mysql(?:\+\w+)?:\/\/([^:]+):([^@]+)@([^/]+)\/([^?#]+)/);
    if (!match) {
        throw new Error(`[COMPLAINT] Invalid SQL_DB_URL format: ${url}`);
    }
    return {
        user: match[1],
        password: decodeURIComponent(match[2]),
        host: match[3],
        database: match[4]
    };
}

const dbConfig = parseSqlDbUrl(SQL_DB_URL);
const dbPool = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10
});

const FIELD_DEFINITIONS = [
    { key: 'name', label: 'Name', prompt: 'Please share your full name.' },
    { key: 'contact_number', label: 'Contact Number', prompt: 'Please share your contact number (10 digits).' },
    { key: 'issue', label: 'Issue', prompt: 'Please describe the issue you are facing.' },
    { key: 'pin_code', label: 'Pin Code', prompt: 'Please share your PIN code (6 digits).' },
    { key: 'city', label: 'City', prompt: 'Please share your city.' },
    { key: 'state', label: 'State', prompt: 'Please share your state.' }
];

const CANCEL_PATTERN = /^(cancel|cancel karo|cancel kar do)$/i;
const COMPLAINT_PATTERN = /\bcomplai[a-z]*\b|\bshikayat\b|\bshikayt\b/i;

class ComplaintService {
    constructor() {
        // 🔴 CRM API HTTP endpoint disabled
        // this.crmApiUrl = CRM_API_URL;
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
            status: 'collecting'
        }).sort({ createdAt: -1 });
    }

    async startComplaint(vendorId, phoneNumber) {
        await ComplaintSession.updateMany(
            { vendor_id: vendorId, phone_number: phoneNumber, status: 'collecting' },
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
        const payload = {
            'Name': session.fields.name,
            'Contact Number': session.fields.contact_number,
            'Issue': session.fields.issue,
            'Pin Code': session.fields.pin_code,
            'City': session.fields.city,
            'State': session.fields.state
        };

        const MAX_ATTEMPTS = 1;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                if (attempt === 1) {
                    await this.send(session.vendor_id, session.phone_number, 'Please wait, registering your complaint...');
                }

                // 🔴 OLD: HTTP call to CRM API (disabled)
                // const response = await axios.post(this.crmApiUrl, payload, {
                //     headers: {
                //         'Content-Type': 'application/json',
                //         'Auth-Token': this.crmAuthToken
                //     },
                //     timeout: 30000
                // });
                // const data = response.data;
                // const srNumber = data['In Call Id'] || data.in_call_id || data.inCallId || data.sr_number || '';

                // 🔥 NEW: Direct MySQL insert (same logic as FastAPI /webhook-api)
                const srNumber = await this.insertCallToCrm(payload);

                session.status = 'submitted';
                session.in_call_id = String(srNumber);
                session.crm_response = { status: 'success', message: 'Data inserted successfully', 'In Call Id': srNumber };
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
                return;
            } catch (error) {
                lastError = error;
                console.error(`[COMPLAINT] CRM submission attempt ${attempt}/${MAX_ATTEMPTS} failed:`, error.message);
                if (attempt < MAX_ATTEMPTS) {
                    await this.sleep(attempt * 2000);
                }
            }
        }

        session.status = 'failed';
        session.error_message = lastError ? lastError.message : 'Unknown error';
        await session.save();

        console.error(`[COMPLAINT] Complaint NOT raised for ${session.phone_number}: ${this.classifyError(lastError)}`);
        await this.send(
            session.vendor_id,
            session.phone_number,
            'Sorry, your complaint could not be raised right now. Please try again after some time.'
        );
    }

    classifyError(error) {
        if (!error) return 'unknown error';
        if (error.response) return `CRM server error (HTTP ${error.response.status})`;
        if (error.code === 'ECONNABORTED') return 'connection timeout';
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') return 'host not reachable';
        if (error.code === 'ECONNREFUSED') return 'connection refused';
        if (error.code === 'ETIMEDOUT') return 'connection timed out';
        return 'network issue';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 🔥 Direct MySQL insert — replicates FastAPI /webhook-api logic
    async insertCallToCrm(data) {
        const connection = await dbPool.getConnection();
        try {
            const clientId = this.getClientId();

            // 1. Fetch field mappings (bot_integration_fields -> field ids)
            const [mappings] = await connection.query(
                'SELECT field FROM bot_integration_fields WHERE client_id = ?',
                [clientId]
            );

            const fieldNumbers = {};
            for (const m of mappings) {
                const fieldId = m.field;
                const fieldNumber = String(fieldId).replace('Field', '');
                const [rows] = await connection.query(
                    'SELECT FieldName FROM field_master WHERE ClientId = ? AND fieldNumber = ? LIMIT 1',
                    [clientId, fieldNumber]
                );
                if (rows.length > 0) {
                    fieldNumbers[String(rows[0].FieldName).trim()] = fieldId;
                }
            }

            // 2. Alias mapping (same as PHP)
            const alias = {
                'distributor_code': 'Distributor ID/Name',
                'delivery_issue': 'Delivery Issue Details',
                'quality_issue': 'Quality Issue Details',
                'sales_response_issue': 'Sales Team Response',
                'backend_support_issue': 'Backend Support',
                'material_availability_issue': 'Material Availability',
                'claim_payout_issue': 'Claim Payout',
                'partnership_issue': 'Overall Satisfaction'
            };

            const mappedData = {};
            for (const [fieldName, value] of Object.entries(data)) {
                const key = fieldName.toLowerCase().trim();
                let mappedFieldName = fieldName;
                if (alias[key]) {
                    mappedFieldName = alias[key];
                }

                if (fieldNumbers[mappedFieldName] !== undefined) {
                    let v = value;
                    if (typeof v === 'object' && v !== null) {
                        v = this.flattenDict(v);
                    }
                    mappedData[fieldNumbers[mappedFieldName]] = String(v).replace(/'/g, "\\'");
                }

                if (mappedFieldName.toLowerCase().startsWith('category')) {
                    mappedData[mappedFieldName] = String(value).replace(/'/g, "\\'");
                }
            }

            // 3. Get next SR number
            let srno = await this.getNextSrNo(connection, clientId);
            const now = this.formatNow();

            // 4. Static columns/values
            const staticColumns = [
                'clientid', 'TagType', 'SrNo', 'SrNo2',
                'LeadId', 'CallDate', 'AgentId',
                'CallType', 'escalation_no', 'bot_tagging'
            ];
            const staticValues = [
                clientId, 'Bot Integration', srno, srno,
                '0', now, '0', 'WhatsApp', '0', '1'
            ];

            const columns = staticColumns.concat(Object.keys(mappedData));
            const values = staticValues.concat(Object.values(mappedData));
            const insertSql = `INSERT INTO call_master (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;

            try {
                await connection.query(insertSql, values);
            } catch (error) {
                // 🔁 Retry same as PHP: recompute srno and insert again
                console.warn('[COMPLAINT] call_master insert failed, retrying with new SrNo:', error.message);
                srno = await this.getNextSrNo(connection, clientId);
                staticValues[2] = srno;
                staticValues[3] = srno;
                const retryValues = staticValues.concat(Object.values(mappedData));
                await connection.query(insertSql, retryValues);
            }

            // 5. SMS text
            const [smsRows] = await connection.query(
                `SELECT smsText FROM tbl_sms
                 WHERE clientId = ? AND sendType = '0' AND alertType = 'Alert'
                 AND (category = 'Whatsapp' OR category = 'All')
                 LIMIT 1`,
                [clientId]
            );
            const smsText = smsRows.length ? smsRows[0].smsText : '';

            // 6. Matrix -> cron jobs
            const [matrixRows] = await connection.query(
                `SELECT alertType, alertOn, personName, email, mobileno, tat
                 FROM tbl_matrix
                 WHERE clientId = ?
                 AND (categoryName = 'Whatsapp' OR categoryName = 'All')`,
                [clientId]
            );

            for (const m of matrixRows) {
                await connection.query(
                    `INSERT INTO crone_job
                     (clientId, bpo, data_id, alertType, alertOn, personName,
                      email, mobileNo, tat, msg, createdate)
                     VALUES (?, '0', ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [clientId, srno, m.alertType, m.alertOn, m.personName, m.email, m.mobileno, m.tat, smsText]
                );
            }

            console.log(`[COMPLAINT] MySQL insert OK: client=${clientId}, srno=${srno}`);
            return srno;
        } finally {
            connection.release();
        }
    }

    async getNextSrNo(connection, clientId) {
        const [rows] = await connection.query(
            'SELECT MAX(SrNo) as srno FROM call_master WHERE ClientId = ?',
            [clientId]
        );
        return (rows[0]?.srno || 0) + 1;
    }

    // Decode Auth-Token: base64("clientId|signature") -> client_id
    getClientId() {
        try {
            const decoded = Buffer.from(this.crmAuthToken, 'base64').toString('utf8');
            const clientId = parseInt(decoded.split('|')[0], 10);
            if (!clientId) {
                throw new Error('Could not extract client_id from Auth-Token');
            }
            console.log(`[COMPLAINT] Auth-Token -> client_id: ${clientId}`);
            return clientId;
        } catch (error) {
            throw new Error(`Invalid Auth-Token: ${error.message}`);
        }
    }

    flattenDict(obj, prefix = '') {
        let out = {};
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                out = { ...out, ...this.flattenDict(v, key) };
            } else {
                out[key] = v;
            }
        }
        return out;
    }

    formatNow() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
