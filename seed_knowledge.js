require('dotenv').config();
const mongoose = require('mongoose');

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
    console.log('MongoDB connected');

    const { FAQ, Plan } = require('./src/models/FAQModel');
    const { Vendor } = require('./src/models/database');

    const vendors = await Vendor.find({ is_active: true }).lean();
    if (vendors.length === 0) {
        console.error('No active vendors found in database. Create a vendor first.');
        process.exit(1);
    }

    const vendorIdArg = process.argv[2] || process.env.VENDOR_ID;
    let VENDOR_ID;

    if (vendorIdArg) {
        const match = vendors.find(v => v.vendor_id === vendorIdArg);
        if (!match) {
            console.error(`Vendor ${vendorIdArg} not found. Available vendors:`);
            vendors.forEach(v => console.log(`  ${v.vendor_id} - ${v.company_name}`));
            process.exit(1);
        }
        VENDOR_ID = vendorIdArg;
        console.log(`Seeding for vendor: ${match.company_name} (${VENDOR_ID})`);
    } else {
        VENDOR_ID = vendors[0].vendor_id;
        console.log(`No vendor specified. Seeding for first active vendor: ${vendors[0].company_name} (${VENDOR_ID})`);
        console.log(`To seed a specific vendor: node seed_knowledge.js <vendor_id>`);
    }

    // ================ FAQs ================
    const faqs = [
        // ---- Internet & Connectivity ----
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Mera internet kaam nahi kar raha hai. / My internet is not working.',
            answer: 'Kripya basic troubleshooting check karein:\n(1) ONU (Optical Network Unit) par light indication dekhein — PWR, LAN, LOS, PON.\n(2) Router par light indication dekhein — PWR, WAN.\n(3) Agar koi light red hai, to complaint register karein.',
            keywords: ['internet not working', 'no internet', 'not working', 'kaam nahi kar raha'],
            tags: ['troubleshooting', 'connectivity'], sort_order: 1
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Mujhe speed ki problem hai. / I am facing a speed issue.',
            answer: 'Speed Issues ke liye:\n\n1. Router Restart & Speed Test:\n- Router ko restart/reboot karein.\n- Browser mein speedtest.net open karke speed test chalayein.\n\n2. Sahi Server Select Karein:\n- Speed test ke time ensure karein ki Weebo server selected ho.\n- Test "Weebo to Weebo" server par hi run hona chahiye.\n\n3. Wi-Fi Band & Range Check:\n- Check karein ki device 2.4GHz ya 5GHz Wi-Fi se connected hai.\n- Better speed ke liye router ke paas rahkar test karein.\n\n4. Single Device Par Test:\n- Accurate speed check ke liye ek time par sirf ek hi device use karein.\n- Multiple devices connected hone se speed kam dikh sakti hai.',
            keywords: ['speed issue', 'slow speed', 'speed slow', 'buffering', 'speed test', 'speedtest'],
            tags: ['speed', 'troubleshooting'], sort_order: 2
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Wi-Fi range ki problem hai. / I am facing Wi-Fi range issues.',
            answer: 'Range Issues ke liye:\n\n1. Router IP Check Karein:\n- Keyboard par Win + R dabayein.\n- ncpa.cpl likhkar Enter karein.\n- Apne Wi-Fi par right-click karke Status > Details open karein.\n- Yahan jo IPv4 Default Gateway dikhega, wahi router ka IP hota hai.\n\n2. Wi-Fi Power High Karein:\n- Wi-Fi settings mein jaakar Transmit Power ko High select karein.\n\n3. Wi-Fi Band Change Karke Check Karein:\n- Agar signal ya speed issue aa raha hai, to Wi-Fi ka band 2.4GHz ya 5GHz change karke check karein.\n- Isse internet signal aur speed better ho sakti hai.',
            keywords: ['wifi range', 'range issue', 'signal weak', 'range problem', 'signal strength'],
            tags: ['wifi', 'range', 'troubleshooting'], sort_order: 3
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Mera connection baar baar disconnect ho raha hai. / Frequent disconnection.',
            answer: 'Frequent disconnection ke liye yeh steps follow karein:\n\n1. Usage Check Karein:\n- Session history, connected devices aur current data usage check karein.\n\n2. Internet Connectivity Test Karein:\n- Keyboard par Windows + R dabayein.\n- cmd likhkar Enter karein.\n- Black screen open hogi, usme ping 8.8.8.8 -t type karke Enter dabayein.\n- Check karein ki kahin "Request timed out" message to nahi aa raha.\n\n3. Agar "Request timed out" ya packet loss aaye:\n- Customer ko batayein ki ghar tak aane wali fiber line mein issue ho sakta hai.\n- Hamari team is issue ko approx. 4 hours ke andar resolve kar degi.\n\nFrequent disconnection ke liye complaint raise karein.',
            keywords: ['disconnect', 'frequent disconnect', 'connection drop', 'baar baar', 'disconnect ho raha', 'packet loss', 'request timed out', 'ping'],
            tags: ['disconnection', 'troubleshooting'], sort_order: 4
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Wi-Fi connected hai lekin internet nahi chal raha. / Wi-Fi connected but no internet.',
            answer: 'Wi-Fi Connected, No Internet ke liye:\n\n1. Wi-Fi Name Check Karein:\n- Confirm karein ki aap sahi Wi-Fi network (SSID) se connected hain.\n\n2. Wi-Fi Reconnect Karein:\n- Wi-Fi settings mein jaakar current network ko Forget Network karein.\n- Phir dobara password daalkar connect karein.\n\n3. Router Restart Karein:\n- Agar issue abhi bhi aa raha hai, to router ko restart/reboot karke check karein.\n- Agar restart ke baad internet chalne lage, to complaint raise karne ki zarurat nahi hai.\n\n4. Agar Issue Fir Bhi Rahe:\n- Agar internet abhi bhi nahi chal raha, to No Internet ki complaint raise karein.',
            keywords: ['wifi connected', 'no internet', 'connected no internet', 'wifi to connected'],
            tags: ['wifi', 'connectivity', 'troubleshooting'], sort_order: 5
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Internet ek device par chal raha hai lekin doosron par nahi. / Internet on one device but not others.',
            answer: '(1) Router restart karein.\n(2) Affected devices ko Wi-Fi se reconnect karein.\n(3) Check karein ki device router range mein hai ya nahi. Agar multiple devices par issue continues to complaint raise karein.',
            keywords: ['one device working', 'not others', 'ek device', 'doosra device'],
            tags: ['connectivity', 'troubleshooting'], sort_order: 6
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Shaam ke samay internet slow ho jata hai. / Internet slow during evening.',
            answer: 'Yeh peak-hour network congestion ki vajah se ho sakta hai. Hum complaint raise karenge aur network team investigate karegi.',
            keywords: ['evening slow', 'shaam slow', 'peak hour', 'night slow'],
            tags: ['speed', 'congestion'], sort_order: 7
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Video calls lag ho rahi hain ya disconnect ho rahi hain. / Video calls lagging or disconnecting.',
            answer: 'Hum iske liye complaint raise karenge. Is beech mein LAN cable se connect karke try karein aur bandwidth-heavy applications band karein.',
            keywords: ['video call', 'lag', 'zoom', 'google meet', 'disconnect call'],
            tags: ['video call', 'connectivity'], sort_order: 8
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Technical issue hai mere connection mein. / Technical issue with connection.',
            answer: 'Basic troubleshooting karein: router restart karein aur cable connections check karein. Agar issue persists to complaint raise karenge.',
            keywords: ['technical issue', 'technical problem', 'connection issue'],
            tags: ['technical', 'troubleshooting'], sort_order: 9
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Gaming issue hai; Wi-Fi par game nahi chal raha. / Gaming issues on Wi-Fi.',
            answer: 'Hum complaint raise karenge. Is beech mein better gaming experience ke liye LAN cable se connect karein aur ensure karein ki koi aur device high bandwidth consume na kar rahi ho. Complaint raise karte waqt game ka naam bataayein.',
            keywords: ['gaming', 'game', 'pubg', 'free fire', 'lag game', 'online game'],
            tags: ['gaming', 'connectivity'], sort_order: 10
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'Specific website nahi khul rahi. / Specific website not opening.',
            answer: 'Hum complaint raise karenge. Kripya different browser ya device se access karke confirm karein ki issue network-related hai. Complaint raise karte waqt website ka naam bataayein.',
            keywords: ['website not opening', 'site not working', 'website not loading'],
            tags: ['website', 'connectivity'], sort_order: 11
        },
        {
            vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
            question: 'CCTV Wi-Fi se connect nahi ho raha. / Unable to connect CCTV to Wi-Fi.',
            answer: 'Ensure karein ki aapka CCTV system aapki Wi-Fi frequency (2.4 GHz / 5 GHz) ko support karta hai aur aap sahi credentials enter kar rahe hain. Complaint raise karenge.',
            keywords: ['cctv', 'camera', 'connect cctv', 'cctv wifi'],
            tags: ['cctv', 'connectivity'], sort_order: 12
        },

        // ---- Wi-Fi & Router ----
        {
            vendor_id: VENDOR_ID, category: 'wifi_router', category_label: 'Wi-Fi & Router',
            question: 'Wi-Fi password change/reset karna hai. / Change/Reset Wi-Fi password.',
            answer: 'Router Configuration / Password Reset:\n\nAgar customer khud kar sakta hai to:\n\n1. Router IP Check Karein:\n- Keyboard par Win + R dabayein.\n- ncpa.cpl likhkar Enter karein.\n- Wi-Fi par right-click karke Status > Details open karein.\n- Yahan jo IPv4 Default Gateway dikhega, wahi router ka IP hota hai. Router ke piche bhi likha ho sakta hai.\n\n2. Router Login & Credentials Update:\n- Browser mein router ka IP open karein aur login karein.\n- Phir Internet Settings mein jaakar provider ka Connection ID aur Password update karein.\n\nYa hum service request raise kar sakte hain. Hamari team aapka Wi-Fi password update karegi aur naye credentials share karegi.',
            keywords: ['change password', 'reset password', 'wifi password change', 'new password', 'router login', 'router config', 'router setting'],
            tags: ['wifi', 'password', 'router config'], sort_order: 13
        },
        {
            vendor_id: VENDOR_ID, category: 'wifi_router', category_label: 'Wi-Fi & Router',
            question: 'Wi-Fi password bhool gaya. / Forgot Wi-Fi password.',
            answer: 'Hum service request raise karenge. Hamari team aapka Wi-Fi password reset karke share karegi. Update ke baad saare devices ko new password se reconnect karein.',
            keywords: ['forgot password', 'password bhool', 'wifi password forgot'],
            tags: ['wifi', 'password', 'forgot'], sort_order: 14
        },
        {
            vendor_id: VENDOR_ID, category: 'wifi_router', category_label: 'Wi-Fi & Router',
            question: 'Dual-band Wi-Fi support chahiye. / Need dual-band Wi-Fi support.',
            answer: 'Hum dual-band router upgrade ke liye service request raise karenge. Team availability check karegi aur request process karegi. Aapke plan ke according additional charges apply ho sakte hain.',
            keywords: ['dual band', 'dual-band', '2.4ghz', '5ghz', 'wifi band'],
            tags: ['router', 'upgrade'], sort_order: 15
        },
        {
            vendor_id: VENDOR_ID, category: 'wifi_router', category_label: 'Wi-Fi & Router',
            question: 'Purana router replace karke naya chahiye. / Replace old router with new.',
            answer: 'Hum router replacement ke liye service request raise karenge. Team aapke current router ki condition assess karegi aur replacement arrange karegi. Applicable charges, agar hain, to pehle bataye jayenge.',
            keywords: ['replace router', 'new router', 'old router', 'router replacement'],
            tags: ['router', 'replacement'], sort_order: 16
        },

        // ---- Installation & Shifting ----
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Connection doosri jagah shift karna hai. / Shift connection to another location.',
            answer: 'Hum shifting request raise karenge. Team new location par service availability check karegi aur aapke convenient time par shifting schedule karegi. Kripya naye location ki details dein. Applicable charges ke baare mein bhi bataya jayega.',
            keywords: ['shift', 'shifting', 'relocate', 'transfer', 'move', 'shift connection'],
            tags: ['shifting', 'relocation'], sort_order: 17
        },
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Connection shifting ke charges kya hain? / Charges for connection shifting.',
            answer: 'Connection shifting charges distance aur location ke hisaab se vary karte hain. Hum request raise karenge aur team aapko charges pehle batayegi.',
            keywords: ['shifting charges', 'shift charge', 'shifting fee', 'transfer charges'],
            tags: ['shifting', 'charges'], sort_order: 18
        },
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Shifting charges nahi dene. / Don\'t want to pay shifting charges.',
            answer: 'Hum aapki concern samajhte hain. Request raise karenge aur team aapke account history ko review karegi. Agar koi waiver offer kiya ja sakta hai to bataya jayega.',
            keywords: ['no shifting charge', 'free shift', 'waiver', 'mujhe nahi dene'],
            tags: ['shifting', 'charges', 'waiver'], sort_order: 19
        },
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Naya connection properly install nahi hua. / New connection not installed properly.',
            answer: 'Inconvenience ke liye khed hai. Hum complaint raise karenge aur technician ko bhejenge jo installation ko inspect aur fix karega.',
            keywords: ['not installed properly', 'installation issue', 'improper installation'],
            tags: ['installation', 'complaint'], sort_order: 20
        },
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Connection time par install nahi hua. / Connection not installed on time.',
            answer: 'Delay ke liye khed hai. Hum complaint raise karenge aur team aapki installation ko prioritize karegi. Revised schedule ke baare mein update diya jayega.',
            keywords: ['install not on time', 'delay installation', 'late installation', 'not installed on time'],
            tags: ['installation', 'delay'], sort_order: 21
        },
        {
            vendor_id: VENDOR_ID, category: 'installation_shifting', category_label: 'Installation & Shifting',
            question: 'Mere area mein naya connection chahiye. / New connection in my area.',
            answer: 'Hum request raise karenge aur service availability check karenge. Team feasibility verify karegi aur availability details aur plan options ke saath aapko update karegi.',
            keywords: ['new connection', 'naya connection', 'new area', 'my area'],
            tags: ['installation', 'new connection'], sort_order: 22
        },

        // ---- Billing & Payments ----
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Subscription kaise recharge karein? / How to recharge subscription?',
            answer: 'Do tarike hain:\nA. Self-care portal (http://103.99.186.8/iconradius/user//login) par login karke plan select karein aur payment karein.\nB. UPI app mein broadband recharge option search karein, company name (Weebo) select karein, registered mobile number aur amount enter karein.',
            keywords: ['recharge', 'subscription recharge', 'payment', 'how to recharge', 'online recharge'],
            tags: ['billing', 'recharge', 'payment'], sort_order: 23
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Invoice copy chahiye. / Need a copy of my invoice.',
            answer: 'Hum request raise karenge aur invoice generate karke share karenge. Aapko registered email ID par 24 hours ke andar receive ho jayega.',
            keywords: ['invoice', 'bill copy', 'receipt', 'invoice copy'],
            tags: ['billing', 'invoice'], sort_order: 24
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Payment ke liye barcode/QR code share karein. / Share barcode/QR code for payment.',
            answer: 'Hum request raise karenge aur payment QR code/barcode aapke registered mobile number ya email ID par share karenge. Isse aap quick aur easy payment kar sakte hain.',
            keywords: ['barcode', 'qr code', 'qr', 'payment barcode', 'scan payment'],
            tags: ['billing', 'payment', 'qr'], sort_order: 25
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Payment collection ke liye koi bhej do. / Send someone for payment collection.',
            answer: 'Kripya online payment mode use karein. Aap self-care portal ya UPI app se payment kar sakte hain.',
            keywords: ['payment collection', 'bhejo', 'collect payment', 'cash payment'],
            tags: ['billing', 'payment', 'collection'], sort_order: 26
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Executive ko payment de di thi lekin update nahi hua. / Payment given but not updated.',
            answer: 'Inconvenience ke liye khed hai. Hum complaint raise karenge aur concerned team ko escalate karenge. Kripya payment receipt ya transaction details share karein taaki hum update jaldi kar sakein.',
            keywords: ['payment not updated', 'executive payment', 'de diya lekin update nahi', 'payment given'],
            tags: ['billing', 'payment', 'complaint'], sort_order: 27
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Security deposit refund ki status confirm karein. / Confirm security deposit refund status.',
            answer: 'Hum request raise karenge aur security deposit refund ki status check karenge. Team details verify karegi aur expected refund timeline ke baare mein update karegi.',
            keywords: ['security deposit', 'refund', 'deposit refund', 'security refund'],
            tags: ['billing', 'refund', 'security deposit'], sort_order: 28
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'GST input claim nahi kar pa raha. / Unable to claim GST input on invoice.',
            answer: 'Hum request raise karenge aur invoice par GST details correct karenge. Kripya apna GSTIN share karein. Hum records update karke invoice reissue karenge.',
            keywords: ['gst', 'gst input', 'gst claim', 'gstin', 'tax invoice'],
            tags: ['billing', 'gst', 'invoice'], sort_order: 29
        },
        {
            vendor_id: VENDOR_ID, category: 'billing_payments', category_label: 'Billing & Payments',
            question: 'Internet kaam nahi kar raha to extension chahiye. / Need extension because internet not working.',
            answer: 'Hum validity extension ke liye request raise karenge. Team aapke complaint history ko review karegi aur downtime ke hisaab se extension process karegi.',
            keywords: ['extension', 'validity extension', 'internet not working extension', 'din badhao'],
            tags: ['billing', 'extension'], sort_order: 30
        },

        // ---- Plans & Subscription ----
        {
            vendor_id: VENDOR_ID, category: 'plans_subscription', category_label: 'Plans & Subscription',
            question: 'Plan upgrade karna hai. / Want to upgrade my plan.',
            answer: 'Hum upgrade request raise karenge. Team available upgrade options with pricing share karegi aur aapki preference ke hisaab se change process karegi. Aapke usage ke hisaab se suitable speed aur plan duration suggest kiya jayega.',
            keywords: ['upgrade', 'plan upgrade', 'better plan', 'change plan'],
            tags: ['plans', 'upgrade'], sort_order: 31
        },
        {
            vendor_id: VENDOR_ID, category: 'plans_subscription', category_label: 'Plans & Subscription',
            question: 'Current available plans kya hain? / What are the current available plans?',
            answer: 'Hum request raise karenge aur team latest plan details (speed, validity, pricing) share karegi. Aapke current plan ko check karke suitable plan suggest kiya jayega. Agar current plan 1 month ka hai to 3 month plan suggest kiya jayega.',
            keywords: ['available plans', 'plan list', 'plan details', 'all plans', 'kya plans hain'],
            tags: ['plans', 'information'], sort_order: 32
        },
        {
            vendor_id: VENDOR_ID, category: 'plans_subscription', category_label: 'Plans & Subscription',
            question: 'Meri plan validity check karein. / Check my plan validity.',
            answer: 'Main abhi check kar sakti hoon. Kripya apna registered mobile number ya account ID share karein. Main aapka active plan, validity date aur remaining days confirm kar doongi.',
            keywords: ['plan validity', 'validity', 'plan expiry', 'kitne din bache', 'plan kab khatam'],
            tags: ['plans', 'validity'], sort_order: 33
        },
        {
            vendor_id: VENDOR_ID, category: 'plans_subscription', category_label: 'Plans & Subscription',
            question: 'Online recharge credentials/login details share karein. / Share online recharge login details.',
            answer: 'Hum request raise karenge aur self-care portal login credentials aapke registered mobile number ya email ID par share karenge. Security ke liye first login ke baad password change karein.',
            keywords: ['login details', 'credentials', 'self care', 'portal login', 'online recharge login'],
            tags: ['plans', 'login', 'portal'], sort_order: 34
        },

        // ---- OTT & IPTV ----
        {
            vendor_id: VENDOR_ID, category: 'ott_iptv', category_label: 'OTT & IPTV',
            question: 'OTT aur IPTV services kaise activate karein? / How to activate OTT and IPTV?',
            answer: 'OTT Activation Steps:\n\n1. PlayBoxTV App Install Karein:\n- Google Play Store se PlayBoxTV app download aur install karein.\n- App Link: https://play.google.com/store/search?q=playboxtv+app&c=apps&hl=en_IN\n\n2. Login & Verification:\n- App open karke apna registered mobile number enter karein.\n- Mobile par aaya hua OTP daalkar verification complete karein.\n\n3. Subscription Activate Karein:\n- Login hone ke baad apna OTT plan activate/claim karein.\n\n4. Partner OTT Apps Install Karein:\nSubscription use karne ke liye ye apps install karein:\n- JioHotstar\n- Zee5\n- SonyLIV\n- Amazon Prime Video (Lite)\n\n5. Screen & Device Limit:\n- JioHotstar, Zee5, SonyLIV: Ek time par 2 screens par chal sakta hai.\n- Amazon Prime Video (Lite): Sirf 1 screen aur 1 registered device par chalega.\n\nVideo Guide: https://youtu.be/9Hb2JafHF_c?si=xgVZxBbqWLpk0ERh',
            keywords: ['ott activation', 'iptv activation', 'ott activate', 'how to activate ott', 'playboxtv', 'ott steps', 'ott setup'],
            tags: ['ott', 'iptv', 'activation'], sort_order: 35
        },
        {
            vendor_id: VENDOR_ID, category: 'ott_iptv', category_label: 'OTT & IPTV',
            question: 'OTT/IPTV service kaam nahi kar rahi. / OTT/IPTV service not working.',
            answer: 'Hum service request raise karenge. Team investigate karegi aur service restore karegi. Is beech mein logout karke wapas login karke try karein.',
            keywords: ['ott not working', 'iptv not working', 'ott issue', 'iptv issue'],
            tags: ['ott', 'iptv', 'troubleshooting'], sort_order: 36
        },
        {
            vendor_id: VENDOR_ID, category: 'ott_iptv', category_label: 'OTT & IPTV',
            question: 'OTT services sahi se kaam nahi kar rahi. / OTT services not working properly.',
            answer: 'Hum request raise karenge. Kripya app cache clear karein, app reinstall karein ya different device se try karke issue confirm karein.',
            keywords: ['ott not working properly', 'ott problem', 'ott app issue'],
            tags: ['ott', 'troubleshooting'], sort_order: 37
        },
        {
            vendor_id: VENDOR_ID, category: 'ott_iptv', category_label: 'OTT & IPTV',
            question: 'IPTV par channels load nahi ho rahe. / Channels not loading on IPTV.',
            answer: 'Hum request raise karenge. Team service status check karegi aur channels jald se jald restore karegi.',
            keywords: ['channels not loading', 'iptv channel', 'channel load', 'tv channel'],
            tags: ['iptv', 'channels', 'troubleshooting'], sort_order: 38
        },
        {
            vendor_id: VENDOR_ID, category: 'ott_iptv', category_label: 'OTT & IPTV',
            question: 'OTT login credentials kaam nahi kar rahe. / OTT login credentials not working.',
            answer: 'Hum request raise karenge aur OTT login credentials reset karenge. Naye credentials registered mobile number ya email ID par bhej diye jayenge.',
            keywords: ['ott login', 'ott credentials', 'ott password', 'ott login not working'],
            tags: ['ott', 'login'], sort_order: 39
        },

        // ---- Complaint & Support ----
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Mera complaint/ticket number share karein. / Share my complaint/ticket number.',
            answer: 'Main CRM system par aapka complaint/ticket status check karoongi aur ticket number immediately share kar doongi.',
            keywords: ['complaint number', 'ticket number', 'complaint id', 'ticket id'],
            tags: ['complaint', 'ticket'], sort_order: 40
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Mera complaint abhi pending hai. / My complaint is still pending.',
            answer: 'Main CRM par complaint status check karoongi. Hamara standard resolution TAT 4 to 5 working hours hai. Agar yeh exceed ho gaya hai to immediately escalate karenge aur aapko jald se jald update milega.',
            keywords: ['pending complaint', 'complaint pending', 'still pending', 'complaint not resolved'],
            tags: ['complaint', 'pending'], sort_order: 41
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Mere complaint par koi update nahi aaya. / No update on my complaint.',
            answer: 'Communication ki kami ke liye khed hai. Main CRM par complaint check karoongi aur current status update karoongi. Hamara resolution TAT complaint registration se 4 to 5 working hours hai.',
            keywords: ['no update', 'koi update nahi', 'update nahi aaya', 'complaint update'],
            tags: ['complaint', 'update'], sort_order: 42
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Engineer aaya lekin issue masih unresolved hai. / Engineer visited but issue unresolved.',
            answer: 'Humein sincere apology. Main CRM par complaint check karoongi aur agar 4-5 working hours TAT exceed hua hai to senior technical team ko escalate karoonga for immediate re-visit and resolution.',
            keywords: ['engineer came', 'engineer visited', 'still not fixed', 'unresolved', 'engineer aaya'],
            tags: ['complaint', 'engineer', 'unresolved'], sort_order: 43
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Technician visit urgently chahiye. / Need urgent technician visit.',
            answer: 'Hum urgent technician visit ke liye priority complaint raise karenge. Team visit schedule karegi aur 4-5 working hours ke andar aap tak pahunchne ka prayas karegi. Aapko timing ke baare mein notify kiya jayega.',
            keywords: ['urgent technician', 'urgent visit', 'technician chahiye', 'engineer bhejo'],
            tags: ['complaint', 'technician', 'urgent'], sort_order: 44
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Queries/escalations ke liye email ID kya hai? / Email ID for raising queries?',
            answer: 'Queries aur escalations ke liye kripya hamari official support email par likhein: customercare@weebo.co.in. Team 24 business hours ke andar respond karegi.',
            keywords: ['email', 'email id', 'support email', 'complaint email', 'customercare'],
            tags: ['support', 'email'], sort_order: 45
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Executive ke against complaint karna hai. / Register complaint against executive.',
            answer: 'Hum aisi concerns ko seriously lete hain. Kripya official complaint email ID (customercare@weebo.co.in) par incident details ke saath likhein. Investigation ki jayegi aur strict action liya jayega.',
            keywords: ['executive complaint', 'against executive', 'employee complaint', 'staff complaint'],
            tags: ['complaint', 'executive'], sort_order: 46
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Field team ne misbehavior kiya. / Faced misbehavior from field team.',
            answer: 'Aapke saath hue vyavahar ke liye hum sincere apology. Kripya incident details hamari official complaint email (customercare@weebo.co.in) par bhejein. Investigation ki jayegi aur strict action liya jayega.',
            keywords: ['misbehavior', 'field team', 'rude', 'bad behavior', 'galti'],
            tags: ['complaint', 'misbehavior'], sort_order: 47
        },
        {
            vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint & Support',
            question: 'Sales team ne wrong commitment kiya. / Wrong commitment by sales team.',
            answer: 'Kisi bhi miscommunication ke liye khed hai. Kripya details hamari official feedback/complaint email (customercare@weebo.co.in) par bhejein. Team review karegi aur matter resolve karegi.',
            keywords: ['wrong commitment', 'false commitment', 'sales team', 'wrong promise', 'commitment'],
            tags: ['complaint', 'sales', 'commitment'], sort_order: 48
        },

        // ---- Disconnection ----
        {
            vendor_id: VENDOR_ID, category: 'disconnection_hold', category_label: 'Disconnection & Hold',
            question: 'Issue ki vajah se connection disconnect karna hai. / Disconnect connection due to issue.',
            answer: 'Hum disconnection request raise karenge. Processing se pehle, hamari retention team issue resolve karne ke liye alternative solution offer kar sakti hai. Disconnection par company device (ONT/Router) wapas karna hoga. Security amount refund kiya jayega.',
            keywords: ['disconnect', 'cancel connection', 'connection band', 'close connection'],
            tags: ['disconnection', 'cancellation'], sort_order: 49
        },
        {
            vendor_id: VENDOR_ID, category: 'disconnection_hold', category_label: 'Disconnection & Hold',
            question: 'Temporary disconnect karna hai. / Temporarily disconnect connection.',
            answer: 'Hum temporary disconnection request raise karenge. Kripya duration batayein ki kitne time ke liye service on hold rakhni hai.',
            keywords: ['temporary disconnect', 'hold', 'suspend', 'temporarily', 'kuch din band'],
            tags: ['disconnection', 'hold', 'temporary'], sort_order: 50
        },

        // ---- Account Updates ----
        {
            vendor_id: VENDOR_ID, category: 'account_updates', category_label: 'Account & Details Update',
            question: 'Apne details update karane hain (mobile number, name, GST, etc.). / Update my details.',
            answer: 'Hum account details update ke liye request raise karenge. Kripya new information aur ID proof provide karein. Changes committed TAT ke andar update kar diye jayenge.',
            keywords: ['update details', 'change mobile', 'change name', 'change number', 'update account'],
            tags: ['account', 'update'], sort_order: 51
        },
        {
            vendor_id: VENDOR_ID, category: 'account_updates', category_label: 'Account & Details Update',
            question: 'Registered email ID change karna hai. / Change registered email ID.',
            answer: 'Hum registered email ID update ke liye request raise karenge. Kripya new email address provide karein aur identity verify karein. Change confirm kar diya jayega. Aap customercare@weebo.co.in par bhi request bhej sakte hain.',
            keywords: ['change email', 'update email', 'registered email', 'email change'],
            tags: ['account', 'email'], sort_order: 52
        },

        // ---- Hardware ----
        {
            vendor_id: VENDOR_ID, category: 'hardware', category_label: 'Hardware & Physical Damage',
            question: 'Internet wire damaged hai, replacement chahiye. / Wire damaged needs replacement.',
            answer: 'Hum wire replacement ke liye service request raise karenge. Technician visit karega aur damaged wire replace karega. Damage ki nature ke according applicable charges, agar hain, to visit se pehle bataye jayenge.',
            keywords: ['wire damaged', 'cable damaged', 'wire replacement', 'cable replacement', 'fiber cut'],
            tags: ['hardware', 'damage', 'replacement'], sort_order: 53
        },

        // ---- Landline ----
        {
            vendor_id: VENDOR_ID, category: 'landline', category_label: 'Landline Services',
            question: 'Landline service kaam nahi kar rahi. / Landline service not working.',
            answer: 'Hum landline issue ke liye service request raise karenge. Is beech mein ensure karein ki phone handset aur cables properly connected hain.',
            keywords: ['landline', 'landline not working', 'phone not working', 'telephone'],
            tags: ['landline', 'telephone', 'troubleshooting'], sort_order: 54
        }
    ];

    // --- TAT & Service Info FAQ ---
    const tatFaq = {
        vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Service TAT Information',
        question: 'Service TAT / Timing kya hai? / What are the service timelines?',
        answer: 'Service Timelines (TAT):\n- Barcode request: 1 hour\n- Wi-Fi shifting: 24 to 48 hours\n- Connection disconnection: 24 to 48 working hours\n- Technician visiting time: 10am to 7pm only\n- Complaint resolution: 4 to 5 working hours',
        keywords: ['tat', 'time', 'timeline', 'how long', 'service time', 'working hours', 'technician time'],
        tags: ['tat', 'service', 'timeline'], sort_order: 55
    };

    // No Internet Connectivity troubleshooting FAQ
    const noInternetFaq = {
        vendor_id: VENDOR_ID, category: 'internet_connectivity', category_label: 'Internet & Connectivity',
        question: 'No Internet Connectivity - troubleshooting steps kya hain? / No Internet troubleshooting.',
        answer: 'No Internet Connectivity ke liye:\n\n1. Check Optical Network Unit (ONU) light indications (PWR-LAN-LOS-PON).\n2. Check Router Light indication (PWR-WAN).\n3. Check if all cables are connected: yellow fiber cable and power cable of the router.\n\nIf connected then:\n- PON light shows red: raise complaint for fiber cut\n- If WAN light shows no colour: reboot the router.',
        keywords: ['no internet connectivity', 'troubleshooting steps', 'internet troubleshooting', 'onu light', 'pon light', 'los light'],
        tags: ['connectivity', 'troubleshooting', 'onu'], sort_order: 56
    };

    const complaintTypesFaq = {
        vendor_id: VENDOR_ID, category: 'complaint_support', category_label: 'Complaint Categories',
        question: 'Complaint categories / tagging kaise karein? / How to categorize complaints?',
        answer: 'Tagging Categories:\n\n1. Limited or No Connectivity: Internet not working, Wi-Fi connected but no internet\n2. Invalid Network Config: IP/DNS config error, router setup issue\n3. Slow Browsing: Buffering, websites open slowly, download speed low\n4. Frequent Disconnection: Internet drops every few minutes\n5. Cable: LAN/Ethernet cable damaged or loose\n6. Fiber: Fiber optic cable cut or damaged\n7. Site Issue: Area outage affecting multiple customers\n8. ONU Issue: ONU/ONT device problem (LOS light red, no power)\n9. Switch: Network switch failure in building/locality\n10. Payment Issue: Payment done but internet not restored\n11. Electricity/Power Issue: Power outage affecting equipment\n12. Shifting: Customer wants to relocate connection\n13. Connection Discontinued: Customer wants to close connection',
        keywords: ['tagging', 'complaint category', 'complaint type', 'category', 'main type', 'complaint main type'],
        tags: ['complaint', 'category', 'tagging'], sort_order: 57
    };

    faqs.push(tatFaq, noInternetFaq, complaintTypesFaq);

    // ================ PLANS ================
    const plans = [
        // --- 1st Table (DP-DOPs Plans) ---
        { vendor_id: VENDOR_ID, plan_code: '3M_225Mbps_OTT', name: 'Weebo_Dhamaka_AJHS_90', speed: '225Mbps', price: 1800, validity_days: 90, validity_label: '3 Months', base_price: 1525, gst: 275, mrp: 1800, ont_security: '200 After Disconnection', total_amount: 1800, ott_apps: ['Amazon Lite', 'JioHotstar', 'SonyLiv', 'Chaupal', 'Discovery Plus', 'ShemarooMe'], ott_detail: 'Amazon Lite, JioHotstar, SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 1, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '6+3M_200Mbps_OTT', name: 'Weebo_Dhamaka_S_270', speed: '200Mbps', price: 3700, validity_days: 270, validity_label: '9 Months (6+3)', base_price: 3051, gst: 549, mrp: 3600, ont_security: '100', total_amount: 3700, ott_apps: ['SonyLiv', 'Chaupal', 'Discovery Plus', 'ShemarooMe'], ott_detail: 'SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 2, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '200Mbps_ul_3M_DP', name: 'Weebo_Dhamaka_S_90', speed: '200Mbps', price: 1500, validity_days: 90, validity_label: '3 Months', base_price: 1271, gst: 229, mrp: 1500, ont_security: '200 Refund After Disconnection', total_amount: 1500, ott_apps: ['SonyLiv', 'Chaupal', 'Discovery Plus', 'ShemarooMe'], ott_detail: 'SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 3, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '200Mbps_12M_OTT', name: 'Weeb_Gold_AJHSZ_365', speed: '200Mbps', price: 6600, validity_days: 365, validity_label: '12 Months', base_price: 5508, gst: 992, mrp: 6500, ont_security: '100', total_amount: 6600, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 4, city: 'all' },

        // --- 2nd Table ---
        { vendor_id: VENDOR_ID, plan_code: '125Mbps_3M_OTT', name: 'Weebo_Dhamaka_ZJHS_90', speed: '125Mbps', price: 2000, validity_days: 90, validity_label: '3 Months', base_price: 1695, gst: 305, mrp: 2000, ont_security: '200 After Disconnection', total_amount: 2000, ott_apps: ['JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo'], ott_detail: 'JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 5, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '2M_100Mbps_OTT2', name: 'Weebo_Dhamaka_S_60', speed: '100Mbps', price: 1100, validity_days: 60, validity_label: '2 Months', base_price: 932, gst: 168, mrp: 1100, ont_security: '200 Refund After Disconnection', total_amount: 1100, ott_apps: ['SonyLiv', 'Chaupal', 'Discovery Plus', 'ShemarooMe'], ott_detail: 'SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 6, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '100Mbps_6M_OTT_DP', name: 'Weebo_Dhamaka_JHS_180', speed: '100Mbps', price: 3000, validity_days: 180, validity_label: '6 Months', base_price: 2542, gst: 458, mrp: 3000, ont_security: '200 Refund After Disconnection', total_amount: 3000, ott_apps: ['JioHotstar', 'SonyLiv', 'Chaupal', 'Discovery Plus'], ott_detail: 'JioHotstar, SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 7, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '100Mbps_12M_OTT', name: 'Weeb_Gold_AJHSZ_365', speed: '100Mbps', price: 6100, validity_days: 365, validity_label: '12 Months', base_price: 5085, gst: 915, mrp: 6000, ont_security: '100', total_amount: 6100, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 8, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '125Mbps_1M_OTT', name: 'Weebo_Dhamaka_ZJHS_30', speed: '125Mbps', price: 700, validity_days: 30, validity_label: '1 Month', base_price: 593, gst: 107, mrp: 700, ont_security: 'Renewals Only', total_amount: 700, ott_apps: ['JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+'], ott_detail: 'JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'renewal', sort_order: 9, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: '1M_100Mbps_OTT', name: 'Weebo_Dhamaka_S_30', speed: '100Mbps', price: 550, validity_days: 30, validity_label: '1 Month', base_price: 466, gst: 84, mrp: 550, ont_security: 'Renewal Only', total_amount: 550, ott_apps: ['SonyLiv', 'Chaupal', 'Discovery Plus', 'ShemarooMe'], ott_detail: 'SonyLiv, Chaupal, Discovery Plus, ShemarooMe (Gujrati Marathi), Hungama, Waves OTT, I-Tap, Shucae Films, OMTV, Runn TV, Aaonxt, Kanchanlanka, Stage OTT, Chana Jor, Shorts TV, Travel XP, Dangal Play, Gamezop, PlayboxTV 400+ Live TV', live_channels: '400+ Live TV', plan_type: 'renewal', sort_order: 10, city: 'all' },

        // --- 3rd Table ---
        { vendor_id: VENDOR_ID, plan_code: '300Mbps_12M_OTT', name: 'Weeb_Gold_AJHSZ_365', speed: '300Mbps', price: 7100, validity_days: 365, validity_label: '12 Months', base_price: 5932, gst: 1068, mrp: 7000, ont_security: '100', total_amount: 7100, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 11, city: 'all' },

        // --- Premium Plans (from main table) ---
        { vendor_id: VENDOR_ID, plan_code: 'PREMIUM_1700_30D', name: 'Weebo Premium 30D', speed: '150Mbps', price: 1700, validity_days: 30, validity_label: '1 Month', mrp: 1700, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 12, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: 'PREMIUM_2500_90D', name: 'Weebo Premium 90D', speed: '150Mbps', price: 2500, validity_days: 90, validity_label: '3 Months', mrp: 2500, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 13, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: 'PREMIUM_7799_365D', name: 'Weebo Premium 365D', speed: '200Mbps', price: 7799, validity_days: 365, validity_label: '12 Months', mrp: 7799, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 14, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: 'PREMIUM_9999_365D', name: 'Weebo Premium Plus 365D', speed: '300Mbps', price: 9999, validity_days: 365, validity_label: '12 Months', mrp: 9999, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 15, city: 'all' },
        { vendor_id: VENDOR_ID, plan_code: 'PREMIUM_11500_365D', name: 'Weebo Ultimate 365D', speed: '500Mbps', price: 11500, validity_days: 365, validity_label: '12 Months', mrp: 11500, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Zee5', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Zee5, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 16, city: 'all' },

        // --- Udaipur specific plans ---
        { vendor_id: VENDOR_ID, plan_code: 'UDR_1500_30D', name: 'Udaipur 30D', speed: '100Mbps', price: 1500, validity_days: 30, validity_label: '1 Month', mrp: 1500, ont_security: '', total_amount: 1500, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 20, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_1649_30D', name: 'Udaipur OTT 30D', speed: '100Mbps', price: 1649, validity_days: 30, validity_label: '1 Month', mrp: 1649, ont_security: '', total_amount: 1649, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 21, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_1799_30D', name: 'Udaipur Premium 30D', speed: '150Mbps', price: 1799, validity_days: 30, validity_label: '1 Month', mrp: 1799, ont_security: '', total_amount: 1799, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 22, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_1999_30D', name: 'Udaipur Ultra 30D', speed: '200Mbps', price: 1999, validity_days: 30, validity_label: '1 Month', mrp: 1999, ont_security: '', total_amount: 1999, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 23, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_2000_90D', name: 'Udaipur 90D', speed: '100Mbps', price: 2000, validity_days: 90, validity_label: '3 Months', mrp: 2000, ont_security: '', total_amount: 2000, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 24, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_3067_90D', name: 'Udaipur OTT 90D', speed: '100Mbps', price: 3067, validity_days: 90, validity_label: '3 Months', mrp: 3067, ont_security: '', total_amount: 3067, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 25, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_3100_90D', name: 'Udaipur Premium 90D', speed: '150Mbps', price: 3100, validity_days: 90, validity_label: '3 Months', mrp: 3100, ont_security: '', total_amount: 3100, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 26, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_3325_180D', name: 'Udaipur 180D', speed: '100Mbps', price: 3325, validity_days: 180, validity_label: '6 Months', mrp: 3325, ont_security: '', total_amount: 3325, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 27, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_3500_210D', name: 'Udaipur 210D', speed: '100Mbps', price: 3500, validity_days: 210, validity_label: '7 Months', mrp: 3500, ont_security: '', total_amount: 3500, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 28, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_3999_180D', name: 'Udaipur Premium 180D', speed: '150Mbps', price: 3999, validity_days: 180, validity_label: '6 Months', mrp: 3999, ont_security: '', total_amount: 3999, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 29, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_4499_365D', name: 'Udaipur 365D', speed: '100Mbps', price: 4499, validity_days: 365, validity_label: '12 Months', mrp: 4499, ont_security: '', total_amount: 4499, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 30, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_4800_365D', name: 'Udaipur Annual', speed: '100Mbps', price: 4800, validity_days: 365, validity_label: '12 Months', mrp: 4800, ont_security: '', total_amount: 4800, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 31, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_5000_395D', name: 'Udaipur 395D', speed: '100Mbps', price: 5000, validity_days: 395, validity_label: '13 Months', mrp: 5000, ont_security: '', total_amount: 5000, ott_apps: ['PlayBoxTV'], ott_detail: 'PlayBoxTV', plan_type: 'both', sort_order: 32, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_5500_365D', name: 'Udaipur Annual OTT', speed: '150Mbps', price: 5500, validity_days: 365, validity_label: '12 Months', mrp: 5500, ont_security: '', total_amount: 5500, ott_apps: ['SonyLiv', 'JioHotstar', 'Shemaroo', 'ALT Balaji', 'Hungama', 'Fancode', 'Chaupal', 'Savan'], ott_detail: 'SonyLiv, Jio-Hotstar, Shemaroo, ALT Balaji, Hungama Play, Kanchanlanka, Dangal, DistroTV, Waves, Savan, Stage, Aao NXT, Fancode, Chaupal, Shorts TV, VR OTT - 350+ Live TV Channels', live_channels: '350+ Live TV', plan_type: 'both', sort_order: 33, city: 'Udaipur' },
        { vendor_id: VENDOR_ID, plan_code: 'UDR_7000_425D', name: 'Udaipur Platinum 425D', speed: '200Mbps', price: 7000, validity_days: 425, validity_label: '14 Months', mrp: 7000, ont_security: '', total_amount: 7000, ott_apps: ['Amazon Lite Prime', 'JioHotstar', 'SonyLiv', 'Discovery+', 'Chaupal', 'Shemaroo', 'Hungama', 'Fancode', 'ETV Win'], ott_detail: 'Amazon Lite Prime, JioHotstar, SonyLiv, Discovery+, Chaupal, Shemaroo, Travel XP, Dangal Play, Shucae Films, Stage, Namma Flix, Raj Tv, Hungama, I Tap, Waves, Jio Saavan, Fancode, Distro TV, OM TV, Kanchan Lanka, Chana Jor, Shorts TV, Run TV, ETV Win, PlayboxTV + 400 Live TV Channels', live_channels: '400+ Live TV', plan_type: 'both', sort_order: 34, city: 'Udaipur' }
    ];

    // Clear existing data
    await FAQ.deleteMany({ vendor_id: VENDOR_ID });
    await Plan.deleteMany({ vendor_id: VENDOR_ID });
    console.log('Cleared existing FAQ and Plan data');

    // Insert FAQs
    await FAQ.insertMany(faqs);
    console.log(`Inserted ${faqs.length} FAQs`);

    // Insert Plans
    await Plan.insertMany(plans);
    console.log(`Inserted ${plans.length} plans`);

    console.log('\n✅ Knowledge base seeded successfully!');
    console.log(`   - Vendor ID: ${VENDOR_ID}`);
    console.log(`   - Change VENDOR_ID in .env or run: VENDOR_ID=your_vendor_id node seed_knowledge.js`);

    await mongoose.disconnect();
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
