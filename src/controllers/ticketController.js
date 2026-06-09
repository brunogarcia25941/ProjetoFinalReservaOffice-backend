const db = require('../config/db');
const sendEmail = require('../utils/sendEmail');
const { cancelarReservasENotificar } = require('./resourceController');

// 1. Criar Ticket (Utilizador Reporta Avaria)
exports.createTicket = async (req, res) => {
    const { resource_id, title, description, urgency } = req.body;
    const reported_by = req.user.id;

    if (!title || !description) {
        return res.status(400).json({ message: "Título e descrição são obrigatórios." });
    }

    try {
        const [result] = await db.execute(
            "INSERT INTO tickets (resource_id, reported_by, title, description, urgency, status) VALUES (?, ?, ?, ?, ?, 'pending')",
            [resource_id || null, reported_by, title, description, urgency || 'medium']
        );
        const ticketId = result.insertId;

        // Se a urgência for Alta e tiver recurso associado, coloca o recurso em manutenção automaticamente
        if (urgency === 'high' && resource_id) {
            await db.execute("UPDATE resources SET status = 'maintenance' WHERE id = ?", [resource_id]);
            await cancelarReservasENotificar(resource_id, 'maintenance');
        }

        // Notificar técnicos por email (se houver técnicos registados)
        try {
            const [techs] = await db.execute(
                "SELECT u.email, u.name FROM users u JOIN user_roles ur ON u.role_id = ur.id WHERE ur.name = 'tecnico'"
            );

            for (const tech of techs) {
                await sendEmail({
                    email: tech.email,
                    subject: `[Ticket #${ticketId}] Nova Avaria Reportada - Urgência ${urgency || 'Média'}`,
                    message: `Olá ${tech.name},\n\nFoi reportado um novo problema:\n\nTítulo: ${title}\nDescrição: ${description}\nUrgência: ${urgency || 'medium'}\n\nPor favor, aceda ao painel de tickets para gerir esta avaria.\n\nObrigado,\nEquipa Reserva Office`,
                    email_type: 'new_ticket'
                });
            }
        } catch (emailError) {
            console.error('Erro ao notificar técnicos por email:', emailError.message);
        }

        res.status(201).json({ message: "Ticket criado com sucesso!", ticketId });
    } catch (error) {
        console.error('Erro ao criar ticket:', error);
        res.status(500).json({ message: "Erro ao criar o ticket." });
    }
};

// 2. Listar Tickets (Técnico/Admin vê todos, Utilizador vê apenas os seus)
exports.listTickets = async (req, res) => {
    const { status, urgency } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        let query = `
            SELECT t.id, t.title, t.description, t.urgency, t.status, t.resolution_notes,
                   t.created_at, t.updated_at, t.resolved_at,
                   t.reported_by, u1.name as reporter_name, u1.email as reporter_email,
                   t.assigned_to, u2.name as assignee_name,
                   t.resource_id, r.name as resource_name, r.status as resource_status,
                   o.name as building, l.floor
            FROM tickets t
            LEFT JOIN users u1 ON t.reported_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            LEFT JOIN resources r ON t.resource_id = r.id
            LEFT JOIN locations l ON r.location_id = l.id
            LEFT JOIN offices o ON l.office_id = o.id
        `;
        
        const params = [];
        const conditions = [];

        // Filtro de segurança baseado no Role
        if (userRole !== 'admin' && userRole !== 'tecnico') {
            conditions.push('t.reported_by = ?');
            params.push(userId);
        }

        // Filtros opcionais de query
        if (status) {
            conditions.push('t.status = ?');
            params.push(status);
        }
        if (urgency) {
            conditions.push('t.urgency = ?');
            params.push(urgency);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY t.created_at DESC';

        const [tickets] = await db.execute(query, params);
        res.status(200).json(tickets);
    } catch (error) {
        console.error('Erro ao listar tickets:', error);
        res.status(500).json({ message: "Erro ao obter os tickets." });
    }
};

