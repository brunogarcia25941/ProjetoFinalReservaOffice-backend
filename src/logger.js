// src/logger.js
const pino = require('pino');
const { Writable } = require('stream');
const db = require('./config/db');
const path = require('path');

// Stream para a Base de Dados
const dbStream = new Writable({
    write(chunk, encoding, callback) {
        (async () => {
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

                const query = `
                    INSERT INTO audit_logs 
                    (pid, log_date, method, url, status_code, user_id, remote_address, request_data, msg, tracking_id) 
                    VALUES (?, FROM_UNIXTIME(? / 1000), ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const dataStr = requestData ? JSON.stringify(requestData) : null;
                
                await db.execute(query, [
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
            } catch (err) {
                console.error('Erro ao gravar log na BD:', err.message);
            } finally {
                callback();
            }
        })();
    }
});

// Configuração do Logger com múltiplos destinos
const logger = pino(
    {
        level: 'info',
    },
    pino.multistream([
        { stream: process.stdout }, // Destino 1: Consola
        { stream: dbStream },       // Destino 2: Base de Dados
        { 
            // Destino 3: Ficheiro físico
            stream: pino.destination({
                dest: path.join(__dirname, '../logs/app.log'),
                sync: true // Escrever imediatamente (melhor para debug)
            })
        }
    ])
);

module.exports = logger;
