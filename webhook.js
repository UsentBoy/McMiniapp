// --- api/webhook.js ---

const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');

// VERCEL SECRET থেকে Firebase Admin Key লোড করা
// JSON স্ট্রিংটিকে Parse করে একটি কনফিগারেশন অবজেক্ট তৈরি করুন
try {
    const serviceAccountJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://mangoxcoin-default-rtdb.firebaseio.com"
    });
} catch (e) {
    console.error("Firebase Admin initialization failed. Check Vercel Environment Variables.");
    console.error(e);
}

const db = admin.firestore();
const app = express();

// Telegram Webhook রিকোয়েস্ট পার্স করার জন্য middleware
app.use(bodyParser.json());

// Telegram Bot Token Vercel Secret থেকে লোড করুন
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_ID = "mangoxcoin"; // আপনার Firebase Project ID বা App ID

// --- রেফারেল পুরষ্কার প্রদান লজিক ---
async function awardReferral(referrerId, newUserId) {
    console.log(`Processing referral: ${newUserId} referred by ${referrerId}`);
    const REFERRAL_BONUS = 25; 

    // রেফারারের ডকুমেন্ট রেফারেন্স
    const referrerDocRef = db.doc(`artifacts/${APP_ID}/users/${referrerId}/user_data/profile`); 

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(referrerDocRef);

            if (doc.exists) {
                // ডেটাবেসে পুরষ্কার আপডেট
                transaction.update(referrerDocRef, {
                    totalReferrals: admin.firestore.FieldValue.increment(1),
                    referralEarnings: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
                    balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS)
                });

                // Mini App-এ নোটিফিকেশন পাঠানোর লজিক
                await db.collection(`artifacts/${APP_ID}/public/data/notifications`).add({
                    recipientId: referrerId,
                    message: `Congrats! You earned ${REFERRAL_BONUS} TK from a new referral! (@${newUserId})`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Referral reward successful for ${referrerId}`);
            } else {
                console.warn(`Referrer profile not found for ID: ${referrerId}`);
            }
        });
        return true;
    } catch (error) {
        console.error("Transaction failed during referral award:", error);
        return false;
    }
}

// --- Webhook রিকোয়েস্ট হ্যান্ডলার (Vercel Entry Point) ---
app.post('/api/webhook', async (req, res) => {
    const update = req.body;

    if (update.message && update.message.text) {
        const messageText = update.message.text;
        const chatId = update.message.chat.id;
        const newUserId = update.message.from.id.toString();

        // /start কমান্ডের জন্য চেক করুন
        if (messageText.startsWith('/start ')) {
            const referrerId = messageText.substring(7); // /start এর পরে থাকা আইডি

            if (referrerId && referrerId !== newUserId) {
                await awardReferral(referrerId, newUserId);
                // বটকে উত্তর দিন (ঐচ্ছিক)
                // await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify({ chat_id: chatId, text: "Referral registered! Welcome to Mango X Coin." })
                // });
            }
        }
    }

    // Vercel ফাংশন রিকোয়েস্ট শেষ করুন
    res.status(200).send('OK');
});

// Vercel ফাংশন এক্সপোর্ট করুন
module.exports = app;
