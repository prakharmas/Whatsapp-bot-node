const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Simple in-memory cache for agent contexts
const agentContextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Vendor Schema
const vendorSchema = new mongoose.Schema({
    vendor_id: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    company_name: { type: String, required: true },
    phone: { type: String },
    whatsapp_phone_id: { type: String },
    whatsapp_access_token: { type: String },
    webhook_verify_token: { type: String },
    whatsapp_app_secret: { type: String },
    business_id: { type: Number, default: 1 }, // Default business_id for SaaS
    agent_id: { type: Number, default: 1 }, // Default agent_id
    is_active: { type: Boolean, default: true }
}, {
    timestamps: true
});



// Hash password before saving
vendorSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
vendorSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Chatroom Schema (Updated)
const chatroomSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    business_id: { type: Number, required: true },
    agent_id: { type: Number, required: true },
    thread_id: { type: String, required: true },
    phone_number: { type: String, required: true },
    // MVP: SLA Management & Tagging
    status: { type: String, enum: ['new', 'pending', 'overdue', 'closed'], default: 'new' },
    manually_closed: { type: Boolean, default: false },
    closed_reason: { type: String, enum: ['manual', 'auto_resolution', 'auto_inactivity'] },
    closed_at: { type: Date },
    tags: [{ type: String }],
    sla_deadline: { type: Date },
    // Feedback State Tracking
    feedback_state: {
        awaiting_feedback: { type: Boolean, default: false },
        feedback_request_id: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedbackRequest' },
        feedback_sent_at: { type: Date },
        feedback_expires_at: { type: Date }
    }
}, {
    timestamps: true
});

// Compound unique index for vendor_id + thread_id
chatroomSchema.index({ vendor_id: 1, thread_id: 1 }, { unique: true });

// Message Schema (Updated)
const messageSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatroom', required: true },
    message_type: { type: String, enum: ['user', 'bot'], required: true },
    content: { type: String, required: true },
    media_type: { type: String, enum: ['image', 'audio', 'video', 'document'] },
    media_url: { type: String },
    whatsapp_message_id: { type: String },
    phone_number: { type: String, required: true },
    // Enhanced Media Analysis
    media_analysis: {
        type: { type: String, enum: ['pdf', 'image', 'audio'] },
        extracted_text: { type: String },
        analysis_summary: { type: String },
        key_details: {
            amount: { type: String },
            date: { type: String },
            company: { type: String },
            document_type: { type: String },
            service_type: { type: String },
            due_date: { type: String },
            account_number: { type: String }
        },
        file_info: {
            original_name: { type: String },
            file_size: { type: Number },
            mime_type: { type: String }
        },
        verification: {
            authenticity_score: { type: Number, min: 0, max: 10 },
            verification_status: { type: String, enum: ['GENUINE', 'SUSPICIOUS', 'FAKE', 'UNKNOWN'] },
            issues_found: [{ type: String }]
        }
    },
    // MVP: Conversation Intelligence
    intent: { type: String, enum: ['query', 'complaint', 'need_action', 'feedback'] },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
    summary: { type: String },
    // AI Resolution Analysis
    resolution_analysis: {
        resolved: { type: Boolean, default: false },
        confidence: { type: Number, min: 0, max: 1, default: 0 },
        reason: { type: String },
        resolution_type: { 
            type: String, 
            enum: ['direct_answer', 'partial_answer', 'escalation_needed', 'information_provided', 'no_resolution'],
            default: 'no_resolution'
        },
        analyzed_at: { type: Date }
    }
}, {
    timestamps: true
});

// Agent Context Schema (Updated)
const agentContextSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    business_id: { type: Number, required: true },
    agent_id: { type: Number, default: 1 },
    name: { type: String, required: true },
    context: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: 'system' },
    updated_by: { type: String, default: 'system' }
}, {
    timestamps: true
});

// Conversation Window Tracking Schema
const conversationWindowSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    phone_number: { type: String, required: true },
    first_message_at: { type: Date, required: true },
    last_message_at: { type: Date, required: true },
    current_window: { 
        type: String, 
        enum: ['new_user_4h', 'existing_user_20h', 'existing_user_24h+'], 
        required: true 
    },
    window_expires_at: { type: Date }
}, {
    timestamps: true
});

