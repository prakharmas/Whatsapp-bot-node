require('dotenv').config();

const { connectDB, disconnectDB } = require('./src/config/database');
const {
    Vendor,
    PricingConfig,
    AgentContext,
    ConversationWindow,
    ExchangeRate,
    VendorWallet,
    WalletTransaction,
    generateVendorId,
    generateBusinessId
} = require('./src/models/database');
const AdminUser = require('./src/models/AdminModel');

async function seed() {
    await connectDB();

    try {
        // 1) Admin user
        const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@whatsappbot.local';
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'P@ssword1!';

        let admin = await AdminUser.findOne({ email: adminEmail.toLowerCase() });
        if (!admin) {
            admin = new AdminUser({
                email: adminEmail.toLowerCase(),
                password: adminPassword,
                name: 'Super Admin',
                role: 'superadmin',
                is_active: true,
                notes: 'Seed data admin account'
            });
            await admin.save();
            console.log(`✅ Admin user created: ${adminEmail}`);
            console.log(`   - password: ${adminPassword}`);
        } else {
            console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
        }

        // 2) Vendor account (for testing / initial environment)
        const vendorEmail = process.env.SEED_VENDOR_EMAIL || 'vendor@whatsappbot.local';
        const vendorPassword = process.env.SEED_VENDOR_PASSWORD || 'VendorPass1!';

        let vendor = await Vendor.findOne({ email: vendorEmail.toLowerCase() });
        if (!vendor) {
            const vendorId = generateVendorId();
            const businessId = generateBusinessId();

            vendor = new Vendor({
                vendor_id: vendorId,
                email: vendorEmail.toLowerCase(),
                password: vendorPassword,
                company_name: 'Seeded Vendor Co',
                phone: '+10000000001',
                business_id: businessId,
                agent_id: 1,
                is_active: true,
                whatsapp_phone_id: 'seed-1234',
                whatsapp_access_token: 'seed-token'
            });
            await vendor.save();

            console.log(`✅ Vendor user created: ${vendorEmail}`);

            // Vendor wallet
            const wallet = new VendorWallet({
                vendor_id: vendorId,
                balance_usd_micro: 10000000 // $10
            });
            await wallet.save();

            // Initial exchange rate (used for INR<->USD conversions in admin dashboard, topups)
            let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                exchangeRate = new ExchangeRate({
                    from_currency: 'INR',
                    to_currency: 'USD',
                    rate: 83.0,
                    updated_by: 'seed'
                });
                await exchangeRate.save();
            }

            await new WalletTransaction({
                vendor_id: vendorId,
                transaction_type: 'credit',
                amount_inr: 830,
                amount_usd_micro: 10000000,
                exchange_rate: exchangeRate.rate,
                description: 'Seed initial balance',
                added_by: 'seed'
            }).save();

            // Pricing config for billing windows, and initial model costs
            const pricingConfig = new PricingConfig({
                vendor_id: vendorId,
                new_user_4h_markup: 50,
                existing_user_20h_markup: 30,
                existing_user_24h_markup: 20,
                gpt4_mini_input_price: 0.00015,
                gpt4_mini_output_price: 0.0006,
                whisper_price_per_minute: 0.006,
                vision_input_price: 0.00015,
                vision_output_price: 0.0006
            });
            await pricingConfig.save();

            // Agent context initial setup for vendor
            await new AgentContext({
                vendor_id: vendorId,
                business_id: businessId,
                agent_id: 1,
                name: 'Seed Assistant',
                context: 'You are a helpful WhatsApp support agent for Seeded Vendor Co. Keep replies short and helpful.',
                is_active: true,
                created_by: 'seed',
                updated_by: 'seed'
            }).save();

            // Conversation window seed entry (new user first message)
            await new ConversationWindow({
                vendor_id: vendorId,
                phone_number: '+19999999999',
                first_message_at: new Date(),
                last_message_at: new Date(),
                current_window: 'new_user_4h',
                window_expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000)
            }).save();

            console.log(`✅ Seed vendor data created for ${vendorId} (business ${businessId})`);
        } else {
            console.log(`ℹ️ Vendor already exists: ${vendorEmail}`);
        }

        console.log('🎉 Seed data installation complete.');

    } catch (error) {
        console.error('Seed process failed:', error);
    } finally {
        await disconnectDB();
    }
}

const bcrypt = require('bcrypt');
const password = "admin123"; // dummy password
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) throw err;
    console.log("Hashed password:", hash);
});


seed();
