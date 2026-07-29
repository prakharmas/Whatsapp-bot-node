const { FAQ, Plan } = require('../models/database');

const CATEGORY_KEYWORDS = {
    internet_connectivity: [
        'internet', 'speed', 'slow', 'connect', 'disconnect', 'wifi not working',
        'no internet', 'network', 'lag', 'buffering', 'gaming', 'cctv', 'website not opening',
        'video call', 'evening slow', 'one device working', 'connected but no internet',
        'frequent disconnect', 'range', 'signal', 'los', 'pon', 'onu', 'fiber'
    ],
    wifi_router: [
        'wifi password', 'change password', 'reset password', 'forgot password',
        'dual band', 'router replace', 'old router', 'new router', 'router setting',
        'router config'
    ],
    installation_shifting: [
        'shift', 'relocate', 'new connection', 'install', 'installation',
        'not installed', 'new area', 'shifting charge', 'transfer'
    ],
    billing_payments: [
        'recharge', 'bill', 'payment', 'invoice', 'barcode', 'qr code',
        'collection', 'refund', 'security deposit', 'gst input', 'gst claim',
        'extension', 'validity extension', 'upi'
    ],
    plans_subscription: [
        'plan', 'upgrade', 'subscription', 'current plan', 'plan validity',
        'plan detail', 'plan list', 'login credential', 'self care', 'portal'
    ],
    ott_iptv: [
        'ott', 'iptv', 'netflix', 'hotstar', 'amazon prime', 'zee5', 'sonyliv',
        'discovery', 'chaupal', 'playboxtv', 'channel', 'live tv',
        'ott not working', 'ott login', 'channel loading', 'entertainment pack'
    ],
    complaint_support: [
        'complaint', 'ticket', 'pending', 'engineer', 'technician', 'visit',
        'unresolved', 'update', 'escalation', 'email', 'executive misbehavior',
        'wrong commitment', 'sales team'
    ],
    disconnection_hold: [
        'disconnect', 'cancel', 'temporary hold', 'close connection', 'terminate',
        'device pickup', 'surrender'
    ],
    account_updates: [
        'update detail', 'change mobile', 'change name', 'change email',
        'change address', 'update gst', 'registered email'
    ],
    hardware: [
        'wire damaged', 'cable damaged', 'router damaged', 'ont damaged',
        'hardware', 'replace wire'
    ],
    landline: [
        'landline', 'phone service', 'landline not working'
    ]
};