// Pricing Configuration Schema
const pricingConfigSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, unique: true },
    // Time-based markup percentages
    new_user_4h_markup: { type: Number, default: 50 }, // 50%
    existing_user_20h_markup: { type: Number, default: 30 }, // 30%
    existing_user_24h_markup: { type: Number, default: 20 }, // 20%
    // Base AI service costs (USD)
    gpt4_mini_input_price: { type: Number, default: 0.00015 }, // per 1K tokens
    gpt4_mini_output_price: { type: Number, default: 0.0006 }, // per 1K tokens
    whisper_price_per_minute: { type: Number, default: 0.006 }, // per minute
    vision_input_price: { type: Number, default: 0.00015 }, // per 1K tokens (same as GPT-4o-mini)
    vision_output_price: { type: Number, default: 0.0006 } // per 1K tokens
}, {
    timestamps: true
});

// Vendor Wallet Schema
const vendorWalletSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, unique: true },
    balance_usd_micro: { type: Number, default: 0 }, // Stored in micro-dollars (1/1,000,000) for precision
    last_updated: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Usage Record Schema
const usageRecordSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    phone_number: { type: String, required: true },
    message_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    conversation_window: { 
        type: String, 
        enum: ['new_user_4h', 'existing_user_20h', 'existing_user_24h+'], 
        required: true 
    },
    
    // AI Service Usage
    services_used: [{
        service_type: { 
            type: String, 
            enum: ['sentiment', 'intent', 'vision', 'stt', 'agent_process', 'resolution_analysis', 'pdf_analysis', 'bill_verification'], 
            required: true 
        },
        model_name: { type: String, required: true },
        prompt_tokens: { type: Number, default: 0 },
        completion_tokens: { type: Number, default: 0 },
        total_tokens: { type: Number, default: 0 },
        duration_seconds: { type: Number, default: 0 },
        base_cost_usd_micro: { type: Number, required: true }
    }],
    
    // Billing Calculation
    total_base_cost_usd_micro: { type: Number, required: true },
    markup_percentage: { type: Number, required: true },
    markup_amount_usd_micro: { type: Number, required: true },
    final_cost_usd_micro: { type: Number, required: true },
    
    charged_at: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Exchange Rate Schema
const exchangeRateSchema = new mongoose.Schema({
    from_currency: { type: String, required: true, default: 'INR' },
    to_currency: { type: String, required: true, default: 'USD' },
    rate: { type: Number, required: true }, // 1 USD = X INR
    updated_at: { type: Date, default: Date.now },
    updated_by: { type: String, default: 'system' }
}, {
    timestamps: true
});

// Wallet Transaction Schema
const walletTransactionSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    transaction_type: { type: String, enum: ['credit', 'debit'], required: true },
    amount_inr: { type: Number, required: true }, // Amount in INR
    amount_usd_micro: { type: Number, required: true }, // Amount in micro-dollars
    exchange_rate: { type: Number, required: true }, // Rate used for conversion
    description: { type: String, required: true },
    added_by: { type: String, required: true }, // Admin who added
    reference_id: { type: String } // For tracking
}, {
    timestamps: true
});



// Upload Batch Schema (tracks each file upload)
const uploadBatchSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    filename: { type: String, required: true },
    original_name: { type: String, required: true },
    file_type: { type: String, enum: ['csv', 'xlsx', 'xls'], required: true },
    columns: [{ type: String }],
    total_rows: { type: Number, default: 0 },
    success_rows: { type: Number, default: 0 },
    error_rows: { type: Number, default: 0 },
    errors: [{ row: Number, message: String }],
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' }
}, {
    timestamps: true
});

// Contact Upload Schema (individual contacts from uploaded files)
const contactUploadSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    batch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadBatch', required: true },
    row_number: { type: Number },
    fields: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['valid', 'invalid', 'duplicate'], default: 'valid' },
    validation_errors: [{ type: String }]
}, {
    timestamps: true
});

