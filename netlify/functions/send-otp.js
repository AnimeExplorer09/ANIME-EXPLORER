const { Resend } = require('resend');

// Aapki API Key yahan safe rahegi, browser ko nahi dikhegi
const resend = new Resend(process.env.RESEND_API_KEY);
exports.handler = async (event) => {
    // Sirf POST request allow karni hai
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { email, username, code } = JSON.parse(event.body);

        await resend.emails.send({
            from: 'onboarding@resend.dev', // Default sender
            to: email,
            subject: 'Verify your AnimeExplorer Account',
            html: `
                <div style="font-family:sans-serif; background:#0b0c10; padding:30px; color:white; border-radius:15px; text-align:center; border:1px solid #7c4dff;">
                    <h2 style="color:#7c4dff;">AnimeExplorer</h2>
                    <p style="color:#aaa;">Hi ${username}, use the code below to verify your account:</p>
                    <div style="font-size:32px; font-weight:bold; letter-spacing:8px; color:#00e5ff; margin:20px 0; padding:15px; background:rgba(124,77,255,0.1); border-radius:10px;">
                        ${code}
                    </div>
                    <p style="font-size:12px; color:#666;">This code will expire in 10 minutes.</p>
                </div>`
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // CORS issue fix
            },
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
