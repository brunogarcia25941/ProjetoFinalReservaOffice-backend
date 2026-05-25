const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Configuração do Pool de Ligações ao MySQL (Aiven)
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : null,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

// Testar a ligação no arranque
pool.getConnection()
    .then(connection => {
        console.log('Ligação à base de dados MySQL (Aiven) com sucesso!');
        connection.release();
    })
    .catch(err => {
        console.error('Erro crítico ao ligar à base de dados:', err.message);
    });

module.exports = pool;