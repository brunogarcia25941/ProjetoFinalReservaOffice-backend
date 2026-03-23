const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
   
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
   
    tls: {
        rejectUnauthorized: false
    }
});


    const mailOptions = {
        from: '"Suporte Reserva Office" <' + process.env.EMAIL_USER + '>',
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

   
    await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;