contactUploadSchema.index({ vendor_id: 1, batch_id: 1 });

const Vendor = mongoose.model('Vendor', vendorSchema);
const UploadBatch = mongoose.model('UploadBatch', uploadBatchSchema);
const ContactUpload = mongoose.model('ContactUpload', contactUploadSchema);
const Chatroom = mongoose.model('Chatroom', chatroomSchema);
const Message = mongoose.model('Message', messageSchema);
const AgentContext = mongoose.model('AgentContext', agentContextSchema);
const ConversationWindow = mongoose.model('ConversationWindow', conversationWindowSchema);
const PricingConfig = mongoose.model('PricingConfig', pricingConfigSchema);
const VendorWallet = mongoose.model('VendorWallet', vendorWalletSchema);
const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);
const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);
const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);



// Create or get chatroom (Updated for multi-tenancy with duplicate prevention)
async function createOrGetChatroom(vendorId, businessId, agentId, threadId, phoneNumber) {
    try {
        // First, try to find existing chatroom for this vendor
        let chatroom = await Chatroom.findOne({ 
            thread_id: threadId, 
            vendor_id: vendorId 
        });
        
        if (chatroom) {
            // Update timestamp and return existing chatroom
            chatroom.updatedAt = new Date();
            await chatroom.save();
            console.log(`[CHATROOM] Found existing chatroom for ${threadId}`);
            return chatroom;
        }
        
        // Check for existing chatroom by phone number for this vendor only
        chatroom = await Chatroom.findOne({ 
            phone_number: phoneNumber, 
            vendor_id: vendorId 
        }).sort({ createdAt: -1 });
        
        if (chatroom) {
            // Update thread_id if needed and return
            if (chatroom.thread_id !== threadId) {
                chatroom.thread_id = threadId;
                chatroom.updatedAt = new Date();
                await chatroom.save();
            }
            console.log(`[CHATROOM] Reused existing chatroom for ${phoneNumber}`);
            return chatroom;
        }
        
        // Create new chatroom
        chatroom = new Chatroom({
            vendor_id: vendorId,
            business_id: businessId,
            agent_id: agentId,
            thread_id: threadId,
            phone_number: phoneNumber,
            sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
        });
        
        const savedChatroom = await chatroom.save();
        console.log(`[CHATROOM] Created new chatroom for ${phoneNumber}`);
        return savedChatroom;
    } catch (error) {
        // Handle duplicate key error gracefully
        if (error.code === 11000) {
            console.log(`[CHATROOM] Duplicate key error, fetching existing chatroom for ${phoneNumber}`);
            
            // Try to find by thread_id first
            let existingChatroom = await Chatroom.findOne({ thread_id: threadId, vendor_id: vendorId });
            if (existingChatroom) {
                return existingChatroom;
            }
            
            // If not found, find by phone_number (most recent)
            existingChatroom = await Chatroom.findOne({ 
                phone_number: phoneNumber, 
                vendor_id: vendorId 
            }).sort({ createdAt: -1 });
            
            if (existingChatroom) {
                console.log(`[CHATROOM] Reusing existing chatroom for ${phoneNumber} to prevent duplicates`);
                return existingChatroom;
            }
        }
        console.error('[CHATROOM] Error creating chatroom:', error);
        throw error;
    }
}

// Save message (Updated for multi-tenancy)
async function saveMessage(vendorId, chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
    try {
        const message = new Message({
            vendor_id: vendorId,
            chatroom_id: chatroomId,
            message_type: messageType,
            content: content,
            phone_number: phoneNumber,
            media_type: mediaType,
            media_url: mediaUrl,
            whatsapp_message_id: whatsappMessageId
        });
        return await message.save();
    } catch (error) {
        throw error;
    }
}

// Get chatroom messages (Updated for multi-tenancy)
async function getChatroomMessages(vendorId, chatroomId, limit = 50) {
    try {
        return await Message.find({ 
            vendor_id: vendorId,
            chatroom_id: chatroomId 
        })
            .sort({ createdAt: -1 })
            .limit(limit);
    } catch (error) {
        throw error;
    }
}

