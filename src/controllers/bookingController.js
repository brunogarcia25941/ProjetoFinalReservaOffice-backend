const db = require('../config/db'); 
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// Função auxiliar para marcar reservas passadas como Concluídas
const autoCompleteBookings = async () => {
    try {
        const mysqlNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon', hour12: false }).replace('T', ' ');
        await db.execute(
            "UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND end_time < ?",
            [mysqlNow]
        );
    } catch (err) {
        console.error("Erro ao auto-concluir reservas:", err);
    }
};

// Criar nova reserva com validação de conflitos
exports.createBooking = async (req, res) => {
    const { resource_id, start_time, end_time, guests, extra_resource_id, recurrence } = req.body;
    const user_id = req.user.id;

    if (!resource_id || !start_time || !end_time) {
        return res.status(400).json({ message: "Por favor, forneça o recurso, a data/hora de início e de fim." });
    }

    // Validar se data de fim é posterior à data de início
    if (new Date(start_time) >= new Date(end_time)) {
        return res.status(400).json({ message: "A data de fim deve ser posterior à data de início." });
    }

    // Validar se a duração da reserva não excede 1 mês
    const start = new Date(start_time);
    const end = new Date(end_time);
    const maxEndDate = new Date(start);
    maxEndDate.setMonth(maxEndDate.getMonth() + 1);
    if (end > maxEndDate) {
        return res.status(400).json({ message: "A duração da reserva não pode exceder o período máximo de 1 mês." });
    }

    // Validar se a antecedência não excede 1 mês no futuro
    const agora = new Date();
    const limiteFuturo = new Date(agora);
    limiteFuturo.setMonth(limiteFuturo.getMonth() + 1);
    if (start > limiteFuturo) {
        return res.status(400).json({ message: "Não é possível criar reservas com mais de 1 mês de antecedência." });
    }

    // Gerar as ocorrências
    const ocorrencias = [];
    ocorrencias.push({ start_time, end_time });

    if (recurrence && recurrence.type && recurrence.endDate) {
        if (!['daily', 'weekly'].includes(recurrence.type)) {
            return res.status(400).json({ message: "O tipo de recorrência deve ser 'daily' ou 'weekly'." });
        }
        
        let currentStart = new Date(start_time.replace(' ', 'T') + 'Z');
        let currentEnd = new Date(end_time.replace(' ', 'T') + 'Z');
        const limitDateLocal = new Date(recurrence.endDate);
        const limitDateUTC = new Date(recurrence.endDate.replace(' ', 'T') + 'Z');
        
        // Limitar a data de fim de recorrência a no máximo 1 mês de antecedência
        if (limitDateLocal > limiteFuturo) {
            return res.status(400).json({ message: "A data limite de recorrência não pode exceder o limite de 1 mês no futuro." });
        }
        
        while (true) {
            if (recurrence.type === 'daily') {
                currentStart.setUTCDate(currentStart.getUTCDate() + 1);
                currentEnd.setUTCDate(currentEnd.getUTCDate() + 1);
            } else if (recurrence.type === 'weekly') {
                currentStart.setUTCDate(currentStart.getUTCDate() + 7);
                currentEnd.setUTCDate(currentEnd.getUTCDate() + 7);
            }
            
            if (currentStart > limitDateUTC) {
                break;
            }
            
            // Converter de volta para formato de string ISO
            ocorrencias.push({
                start_time: currentStart.toISOString().replace('T', ' ').substring(0, 19),
                end_time: currentEnd.toISOString().replace('T', ' ').substring(0, 19)
            });
        }

        if (ocorrencias.length > 30) {
            return res.status(400).json({ message: "O número máximo de ocorrências recorrentes permitidas é 30." });
        }
    }

    let connection;
    try {
        // Obter uma ligação do pool para gerir a transação
        connection = await db.getConnection();
        
        // 1. INICIAR TRANSAÇÃO
        await connection.beginTransaction();

        // 2. VERIFICAR SE O RECURSO EXISTE E ESTÁ ATIVO (Obtendo tipo e escritório/localização)
        const queryRecurso = `
            SELECT r.status, r.name AS resource_name, rt.name AS resource_type,
                   o.name AS office_name, l.floor, l.zone
            FROM resources r
            JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
            WHERE r.id = ?
            FOR UPDATE
        `;
        const [recursos] = await connection.execute(queryRecurso, [resource_id]);

        if (recursos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "O recurso selecionado não existe." });
        }

        if (recursos[0].status !== 'active') {
            await connection.rollback();
            return res.status(400).json({ message: "Lamentamos, mas este recurso encontra-se em manutenção." });
        }

        const resource_type = recursos[0].resource_type;

        // 3. VERIFICAR CONFLITOS COM BLOQUEIO DE ESCRITA (FOR UPDATE)
        const queryVerificacao = `
            SELECT id FROM bookings 
            WHERE resource_id = ? 
            AND status = 'confirmed'
            AND start_time < ? 
            AND end_time > ?
            FOR UPDATE
        `;
        
        for (const ocorrencia of ocorrencias) {
            const [reservasConflituosas] = await connection.execute(queryVerificacao, [resource_id, ocorrencia.end_time, ocorrencia.start_time]);
            if (reservasConflituosas.length > 0) {
                await connection.rollback();
                const dataFormatada = new Date(ocorrencia.start_time).toLocaleDateString('pt-PT');
                return res.status(400).json({ 
                    message: `Lamentamos, mas este recurso já se encontra reservado no dia ${dataFormatada} para o horário selecionado.` 
                });
            }
        }

        // 3.1 VERIFICAR MONITOR EXTRA SE ENVIADO
        let hasExtra = false;
        if (extra_resource_id) {
            const queryExtra = `
                SELECT r.status, r.name, rt.name AS resource_type
                FROM resources r
                JOIN resource_types rt ON r.type_id = rt.id
                WHERE r.id = ?
                FOR UPDATE
            `;
            const [extras] = await connection.execute(queryExtra, [extra_resource_id]);
            if (extras.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "O monitor extra selecionado não existe." });
            }
            if (extras[0].status !== 'active') {
                await connection.rollback();
                return res.status(400).json({ message: "O monitor extra selecionado está em manutenção." });
            }
            if (extras[0].resource_type !== 'monitor') {
                await connection.rollback();
                return res.status(400).json({ message: "O recurso extra selecionado deve ser um monitor." });
            }
            
            // Verificar conflitos do monitor extra para cada ocorrência
            for (const ocorrencia of ocorrencias) {
                const [extraConflitos] = await connection.execute(queryVerificacao, [extra_resource_id, ocorrencia.end_time, ocorrencia.start_time]);
                if (extraConflitos.length > 0) {
                    await connection.rollback();
                    const dataFormatada = new Date(ocorrencia.start_time).toLocaleDateString('pt-PT');
                    return res.status(400).json({
                        message: `Lamentamos, mas o monitor extra selecionado já se encontra reservado no dia ${dataFormatada} para o horário.`
                    });
                }
            }
            hasExtra = true;
        }
        
        // 4. CRIAR AS RESERVAS
        const recurrence_group_id = ocorrencias.length > 1 ? crypto.randomUUID() : null;
        const mainBookingIds = [];
        let guestDetails = [];

        // Extrair convidados se for sala
        if (resource_type === 'room' && guests && Array.isArray(guests)) {
            const cleanGuests = [...new Set(guests.map(e => e.trim().toLowerCase()).filter(Boolean))];
            for (const email of cleanGuests) {
                const [existingUsers] = await connection.execute(
                    'SELECT id, name FROM users WHERE email = ?',
                    [email]
                );
                let guestUserId = null;
                let guestName = null;
                if (existingUsers.length > 0) {
                    guestUserId = existingUsers[0].id;
                    guestName = existingUsers[0].name;
                }
                guestDetails.push({ email, name: guestName, user_id: guestUserId });
            }
        }

        for (const ocorrencia of ocorrencias) {
            const [result] = await connection.execute(
                'INSERT INTO bookings (user_id, resource_id, start_time, end_time, status, recurrence_group_id) VALUES (?, ?, ?, ?, ?, ?)',
                [user_id, resource_id, ocorrencia.start_time, ocorrencia.end_time, 'confirmed', recurrence_group_id]
            );
            const mainBookingId = result.insertId;
            mainBookingIds.push(mainBookingId);

            // 4.1 REGISTAR NO HISTÓRICO (Auditoria)
            const newBookingData = { resource_id, start_time: ocorrencia.start_time, end_time: ocorrencia.end_time, status: 'confirmed', recurrence_group_id };
            await connection.execute(
                'INSERT INTO booking_history (booking_id, action, new_data, changed_by) VALUES (?, ?, ?, ?)',
                [mainBookingId, 'create', JSON.stringify(newBookingData), user_id]
            );

            // 4.2 INSERIR MONITOR EXTRA SE APLICÁVEL
            if (hasExtra) {
                const [extraResult] = await connection.execute(
                    'INSERT INTO bookings (user_id, resource_id, start_time, end_time, status, parent_booking_id, recurrence_group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [user_id, extra_resource_id, ocorrencia.start_time, ocorrencia.end_time, 'confirmed', mainBookingId, recurrence_group_id]
                );
                
                const extraBookingData = { resource_id: extra_resource_id, start_time: ocorrencia.start_time, end_time: ocorrencia.end_time, status: 'confirmed', parent_booking_id: mainBookingId, recurrence_group_id };
                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, new_data, changed_by) VALUES (?, ?, ?, ?)',
                    [extraResult.insertId, 'create', JSON.stringify(extraBookingData), user_id]
                );
            }

            // 4.3 PROCESSAR CONVIDADOS SE FOR SALA
            if (resource_type === 'room' && guestDetails.length > 0) {
                for (const guest of guestDetails) {
                    await connection.execute(
                        'INSERT INTO booking_guests (booking_id, user_id, email, name, status) VALUES (?, ?, ?, ?, ?)',
                        [mainBookingId, guest.user_id, guest.email, guest.name, 'pending']
                    );
                }
            }
        }

        // 5. CONFIRMAR TRANSAÇÃO
        await connection.commit();

        // Enviar emails de convite em background pós-commit
        if (resource_type === 'room' && guestDetails.length > 0) {
            db.execute('SELECT name FROM users WHERE id = ?', [user_id])
                .then(([organizador]) => {
                    const organizadorNome = organizador.length > 0 ? organizador[0].name : 'Um colega';

                    const formatarData = (dataStr) => {
                        const d = new Date(dataStr);
                        return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
                    };

                    const dataInicioStr = formatarData(start_time);
                    const dataFimStr = formatarData(end_time);
                    const local = `${recursos[0].resource_name} (${recursos[0].office_name || 'Escritório'} - Piso ${recursos[0].floor || 1})`;
                    
                    let recText = '';
                    if (recurrence && recurrence.type) {
                        const freqLabel = recurrence.type === 'daily' ? 'diário' : 'semanal';
                        recText = `\nRecorrência: Reunião recorrente com padrão ${freqLabel} até ${formatarData(recurrence.endDate).split(' ')[0]}`;
                    }

                    guestDetails.forEach(guest => {
                        const subject = `Convite: Reunião em ${recursos[0].resource_name} - ${dataInicioStr.split(' ')[0]} ${recurrence ? '(Recorrente)' : ''}`;
                        const message = `Olá${guest.name ? ' ' + guest.name : ''},

${organizadorNome} convidou-o para uma reunião.

Detalhes do Evento:
--------------------------------------------------
Local: ${local}
Início (1ª ocorrência): ${dataInicioStr}
Fim (1ª ocorrência): ${dataFimStr}${recText}
--------------------------------------------------

Por favor, compareça no horário indicado.

Cumprimentos,
Equipa Reserva Office`;

                        sendEmail({
                            email: guest.email,
                            subject: subject,
                            message: message,
                            user_id: guest.user_id,
                            email_type: 'invitation'
                        }).catch(err => {
                            console.error(`Erro ao enviar email de convite para ${guest.email}:`, err);
                        });
                    });
                })
                .catch(err => console.error("Erro ao obter nome do organizador para email:", err));
        }

        return res.status(201).json({ 
            message: "Reserva efetuada com sucesso!", 
            booking_id: mainBookingIds[0]
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao criar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar a reserva." });
    } finally {
        if (connection) connection.release();
    }
};

