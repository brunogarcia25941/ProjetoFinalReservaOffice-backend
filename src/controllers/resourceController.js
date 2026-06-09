const db = require('../config/db');
const sendEmail = require('../utils/sendEmail');

// Função auxiliar para cancelar reservas ativas e notificar utilizadores
const cancelarReservasENotificar = async (resourceId, reason) => {
    try {
        // 1. Encontrar todas as reservas ativas (futuras ou a decorrer) para este recurso
        const query = `
            SELECT b.id as booking_id, u.email, u.id as user_id, u.name as user_name, b.start_time, r.name as resource_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN resources r ON b.resource_id = r.id
            WHERE b.resource_id = ? AND b.status = 'confirmed' AND b.end_time > NOW()
        `;
        const [bookings] = await db.execute(query, [resourceId]);

        // 2. Se houver reservas, cancelá-las e enviar emails
        if (bookings.length > 0) {
            const bookingIds = bookings.map(b => b.booking_id);
            
            // Cancelar na BD
            await db.execute(
                `UPDATE bookings SET status = 'cancelled' WHERE id IN (${bookingIds.map(() => '?').join(',')})`,
                bookingIds
            );

            // Enviar notificação para cada utilizador afetado
            for (const booking of bookings) {
                const subject = `Reserva Cancelada - ${booking.resource_name}`;
                const action = reason === 'maintenance' ? 'entrou em manutenção' : 'foi removido(a) do sistema';
                const message = `Olá ${booking.user_name},\n\nLamentamos informar que a sua reserva para ${booking.resource_name} (agendada para ${new Date(booking.start_time).toLocaleString('pt-PT')}) foi cancelada porque o recurso ${action}.\n\nPor favor, aceda ao portal para reservar uma nova alternativa.\n\nObrigado,\nEquipa Reserva Office`;

                await sendEmail({
                    email: booking.email,
                    subject: subject,
                    message: message,
                    user_id: booking.user_id,
                    email_type: 'booking_cancellation'
                });
            }
            console.log(`Foram canceladas ${bookings.length} reservas para o recurso ID ${resourceId} devido a ${reason}.`);
        }
    } catch (error) {
        console.error('Erro ao cancelar reservas e notificar:', error);
    }
};

// 1. Listar TODOS os recursos (Para Admin e visualização geral)
exports.getAllResources = async (req, res) => {
    try {
        const query = `
            SELECT 
                r.id, r.name, rt.name as type, 
                o.name as building, l.floor, l.zone,
                r.status, r.features, r.pos_x, r.pos_y, r.rotation
            FROM resources r 
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
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
                o.name as building, l.floor, l.zone,
                r.status, r.features
            FROM resources r 
            JOIN resource_types rt ON r.type_id = rt.id
            JOIN locations l ON r.location_id = l.id
            JOIN offices o ON l.office_id = o.id
            WHERE r.status = 'active' AND rt.active = TRUE AND l.active = TRUE AND o.active = TRUE
        `;
        const [resources] = await db.execute(query);
        res.status(200).json(resources);
    } catch (error) {
        console.error('Erro ao listar recursos disponíveis:', error);
        res.status(500).json({ message: 'Erro ao obter recursos disponíveis.' });
    }
};

// --- FUNÇÕES DE ADMINISTRAÇÃO DE RECURSOS ---

// Função auxiliar para obter ou criar o ID de uma localização
const obterOuCriarLocationId = async (building, floor) => {
    const buildingName = building || 'Edifício Principal';
    const floorStr = String(floor || 1);
    
    // Procurar se já existe esta combinação de edifício e piso
    const [existing] = await db.execute(
        'SELECT id FROM locations WHERE building = ? AND floor = ?',
        [buildingName, floorStr]
    );
    
    if (existing.length > 0) {
        return existing[0].id;
    }
    
    // Se não existir, criamos a localização
    const [result] = await db.execute(
        'INSERT INTO locations (building, floor) VALUES (?, ?)',
        [buildingName, floorStr]
    );
    return result.insertId;
};

