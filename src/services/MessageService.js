const axios = require('axios');
const path = require('path');
const { createOrGetChatroom, saveMessage, Message, Vendor, getAgentContext, lookupContactByPhone } = require('../models/database');
const { WEEBO_PROMPT, buildCustomerContext } = require('./promptBuilder');
const { transcribeAudio } = require('./ai/STTService');
const { analyzeImage } = require('./ai/VisionService');
const { PDFAnalysisService } = require('./ai/PDFAnalysisService');
const { detectIntent } = require('./ai/IntentService');
const { analyzeSentiment } = require('./ai/SentimentService');
const { autoTagFromIntent } = require('./ai/TaggingService');
const WhatsAppService = require('./WhatsAppService');
const BillingEngine = require('./billing/BillingEngine');
const tokenOptimizer = require('../utils/tokenOptimizer');
const knowledgeService = require('./KnowledgeService');

class MessageService {
    constructor() {
        this.billingEngine = new BillingEngine();
        this.API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';
    }

    async handleIncomingMessage(message, value, phoneNumberId) {
        const from = message.from;
        const messageType = message.type;
        let messageText = '';
        let mediaInfo = '';

        console.log(`[WEBHOOK] Input - From: ${from}, Type: ${messageType}, Phone ID: ${phoneNumberId}`);

        // VENDOR IDENTIFICATION
        const vendor = await Vendor.findOne({
            whatsapp_phone_id: phoneNumberId,
            is_active: true
        });

        if (!vendor) {
            console.log(`[VENDOR_NOT_FOUND] No vendor found for phone_number_id: ${phoneNumberId}`);
            return;
        }

        console.log(`[VENDOR_FOUND] Message for vendor: ${vendor.company_name} (${vendor.vendor_id})`);

        // 🔥 CHECK FOR FEEDBACK RESPONSE FIRST
        const { FeedbackService } = require('../models/FeedbackModel');
        const isAwaitingFeedback = await FeedbackService.isAwaitingFeedback(from);
        
        if (isAwaitingFeedback && messageType === 'text') {
            const feedbackProcessed = await FeedbackService.processFeedbackResponse(from, message.text?.body || '');
            if (feedbackProcessed) {
                console.log(`[FEEDBACK] Processed feedback response from ${from}`);
                return; // Don't process as regular message
            }
        }

        // Handle different message types
        if (messageType === 'text') {
            messageText = message.text?.body || '';
        } else if (['image', 'audio', 'video', 'document'].includes(messageType)) {
            const mediaData = message[messageType];
            const caption = mediaData?.caption || '';

            try {
                const fileName = await WhatsAppService.downloadMedia(mediaData.id, messageType, from, vendor.vendor_id);
                mediaInfo = `[Media received: ${messageType}${fileName ? ` - ${fileName}` : ''}]`;

                if (fileName) {
                    messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
                    messageText += `|FILENAME:${fileName}`;
                } else {
                    messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
                }

                console.log(`Media downloaded: ${fileName}`);
            } catch (error) {
                console.log(`Media download failed: ${error.message}`);
                mediaInfo = `[Media received: ${messageType} - download failed]`;
                messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
            }
        } else {
            console.log(`Unsupported message type: ${messageType}`);
            return;
        }

        if (!messageText.trim()) return;

        // Mark message as read
        await WhatsAppService.markMessageAsRead(message.id, vendor.vendor_id);

        // 🔥 COMPLAINT INTEGRATION: Detect complaint, collect details, register via CRM API
        const { ComplaintService } = require('./ComplaintService');
        const complaintHandled = await ComplaintService.handleMessage(vendor, from, messageText);
        if (complaintHandled) {
            console.log(`[COMPLAINT] Message handled by complaint flow for ${from}`);
            return;
        }

        try {
            const businessId = vendor.business_id || 1;
            const agentId = vendor.agent_id || 1;

            // Create or get chatroom
            const chatroom = await createOrGetChatroom(vendor.vendor_id, businessId, agentId, from, from);
            
            if (!chatroom) {
                console.log(`[CHATROOM] Failed to create/get chatroom for ${from}`);
                await WhatsAppService.sendMessage(from, 'Sorry, there was an issue processing your message. Please try again.', vendor.vendor_id);
                return;
            }

            // Save user message with AI intelligence
            const mediaUrl = mediaInfo ? `uploads/${mediaInfo.split(' - ')[1]?.replace(']', '')}` : null;
            const userMessage = await this.saveMessageWithAI(vendor.vendor_id, chatroom._id, 'user', messageText, from, messageType !== 'text' ? messageType : null, mediaUrl, message.id);

            // Collect AI usage data for billing
            let aiUsageData = [];
            if (userMessage.aiUsageData) {
                aiUsageData = [...userMessage.aiUsageData];
            }
            if (userMessage.mediaUsageData) {
                aiUsageData = [...aiUsageData, ...userMessage.mediaUsageData];
            }

            // Get agent context
            const agentContextData = await getAgentContext(vendor.vendor_id, businessId, agentId);
            
            // 🔥 LOOKUP CUSTOMER DATA FROM UPLOADED CONTACTS
            const customerData = await lookupContactByPhone(vendor.vendor_id, from, messageText);
            const customerContext = buildCustomerContext(customerData, from);
            
            console.log(`[CONTACT_LOOKUP] Phone: ${from}, Found: ${!!customerData}, Verified: ${customerContext.identityVerified}`);
            
            // Get optimized conversation history
            const rawHistory = await this.getOptimizedHistory(chatroom._id, 8);
            console.log(`[HISTORY] Retrieved ${rawHistory.length} previous messages for context`);
            
            // ⚡ OPTIMIZATION: Apply token budgeting
            const conversationHistory = tokenOptimizer.optimizeHistory(rawHistory);
            const estimatedTokens = tokenOptimizer.estimateTokens(
                conversationHistory.map(m => m.content).join(' ')
            );
            console.log(`[TOKEN_OPTIMIZER] History uses ~${estimatedTokens} tokens`);
            
            // 🔥 SANITIZE HISTORY: When identity verified, fix old wrong greeting messages in history
            if (customerContext.identityVerified) {
                const histName = customerContext.customerData?.name || '';
                for (let i = 0; i < conversationHistory.length; i++) {
                    if (conversationHistory[i].role === 'assistant' && 
                        conversationHistory[i].content.includes('May I know your name and registered mobile number')) {
                        const newGreeting = histName 
                            ? `Hello ${histName}! Welcome to Weebo Broadband, this is Priya. How can I help you today?`
                            : `Hello! Welcome to Weebo Broadband, this is Priya. How can I help you today?`;
                        conversationHistory[i].content = newGreeting;
                        console.log(`[HISTORY] Fixed old greeting in history message ${i} for ${from}`);
                    }
                }
            }
            
            // 🔥 FIX: Include media analysis in current message
            let enhancedMessage = messageText;
            if (userMessage.media_analysis && userMessage.media_analysis.analysis_summary) {
                const analysis = userMessage.media_analysis;
                enhancedMessage = `[${analysis.type.toUpperCase()} ANALYSIS: ${analysis.analysis_summary}]`;
                
                if (analysis.key_details) {
                    const details = Object.entries(analysis.key_details)
                        .filter(([k, v]) => v && v !== '')
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ');
                    if (details) {
                        enhancedMessage += ` [Details: ${details}]`;
                    }
                }
                
                // Add original message if exists
                const originalMsg = messageText.replace(/\[Media received:.*?\]/g, '').trim();
                if (originalMsg && originalMsg.length > 0) {
                    enhancedMessage += ` | User message: ${originalMsg}`;
                }
                
                console.log(`[MEDIA_CONTEXT] Enhanced message with analysis for agent`);
            }
            // Enhanced context with PDF analysis capabilities
            let contextText;
            const basePrompt = WEEBO_PROMPT;
            
            if (customerData && customerContext.contextText) {
                let workingPrompt = basePrompt;
                
                // If identity is verified, replace STEP 1 (greeting + identity) with direct greeting
                if (customerContext.identityVerified) {
                    const name = customerContext.customerData?.name || '';
                    const salutation = customerContext.customerData?.gender || 'Sir';
                    const step1New = `## STEP 1 — GREETING (IDENTITY VERIFIED)\n\nThe customer's WhatsApp number matches their registered mobile number. Identity is already confirmed.\n\nSkip asking for name or mobile number. Greet them by name directly:\n\nHINGLISH: "Namaste! 😊 Weebo Broadband mein aapka swagat hai ${name ? name + ' ' + salutation : 'ji'}! Main Priya hoon. Batayein, main aapki kis tarah madad kar sakti hoon?"\n\nENGLISH: "${name ? 'Hello ' + name + '! ' : ''}Welcome to Weebo Broadband, this is Priya. How can I help you today?"\n\n→ Go to STEP 2\n\n`;
                    workingPrompt = workingPrompt.replace(/## STEP 1 — GREETING & IDENTITY[\s\S]*?(?=## STEP 2 — REASON FOR CONTACT)/, step1New);
                    console.log(`[PROMPT] Identity verified — replaced STEP 1 with direct greeting for ${from}`);
                }
                
                contextText = `${workingPrompt}\n\n${customerContext.contextText}`;
                
                console.log(`[PROMPT] Using Weebo prompt with customer data for ${from}`);
            } else if (agentContextData) {
                // No customer data found — use agent context from DB (fallback)
                contextText = `${basePrompt}\n\nCUSTOMER DATA: No records found for this phone number.\n\nADDITIONAL CONTEXT:\n${agentContextData.context}`;
                console.log(`[PROMPT] Using Weebo prompt without customer data for ${from}`);
            } else {
                // No customer data, no agent context — use base prompt only
                contextText = `${basePrompt}\n\nCUSTOMER DATA: No records found for this phone number. Treat all fields as MISSING.`;
                console.log(`[PROMPT] Using base Weebo prompt for ${from}`);
            }

            // 🔥 KNOWLEDGE BASE: Inject relevant FAQ & Plan data
            const knowledgeContext = await knowledgeService.buildKnowledgeContext(vendor.vendor_id, messageText);
            if (knowledgeContext) {
                contextText += `\n\n--- KNOWLEDGE BASE ---\n${knowledgeContext}`;
                contextText += `\n\nIMPORTANT: Use the FAQs above to answer the customer's question accurately. For plan/pricing queries, use the plan data provided above. If the answer is not in the knowledge base, follow the normal flow.`;
                console.log(`[KNOWLEDGE] Injected ${knowledgeContext.length} chars of context for ${from}`);
            }

            // 🔥 FINAL OVERRIDE: When identity is verified, break the historical pattern
            // (placed at end for recency bias — GPT follows latest instructions most strongly)
            if (customerContext.identityVerified) {
                const overrideName = customerContext.customerData?.name || '';
                contextText += `\n\n### ⚠️ FINAL OVERRIDE — READ CAREFULLY\n`;
                contextText += `The customer's identity (${overrideName}) is ALREADY verified and confirmed.\n`;
                contextText += `DO NOT ask for their name or registered mobile number under ANY circumstances.\n`;
                contextText += `DO NOT use the old greeting "May I know your name and registered mobile number?" — that is now WRONG.\n`;
                contextText += `Ignore any previous messages in the history where the assistant asked for name/number — those were mistakes.\n`;
                contextText += `This customer is ${overrideName} and their identity is confirmed. Start fresh.\n`;
                console.log(`[PROMPT] Added final override for verified identity of ${from}`);
            }

            const agentRequest = {
                business_id: businessId,
                agent_id: agentId,
                thread_id: from,
                user_message: enhancedMessage, // 🔥 Use enhanced message with media analysis
                context: contextText,
                conversation_history: conversationHistory,
                tools: [
                    {
                        name: "submit_feedback",
                        description: "Submit user feedback rating when user provides rating or feedback",
                        parameters: {
                            rating: "number 1-5",
                            feedback_text: "original user message"
                        }
                    }
                ]
            };

            console.log(`[MESSAGE_LIFECYCLE] PROCESSING - Vendor: ${vendor.vendor_id}, From: ${from}`);
            
            let response;
            try {
                response = await axios.post(`${this.API_BASE}/agent/process`, agentRequest, {
                    timeout: 30000,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (apiError) {
                console.error(`[AGENT_API] Error calling agent service:`, apiError.message);
                await WhatsAppService.sendMessage(from, 'I received your message. Let me help you with that. Could you please provide more details?', vendor.vendor_id);
                return;
            }

            // Collect agent API usage for billing
            if (response.data.token_usage) {
                aiUsageData.push({
                    service_type: 'agent_process',
                    model_name: response.data.model_name || 'gpt-4o-mini',
                    prompt_tokens: response.data.token_usage.prompt_tokens || 0,
                    completion_tokens: response.data.token_usage.completion_tokens || 0,
                    total_tokens: response.data.token_usage.total_tokens || 0,
                    duration_seconds: 0
                });
            }

            await WhatsAppService.sendMessage(from, response.data.ai_response, vendor.vendor_id);
            console.log(`[MESSAGE_LIFECYCLE] RESPONDED - Vendor: ${vendor.vendor_id}, From: ${from}`);

            // Handle tool calls
            if (response.data.tool_calls) {
                const { FeedbackAPI } = require('./FeedbackService');
                
                for (const toolCall of response.data.tool_calls) {
                    if (toolCall.name === 'submit_feedback') {
                        try {
                            await FeedbackAPI.submitFeedback(
                                vendor.vendor_id,
                                chatroom._id,
                                from,
                                toolCall.parameters.rating,
                                toolCall.parameters.feedback_text
                            );
                        } catch (error) {
                            console.error('[FEEDBACK] Tool call failed:', error);
                        }
                    }
                }
            }

            // Save bot response
            const botMessage = await this.saveMessageWithResolutionAnalysis(vendor.vendor_id, chatroom._id, 'bot', response.data.ai_response, from, messageText);

            if (botMessage.resolutionUsageData) {
                aiUsageData.push(botMessage.resolutionUsageData);
            }

            // 🤖 Auto-close conversation if AI resolved with high confidence
            if (botMessage.resolution_analysis) {
                console.log(`[RESOLUTION] Analysis result: resolved=${botMessage.resolution_analysis.resolved}, confidence=${botMessage.resolution_analysis.confidence}, reason="${botMessage.resolution_analysis.reason}"`);
                
                const { autoCloseIfResolved } = require('../services/SLAService');
                const autoClosed = await autoCloseIfResolved(chatroom._id, botMessage.resolution_analysis);
                if (autoClosed) {
                    console.log(`[SLA] Auto-closed conversation ${chatroom._id} due to high confidence resolution`);
                    
                    // 🔥 NEW: Request feedback after AI auto-close
                    const { FeedbackService } = require('../models/FeedbackModel');
                    await FeedbackService.scheduleFeedbackRequest(
                        vendor.vendor_id,
                        chatroom._id,
                        from,
                        'resolution_confident',
                        1, // Send in 1 minute instead of 5
                        botMessage.resolution_analysis.confidence
                    );
                    console.log(`[FEEDBACK] Scheduled confident resolution feedback for ${from}`);
                } else {
                    console.log(`[SLA] No auto-close triggered - confidence ${botMessage.resolution_analysis.confidence} below threshold`);
                }
            }

            // Process billing
            try {
                if (aiUsageData.length > 0) {
                    const costCalculation = await this.billingEngine.calculateMessageCost(
                        vendor.vendor_id,
                        from,
                        aiUsageData,
                        userMessage._id
                    );

                    await this.billingEngine.chargeVendor(
                        vendor.vendor_id,
                        from,
                        userMessage._id,
                        costCalculation
                    );
                }
            } catch (billingError) {
                console.error('[BILLING] Billing failed:', billingError.message);
                
                // 🔥 FIX: Handle insufficient balance gracefully
                if (billingError.message.includes('Insufficient balance')) {
                    console.error(`[BILLING] ⚠️ LOW BALANCE ALERT for vendor ${vendor.vendor_id}`);
                    
                    // TODO: Send email/SMS notification to vendor
                    // For now, log critical alert
                    console.error(`[BILLING] 🚨 CRITICAL: Vendor ${vendor.company_name} has insufficient balance!`);
                    console.error(`[BILLING] Service will continue but vendor needs to top up immediately.`);
                    
                    // Optional: Send WhatsApp notification to vendor's registered number
                    // await this.notifyVendorLowBalance(vendor);
                }
            }

        } catch (error) {
            console.log(`[MESSAGE_LIFECYCLE] ERROR - Vendor: ${vendor.vendor_id}, From: ${from}, Error: ${error.message}`);
            try {
                await WhatsAppService.sendMessage(from, 'Sorry, I encountered an error. Please try again.', vendor.vendor_id);
            } catch (sendError) {
                console.log(`[SEND_ERROR] Failed to send error message: ${sendError.message}`);
            }
        }
    }

    async saveMessageWithAI(vendorId, chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
        try {
            let intent = null;
            let sentiment = null;
            let tags = [];
            const aiUsageData = [];
            const mediaUsageData = [];
            let processedContent = content;
            let mediaAnalysis = null;

            // Process media if filename is embedded
            if (content.includes('|FILENAME:')) {
                const [baseContent, filenamePart] = content.split('|FILENAME:');
                const fileName = filenamePart;
                processedContent = baseContent;
                
                if (mediaType === 'audio' && fileName) {
                    const audioPath = path.join(__dirname, '../../uploads', fileName);
                    const transcriptionResult = await transcribeAudio(audioPath);
                    if (transcriptionResult && transcriptionResult.text) {
                        processedContent += ` [Transcription: ${transcriptionResult.text}]`;
                        
                        mediaAnalysis = {
                            type: 'audio',
                            extracted_text: transcriptionResult.text,
                            analysis_summary: `Audio transcription: ${transcriptionResult.text}`,
                            file_info: {
                                original_name: fileName,
                                mime_type: 'audio/ogg'
                            }
                        };
                        
                        if (transcriptionResult.duration) {
                            mediaUsageData.push({
                                service_type: 'stt',
                                model_name: 'whisper-1',
                                prompt_tokens: 0,
                                completion_tokens: 0,
                                total_tokens: 0,
                                duration_seconds: transcriptionResult.duration,
                                base_cost_usd_micro: Math.round((transcriptionResult.duration / 60) * 6000)
                            });
                        }
                    }
                } else if (mediaType === 'image' && fileName) {
                    const imagePath = path.join(__dirname, '../../uploads', fileName);
                    const imageResult = await analyzeImage(imagePath);
                    if (imageResult && imageResult.analysis) {
                        processedContent += ` [Image Analysis: ${imageResult.analysis}]`;
                        
                        mediaAnalysis = {
                            type: 'image',
                            analysis_summary: imageResult.analysis,
                            file_info: {
                                original_name: fileName,
                                mime_type: 'image/jpeg'
                            },
                            verification: {
                                authenticity_score: 0,
                                verification_status: 'UNKNOWN',
                                issues_found: []
                            }
                        };
                        
                        // Check if image contains financial document and perform verification
                        const financialKeywords = ['invoice', 'bill', 'receipt', 'statement', 'payment', 'amount', 'total', 'tax', 'due'];
                        const containsFinancialContent = financialKeywords.some(keyword => 
                            imageResult.analysis.toLowerCase().includes(keyword)
                        );
                        
                        if (containsFinancialContent) {
                            const { BillVerificationService } = require('./ai/BillVerificationService');
                            const mockPdfAnalysis = {
                                summary: imageResult.analysis,
                                document_type: 'invoice', // Assume invoice for images
                                key_details: {
                                    amount: '',
                                    date: '',
                                    company: ''
                                }
                            };
                            
                            const verificationResult = await BillVerificationService.verifyBillAuthenticity(
                                mockPdfAnalysis, 
                                processedContent
                            ).catch(err => ({ success: false }));
                            
                            if (verificationResult.success) {
                                mediaAnalysis.verification = {
                                    authenticity_score: verificationResult.verification.authenticity_score,
                                    verification_status: verificationResult.verification.verification_status,
                                    issues_found: verificationResult.verification.issues_found || []
                                };
                                
                                if (verificationResult.tokenUsage) {
                                    mediaUsageData.push({
                                        service_type: 'bill_verification',
                                        model_name: 'gpt-4o-mini',
                                        prompt_tokens: verificationResult.tokenUsage.prompt_tokens || 0,
                                        completion_tokens: verificationResult.tokenUsage.completion_tokens || 0,
                                        total_tokens: verificationResult.tokenUsage.total_tokens || 0,
                                        duration_seconds: 0
                                    });
                                }
                            }
                        }
                        
                        if (imageResult.tokenUsage) {
                            mediaUsageData.push({
                                service_type: 'vision',
                                model_name: 'gpt-4o-mini',
                                prompt_tokens: imageResult.tokenUsage.prompt_tokens || 0,
                                completion_tokens: imageResult.tokenUsage.completion_tokens || 0,
                                total_tokens: imageResult.tokenUsage.total_tokens || 0,
                                duration_seconds: 0
                            });
                        }
                    }
                } else if (mediaType === 'document' && fileName) {
                    // Check if it's a PDF
                    if (fileName.toLowerCase().endsWith('.pdf')) {
                        const pdfPath = path.join(__dirname, '../../uploads', fileName);
                        const pdfResult = await PDFAnalysisService.analyzePDF(pdfPath, baseContent);
                        
                        if (pdfResult.success) {
                            processedContent += ` [PDF Analysis: ${pdfResult.analysis.summary}]`;
                            processedContent += ` [Document Type: ${pdfResult.analysis.document_type}]`;
                            
                            if (pdfResult.analysis.key_details) {
                                const details = Object.entries(pdfResult.analysis.key_details)
                                    .filter(([key, value]) => value && value !== '')
                                    .map(([key, value]) => `${key}: ${value}`)
                                    .join(', ');
                                if (details) {
                                    processedContent += ` [Key Details: ${details}]`;
                                }
                            }
                            
                            mediaAnalysis = {
                                type: 'pdf',
                                extracted_text: pdfResult.analysis.extracted_text || '',
                                analysis_summary: pdfResult.analysis.summary,
                                key_details: {
                                    amount: pdfResult.analysis.key_details?.amount || '',
                                    date: pdfResult.analysis.key_details?.date || '',
                                    company: pdfResult.analysis.key_details?.company || '',
                                    document_type: pdfResult.analysis.document_type || '',
                                    service_type: pdfResult.analysis.key_details?.service_type || '',
                                    due_date: pdfResult.analysis.key_details?.due_date || '',
                                    account_number: pdfResult.analysis.key_details?.account_number || ''
                                },
                                file_info: {
                                    original_name: fileName,
                                    mime_type: 'application/pdf'
                                },
                                verification: {
                                    authenticity_score: 0,
                                    verification_status: 'UNKNOWN',
                                    issues_found: []
                                }
                            };
                            
                            // Perform bill verification for financial documents
                            if (pdfResult.analysis.document_type && 
                                ['bill', 'invoice', 'receipt', 'statement'].includes(pdfResult.analysis.document_type.toLowerCase())) {
                                const { BillVerificationService } = require('./ai/BillVerificationService');
                                const verificationResult = await BillVerificationService.verifyBillAuthenticity(
                                    pdfResult.analysis, 
                                    processedContent
                                ).catch(err => ({ success: false }));
                                
                                if (verificationResult.success) {
                                    mediaAnalysis.verification = {
                                        authenticity_score: verificationResult.verification.authenticity_score,
                                        verification_status: verificationResult.verification.verification_status,
                                        issues_found: verificationResult.verification.issues_found || []
                                    };
                                    
                                    if (verificationResult.tokenUsage) {
                                        mediaUsageData.push({
                                            service_type: 'bill_verification',
                                            model_name: 'gpt-4o-mini',
                                            prompt_tokens: verificationResult.tokenUsage.prompt_tokens || 0,
                                            completion_tokens: verificationResult.tokenUsage.completion_tokens || 0,
                                            total_tokens: verificationResult.tokenUsage.total_tokens || 0,
                                            duration_seconds: 0
                                        });
                                    }
                                }
                            }
                            
                            if (pdfResult.tokenUsage) {
                                mediaUsageData.push({
                                    service_type: 'pdf_analysis',
                                    model_name: 'gpt-4o-mini',
                                    prompt_tokens: pdfResult.tokenUsage.prompt_tokens || 0,
                                    completion_tokens: pdfResult.tokenUsage.completion_tokens || 0,
                                    total_tokens: pdfResult.tokenUsage.total_tokens || 0,
                                    duration_seconds: 0
                                });
                            }
                        } else {
                            processedContent += ` [PDF received but analysis failed: ${pdfResult.error}]`;
                        }
                    } else {
                        processedContent += ` [Document received: ${fileName}]`;
                    }
                }
            }

            // AI analysis for user messages (skip for media-only messages to save tokens)
            if (messageType === 'user' && processedContent && !processedContent.includes('[Media received:')) {
                // Only run intent/sentiment for text messages, not media
                const hasText = processedContent.replace(/\[.*?\]/g, '').trim().length > 10;
                
                if (hasText) {
                    const [detectedIntent, detectedSentiment] = await Promise.all([
                        detectIntent(processedContent).catch(err => ({ intent: null, tokenUsage: null })),
                        analyzeSentiment(processedContent).catch(err => ({ sentiment: null, tokenUsage: null }))
                    ]);

                    intent = detectedIntent.intent;
                    sentiment = detectedSentiment.sentiment;

                    if (detectedIntent.tokenUsage) {
                        aiUsageData.push({
                            service_type: 'intent',
                            model_name: 'gpt-3.5-turbo',
                            prompt_tokens: detectedIntent.tokenUsage.prompt_tokens || 0,
                            completion_tokens: detectedIntent.tokenUsage.completion_tokens || 0,
                            total_tokens: detectedIntent.tokenUsage.total_tokens || 0,
                            duration_seconds: 0
                        });
                    }

                    if (detectedSentiment.tokenUsage) {
                        aiUsageData.push({
                            service_type: 'sentiment',
                            model_name: 'gpt-3.5-turbo',
                            prompt_tokens: detectedSentiment.tokenUsage.prompt_tokens || 0,
                            completion_tokens: detectedSentiment.tokenUsage.completion_tokens || 0,
                            total_tokens: detectedSentiment.tokenUsage.total_tokens || 0,
                            duration_seconds: 0
                        });
                    }

                    if (intent) {
                        tags = await autoTagFromIntent(intent, processedContent).catch(err => []);
                    }
                } else {
                    console.log('[AI_PROCESSING] Skipping intent/sentiment for media-only message (token optimization)');
                }
            }

            const message = new Message({
                vendor_id: vendorId,
                chatroom_id: chatroomId,
                message_type: messageType,
                content: processedContent,
                phone_number: phoneNumber,
                media_type: mediaType,
                media_url: mediaUrl,
                whatsapp_message_id: whatsappMessageId,
                intent: intent,
                sentiment: sentiment,
                media_analysis: mediaAnalysis
            });

            const savedMessage = await message.save();

            // Update chatroom with tags
            if (tags.length > 0) {
                const { Chatroom } = require('../models/database');
                const chatroom = await Chatroom.findById(chatroomId);
                if (chatroom) {
                    const existingTags = chatroom.tags || [];
                    const newTags = [...new Set([...existingTags, ...tags])];
                    await Chatroom.findByIdAndUpdate(chatroomId, { tags: newTags });
                }
            }

            savedMessage.aiUsageData = aiUsageData;
            savedMessage.mediaUsageData = mediaUsageData;
            return savedMessage;
        } catch (error) {
            console.error(`[AI_PROCESSING] Error saving message with AI for vendor ${vendorId}:`, error);
            throw error;
        }
    }

    async saveMessageWithResolutionAnalysis(vendorId, chatroomId, messageType, content, phoneNumber, userMessage = null) {
        try {
            let resolutionAnalysis = null;
            let resolutionUsageData = null;

            if (messageType === 'bot' && userMessage) {
                const { analyzeQueryResolution } = require('./ai/ResolutionService');
                const analysis = await analyzeQueryResolution(userMessage, content).catch(err => ({
                    resolved: false, confidence: 0, reason: 'Analysis failed', resolution_type: 'no_resolution', tokenUsage: null
                }));

                resolutionAnalysis = {
                    resolved: analysis.resolved,
                    confidence: analysis.confidence,
                    reason: analysis.reason,
                    resolution_type: analysis.resolution_type,
                    analyzed_at: new Date()
                };

                if (analysis.tokenUsage) {
                    resolutionUsageData = {
                        service_type: 'resolution_analysis',
                        model_name: 'gpt-3.5-turbo',
                        prompt_tokens: analysis.tokenUsage.prompt_tokens || 0,
                        completion_tokens: analysis.tokenUsage.completion_tokens || 0,
                        total_tokens: analysis.tokenUsage.total_tokens || 0,
                        duration_seconds: 0
                    };
                }
            }

            const message = new Message({
                vendor_id: vendorId,
                chatroom_id: chatroomId,
                message_type: messageType,
                content: content,
                phone_number: phoneNumber,
                resolution_analysis: resolutionAnalysis
            });

            const savedMessage = await message.save();

            if (resolutionUsageData) {
                savedMessage.resolutionUsageData = resolutionUsageData;
            }
            
            return savedMessage;
        } catch (error) {
            console.error(`[RESOLUTION] Error saving message with resolution analysis for vendor ${vendorId}:`, error);
            throw error;
        }
    }

    async getOptimizedHistory(chatroomId, limit = 8) {
        try {
            const { Message } = require('../models/database');
            
            // Get recent messages (excluding current message being processed)
            const recentMessages = await Message.find({ chatroom_id: chatroomId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
            
            // Convert to conversation history format (reverse to chronological order)
            const conversationHistory = recentMessages.reverse().map(msg => {
                let content;
                
                // 🔥 FIX: Preserve FULL media context for agent memory
                if (msg.media_analysis && msg.media_analysis.type) {
                    const mediaType = msg.media_analysis.type.toUpperCase();
                    const summary = msg.media_analysis.analysis_summary || '';
                    const keyDetails = msg.media_analysis.key_details ? 
                        Object.entries(msg.media_analysis.key_details)
                            .filter(([k, v]) => v && v !== '')
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ') : '';
                    
                    // Build comprehensive media context
                    let mediaContext = `[${mediaType}]`;
                    if (summary) mediaContext += ` ${summary}`;
                    if (keyDetails) mediaContext += ` | Details: ${keyDetails}`;
                    
                    // Extract user's question from content (remove analysis tags)
                    const userQuestion = msg.content
                        .replace(/\[Media received:.*?\]/g, '')
                        .replace(/\[PDF Analysis:.*?\]/g, '')
                        .replace(/\[Image Analysis:.*?\]/g, '')
                        .replace(/\[Transcription:.*?\]/g, '')
                        .replace(/\[Document Type:.*?\]/g, '')
                        .replace(/\[Key Details:.*?\]/g, '')
                        .trim();
                    
                    if (userQuestion && userQuestion.length > 0) {
                        mediaContext += ` | User: ${userQuestion}`;
                    }
                    
                    content = mediaContext.substring(0, 1500); // Increased limit for media
                } else {
                    // For text messages, use standard truncation
                    content = msg.content.length > 800 ? msg.content.substring(0, 800) + '...' : msg.content;
                }
                
                return {
                    role: msg.message_type === 'user' ? 'user' : 'assistant',
                    content: content
                };
            });
            
            console.log(`[HISTORY] Prepared ${conversationHistory.length} messages with media context`);
            return conversationHistory;
        } catch (error) {
            console.error('[HISTORY] Error getting optimized history:', error);
            return [];
        }
    }
}

module.exports = new MessageService();