// Listar reservas do utilizador autenticado
exports.getUserBookings = async (req, res) => {
    const user_id = req.user.id; 

    req.log.info(`Procurando reservas para o utilizador ID: ${user_id}`);
    try {
        await autoCompleteBookings();
        
        const query = `
            SELECT 
                b.id AS booking_id, 
                b.resource_id,
                b.start_time, 
                b.end_time, 
                b.status, 
                b.recurrence_group_id,
                r.name AS resource_name, 
                rt.name AS resource_type
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            WHERE b.user_id = ? AND b.parent_booking_id IS NULL
            ORDER BY b.start_time DESC
        `;
        
        const [bookings] = await db.execute(query, [user_id]);
        for (const booking of bookings) {
            // Carregar convidados
            if (booking.resource_type === 'room') {
                const [guests] = await db.execute(
                    'SELECT email, name, status FROM booking_guests WHERE booking_id = ?',
                    [booking.booking_id]
                );
                booking.guests = guests;
            } else {
                booking.guests = [];
            }

            // Carregar monitor extra se existir
            const [childBookings] = await db.execute(
                `SELECT b.id AS booking_id, b.resource_id, r.name AS resource_name 
                 FROM bookings b
                 JOIN resources r ON b.resource_id = r.id
                 WHERE b.parent_booking_id = ? AND b.status = 'confirmed'`,
                [booking.booking_id]
            );
            if (childBookings.length > 0) {
                booking.extra = {
                    booking_id: childBookings[0].booking_id,
                    resource_id: childBookings[0].resource_id,
                    resource_name: childBookings[0].resource_name
                };
            } else {
                booking.extra = null;
            }
        }
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

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Obter os detalhes da reserva, recurso e localização para os emails
        const queryOldBooking = `
            SELECT b.*, r.name AS resource_name, rt.name AS resource_type,
                   o.name AS office_name, l.floor, l.zone
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
            WHERE b.id = ? AND b.user_id = ?
            FOR UPDATE
        `;
        const [bookings] = await connection.execute(queryOldBooking, [booking_id, user_id]);

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Reserva não encontrada ou sem permissão." });
        }

        const oldBooking = bookings[0];

        if (oldBooking.status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: "Esta reserva já está cancelada." });
        }

        const scope = req.query.scope;
        const isSeries = scope === 'series' && oldBooking.recurrence_group_id;

        if (isSeries) {
            // Obter todas as reservas confirmadas desta série para auditoria e histórico
            const [seriesBookings] = await connection.execute(
                "SELECT id, resource_id, start_time, end_time, status FROM bookings WHERE recurrence_group_id = ? AND status = 'confirmed' FOR UPDATE",
                [oldBooking.recurrence_group_id]
            );

            // Atualizar status de todas para cancelled
            await connection.execute(
                "UPDATE bookings SET status = 'cancelled' WHERE recurrence_group_id = ? AND status = 'confirmed'",
                [oldBooking.recurrence_group_id]
            );

            // Registar no histórico de cada uma
            for (const b of seriesBookings) {
                const oldData = { resource_id: b.resource_id, start_time: b.start_time, end_time: b.end_time, status: b.status };
                const newData = { ...oldData, status: 'cancelled' };
                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                    [b.id, 'cancel', JSON.stringify(oldData), JSON.stringify(newData), user_id]
                );
            }
        } else {
            // Cancelar a reserva principal e a filho (se existir)
            await connection.execute(
                "UPDATE bookings SET status = ? WHERE id = ? OR parent_booking_id = ?",
                ['cancelled', booking_id, booking_id]
            );

            // REGISTAR NO HISTÓRICO DA PRINCIPAL
            const oldData = { resource_id: oldBooking.resource_id, start_time: oldBooking.start_time, end_time: oldBooking.end_time, status: oldBooking.status };
            const newData = { ...oldData, status: 'cancelled' };
            
            await connection.execute(
                'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                [booking_id, 'cancel', JSON.stringify(oldData), JSON.stringify(newData), user_id]
            );

            // REGISTAR NO HISTÓRICO DA SECUNDÁRIA (se existir)
            const [childBookings] = await connection.execute(
                "SELECT id, resource_id, start_time, end_time, status FROM bookings WHERE parent_booking_id = ? AND status = 'confirmed' FOR UPDATE",
                [booking_id]
            );

            if (childBookings.length > 0) {
                const childId = childBookings[0].id;
                const childOldData = { resource_id: childBookings[0].resource_id, start_time: childBookings[0].start_time, end_time: childBookings[0].end_time, status: childBookings[0].status };
                const childNewData = { ...childOldData, status: 'cancelled' };
                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                    [childId, 'cancel', JSON.stringify(childOldData), JSON.stringify(childNewData), user_id]
                );
            }
        }

        // Obter lista de convidados se for uma sala
        let guestsToNotify = [];
        if (oldBooking.resource_type === 'room') {
            const [guests] = await connection.execute(
                'SELECT email, name, user_id FROM booking_guests WHERE booking_id = ?',
                [booking_id]
            );
            guestsToNotify = guests;
        }

        await connection.commit();

        // Enviar email de cancelamento aos convidados em background
        if (guestsToNotify.length > 0) {
            db.execute('SELECT name FROM users WHERE id = ?', [user_id])
                .then(([organizador]) => {
                    const organizadorNome = organizador.length > 0 ? organizador[0].name : 'Um colega';

                    const formatarData = (dataStr) => {
                        const d = new Date(dataStr);
                        return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
                    };

                    const dataInicioStr = formatarData(oldBooking.start_time);
                    const dataFimStr = formatarData(oldBooking.end_time);
                    const local = `${oldBooking.resource_name} (${oldBooking.office_name || 'Escritório'} - Piso ${oldBooking.floor || 1})`;
                    const isSeriesText = isSeries ? ' (e toda a sua série recorrente)' : '';

                    guestsToNotify.forEach(guest => {
                        const subject = `Cancelamento: Reunião em ${oldBooking.resource_name} - ${dataInicioStr.split(' ')[0]} ${isSeries ? '(Recorrente)' : ''}`;
                        const message = `Olá${guest.name ? ' ' + guest.name : ''},

A reunião agendada por ${organizadorNome} foi cancelada${isSeriesText}.

Detalhes do Evento Cancelado:
--------------------------------------------------
Local: ${local}
Início: ${dataInicioStr}
Fim: ${dataFimStr}
--------------------------------------------------

Cumprimentos,
Equipa Reserva Office`;

                        sendEmail({
                            email: guest.email,
                            subject: subject,
                            message: message,
                            user_id: guest.user_id,
                            email_type: 'cancellation'
                        }).catch(err => {
                            console.error(`Erro ao enviar email de cancelamento para ${guest.email}:`, err);
                        });
                    });
                })
                .catch(err => console.error("Erro ao obter nome do organizador para email de cancelamento:", err));
        }

        return res.status(200).json({ message: "Reserva cancelada com sucesso!" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao cancelar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar o cancelamento." });
    } finally {
        if (connection) connection.release();
    }
};

