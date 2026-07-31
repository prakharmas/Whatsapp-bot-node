const mongoose = require('mongoose');

// Complaint Session Schema - tracks complaint registration flow per user
const complaintSessionSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, index: true },
    phone_number: { type: String, required: true, index: true },
    status: {
        type: String,
        enum: ['collecting', 'ready', 'submitted', 'cancelled'],
        default: 'collecting'
    },
    current_step: { type: Number, default: 0 },
    fields: {
        name: { type: String },
        contact_number: { type: String },
        issue: { type: String },
        pin_code: { type: String },
        city: { type: String },
        state: { type: String }
    },
    in_call_id: { type: String },
    crm_response: { type: mongoose.Schema.Types.Mixed },
    error_message: { type: String },
    submitted_at: { type: Date },
    cancelled_at: { type: Date }
}, {
    timestamps: true
});

complaintSessionSchema.index({ vendor_id: 1, phone_number: 1, status: 1 });

const ComplaintSession = mongoose.model('ComplaintSession', complaintSessionSchema);

module.exports = {
    ComplaintSession
};
