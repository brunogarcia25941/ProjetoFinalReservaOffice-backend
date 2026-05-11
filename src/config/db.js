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

/**
 * FUNÇÃO DE AUTO-MIGRAÇÃO
 * Garante que as colunas necessárias existem na Base de Dados do Render/Aiven
 */
const inicializarEstrutura = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- Verificando Estrutura da Base de Dados ---');

        // 1. Colunas para o Auth (Refresh Token e Reset Password)
        // Nota: MySQL 8.0.19+ suporta "ADD COLUMN IF NOT EXISTS". 
        // Para versões anteriores do MySQL/Aiven, usamos um bloco de tentativa e erro silencioso:
        
        try {
            await connection.query("ALTER TABLE users ADD COLUMN refresh_token TEXT NULL");
            console.log('Coluna refresh_token adicionada.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255) NULL");
            await connection.query("ALTER TABLE users ADD COLUMN reset_password_expires DATETIME NULL");
            console.log('Colunas de recuperação de password verificadas.');
        } catch (e) { /* Colunas já existem */ }

        // 2. Colunas para os Recursos (Piso e Características JSON)
        try {
            await connection.query("ALTER TABLE resources ADD COLUMN floor INT NOT NULL DEFAULT 1");
            console.log('Coluna floor adicionada aos recursos.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE resources ADD COLUMN features JSON NULL");
            console.log('Coluna features (JSON) adicionada aos recursos.');
        } catch (e) { /* Coluna já existe */ }

        console.log('--- Estrutura da Base de Dados OK ---');
    } catch (err) {
        console.error('Erro na migração automática:', err.message);
    } finally {
        if (connection) connection.release();
    }
};

// Testar a ligação e inicializar estrutura no arranque
pool.getConnection()
    .then(connection => {
        console.log('Ligação à base de dados MySQL (Aiven) com sucesso!');
        connection.release();
        // Disparar a verificação de colunas
        inicializarEstrutura();
    })
    .catch(err => {
        console.error('Erro crítico ao ligar à base de dados:', err.message);
    });

module.exports = pool;