// 3. Criar uma nova mesa ou sala (Admin)
exports.createResource = async (req, res) => {
    const { name, type, location_id, status, features, floor, building } = req.body;
    try {
        let typeId;
        const [types] = await db.execute('SELECT id FROM resource_types WHERE name = ? OR id = ?', [type, type]);
        if (types.length === 0) {
            return res.status(400).json({ message: "Tipo de recurso inválido." });
        }
        typeId = types[0].id;

        // Se não houver location_id direto, tentamos resolver por building e floor
        let resolvedLocationId = location_id;
        if (!resolvedLocationId && floor) {
            resolvedLocationId = await obterOuCriarLocationId(building, floor);
        }

        const [result] = await db.execute(
            'INSERT INTO resources (name, type_id, location_id, status, features) VALUES (?, ?, ?, ?, ?)',
            [name, typeId, resolvedLocationId || null, status || 'active', features ? JSON.stringify(features) : null]
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
    const { name, type, location_id, status, features, floor, building } = req.body;
    try {
        const [resourceExists] = await db.execute('SELECT * FROM resources WHERE id = ?', [id]);
        if (resourceExists.length === 0) {
            return res.status(404).json({ message: 'Recurso não encontrado.' });
        }

        let typeId;
        const [types] = await db.execute('SELECT id FROM resource_types WHERE name = ? OR id = ?', [type, type]);
        if (types.length === 0) {
            return res.status(400).json({ message: "Tipo de recurso inválido." });
        }
        typeId = types[0].id;

        const oldStatus = resourceExists[0].status;

        // Resolver location_id se building/floor forem fornecidos
        let resolvedLocationId = location_id;
        if (!resolvedLocationId && floor) {
            resolvedLocationId = await obterOuCriarLocationId(building, floor);
        }

        await db.execute(
            'UPDATE resources SET name = ?, type_id = ?, location_id = ?, status = ?, features = ? WHERE id = ?',
            [name, typeId, resolvedLocationId || resourceExists[0].location_id, status, features ? JSON.stringify(features) : null, id]
        );

        // Se o recurso passou a estar em manutenção, cancelar reservas ativas e notificar
        if (oldStatus !== 'maintenance' && status === 'maintenance') {
            await cancelarReservasENotificar(id, 'maintenance');
        }

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
        // Antes de apagar, cancelar reservas ativas e notificar utilizadores
        await cancelarReservasENotificar(id, 'deleted');

        const [result] = await db.execute('DELETE FROM resources WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Recurso não encontrado.' });
        }
        res.json({ message: 'Recurso eliminado com sucesso!' });
    } catch (error) {
        console.error('Erro ao eliminar recurso:', error);
        res.status(500).json({ message: 'Erro ao eliminar recurso. Verifique dependências.' });
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
                o.name as building, l.floor, l.zone, r.features,
                r.pos_x, r.pos_y, r.rotation,
                (SELECT COUNT(*) FROM bookings b 
                 WHERE b.resource_id = r.id 
                 AND b.status = 'confirmed'
                 AND b.start_time < ? 
                 AND b.end_time > ?   
                ) > 0 AS is_booked,
                (SELECT u.name FROM bookings b
                 JOIN users u ON b.user_id = u.id
                 WHERE b.resource_id = r.id 
                 AND b.status = 'confirmed'
                 AND b.start_time < ? 
                 AND b.end_time > ?
                 ORDER BY b.start_time ASC LIMIT 1
                ) AS booked_by_user
            FROM resources r
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
            WHERE (rt.active = TRUE OR rt.id IS NULL) AND (l.active = TRUE OR l.id IS NULL) AND (o.active = TRUE OR o.id IS NULL)
        `;

        const [recursos] = await db.execute(query, [end, start, end, start]);
        return res.status(200).json(recursos);

    } catch (error) {
        console.error("Erro ao procurar disponibilidade:", error);
        return res.status(500).json({ message: "Erro interno ao verificar disponibilidade." });
    }
};

// Atualizar apenas a posição do recurso (para o Editor de Planta)
exports.updateResourcePosition = async (req, res) => {
    const { id } = req.params;
    const { pos_x, pos_y, rotation } = req.body;

    try {
        await db.execute(
            'UPDATE resources SET pos_x = ?, pos_y = ?, rotation = ? WHERE id = ?',
            [pos_x, pos_y, rotation, id]
        );
        res.json({ message: 'Posição atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar posição:', error);
        res.status(500).json({ message: 'Erro ao guardar posição.' });
    }
};

exports.cancelarReservasENotificar = cancelarReservasENotificar;