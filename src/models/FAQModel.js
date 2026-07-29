const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, index: true },
    category: {
        type: String,
        required: true,
        enum: [
            'internet_connectivity',
            'wifi_router',
            'installation_shifting',
            'billing_payments',
            'plans_subscription',
            'ott_iptv',
            'complaint_support',
            'disconnection_hold',
            'account_updates',
            'hardware',
            'landline'
        ]
    },
    category_label: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    keywords: [{ type: String }],
    tags: [{ type: String }],
    is_active: { type: Boolean, default: true },
    sort_order: { type: Number, default: 0 }
}, { timestamps: true });

faqSchema.index({ vendor_id: 1, category: 1 });
faqSchema.index({ vendor_id: 1, keywords: 1 });
faqSchema.index({ vendor_id: 1, tags: 1 });

const planSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, index: true },
    plan_code: { type: String },
    name: { type: String, required: true },
    speed: { type: String, required: true },
    price: { type: Number, required: true },
    validity_days: { type: Number, required: true },
    validity_label: { type: String },
    base_price: { type: Number },
    gst: { type: Number },
    mrp: { type: Number },
    ont_security: { type: String },
    total_amount: { type: Number },
    ott_apps: [{ type: String }],
    ott_detail: { type: String },
    live_channels: { type: String },
    features: [{ type: String }],
    plan_type: {
        type: String,
        enum: ['new_connection', 'renewal', 'both'],
        default: 'both'
    },
    is_active: { type: Boolean, default: true },
    sort_order: { type: Number, default: 0 },
    city: { type: String, default: 'all' }
}, { timestamps: true });

planSchema.index({ vendor_id: 1, price: 1 });
planSchema.index({ vendor_id: 1, speed: 1 });
planSchema.index({ vendor_id: 1, is_active: 1 });

const FAQ = mongoose.model('FAQ', faqSchema);
const Plan = mongoose.model('Plan', planSchema);

module.exports = { FAQ, Plan };
