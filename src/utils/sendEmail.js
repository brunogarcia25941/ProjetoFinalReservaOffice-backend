const nodemailer = require('nodemailer');
const db = require('../config/db');

/**
 * Envia um email e regista a operação na tabela email_logs.
 * @param {Object} options - Contém email, subject, message, user_id (opcional) e email_type (opcional).
 */
const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        family: 4, 
        connectionTimeout: 20000, 
        greetingTimeout: 20000,
        socketTimeout: 20000,
        dnsTimeout: 10000,
        tls: {
            servername: 'smtp.gmail.com',
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `"Suporte Reserva Office" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

    let status = 'sent';
    let errorMessage = null;

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email enviado com sucesso para: ' + options.email);
    } catch (error) {
        status = 'failed';
        errorMessage = error.message;
        console.error('Erro detalhado no transporte: ', error);
        throw error;
    } finally {
        // Registar no Histórico (Auditoria) de Emails
        try {
            await db.execute(
                'INSERT INTO email_logs (user_id, email_type, recipient, subject, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    options.user_id || null, 
                    options.email_type || 'general', 
                    options.email, 
                    options.subject, 
                    status, 
                    errorMessage
                ]
            );
        } catch (dbError) {
            console.error('Erro ao gravar log de email na base de dados:', dbError.message);
        }
    }
};

module.exports = sendEmail;