// Get agent context (Updated for multi-tenancy with caching)
async function getAgentContext(vendorId, businessId, agentId) {
    try {
        // Check cache first
        const cacheKey = `${vendorId}:${businessId}:${agentId}`;
        const cached = agentContextCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`[CACHE] Agent context cache HIT for ${cacheKey}`);
            return cached.data;
        }
        
        console.log(`Database query: Finding agent context for vendor_id: ${vendorId}, business_id: ${businessId}, agent_id: ${agentId}`);
        const result = await AgentContext.findOne({ 
            vendor_id: vendorId,
            business_id: businessId, 
            agent_id: agentId, 
            is_active: true 
        }).lean();
        
        if (result) {
            console.log(`Found agent context: ${result.name}, last updated: ${result.updatedAt}`);
            // Store in cache
            agentContextCache.set(cacheKey, { data: result, timestamp: Date.now() });
        } else {
            console.log(`No agent context found for vendor_id: ${vendorId}`);
        }
        
        return result;
    } catch (error) {
        console.error('Error fetching agent context:', error);
        throw error;
    }
}

// Create or update agent context (Updated for multi-tenancy with cache invalidation)
async function saveAgentContext(vendorId, businessId, agentId, name, context, updatedBy = 'system') {
    try {
        const result = await AgentContext.findOneAndUpdate(
            { vendor_id: vendorId, business_id: businessId, agent_id: agentId },
            { 
                name: name,
                context: context,
                updated_by: updatedBy,
                is_active: true
            },
            { upsert: true, new: true }
        );
        
        // Invalidate cache
        const cacheKey = `${vendorId}:${businessId}:${agentId}`;
        agentContextCache.delete(cacheKey);
        console.log(`[CACHE] Invalidated cache for ${cacheKey}`);
        
        return result;
    } catch (error) {
        throw error;
    }
}

// Lookup contact by phone number from uploaded data
async function lookupContactByPhone(vendorId, phoneNumber) {
    try {
        // Normalize phone number: remove spaces, dashes, ensure it starts with country code
        const normalize = (num) => {
            if (!num) return '';
            return num.toString().replace(/[\s\-()]/g, '').trim();
        };

        const normalizedInput = normalize(phoneNumber);

        // Search across all valid contacts for this vendor
        const contact = await ContactUpload.findOne({
            vendor_id: vendorId,
            status: 'valid',
            $or: [
                { 'fields.phone_number': phoneNumber },
                { 'fields.phone_number': normalizedInput },
                { 'fields.registered_mobile_number': phoneNumber },
                { 'fields.registered_mobile_number': normalizedInput },
                { 'fields.phone': phoneNumber },
                { 'fields.phone': normalizedInput },
                { 'fields.mobile': phoneNumber },
                { 'fields.mobile': normalizedInput }
            ]
        }).sort({ createdAt: -1 }).lean();

        if (contact) {
            console.log(`[CONTACT_LOOKUP] Found contact for ${phoneNumber}: ${JSON.stringify(contact.fields)}`);
            return contact.fields;
        }

        console.log(`[CONTACT_LOOKUP] No contact found for ${phoneNumber}`);
        return null;
    } catch (error) {
        console.error('[CONTACT_LOOKUP] Error:', error);
        return null;
    }
}

// Generate unique vendor ID and business ID
function generateVendorId() {
    return 'VND' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function generateBusinessId() {
    // Generate unique business_id based on timestamp
    return parseInt(Date.now().toString().slice(-8)); // Last 8 digits of timestamp
}

module.exports = {
    connectDB,
    Vendor,
    UploadBatch,
    ContactUpload,
    Chatroom,
    Message,
    AgentContext,
    ConversationWindow,
    PricingConfig,
    VendorWallet,
    UsageRecord,
    ExchangeRate,
    WalletTransaction,
    createOrGetChatroom,
    saveMessage,
    getChatroomMessages,
    getAgentContext,
    saveAgentContext,
    lookupContactByPhone,
    generateVendorId,
    generateBusinessId
};