const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    console.log("Function triggered with method:", event.httpMethod);

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { email, username, code } = JSON.parse(event.body);
        console.log("Sending OTP to:", email);

        // Check if variables exist
        if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
            console.error("Missing Environment Variables!");
            return { statusCode: 500, body: JSON.stringify({ error: "Server Configuration Error" }) };
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            secure: true,
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASS // Spaces nahi hone chahiye isme
            }
        });

        await transporter.sendMail({
            from: `"AnimeExplorer" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: `Verification Code: ${code}`,
            text: `Hello ${username}, your OTP is ${code}. It is valid for 10 minutes.`
        });

        console.log("Email sent successfully!");
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        console.error("Nodemailer Error:", error.message);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};

