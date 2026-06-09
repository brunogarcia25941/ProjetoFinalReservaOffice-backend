// src/logger.js
const pino = require('pino');
const { Writable } = require('stream');
const db = require('./config/db');
const path = require('path');

// Stream para a Base de Dados
const dbStream = new Writable({
    write(chunk, encoding, callback) {
        (async () => {
            let connection;
            try {
                const logEntry = JSON.parse(chunk.toString());
                if (!['request completed', 'request errored'].includes(logEntry.msg)) {
                    return;
                }

                const { 
                    pid, 
                    time, 
                    req, 
                    statusCode, 
                    userId, 
                    remoteAddress, 
                    requestData, 
                    msg 
                } = logEntry;

                connection = await db.getConnection();
                await connection.beginTransaction();

                // Nota: O nome da tabela pode variar entre as branches (audit_logs vs auditLog)
                // Usamos audit_logs conforme a migração mais recente, mas o branch auditLogs usava auditLog.
                // Vou manter audit_logs que parece ser o padrão consolidado.
                const query = `
                    INSERT INTO audit_logs 
                    (pid, log_date, method, url, status_code, user_id, remote_address, request_data, msg, tracking_id) 
                    VALUES (?, FROM_UNIXTIME(? / 1000), ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const dataStr = requestData ? JSON.stringify(requestData) : null;
                
                await connection.execute(query, [
                    pid, 
                    time, 
                    req.method, 
                    req.url, 
                    statusCode, 
                    userId ? String(userId) : 'Anonimo', 
                    remoteAddress || 'Desconhecido',
                    dataStr,
                    msg, 
                    req.id
                ]);

                await connection.commit();
            } catch (err) {
                if (connection) await connection.rollback();
                console.error('Erro ao gravar log na BD:', err.message);
            } finally {
                if (connection) connection.release();
                callback();
            }
        })();
    }
});

// Configuração do Logger com múltiplos destinos
const streams = [
    { stream: process.stdout }, // Destino 1: Consola
    { stream: dbStream }        // Destino 2: Base de Dados
];

// Destino 3: Ficheiro físico (Apenas se NÃO estiver na Vercel ou se estiver em dev)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    streams.push({ 
        stream: pino.destination({
            dest: path.join(__dirname, '../logs/app.log'),
            sync: true
        })
    });
}

const logger = pino(
    {
        level: 'info',
    },
    pino.multistream(streams)
);

module.exports = logger;