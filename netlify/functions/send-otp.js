const { Resend } = require('resend');

// Netlify Dashboard me RESEND_API_KEY environment variable set hona chahiye
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
    // CORS Preflight handling (Browser requests ke liye zaroori)
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            },
            body: ""
        };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { email, username, code } = JSON.parse(event.body);

        // --- SANDBOX TESTING CONFIG ---
        // Logs ke mutabiq aap sirf verified email par hi bhej sakte hain.
        // Jab tak domain verify nahi hota, niche wale email ko apne Resend login email se badal dein.
        const myVerifiedEmail = "opayan1715@gmail.com"; 

        const { data, error } = await resend.emails.send({
            from: 'AnimeExplorer <onboarding@resend.dev>',
            to: myVerifiedEmail, // Testing ke liye ise fix rakhein
            subject: 'Verify your AnimeExplorer Account',
            html: `
                <div style="font-family:sans-serif; background:#050507; padding:40px; color:white; border-radius:20px; text-align:center; border:1px solid #7c4dff;">
                    <h2 style="background: linear-gradient(135deg, #fff 0%, #b39dff 100%); font-size: 28px; margin-bottom: 20px;">AnimeExplorer</h2>
                    <p style="color:rgba(255,255,255,0.6);">Hi ${username},</p>
                    <p style="color:rgba(255,255,255,0.6);">Use the code below to verify your account:</p>
                    <div style="font-size:36px; font-weight:bold; letter-spacing:10px; color:#00e5ff; margin:30px 0; padding:20px; background:rgba(124,77,255,0.05); border: 1px solid rgba(124,77,255,0.2); border-radius:15px; display: inline-block; min-width: 200px;">
                        ${code}
                    </div>
                    <p style="font-size:12px; color:rgba(255,255,255,0.3); margin-top: 20px;">
                        This code was requested for ${email}. It will expire in 10 minutes.
                    </p>
                </div>`
        });

        if (error) {
            console.error("Resend API Error:", error);
            return {
                statusCode: 403,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ success: false, error: error.message })
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ success: true, message: "Email sent to verified tester" })
        };

    } catch (error) {
        console.error("Function Error:", error.message);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
