const db = require('../config/db');

// --- LISTAR RECURSOS (Com filtro opcional por piso) ---
exports.getAllResources = async (req, res) => {
    const { floor } = req.query; // Pega o ?floor=1 do URL se existir

    try {
        let query = 'SELECT * FROM resources';
        let params = [];

        if (floor) {
            query += ' WHERE floor = ?';
            params.push(floor);
        }

        const [resources] = await db.query(query, params);
        
        // O MySQL devolve o JSON como string ou objeto dependendo do driver. 
        // Garantimos que o Frontend recebe um objeto JSON real.
        const formattedResources = resources.map(res => ({
            ...res,
            features: typeof res.features === 'string' ? JSON.parse(res.features) : res.features
        }));

        res.json(formattedResources);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao obter recursos.' });
    }
};

// --- CRIAR NOVO RECURSO ---
exports.createResource = async (req, res) => {
    const { name, type, floor, features } = req.body;

    try {
        // Guardamos o objeto features como string JSON no MySQL
        const [result] = await db.query(
            'INSERT INTO resources (name, type, floor, features) VALUES (?, ?, ?, ?)',
            [name, type, floor || 1, JSON.stringify(features || {})]
        );

        res.status(201).json({ 
            message: 'Recurso criado!', 
            resourceId: result.insertId 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar recurso.' });
    }
};


exports.updateResource = async (req, res) => {
    const { id } = req.params;
    const { name, type, floor, features } = req.body;

    try {
     
        const [exists] = await db.query('SELECT * FROM resources WHERE id = ?', [id]);
        if (exists.length === 0) return res.status(404).json({ message: 'Recurso não encontrado.' });

      
        await db.query(
            'UPDATE resources SET name = ?, type = ?, floor = ?, features = ? WHERE id = ?',
            [
                name || exists[0].name,
                type || exists[0].type,
                floor || exists[0].floor,
                features ? JSON.stringify(features) : exists[0].features,
                id
            ]
        );

        res.json({ message: 'Recurso atualizado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar recurso.' });
    }
};

exports.getResourcesWithAvailability = async (req, res) => {
  
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ message: "Por favor, forneça o start e end time." });
    }

    try {
        const query = `
            SELECT 
                r.id, r.name, r.type, r.status, r.floor,
                -- Cria uma coluna booleana (0 ou 1) se houver sobreposição
                (SELECT COUNT(*) FROM bookings b 
                 WHERE b.resource_id = r.id 
                 AND b.status = 'confirmed'
                 AND b.start_time < ? -- Fim escolhido
                 AND b.end_time > ?   -- Início escolhido
                ) > 0 AS is_booked
            FROM resources r
        `;

        
        const [recursos] = await db.execute(query, [end, start]);

       
        return res.status(200).json(recursos);

    } catch (error) {
        console.error("Erro ao procurar disponibilidade:", error);
        return res.status(500).json({ message: "Erro interno ao verificar disponibilidade." });
    }
};

exports.createResource = async (req, res) => {
    const { name, type, floor, status } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO resources (name, type, floor, status) VALUES (?, ?, ?, ?)',
            [name, type, floor, status || 'active']
        );
        res.status(201).json({ message: 'Recurso criado com sucesso!', id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar recurso:', error);
        res.status(500).json({ message: 'Erro ao criar recurso.' });
    }
};


exports.updateResource = async (req, res) => {
    const { id } = req.params;
    const { name, type, floor, status } = req.body;
    try {
        await db.query(
            'UPDATE resources SET name = ?, type = ?, floor = ?, status = ? WHERE id = ?',
            [name, type, floor, status, id]
        );
        res.json({ message: 'Recurso atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar recurso:', error);
        res.status(500).json({ message: 'Erro ao atualizar recurso.' });
    }
};


exports.deleteResource = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM resources WHERE id = ?', [id]);
        res.json({ message: 'Recurso eliminado com sucesso!' });
    } catch (error) {
        console.error('Erro ao eliminar recurso:', error);
        res.status(500).json({ message: 'Erro ao eliminar recurso.' });
    }
};