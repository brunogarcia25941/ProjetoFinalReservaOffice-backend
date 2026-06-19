const db = require('../config/db');

// 1. Listar todos os escritórios
exports.getAllOffices = async (req, res) => {
    try {
        const [offices] = await db.execute('SELECT * FROM offices ORDER BY name ASC');
        res.json(offices);
    } catch (error) {
        console.error('Erro ao listar escritórios:', error);
        res.status(500).json({ message: 'Erro ao listar escritórios.' });
    }
};

// 2. Criar novo escritório
exports.createOffice = async (req, res) => {
    const { name, address, operating_hours_start, operating_hours_end, timezone, active } = req.body;
    
    if (!name) {
        return res.status(400).json({ message: 'O nome do escritório é obrigatório.' });
    }

    try {
        const [existing] = await db.execute('SELECT id FROM offices WHERE name = ?', [name]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Já existe um escritório com esse nome.' });
        }

        const [result] = await db.execute(
            'INSERT INTO offices (name, address, operating_hours_start, operating_hours_end, timezone, active) VALUES (?, ?, ?, ?, ?, ?)',
            [
                name, 
                address || null, 
                operating_hours_start || '09:00:00', 
                operating_hours_end || '18:00:00', 
                timezone || 'Europe/Lisbon', 
                active !== undefined ? active : true
            ]
        );
        res.status(201).json({ message: 'Escritório criado com sucesso!', id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar escritório:', error);
        res.status(500).json({ message: 'Erro ao criar escritório.' });
    }
};

// 3. Atualizar escritório
exports.updateOffice = async (req, res) => {
    const { id } = req.params;
    const { name, address, operating_hours_start, operating_hours_end, timezone, active } = req.body;

    try {
        const [existing] = await db.execute('SELECT * FROM offices WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Escritório não encontrado.' });
        }

        if (name && name !== existing[0].name) {
            const [nameDup] = await db.execute('SELECT id FROM offices WHERE name = ? AND id != ?', [name, id]);
            if (nameDup.length > 0) {
                return res.status(400).json({ message: 'Já existe outro escritório com esse nome.' });
            }
        }

        await db.execute(
            'UPDATE offices SET name = ?, address = ?, operating_hours_start = ?, operating_hours_end = ?, timezone = ?, active = ? WHERE id = ?',
            [
                name || existing[0].name,
                address !== undefined ? address : existing[0].address,
                operating_hours_start || existing[0].operating_hours_start,
                operating_hours_end || existing[0].operating_hours_end,
                timezone || existing[0].timezone,
                active !== undefined ? active : existing[0].active,
                id
            ]
        );

        res.json({ message: 'Escritório atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar escritório:', error);
        res.status(500).json({ message: 'Erro ao atualizar escritório.' });
    }
};

// 4. Eliminar/Desativar escritório
exports.deleteOffice = async (req, res) => {
    const { id } = req.params;

    try {
        const [existing] = await db.execute('SELECT * FROM offices WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Escritório não encontrado.' });
        }

        // Desativamos em vez de fazer DELETE físico
        await db.execute('UPDATE offices SET active = FALSE WHERE id = ?', [id]);
        res.json({ message: 'Escritório desativado com sucesso!' });
    } catch (error) {
        console.error('Erro ao desativar escritório:', error);
        res.status(500).json({ message: 'Erro ao desativar escritório.' });
    }
};

// 5. Obter layout de um escritório/piso (Imagem de fundo, tamanho e paredes)
exports.getOfficeLayout = async (req, res) => {
    const { office_name, floor } = req.query;

    if (!office_name || !floor) {
        return res.status(400).json({ message: 'O nome do escritório e o piso são obrigatórios.' });
    }

    try {
        const [rows] = await db.execute(
            'SELECT * FROM office_layouts WHERE office_name = ? AND floor = ?',
            [office_name, parseInt(floor)]
        );

        if (rows.length === 0) {
            return res.json({
                office_name,
                floor: parseInt(floor),
                map_image: null,
                map_width: 800,
                map_height: 500,
                walls: []
            });
        }

        const layout = rows[0];
        let walls = [];
        if (layout.walls) {
            try {
                walls = typeof layout.walls === 'string' ? JSON.parse(layout.walls) : layout.walls;
            } catch (e) {
                console.error('Erro ao fazer parse das paredes:', e);
            }
        }

        res.json({
            office_name: layout.office_name,
            floor: layout.floor,
            map_image: layout.map_image,
            map_width: layout.map_width,
            map_height: layout.map_height,
            walls: walls
        });
    } catch (error) {
        console.error('Erro ao obter layout do escritório:', error);
        res.status(500).json({ message: 'Erro ao obter layout do escritório.' });
    }
};

// 6. Guardar ou atualizar layout de um escritório/piso (Imagem de fundo, tamanho e paredes)
exports.saveOfficeLayout = async (req, res) => {
    const { office_name, floor, map_image, map_width, map_height, walls } = req.body;

    if (!office_name || floor === undefined) {
        return res.status(400).json({ message: 'O nome do escritório e o piso são obrigatórios.' });
    }

    try {
        const width = map_width || 800;
        const height = map_height || 500;
        const wallsStr = walls ? JSON.stringify(walls) : '[]';

        await db.execute(`
            INSERT INTO office_layouts (office_name, floor, map_image, map_width, map_height, walls)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                map_image = VALUES(map_image),
                map_width = VALUES(map_width),
                map_height = VALUES(map_height),
                walls = VALUES(walls)
        `, [office_name, parseInt(floor), map_image || null, width, height, wallsStr]);

        res.json({ message: 'Layout guardado com sucesso!' });
    } catch (error) {
        console.error('Erro ao guardar layout do escritório:', error);
        res.status(500).json({ message: 'Erro ao guardar layout do escritório.' });
    }
};

