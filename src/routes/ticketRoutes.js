const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authMiddleware = require('../middlewares/auth');

// Criar ticket (Qualquer utilizador autenticado)
router.post('/', authMiddleware, ticketController.createTicket);

// Listar tickets (Qualquer utilizador autenticado, filtrado por permissões na controller)
router.get('/', authMiddleware, ticketController.listTickets);

// Obter detalhes de um ticket específico
router.get('/:id', authMiddleware, ticketController.getTicketById);

// Técnico assumir a responsabilidade de um ticket
router.put('/:id/assign', authMiddleware, ticketController.assignTicket);

// Atualizar o estado do ticket (por exemplo, marcar como resolvido)
router.put('/:id/status', authMiddleware, ticketController.updateTicketStatus);

module.exports = router;
