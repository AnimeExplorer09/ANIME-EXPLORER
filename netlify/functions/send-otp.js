const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    // Sirf POST request allow karein
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // Frontend (signup.html) se aane wala data
        const { email, username, code } = JSON.parse(event.body);

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,      // Netlify dashboard se aayega
                pass: process.env.GMAIL_APP_PASS   // Netlify dashboard se aayega
            }
        });

        const mailOptions = {
            from: `"AnimeExplorer" <${process.env.GMAIL_USER}>`,
            to: email, // <--- Ab ye us user ko jayega jo signup kar raha hai
            subject: `Verification Code: ${code}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 2px solid #7c4dff; border-radius: 12px; text-align: center;">
                    <h2 style="color: #7c4dff;">Welcome to AnimeExplorer</h2>
                    <p>Hi <b>${username}</b>, use this code to verify your account:</p>
                    <h1 style="background: #f0f0f0; display: inline-block; padding: 10px 20px; letter-spacing: 5px;">${code}</h1>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
