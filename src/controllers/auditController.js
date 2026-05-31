// src/controllers/auditController.js
const db = require('../config/db');

/**
 * Listar todos os logs de auditoria (Apenas Admin)
 * Retorna os últimos 500 registos por defeito.
 */
exports.getAllLogs = async (req, res) => {
    try {
        const { limit = 500, offset = 0 } = req.query;
        const query = `
            SELECT id, pid, log_date, method, url, status_code, user_id, remote_address, request_data, msg, tracking_id
            FROM audit_logs
            ORDER BY log_date DESC
            LIMIT ? OFFSET ?
        `;
        
        // Os parâmetros LIMIT e OFFSET devem ser números
        const [logs] = await db.execute(query, [String(limit), String(offset)]);
        res.status(200).json(logs);
    } catch (error) {
        console.error('Erro ao listar logs:', error);
        res.status(500).json({ message: 'Erro ao obter logs de auditoria.' });
    }
};

/**
 * Obter detalhes de um log específico por ID.
 */
exports.getLogById = async (req, res) => {
    const { id } = req.params;
    try {
        const [logs] = await db.execute('SELECT * FROM audit_logs WHERE id = ?', [id]);
        
        if (logs.length === 0) {
            return res.status(404).json({ message: 'Log não encontrado.' });
        }
        
        res.json(logs[0]);
    } catch (error) {
        console.error('Erro ao obter log detalhado:', error);
        res.status(500).json({ message: 'Erro ao obter detalhes do log.' });
    }
};