// Terminar uma reserva a decorrer mais cedo
exports.endBookingEarly = async (req, res) => {
    const booking_id = req.params.id;
    const user_id = req.user.id;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [bookings] = await connection.execute(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE', 
            [booking_id, user_id]
        );

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Reserva não encontrada ou sem permissão." });
        }

        const booking = bookings[0];

        if (booking.status !== 'confirmed') {
            await connection.rollback();
            return res.status(400).json({ message: "Apenas reservas confirmadas podem ser terminadas." });
        }

        // Gera a data atual no fuso horário de Portugal para guardar corretamente na BD
        const mysqlNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon', hour12: false }).replace('T', ' ');

        // Obter id da reserva filho se existir
        const [childBookings] = await connection.execute(
            "SELECT id, resource_id, start_time, end_time, status FROM bookings WHERE parent_booking_id = ? AND status = 'confirmed' FOR UPDATE",
            [booking_id]
        );

        await connection.execute(
            "UPDATE bookings SET end_time = ?, status = 'completed' WHERE id = ? OR parent_booking_id = ?",
            [mysqlNow, booking_id, booking_id]
        );

        // REGISTAR NO HISTÓRICO
        const oldData = { resource_id: booking.resource_id, start_time: booking.start_time, end_time: booking.end_time, status: booking.status };
        const newData = { ...oldData, end_time: mysqlNow, status: 'completed' };
        
        await connection.execute(
            'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
            [booking_id, 'update', JSON.stringify(oldData), JSON.stringify(newData), user_id]
        );

        if (childBookings.length > 0) {
            const childId = childBookings[0].id;
            const childOldData = { resource_id: childBookings[0].resource_id, start_time: childBookings[0].start_time, end_time: childBookings[0].end_time, status: childBookings[0].status };
            const childNewData = { ...childOldData, end_time: mysqlNow, status: 'completed' };
            await connection.execute(
                'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                [childId, 'update', JSON.stringify(childOldData), JSON.stringify(childNewData), user_id]
            );
        }

        await connection.commit();
        return res.status(200).json({ message: "Reserva terminada com sucesso. Obrigado por libertar o recurso!" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao terminar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar a operação." });
    } finally {
        if (connection) connection.release();
    }
};

