const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
   
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    
    family: 4, 
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 15000 
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