class KnowledgeService {
    /**
     * Search FAQs relevant to the user's query
     */
    async searchFAQs(vendorId, query) {
        if (!query || !query.trim()) return [];

        const queryLower = query.toLowerCase();
        const matchedCategories = new Set();

        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (queryLower.includes(keyword.toLowerCase())) {
                    matchedCategories.add(category);
                    break;
                }
            }
        }

        let faqs = [];

        if (matchedCategories.size > 0) {
            faqs = await FAQ.find({
                vendor_id: vendorId,
                category: { $in: [...matchedCategories] },
                is_active: true
            })
                .sort({ sort_order: 1 })
                .limit(15)
                .lean();
        }

        if (faqs.length === 0) {
            faqs = await FAQ.find({
                vendor_id: vendorId,
                is_active: true,
                $or: [
                    { question: { $regex: queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(' ').filter(w => w.length > 3).join('|'), $options: 'i' } },
                    { keywords: { $in: queryLower.split(' ').filter(w => w.length > 3) } }
                ]
            })
                .sort({ sort_order: 1 })
                .limit(5)
                .lean();
        }

        if (faqs.length === 0) {
            faqs = await FAQ.find({
                vendor_id: vendorId,
                is_active: true
            })
                .sort({ sort_order: 1 })
                .limit(3)
                .lean();
        }

        return faqs;
    }

    /**
     * Search plans matching the user's criteria
     */
    async searchPlans(vendorId, query) {
        if (!query || !query.trim()) return [];

        const queryLower = query.toLowerCase();
        const isOtt = /ott|entertainment|hotstar|prime|netflix|channel|live tv/i.test(queryLower);
        const isNoOtt = /without ott|no ott|basic|only internet/i.test(queryLower);
        const isShort = /1 month|30 day|monthly/i.test(queryLower);
        const isMedium = /3 month|90 day|quarterly/i.test(queryLower);
        const isLong = /6 month|180 day|12 month|365 day|yearly|annual/i.test(queryLower);
        const isHighSpeed = /300|high speed|gaming/i.test(queryLower);

        let filter = { vendor_id: vendorId, is_active: true };

        if (isNoOtt) {
            filter.ott_apps = { $size: 0 };
        }

        let plans = await Plan.find(filter)
            .sort({ sort_order: 1, price: 1 })
            .limit(20)
            .lean();

        if (isOtt && plans.length > 0) {
            plans = plans.filter(p => p.ott_apps && p.ott_apps.length > 0);
        }

        if (isShort && plans.length > 0) {
            const short = plans.filter(p => p.validity_days <= 60);
            if (short.length > 0) plans = short;
        } else if (isMedium && plans.length > 0) {
            const med = plans.filter(p => p.validity_days > 60 && p.validity_days <= 120);
            if (med.length > 0) plans = med;
        } else if (isLong && plans.length > 0) {
            const long = plans.filter(p => p.validity_days >= 180);
            if (long.length > 0) plans = long;
        }

        if (isHighSpeed && plans.length > 0) {
            const fast = plans.filter(p => {
                const speed = parseInt(p.speed);
                return !isNaN(speed) && speed >= 200;
            });
            if (fast.length > 0) plans = fast;
        }

        if (plans.length > 5) {
            plans = plans.slice(0, 5);
        }

        return plans;
    }

    /**
     * Get all plans as a formatted summary
     */
    async getAllPlansSummary(vendorId) {
        const plans = await Plan.find({ vendor_id: vendorId, is_active: true })
            .sort({ price: 1 })
            .lean();

        if (plans.length === 0) return '';

        const groups = {};
        for (const p of plans) {
            const key = p.validity_days <= 60 ? 'Monthly' :
                p.validity_days <= 120 ? 'Quarterly' :
                    p.validity_days <= 210 ? 'Half-Yearly' : 'Yearly';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        }

        let summary = '\n\nAVAILABLE PLANS:\n';
        for (const [period, planList] of Object.entries(groups)) {
            summary += `\n--- ${period} PLANS ---\n`;
            for (const p of planList) {
                const ott = p.ott_apps && p.ott_apps.length > 0 ? ` (with OTT: ${p.ott_apps.slice(0, 3).join(', ')}${p.ott_apps.length > 3 ? '...' : ''})` : '';
                summary += `${p.speed} - Rs.${p.price}${ott}\n`;
            }
        }

        return summary;
    }

    /**
     * Build knowledge context string to inject into the prompt
     */
    async buildKnowledgeContext(vendorId, userMessage) {
        const faqs = await this.searchFAQs(vendorId, userMessage);
        const plans = await this.searchPlans(vendorId, userMessage);

        let context = '';

        if (faqs.length > 0) {
            context += '\n\n## RELEVANT FAQs (use these to answer the customer):\n';
            for (const faq of faqs) {
                context += `\nQ: ${faq.question}\nA: ${faq.answer}\n`;
            }
        }

        if (plans.length > 0) {
            context += '\n\n## AVAILABLE PLANS (reference for pricing/plan queries):\n';
            for (const p of plans) {
                const ottInfo = p.ott_apps && p.ott_apps.length > 0 ? p.ott_apps.slice(0, 5).join(', ') : '';
                const label = p.validity_label || (p.validity_days >= 365 ? '1 Year' : p.validity_days >= 180 ? '6 Months' : p.validity_days >= 90 ? '3 Months' : p.validity_days >= 60 ? '2 Months' : '1 Month');
                context += `\n- ${p.speed}: ₹${p.price} for ${label}`;
                if (ottInfo) context += ` (includes ${ottInfo})`;
            }
        }

        return context;
    }
}

module.exports = new KnowledgeService();