// Atualizar reserva existente
exports.updateBooking = async (req, res) => {
    const booking_id = req.params.id;
    const { resource_id, start_time, end_time, guests, extra_resource_id } = req.body;
    const user_id = req.user.id;

    if (!resource_id || !start_time || !end_time) {
        return res.status(400).json({ message: "Por favor, forneça o recurso, a data/hora de início e de fim." });
    }

    // Validar se data de fim é posterior à data de início
    if (new Date(start_time) >= new Date(end_time)) {
        return res.status(400).json({ message: "A data de fim deve ser posterior à data de início." });
    }

    // Validar se a duração da reserva não excede 1 mês
    const start = new Date(start_time);
    const end = new Date(end_time);
    const maxEndDate = new Date(start);
    maxEndDate.setMonth(maxEndDate.getMonth() + 1);
    if (end > maxEndDate) {
        return res.status(400).json({ message: "A duração da reserva não pode exceder o período máximo de 1 mês." });
    }

    // Validar se a antecedência não excede 1 mês no futuro
    const agora = new Date();
    const limiteFuturo = new Date(agora);
    limiteFuturo.setMonth(limiteFuturo.getMonth() + 1);
    if (start > limiteFuturo) {
        return res.status(400).json({ message: "Não é possível alterar reservas para uma data com mais de 1 mês de antecedência." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Verificar se a reserva existe e pertence ao utilizador (Obtendo dados anteriores do recurso)
        const queryOldBooking = `
            SELECT b.*, r.name AS resource_name, rt.name AS resource_type,
                   o.name AS office_name, l.floor, l.zone
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
            WHERE b.id = ? AND b.user_id = ?
            FOR UPDATE
        `;
        const [bookings] = await connection.execute(queryOldBooking, [booking_id, user_id]);

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Reserva não encontrada ou sem permissão." });
        }

        const oldBooking = bookings[0];

        if (oldBooking.status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: "Não é possível editar uma reserva cancelada." });
        }

        // 2. Verificar se o recurso (novo ou mesmo) existe e está ativo (Obtendo tipo e escritório/localização)
        const queryNewResource = `
            SELECT r.status, r.name AS resource_name, rt.name AS resource_type,
                   o.name AS office_name, l.floor, l.zone
            FROM resources r
            JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
            WHERE r.id = ?
            FOR UPDATE
        `;
        const [recursos] = await connection.execute(queryNewResource, [resource_id]);

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

        // REGISTAR NO HISTÓRICO
        const oldData = { resource_id: oldBooking.resource_id, start_time: oldBooking.start_time, end_time: oldBooking.end_time, status: oldBooking.status };
        const newData = { resource_id, start_time, end_time, status: oldBooking.status };

        await connection.execute(
            'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
            [booking_id, 'update', JSON.stringify(oldData), JSON.stringify(newData), user_id]
        );

        // 3.1 PROCESSAR ATUALIZAÇÃO DO MONITOR EXTRA
        // Buscar se já tem monitor extra ativo (reserva filho)
        const [existingChildBookings] = await connection.execute(
            "SELECT id, resource_id, status FROM bookings WHERE parent_booking_id = ? AND status = 'confirmed' FOR UPDATE",
            [booking_id]
        );
        const childBooking = existingChildBookings[0];

        if (extra_resource_id) {
            const queryExtra = `
                SELECT r.status, r.name, rt.name AS resource_type
                FROM resources r
                JOIN resource_types rt ON r.type_id = rt.id
                WHERE r.id = ?
                FOR UPDATE
            `;
            const [extras] = await connection.execute(queryExtra, [extra_resource_id]);
            if (extras.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "O monitor extra selecionado não existe." });
            }
            if (extras[0].status !== 'active') {
                await connection.rollback();
                return res.status(400).json({ message: "O monitor extra selecionado está em manutenção." });
            }
            if (extras[0].resource_type !== 'monitor') {
                await connection.rollback();
                return res.status(400).json({ message: "O recurso extra selecionado deve ser um monitor." });
            }

            // Validar conflitos do monitor extra (excluindo a reserva filho atual se existir)
            const childBookingId = childBooking ? childBooking.id : 0;
            const queryVerificacaoExtra = `
                SELECT id FROM bookings 
                WHERE resource_id = ? 
                AND status = 'confirmed'
                AND id != ?
                AND start_time < ? 
                AND end_time > ?
                FOR UPDATE
            `;
            const [extraConflitos] = await connection.execute(queryVerificacaoExtra, [extra_resource_id, childBookingId, end_time, start_time]);
            if (extraConflitos.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    message: "Lamentamos, mas o monitor extra selecionado já se encontra reservado para o horário."
                });
            }

            if (childBooking) {
                // Atualizar monitor existente
                const childOldData = { resource_id: childBooking.resource_id, start_time: oldBooking.start_time, end_time: oldBooking.end_time, status: childBooking.status };
                const childNewData = { resource_id: extra_resource_id, start_time, end_time, status: childBooking.status };
                
                await connection.execute(
                    'UPDATE bookings SET resource_id = ?, start_time = ?, end_time = ? WHERE id = ?',
                    [extra_resource_id, start_time, end_time, childBooking.id]
                );

                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                    [childBooking.id, 'update', JSON.stringify(childOldData), JSON.stringify(childNewData), user_id]
                );
            } else {
                // Criar nova reserva para monitor extra
                const [extraResult] = await connection.execute(
                    'INSERT INTO bookings (user_id, resource_id, start_time, end_time, status, parent_booking_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [user_id, extra_resource_id, start_time, end_time, 'confirmed', booking_id]
                );
                
                const extraBookingData = { resource_id: extra_resource_id, start_time, end_time, status: 'confirmed', parent_booking_id: booking_id };
                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, new_data, changed_by) VALUES (?, ?, ?, ?)',
                    [extraResult.insertId, 'create', JSON.stringify(extraBookingData), user_id]
                );
            }
        } else {
            // Se extra_resource_id não foi passado mas existia monitor extra, cancelá-lo
            if (childBooking) {
                const childOldData = { resource_id: childBooking.resource_id, start_time: oldBooking.start_time, end_time: oldBooking.end_time, status: childBooking.status };
                const childNewData = { ...childOldData, status: 'cancelled' };

                await connection.execute(
                    "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
                    [childBooking.id]
                );

                await connection.execute(
                    'INSERT INTO booking_history (booking_id, action, old_data, new_data, changed_by) VALUES (?, ?, ?, ?, ?)',
                    [childBooking.id, 'cancel', JSON.stringify(childOldData), JSON.stringify(childNewData), user_id]
                );
            }
        }

        // 4. PROCESSAR ALTERAÇÕES DE CONVIDADOS
        const oldIsRoom = oldBooking.resource_type === 'room';
        const newIsRoom = recursos[0].resource_type === 'room';

        let guestDetailsToInvite = [];
        let guestDetailsToRemove = [];
        let guestDetailsToUpdate = [];

        if (guests && Array.isArray(guests)) {
            const cleanBodyGuests = [...new Set(guests.map(e => e.trim().toLowerCase()).filter(Boolean))];

            // Buscar convidados atuais na BD
            const [dbGuests] = await connection.execute(
                'SELECT email, user_id, name FROM booking_guests WHERE booking_id = ?',
                [booking_id]
            );
            const currentGuestsMap = new Map(dbGuests.map(g => [g.email.toLowerCase(), g]));

            if (newIsRoom) {
                // Determinar removidos
                for (const [email, guestObj] of currentGuestsMap.entries()) {
                    if (!cleanBodyGuests.includes(email)) {
                        guestDetailsToRemove.push(guestObj);
                    } else {
                        guestDetailsToUpdate.push(guestObj);
                    }
                }

                // Determinar novos
                for (const email of cleanBodyGuests) {
                    if (!currentGuestsMap.has(email)) {
                        const [existingUsers] = await connection.execute(
                            'SELECT id, name FROM users WHERE email = ?',
                            [email]
                        );
                        let guestUserId = null;
                        let guestName = null;
                        if (existingUsers.length > 0) {
                            guestUserId = existingUsers[0].id;
                            guestName = existingUsers[0].name;
                        }
                        
                        await connection.execute(
                            'INSERT INTO booking_guests (booking_id, user_id, email, name, status) VALUES (?, ?, ?, ?, ?)',
                            [booking_id, guestUserId, email, guestName, 'pending']
                        );
                        
                        guestDetailsToInvite.push({ email, name: guestName, user_id: guestUserId });
                    }
                }

                // Eliminar removidos da BD
                for (const guest of guestDetailsToRemove) {
                    await connection.execute(
                        'DELETE FROM booking_guests WHERE booking_id = ? AND email = ?',
                        [booking_id, guest.email]
                    );
                }
            } else if (oldIsRoom) {
                // Se mudou de sala para outro recurso (ex: desk), remover TODOS os convidados
                for (const [email, guestObj] of currentGuestsMap.entries()) {
                    guestDetailsToRemove.push(guestObj);
                }
                await connection.execute(
                    'DELETE FROM booking_guests WHERE booking_id = ?',
                    [booking_id]
                );
            }
        }

        await connection.commit();

        // 5. ENVIAR EMAILS EM BACKGROUND PÓS-COMMIT
        const timeOrRoomChanged = oldBooking.resource_id !== resource_id || 
                                  new Date(oldBooking.start_time).getTime() !== new Date(start_time).getTime() ||
                                  new Date(oldBooking.end_time).getTime() !== new Date(end_time).getTime();

        db.execute('SELECT name FROM users WHERE id = ?', [user_id])
            .then(([organizador]) => {
                const organizadorNome = organizador.length > 0 ? organizador[0].name : 'Um colega';

                const formatarData = (dataStr) => {
                    const d = new Date(dataStr);
                    return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
                };

                const dataInicioStr = formatarData(start_time);
                const dataFimStr = formatarData(end_time);
                const local = `${recursos[0].resource_name} (${recursos[0].office_name || 'Escritório'} - Piso ${recursos[0].floor || 1})`;

                const oldDataInicioStr = formatarData(oldBooking.start_time);
                const oldDataFimStr = formatarData(oldBooking.end_time);
                const oldLocal = `${oldBooking.resource_name} (${oldBooking.office_name || 'Escritório'} - Piso ${oldBooking.floor || 1})`;

                // A. Notificar cancelamento aos convidados removidos
                guestDetailsToRemove.forEach(guest => {
                    const subject = `Cancelamento: Reunião em ${oldBooking.resource_name} - ${oldDataInicioStr.split(' ')[0]}`;
                    const message = `Olá${guest.name ? ' ' + guest.name : ''},

A reunião agendada por ${organizadorNome} foi cancelada.

Detalhes do Evento Cancelado:
--------------------------------------------------
Local: ${oldLocal}
Início: ${oldDataInicioStr}
Fim: ${oldDataFimStr}
--------------------------------------------------

Cumprimentos,
Equipa Reserva Office`;

                    sendEmail({
                        email: guest.email,
                        subject: subject,
                        message: message,
                        user_id: guest.user_id,
                        email_type: 'cancellation'
                    }).catch(err => console.error(`Erro ao enviar email de remoção/cancelamento para ${guest.email}:`, err));
                });

                // B. Notificar convite aos novos convidados
                guestDetailsToInvite.forEach(guest => {
                    const subject = `Convite: Reunião em ${recursos[0].resource_name} - ${dataInicioStr.split(' ')[0]}`;
                    const message = `Olá${guest.name ? ' ' + guest.name : ''},

${organizadorNome} convidou-o para uma reunião.

Detalhes do Evento:
--------------------------------------------------
Local: ${local}
Início: ${dataInicioStr}
Fim: ${dataFimStr}
--------------------------------------------------

Por favor, compareça no horário indicado.

Cumprimentos,
Equipa Reserva Office`;

                    sendEmail({
                        email: guest.email,
                        subject: subject,
                        message: message,
                        user_id: guest.user_id,
                        email_type: 'invitation'
                    }).catch(err => console.error(`Erro ao enviar email de convite para ${guest.email}:`, err));
                });

                // C. Notificar alteração de horário/local aos convidados retidos
                if (timeOrRoomChanged && guestDetailsToUpdate.length > 0) {
                    guestDetailsToUpdate.forEach(guest => {
                        const subject = `Atualização: Reunião em ${recursos[0].resource_name} - ${dataInicioStr.split(' ')[0]}`;
                        const message = `Olá${guest.name ? ' ' + guest.name : ''},

A reunião agendada por ${organizadorNome} foi atualizada.

Novos Detalhes do Evento:
--------------------------------------------------
Local: ${local}
Início: ${dataInicioStr}
Fim: ${dataFimStr}
--------------------------------------------------

Detalhes Anteriores:
--------------------------------------------------
Local: ${oldLocal}
Início: ${oldDataInicioStr}
Fim: ${oldDataFimStr}
--------------------------------------------------

Cumprimentos,
Equipa Reserva Office`;

                        sendEmail({
                            email: guest.email,
                            subject: subject,
                            message: message,
                            user_id: guest.user_id,
                            email_type: 'update'
                        }).catch(err => console.error(`Erro ao enviar email de atualização para ${guest.email}:`, err));
                    });
                }
            })
            .catch(err => console.error("Erro ao processar emails de atualização:", err));

        return res.status(200).json({ message: "Reserva atualizada com sucesso!" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao atualizar reserva:", error);
        return res.status(500).json({ message: "Erro interno ao processar a atualização." });
    } finally {
        if (connection) connection.release();
    }
};

