// ============================================
// APPWRITE SERVER-SIDE CLIENT
// Used for: email OTP delivery, file storage
// ============================================
const sdk = require('node-appwrite');

let _client = null;

function getAppwriteClient() {
    if (!_client) {
        const endpoint = process.env.APPWRITE_ENDPOINT;
        const projectId = process.env.APPWRITE_PROJECT_ID;
        const apiKey = process.env.APPWRITE_API_KEY;

        if (!endpoint || !projectId || !apiKey) {
            console.warn('⚠️ Appwrite env vars not fully set (APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY). Email delivery will fall back to console.');
        }

        _client = new sdk.Client()
            .setEndpoint(endpoint || 'https://syd.cloud.appwrite.io/v1')
            .setProject(projectId || '')
            .setKey(apiKey || '');
    }
    return _client;
}

/**
 * Send OTP via Appwrite Messaging (Email).
 * Falls back to console log if messaging is not configured.
 */
async function sendOtpEmail(toEmail, otpCode, purpose = 'login') {
    try {
        const client = getAppwriteClient();
        const messaging = new sdk.Messaging(client);
        const users = new sdk.Users(client);

        // Find or create Appwrite user for email
        let appwriteUserId;
        try {
            const existingUsers = await users.list([sdk.Query.equal('email', toEmail)]);
            if (existingUsers.users.length > 0) {
                appwriteUserId = existingUsers.users[0].$id;
            } else {
                const newUser = await users.create(
                    sdk.ID.unique(),
                    toEmail,
                    undefined,
                    undefined,
                    toEmail.split('@')[0]
                );
                appwriteUserId = newUser.$id;
            }
        } catch (userErr) {
            console.warn('⚠️ Appwrite user lookup failed:', userErr.message);
            appwriteUserId = sdk.ID.unique();
        }

        const purposeLabel = purpose === 'login' ? 'sign in' : purpose;
        const subject = `Your ${purposeLabel} OTP – EmproiumVipani`;
        const body = `Hi,\n\nYour one-time verification code for EmproiumVipani is:\n\n  ${otpCode}\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\nIf you did not request this, please ignore this email.\n\n– Team EmproiumVipani`;

        await messaging.createEmail(
            sdk.ID.unique(),   // messageId
            subject,           // subject
            body,              // body (plain text)
            [],                // topics
            [appwriteUserId],  // users
            [],                // targets
            [],                // cc
            [],                // bcc
            [],                // attachments
            false,             // draft
            false              // html (false = plain text)
        );

        console.log(`✅ OTP sent via Appwrite email to ${toEmail}`);
        return true;
    } catch (err) {
        console.warn(`⚠️ Appwrite email delivery failed: ${err.message}`);
        // FALLBACK: log to console so developers can still test
        console.log(`🔐 [DEV FALLBACK] OTP for ${toEmail}: ${otpCode}`);
        return false;
    }
}

module.exports = { getAppwriteClient, sendOtpEmail };
