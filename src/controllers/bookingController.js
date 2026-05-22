const db = require('../config/db'); 

// Criar nova reserva com validação de conflitos
exports.createBooking = async (req, res) => {
    const { resource_id, start_time, end_time } = req.body;
    const user_id = req.user.id;

    if (!resource_id || !start_time || !end_time) {
        return res.status(400).json({ message: "Por favor, forneça o recurso, a data/hora de início e de fim." });
    }

    // Validar se data de fim é posterior à data de início
    if (new Date(start_time) >= new Date(end_time)) {
        return res.status(400).json({ message: "A data de fim deve ser posterior à data de início." });
    }

    let connection;
    try {
        // Obter uma ligação do pool para gerir a transação
        connection = await db.getConnection();
        
        // 1. INICIAR TRANSAÇÃO
        await connection.beginTransaction();

        // 2. VERIFICAR SE O RECURSO EXISTE E ESTÁ ATIVO
        const [recursos] = await connection.execute(
            'SELECT status FROM resources WHERE id = ? FOR UPDATE',
            [resource_id]
        );

        if (recursos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "O recurso selecionado não existe." });
        }

        if (recursos[0].status !== 'active') {
            await connection.rollback();
            return res.status(400).json({ message: "Lamentamos, mas este recurso encontra-se em manutenção." });
        }

        // 3. VERIFICAR CONFLITOS COM BLOQUEIO DE ESCRITA (FOR UPDATE)
        // O FOR UPDATE impede que outros pedidos leiam estas mesmas linhas até a transação terminar
        const queryVerificacao = `
            SELECT id FROM bookings 
            WHERE resource_id = ? 
            AND status = 'confirmed'
            AND start_time < ? 
            AND end_time > ?
            FOR UPDATE
        `;
        
        const [reservasConflituosas] = await connection.execute(queryVerificacao, [resource_id, end_time, start_time]);

        if (reservasConflituosas.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: "Lamentamos, mas este recurso já se encontra reservado para o horário selecionado." 
            });
        }
        
        // 4. INSERIR A RESERVA
        const [result] = await connection.execute(
            'INSERT INTO bookings (user_id, resource_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)',
            [user_id, resource_id, start_time, end_time, 'confirmed']
        );

        // 5. CONFIRMAR TRANSAÇÃO
        await connection.commit();

        return res.status(201).json({ 
            message: "Reserva efetuada com sucesso!", 
            booking_id: result.insertId 
        });

    } catch (error) {
        // 5. ANULAR ALTERAÇÕES EM CASO DE ERRO
        if (connection) await connection.rollback();
        console.error("Erro ao criar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar a reserva." });
    } finally {
        // Libertar a ligação de volta para o pool
        if (connection) connection.release();
    }
};

// Listar reservas do utilizador autenticado
exports.getUserBookings = async (req, res) => {
    const user_id = req.user.id; 

    try {
        const query = `
            SELECT 
                b.id AS booking_id, 
                b.resource_id,
                b.start_time, 
                b.end_time, 
                b.status, 
                r.name AS resource_name, 
                r.type AS resource_type
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            WHERE b.user_id = ?
            ORDER BY b.start_time DESC
        `;
        
        const [bookings] = await db.execute(query, [user_id]);
        return res.status(200).json(bookings);

    } catch (error) {
        console.error("Erro ao procurar reservas:", error);
        return res.status(500).json({ message: "Erro interno ao procurar reservas." });
    }
};

// Cancelar uma reserva
exports.cancelBooking = async (req, res) => {
    const booking_id = req.params.id;
    const user_id = req.user.id;

    try {
        const [bookings] = await db.execute(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ?', 
            [booking_id, user_id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: "Reserva não encontrada ou sem permissão." });
        }

        if (bookings[0].status === 'cancelled') {
            return res.status(400).json({ message: "Esta reserva já está cancelada." });
        }

        await db.execute(
            'UPDATE bookings SET status = ? WHERE id = ?',
            ['cancelled', booking_id]
        );

        return res.status(200).json({ message: "Reserva cancelada com sucesso!" });

    } catch (error) {
        console.error("Erro ao cancelar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar o cancelamento." });
    }
};

// Atualizar reserva existente
exports.updateBooking = async (req, res) => {
    const booking_id = req.params.id;
    const { resource_id, start_time, end_time } = req.body;
    const user_id = req.user.id;

    if (!resource_id || !start_time || !end_time) {
        return res.status(400).json({ message: "Por favor, forneça o recurso, a data/hora de início e de fim." });
    }

    // Validar se data de fim é posterior à data de início
    if (new Date(start_time) >= new Date(end_time)) {
        return res.status(400).json({ message: "A data de fim deve ser posterior à data de início." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Verificar se a reserva existe e pertence ao utilizador
        const [bookings] = await connection.execute(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE',
            [booking_id, user_id]
        );

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Reserva não encontrada ou sem permissão." });
        }

        if (bookings[0].status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: "Não é possível editar uma reserva cancelada." });
        }

        // 2. Verificar se o recurso (novo ou mesmo) existe e está ativo
        const [recursos] = await connection.execute(
            'SELECT status FROM resources WHERE id = ? FOR UPDATE',
            [resource_id]
        );

        if (recursos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "O recurso selecionado não existe." });
        }

        if (recursos[0].status !== 'active') {
            await connection.rollback();
            return res.status(400).json({ message: "Lamentamos, mas este recurso encontra-se em manutenção." });
        }

        // 3. Verificar conflitos ignorando a reserva atual
        const queryVerificacao = `
            SELECT id FROM bookings 
            WHERE resource_id = ? 
            AND status = 'confirmed'
            AND id != ?
            AND start_time < ? 
            AND end_time > ?
            FOR UPDATE
        `;

        const [reservasConflituosas] = await connection.execute(queryVerificacao, [resource_id, booking_id, end_time, start_time]);

        if (reservasConflituosas.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: "Lamentamos, mas este recurso já se encontra reservado para o horário selecionado." 
            });
        }

        await connection.execute(
            'UPDATE bookings SET resource_id = ?, start_time = ?, end_time = ? WHERE id = ?',
            [resource_id, start_time, end_time, booking_id]
        );

        await connection.commit();
        return res.status(200).json({ message: "Reserva atualizada com sucesso!" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao atualizar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar a atualização." });
    } finally {
        if (connection) connection.release();
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const query = `
            SELECT 
                b.id AS booking_id, 
                b.start_time, 
                b.end_time, 
                b.status, 
                u.name AS user_name,
                u.email AS user_email,
                r.name AS resource_name, 
                r.type AS resource_type
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN resources r ON b.resource_id = r.id
            ORDER BY b.start_time DESC
        `;
        
        const [bookings] = await db.execute(query);

        // Devolvemos a lista completa ao Administrador
        return res.status(200).json(bookings);

    } catch (error) {
        console.error("Erro ao procurar todas as reservas:", error);
        return res.status(500).json({ message: "Erro interno ao procurar reservas." });
    }
};