// Obter todas as reservas (Admin)
exports.getAllBookings = async (req, res) => {
    try {
        await autoCompleteBookings();
        
        const query = `
            SELECT 
                b.id AS booking_id, 
                b.start_time, 
                b.end_time, 
                b.status, 
                b.recurrence_group_id,
                u.name AS user_name,
                u.email AS user_email,
                r.name AS resource_name, 
                rt.name AS resource_type
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            WHERE b.parent_booking_id IS NULL
            ORDER BY b.start_time DESC
        `;
        
        const [bookings] = await db.execute(query);
        for (const booking of bookings) {
            // Convidados se for sala
            if (booking.resource_type === 'room') {
                const [guests] = await db.execute(
                    'SELECT email, name, status FROM booking_guests WHERE booking_id = ?',
                    [booking.booking_id]
                );
                booking.guests = guests;
            } else {
                booking.guests = [];
            }

            // Monitor extra se existir
            const [childBookings] = await db.execute(
                `SELECT b.id AS booking_id, b.resource_id, r.name AS resource_name 
                 FROM bookings b
                 JOIN resources r ON b.resource_id = r.id
                 WHERE b.parent_booking_id = ? AND b.status = 'confirmed'`,
                [booking.booking_id]
            );
            if (childBookings.length > 0) {
                booking.extra = {
                    booking_id: childBookings[0].booking_id,
                    resource_id: childBookings[0].resource_id,
                    resource_name: childBookings[0].resource_name
                };
            } else {
                booking.extra = null;
            }
        }

        // Devolvemos a lista completa ao Administrador
        return res.status(200).json(bookings);

    } catch (error) {
        console.error("Erro ao procurar todas as reservas:", error);
        return res.status(500).json({ message: "Erro interno ao procurar reservas." });
    }
};