// 3. Obter Detalhes de um Ticket específico
exports.getTicketById = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        const query = `
            SELECT t.*, u1.name as reporter_name, u1.email as reporter_email,
                   u2.name as assignee_name, r.name as resource_name
            FROM tickets t
            LEFT JOIN users u1 ON t.reported_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            LEFT JOIN resources r ON t.resource_id = r.id
            WHERE t.id = ?
        `;
        const [tickets] = await db.execute(query, [id]);

        if (tickets.length === 0) {
            return res.status(404).json({ message: "Ticket não encontrado." });
        }

        const ticket = tickets[0];

        // Restrição de segurança
        if (userRole !== 'admin' && userRole !== 'tecnico' && ticket.reported_by !== userId) {
            return res.status(403).json({ message: "Não tem permissões para ver este ticket." });
        }

        res.status(200).json(ticket);
    } catch (error) {
        console.error('Erro ao obter ticket:', error);
        res.status(500).json({ message: "Erro ao obter o ticket." });
    }
};

// 4. Técnico Assume o Ticket (Atribuição)
exports.assignTicket = async (req, res) => {
    const { id } = req.params;
    const technicianId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'tecnico') {
        return res.status(403).json({ message: "Apenas técnicos ou administradores podem assumir tickets." });
    }

    try {
        const [ticketCheck] = await db.execute('SELECT id FROM tickets WHERE id = ?', [id]);
        if (ticketCheck.length === 0) {
            return res.status(404).json({ message: "Ticket não encontrado." });
        }

        await db.execute(
            "UPDATE tickets SET assigned_to = ?, status = 'in_progress' WHERE id = ?",
            [technicianId, id]
        );

        res.status(200).json({ message: "Ticket atribuído com sucesso e em curso." });
    } catch (error) {
        console.error('Erro ao atribuir ticket:', error);
        res.status(500).json({ message: "Erro ao atribuir o ticket." });
    }
};

// 5. Atualizar Estado do Ticket (Ex: Fechar / Resolver)
exports.updateTicketStatus = async (req, res) => {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'tecnico') {
        return res.status(403).json({ message: "Apenas técnicos ou administradores podem atualizar o estado de tickets." });
    }

    if (!status) {
        return res.status(400).json({ message: "O estado do ticket é obrigatório." });
    }

    try {
        const [tickets] = await db.execute(
            'SELECT resource_id, reported_by, title FROM tickets WHERE id = ?',
            [id]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ message: "Ticket não encontrado." });
        }

        const ticket = tickets[0];

        let updateQuery = 'UPDATE tickets SET status = ?, resolution_notes = ?';
        const params = [status, resolution_notes || null];

        if (status === 'resolved') {
            updateQuery += ', resolved_at = NOW()';
        } else {
            updateQuery += ', resolved_at = NULL';
        }

        updateQuery += ' WHERE id = ?';
        params.push(id);

        await db.execute(updateQuery, params);

        // Se o ticket foi resolvido e possui um recurso associado
        if (status === 'resolved' && ticket.resource_id) {
            const resId = ticket.resource_id;
            
            // Verifica se existem OUTROS tickets ativos de urgência alta para este recurso
            const [otherHighUrgency] = await db.execute(
                "SELECT id FROM tickets WHERE resource_id = ? AND status IN ('pending', 'in_progress') AND urgency = 'high' AND id != ?",
                [resId, id]
            );

            // Se não houver mais avarias graves ativas, coloca o recurso como ativo novamente
            if (otherHighUrgency.length === 0) {
                await db.execute('UPDATE resources SET status = "active" WHERE id = ?', [resId]);
            }
        }

        // Notificar o utilizador que reportou a avaria por email
        try {
            const [reporter] = await db.execute('SELECT email, name FROM users WHERE id = ?', [ticket.reported_by]);
            if (reporter.length > 0) {
                await sendEmail({
                    email: reporter[0].email,
                    subject: `[Ticket #${id}] Avaria Resolvida - ${ticket.title}`,
                    message: `Olá ${reporter[0].name},\n\nO seu ticket de avaria #${id} ("${ticket.title}") foi marcado como RESOLVIDO.\n\nNotas do Técnico:\n${resolution_notes || 'Nenhuma nota registada.'}\n\nObrigado por nos ajudar a manter o escritório funcional!\n\nEquipa Reserva Office`,
                    user_id: ticket.reported_by,
                    email_type: 'ticket_update'
                });
            }
        } catch (emailError) {
            console.error('Erro ao enviar email de atualização de ticket:', emailError.message);
        }

        res.status(200).json({ message: `Estado do ticket atualizado para: ${status}.` });
    } catch (error) {
        console.error('Erro ao atualizar estado do ticket:', error);
        res.status(500).json({ message: "Erro ao atualizar o estado do ticket." });
    }
};
