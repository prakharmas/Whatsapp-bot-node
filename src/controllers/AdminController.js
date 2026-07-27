const { Vendor, Chatroom, Message, VendorWallet, ExchangeRate, WalletTransaction, UsageRecord, PricingConfig, generateVendorId, generateBusinessId, saveAgentContext } = require('../models/database');

class AdminController {
    // Dashboard with overview metrics
    static async dashboard(req, res) {
        try {
            const totalVendors = await Vendor.countDocuments({});
            const totalChatrooms = await Chatroom.countDocuments({});
            const totalMessages = await Message.countDocuments({});
            const activeVendors = await Vendor.countDocuments({ is_active: true });

            // Get financial overview
            const allWallets = await VendorWallet.find({});
            const totalBalance = allWallets.reduce((sum, wallet) => sum + wallet.balance_usd_micro, 0) / 1000000;
            
            const allTransactions = await WalletTransaction.find({ transaction_type: 'credit' });
            const totalTopups = allTransactions.reduce((sum, tx) => sum + tx.amount_inr, 0);
            
            const allUsage = await UsageRecord.find({});
            const totalBilling = allUsage.reduce((sum, record) => sum + record.final_cost_usd_micro, 0) / 1000000;

            // Get exchange rate
            let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                exchangeRate = new ExchangeRate({ rate: 83.0 });
                await exchangeRate.save();
            }

            const stats = {
                totalVendors,
                totalChatrooms,
                totalMessages,
                activeVendors,
                totalBalance,
                totalTopups,
                totalBilling: totalBilling * exchangeRate.rate,
                exchangeRate: exchangeRate.rate
            };

            res.render('admin/dashboard', { 
                currentPage: 'admin', 
                stats,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        } catch (error) {
            console.error('Admin dashboard error:', error);
            res.status(500).send('Error loading admin dashboard');
        }
    }

    // Vendor management
    static async vendorList(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;
            
            const totalVendors = await Vendor.countDocuments({});
            const totalPages = Math.ceil(totalVendors / limit);
            
            const vendors = await Vendor.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();
            
            // Get additional stats for each vendor
            const vendorsWithStats = await Promise.all(vendors.map(async (vendor) => {
                const chatroomCount = await Chatroom.countDocuments({ vendor_id: vendor.vendor_id });
                const messageCount = await Message.countDocuments({ vendor_id: vendor.vendor_id });
                
                // Get wallet balance
                const wallet = await VendorWallet.findOne({ vendor_id: vendor.vendor_id });
                const walletBalance = wallet ? wallet.balance_usd_micro : 0;
                
                return {
                    ...vendor,
                    chatroomCount,
                    messageCount,
                    walletBalance
                };
            }));
            
            res.render('admin/vendors', { 
                currentPage: 'admin', 
                vendors: vendorsWithStats,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' },
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalVendors,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            console.error('Admin vendors list error:', error);
            res.status(500).send('Error loading vendors');
        }
    }

    static async vendorCreate(req, res) {
        res.render('admin/vendor-create', { 
            currentPage: 'admin', 
            error: null,
            admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
        });
    }

    static async vendorStore(req, res) {
        try {
            const { 
                company_name, email, phone, password,
                whatsapp_phone_id, whatsapp_access_token, webhook_verify_token, whatsapp_app_secret,
                initial_balance, is_active
            } = req.body;
            
            const existing = await Vendor.findOne({ email: email.toLowerCase() });
            if (existing) return res.render('admin/vendor-create', { 
                currentPage: 'admin', 
                error: 'Email already exists',
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });

            const vendorId = generateVendorId();
            const businessId = generateBusinessId();
            const vendor = new Vendor({
                vendor_id: vendorId,
                email: email.toLowerCase(),
                company_name,
                phone,
                password,
                whatsapp_phone_id,
                whatsapp_access_token,
                webhook_verify_token,
                whatsapp_app_secret,
                business_id: businessId,
                agent_id: 1,
                is_active: is_active === 'true'
            });

            await vendor.save();
            await saveAgentContext(vendorId, businessId, 1, `${company_name} Support Agent`, `You are ${company_name} WhatsApp assistant.`, 'admin');

            // Add initial wallet balance if provided
            if (initial_balance && initial_balance > 0) {
                const { VendorWallet, ExchangeRate, WalletTransaction } = require('../models/database');
                
                let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
                if (!exchangeRate) {
                    exchangeRate = new ExchangeRate({ rate: 83.0 });
                    await exchangeRate.save();
                }
                
                const amountUSD = initial_balance / exchangeRate.rate;
                const amountMicro = Math.round(amountUSD * 1000000);
                
                await new VendorWallet({
                    vendor_id: vendorId,
                    balance_usd_micro: amountMicro
                }).save();
                
                await new WalletTransaction({
                    vendor_id: vendorId,
                    transaction_type: 'credit',
                    amount_inr: initial_balance,
                    amount_usd_micro: amountMicro,
                    exchange_rate: exchangeRate.rate,
                    description: 'Initial wallet balance',
                    added_by: 'admin'
                }).save();
            }

            res.redirect('/admin/vendors');
        } catch (error) {
            console.error('Admin create vendor error:', error);
            res.render('admin/vendor-create', { 
                currentPage: 'admin', 
                error: 'Failed to create vendor',
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        }
    }

    static async vendorEdit(req, res) {
        try {
            const vendor = await Vendor.findOne({ vendor_id: req.params.vendorId }).lean();
            if (!vendor) return res.status(404).send('Vendor not found');

            res.render('admin/vendor-edit', {
                currentPage: 'admin',
                vendor,
                error: null,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        } catch (error) {
            console.error('Admin vendor edit error:', error);
            res.status(500).send('Error loading vendor');
        }
    }

    static async vendorUpdate(req, res) {
        try {
            const vendor = await Vendor.findOne({ vendor_id: req.params.vendorId });
            if (!vendor) return res.status(404).send('Vendor not found');

            const {
                company_name, email, phone, password,
                whatsapp_phone_id, whatsapp_access_token, webhook_verify_token, whatsapp_app_secret,
                is_active
            } = req.body;

            const emailLower = email.toLowerCase();
            const existing = await Vendor.findOne({ email: emailLower, vendor_id: { $ne: vendor.vendor_id } });
            if (existing) {
                return res.render('admin/vendor-edit', {
                    currentPage: 'admin',
                    vendor: { ...vendor.toObject(), ...req.body, email: emailLower },
                    error: 'Email already exists',
                    admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
                });
            }

            vendor.company_name = company_name;
            vendor.email = emailLower;
            vendor.phone = phone || '';
            vendor.whatsapp_phone_id = whatsapp_phone_id;
            vendor.whatsapp_access_token = whatsapp_access_token;
            vendor.webhook_verify_token = webhook_verify_token;
            vendor.whatsapp_app_secret = whatsapp_app_secret || '';
            vendor.is_active = is_active === 'true';

            if (password && password.trim()) {
                vendor.password = password;
            }

            await vendor.save();
            await saveAgentContext(
                vendor.vendor_id,
                vendor.business_id,
                vendor.agent_id,
                `${company_name} Support Agent`,
                `You are ${company_name} WhatsApp assistant.`,
                'admin'
            );

            res.redirect(`/admin/vendors/${vendor.vendor_id}`);
        } catch (error) {
            console.error('Admin update vendor error:', error);
            const vendor = await Vendor.findOne({ vendor_id: req.params.vendorId }).lean();
            res.render('admin/vendor-edit', {
                currentPage: 'admin',
                vendor: vendor ? { ...vendor, ...req.body } : req.body,
                error: 'Failed to update client',
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        }
    }

    static async vendorDetail(req, res) {
        try {
            const vendor = await Vendor.findOne({ vendor_id: req.params.vendorId }).lean();
            if (!vendor) return res.status(404).send('Vendor not found');

            // Get vendor stats
            const chatroomCount = await Chatroom.countDocuments({ vendor_id: vendor.vendor_id });
            const messageCount = await Message.countDocuments({ vendor_id: vendor.vendor_id });
            
            // Get wallet info
            let wallet = await VendorWallet.findOne({ vendor_id: vendor.vendor_id });
            if (!wallet) {
                wallet = new VendorWallet({ vendor_id: vendor.vendor_id });
                await wallet.save();
            }

            // Get recent transactions
            const recentTopups = await WalletTransaction.find({ 
                vendor_id: vendor.vendor_id, 
                transaction_type: 'credit' 
            }).sort({ createdAt: -1 }).limit(5);

            // Get usage records
            const recentUsage = await UsageRecord.find({ vendor_id: vendor.vendor_id })
                .sort({ charged_at: -1 }).limit(5);

            // Get exchange rate
            const exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });

            const vendorStats = {
                chatroomCount,
                messageCount,
                wallet,
                recentTopups,
                recentUsage,
                exchangeRate: exchangeRate?.rate || 83.0
            };
            
            res.render('admin/vendor-detail', { 
                currentPage: 'admin', 
                vendor, 
                vendorStats,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        } catch (error) {
            console.error('Admin vendor detail error:', error);
            res.status(500).send('Error loading vendor');
        }
    }

    static async vendorToggle(req, res) {
        try {
            const vendor = await Vendor.findOne({ vendor_id: req.params.vendorId });
            if (!vendor) return res.status(404).send('Vendor not found');
            vendor.is_active = !vendor.is_active;
            await vendor.save();
            res.json({ success: true, is_active: vendor.is_active });
        } catch (error) {
            console.error('Admin vendor toggle error:', error);
            res.status(500).json({ error: 'Failed to update vendor' });
        }
    }

    // Wallet management
    static async walletManagement(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;
            
            const totalVendors = await Vendor.countDocuments({});
            const totalPages = Math.ceil(totalVendors / limit);
            
            const vendors = await Vendor.find({}).skip(skip).limit(limit).lean();
            const vendorIds = vendors.map(v => v.vendor_id);
            
            const wallets = await VendorWallet.find({ vendor_id: { $in: vendorIds } }).lean();
            const walletMap = {};
            wallets.forEach(w => walletMap[w.vendor_id] = w);
            
            const vendorsWithWallets = vendors.map(vendor => ({
                ...vendor,
                wallet: walletMap[vendor.vendor_id] || { balance_usd_micro: 0 }
            }));
            
            let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                exchangeRate = new ExchangeRate({ rate: 83.0 });
                await exchangeRate.save();
            }
            
            res.render('admin/wallet', {
                currentPage: 'admin',
                vendors: vendorsWithWallets,
                exchangeRate: exchangeRate.rate,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' },
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalVendors,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            console.error('Admin wallet error:', error);
            res.status(500).send('Error loading wallet management');
        }
    }

    static async walletTopup(req, res) {
        try {
            const { vendor_id, amount_inr, description, reference_id } = req.body;
            
            if (!vendor_id || !amount_inr || amount_inr <= 0) {
                return res.status(400).json({ success: false, error: 'Invalid parameters' });
            }
            
            const exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                return res.status(400).json({ success: false, error: 'Exchange rate not configured' });
            }
            
            const amountUSD = amount_inr / exchangeRate.rate;
            const amountMicro = Math.round(amountUSD * 1000000);
            
            await VendorWallet.findOneAndUpdate(
                { vendor_id },
                { $inc: { balance_usd_micro: amountMicro }, last_updated: new Date() },
                { upsert: true }
            );
            
            await new WalletTransaction({
                vendor_id,
                transaction_type: 'credit',
                amount_inr,
                amount_usd_micro: amountMicro,
                exchange_rate: exchangeRate.rate,
                description,
                added_by: res.locals.admin?.email || 'admin',
                reference_id
            }).save();
            
            res.json({ success: true, message: `Added ₹${amount_inr} to vendor wallet` });
        } catch (error) {
            console.error('Admin wallet topup error:', error);
            res.status(500).json({ success: false, error: 'Failed to process top-up' });
        }
    }

    // Top-up history
    static async topupHistory(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 50;
            const skip = (page - 1) * limit;
            
            const totalTopups = await WalletTransaction.countDocuments({ transaction_type: 'credit' });
            const totalPages = Math.ceil(totalTopups / limit);
            
            const topups = await WalletTransaction.find({ transaction_type: 'credit' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const vendorIds = [...new Set(topups.map(t => t.vendor_id))];
            const vendors = await Vendor.find({ vendor_id: { $in: vendorIds } }).lean();
            const vendorMap = {};
            vendors.forEach(v => vendorMap[v.vendor_id] = v);

            const topupsWithVendor = topups.map(topup => ({
                ...topup.toObject(),
                vendor: vendorMap[topup.vendor_id]
            }));

            res.render('admin/topup-history', {
                currentPage: 'admin',
                topups: topupsWithVendor,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' },
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalTopups,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            console.error('Topup history error:', error);
            res.status(500).send('Error loading topup history');
        }
    }

    // Billing history
    static async billingHistory(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 5; // Reduced to 5 for testing
            const skip = (page - 1) * limit;
            
            const totalBillings = await UsageRecord.countDocuments({});
            const totalPages = Math.ceil(totalBillings / limit);
            
            const billings = await UsageRecord.find({})
                .sort({ charged_at: -1 })
                .skip(skip)
                .limit(limit);

            const vendorIds = [...new Set(billings.map(b => b.vendor_id))];
            const vendors = await Vendor.find({ vendor_id: { $in: vendorIds } }).lean();
            const vendorMap = {};
            vendors.forEach(v => vendorMap[v.vendor_id] = v);

            const billingsWithVendor = billings.map(billing => ({
                ...billing.toObject(),
                vendor: vendorMap[billing.vendor_id]
            }));

            res.render('admin/billing-history', {
                currentPage: 'admin',
                billings: billingsWithVendor,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' },
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalBillings,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            console.error('Billing history error:', error);
            res.status(500).send('Error loading billing history');
        }
    }

    // Pricing configuration
    static async pricingConfig(req, res) {
        try {
            let globalPricing = await PricingConfig.findOne({ vendor_id: 'GLOBAL' });
            if (!globalPricing) {
                globalPricing = new PricingConfig({ vendor_id: 'GLOBAL' });
                await globalPricing.save();
            }
            
            let defaultMarkup = await PricingConfig.findOne({ vendor_id: 'DEFAULT_MARKUP' });
            if (!defaultMarkup) {
                defaultMarkup = new PricingConfig({ vendor_id: 'DEFAULT_MARKUP' });
                await defaultMarkup.save();
            }
            
            let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                exchangeRate = new ExchangeRate({ rate: 83.0 });
                await exchangeRate.save();
            }
            
            res.render('admin/pricing-config', {
                currentPage: 'admin',
                globalPricing,
                defaultMarkup,
                exchangeRate,
                admin: req.admin || { name: 'Admin', email: 'admin@system.com' }
            });
        } catch (error) {
            console.error('Admin pricing config error:', error);
            res.status(500).send('Error loading pricing configuration');
        }
    }

    static async updateExchangeRate(req, res) {
        try {
            const { rate } = req.body;
            if (!rate || rate <= 0) {
                return res.status(400).json({ success: false, error: 'Invalid exchange rate' });
            }
            
            await ExchangeRate.findOneAndUpdate(
                { from_currency: 'INR', to_currency: 'USD' },
                { rate, updated_at: new Date(), updated_by: res.locals.admin?.email || 'admin' },
                { upsert: true }
            );
            
            res.json({ success: true, message: 'Exchange rate updated successfully' });
        } catch (error) {
            console.error('Exchange rate update error:', error);
            res.status(500).json({ success: false, error: 'Failed to update exchange rate' });
        }
    }

    static async updateGlobalPricing(req, res) {
        try {
            const { gpt4_mini_input_price, gpt4_mini_output_price, whisper_price_per_minute } = req.body;
            
            await PricingConfig.findOneAndUpdate(
                { vendor_id: 'GLOBAL' },
                { gpt4_mini_input_price, gpt4_mini_output_price, whisper_price_per_minute },
                { upsert: true }
            );
            
            res.json({ success: true, message: 'Global pricing updated successfully' });
        } catch (error) {
            console.error('Global pricing update error:', error);
            res.status(500).json({ success: false, error: 'Failed to update global pricing' });
        }
    }

    static async updateDefaultMarkup(req, res) {
        try {
            const { new_user_4h_markup, existing_user_20h_markup, existing_user_24h_markup } = req.body;
            
            await PricingConfig.findOneAndUpdate(
                { vendor_id: 'DEFAULT_MARKUP' },
                { new_user_4h_markup, existing_user_20h_markup, existing_user_24h_markup },
                { upsert: true }
            );
            
            res.json({ success: true, message: 'Default markup updated successfully' });
        } catch (error) {
            console.error('Default markup update error:', error);
            res.status(500).json({ success: false, error: 'Failed to update default markup' });
        }
    }
}

module.exports = AdminController;