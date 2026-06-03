const db = require('../config/db');

// 1. Listar TODOS os recursos (Para Admin e visualização geral)
exports.getAllResources = async (req, res) => {
    try {
        const query = `
            SELECT 
                r.id, r.name, rt.name as type, 
                l.building, l.floor, l.zone,
                r.status, r.features, r.pos_x, r.pos_y
            FROM resources r 
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
        `;
        const [resources] = await db.execute(query);
        res.status(200).json(resources);
    } catch (error) {
        console.error('Erro ao listar recursos:', error);
        res.status(500).json({ message: 'Erro ao obter recursos.' });
    }
};

// 2. Listar APENAS recursos disponíveis (Ativos)
exports.getAvailableResources = async (req, res) => {
    try {
        const query = `
            SELECT 
                r.id, r.name, rt.name as type, 
                l.building, l.floor, l.zone,
                r.status, r.features
            FROM resources r 
            JOIN resource_types rt ON r.type_id = rt.id
            JOIN locations l ON r.location_id = l.id
            WHERE r.status = 'active' AND rt.active = TRUE AND l.active = TRUE
        `;
        const [resources] = await db.execute(query);
        res.status(200).json(resources);
    } catch (error) {
        console.error('Erro ao listar recursos disponíveis:', error);
        res.status(500).json({ message: 'Erro ao obter recursos disponíveis.' });
    }
};

// --- FUNÇÕES DE ADMINISTRAÇÃO DE RECURSOS ---

// 3. Criar uma nova mesa ou sala (Admin)
exports.createResource = async (req, res) => {
    const { name, type, location_id, status, features } = req.body;
    try {
        // Obter o ID do tipo (type pode vir como 'desk' ou id numérico conforme o frontend)
        let typeId;
        const [types] = await db.execute('SELECT id FROM resource_types WHERE name = ? OR id = ?', [type, type]);
        if (types.length === 0) {
            return res.status(400).json({ message: "Tipo de recurso inválido." });
        }
        typeId = types[0].id;

        const [result] = await db.execute(
            'INSERT INTO resources (name, type_id, location_id, status, features) VALUES (?, ?, ?, ?, ?)',
            [name, typeId, location_id || null, status || 'active', features ? JSON.stringify(features) : null]
        );
        res.status(201).json({ message: 'Recurso criado com sucesso!', id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar recurso:', error);
        res.status(500).json({ message: 'Erro ao criar recurso.' });
    }
};

// 4. Atualizar uma mesa ou sala (Admin)
exports.updateResource = async (req, res) => {
    const { id } = req.params;
    const { name, type, location_id, status, features } = req.body;
    try {
        // Verifica se existe primeiro
        const [resourceExists] = await db.execute('SELECT * FROM resources WHERE id = ?', [id]);
        if (resourceExists.length === 0) {
            return res.status(404).json({ message: 'Recurso não encontrado.' });
        }

        // Obter o ID do tipo
        let typeId;
        const [types] = await db.execute('SELECT id FROM resource_types WHERE name = ? OR id = ?', [type, type]);
        if (types.length === 0) {
            return res.status(400).json({ message: "Tipo de recurso inválido." });
        }
        typeId = types[0].id;

        await db.execute(
            'UPDATE resources SET name = ?, type_id = ?, location_id = ?, status = ?, features = ? WHERE id = ?',
            [name, typeId, location_id || resourceExists[0].location_id, status, features ? JSON.stringify(features) : null, id]
        );
        res.json({ message: 'Recurso atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar recurso:', error);
        res.status(500).json({ message: 'Erro ao atualizar recurso.' });
    }
};

// 5. Remover uma mesa ou sala (Admin)
exports.deleteResource = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute('DELETE FROM resources WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Recurso não encontrado.' });
        }
        res.json({ message: 'Recurso eliminado com sucesso!' });
    } catch (error) {
        console.error('Erro ao eliminar recurso:', error);
        res.status(500).json({ message: 'Erro ao eliminar recurso.' });
    }
};

// 6. Obter recursos com disponibilidade (Para o Dashboard principal)
exports.getResourcesWithAvailability = async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ message: "Por favor, forneça o start e end time." });
    }

    try {
        const query = `
            SELECT 
                r.id, r.name, rt.name as type, r.status, 
                l.building, l.floor, l.zone, r.features,
                (SELECT COUNT(*) FROM bookings b 
                 WHERE b.resource_id = r.id 
                 AND b.status = 'confirmed'
                 AND b.start_time < ? 
                 AND b.end_time > ?   
                ) > 0 AS is_booked
            FROM resources r
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE (rt.active = TRUE OR rt.id IS NULL) AND (l.active = TRUE OR l.id IS NULL)
        `;

        const [recursos] = await db.execute(query, [end, start]);
        return res.status(200).json(recursos);

    } catch (error) {
        console.error("Erro ao procurar disponibilidade:", error);
        return res.status(500).json({ message: "Erro interno ao verificar disponibilidade." });
    }
};

// Atualizar apenas a posição do recurso (para o Editor de Planta)
exports.updateResourcePosition = async (req, res) => {
    const { id } = req.params;
    const { pos_x, pos_y } = req.body;

    try {
        await db.execute(
            'UPDATE resources SET pos_x = ?, pos_y = ? WHERE id = ?',
            [pos_x, pos_y, id]
        );
        res.json({ message: 'Posição atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar posição:', error);
        res.status(500).json({ message: 'Erro ao guardar posição.' });
    }
};