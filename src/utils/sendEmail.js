const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        // Usamos o host direto em vez de 'service'
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        // Configuração reforçada para IPv4
        family: 4, 
        connectionTimeout: 20000, 
        greetingTimeout: 20000,
        socketTimeout: 20000,
        dnsTimeout: 10000,
        tls: {
            servername: 'smtp.gmail.com'
        }
    });

    const mailOptions = {
        from: `"Suporte Reserva Office" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email enviado com sucesso para: ' + options.email);
    } catch (error) {
        console.error('Erro detalhado no transporte: ', error);
        throw error; // Lança o erro para o controller saber que falhou
    }
};

module.exports = sendEmail;