const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const bookingController = require('../controllers/bookingController');
const verificarToken = require('../middlewares/auth');
const verificarAdmin = require('../middlewares/admin');

// Regras de Validação para Reservas
const createBookingValidation = [
    body('resource_id').isInt(),
    body('start_time').isISO8601(),
    body('end_time').isISO8601().custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.start_time)) {
            throw new Error('end_time must be after start_time');
        }
        return true;
    }),
    body('guests').optional().isArray().withMessage('Guests deve ser um array.'),
    body('guests.*').optional().isEmail().withMessage('Todos os convidados devem ter um email válido.')
];

const updateBookingValidation = [
    param('id').isInt(),
    body('resource_id').isInt(),
    body('start_time').isISO8601(),
    body('end_time').isISO8601().custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.start_time)) {
            throw new Error('end_time must be after start_time');
        }
        return true;
    }),
    body('guests').optional().isArray().withMessage('Guests deve ser um array.'),
    body('guests.*').optional().isEmail().withMessage('Todos os convidados devem ter um email válido.')
];

const cancelBookingValidation = [
    param('id').isInt()
];

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   put:
 *     summary: Cancelar uma reserva
 *     description: Altera o estado de uma reserva para "cancelled". O utilizador só pode cancelar as suas próprias reservas.
 *     tags:
 *       - Reservas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da reserva a cancelar
 *     responses:
 *       200:
 *         description: Reserva cancelada com sucesso.
 *       400:
 *         description: Reserva já estava cancelada.
 *       404:
 *         description: Reserva não encontrada ou não pertence ao utilizador.
 *       401:
 *         description: Não autenticado.
 */
router.put('/:id/cancel', verificarToken, cancelBookingValidation, validate, bookingController.cancelBooking);

/**
 * @swagger
 * /api/bookings/{id}/end:
 *   put:
 *     summary: Terminar uma reserva em curso mais cedo
 *     description: Altera a data de fim de uma reserva ativa para a hora atual, libertando o recurso.
 *     tags:
 *       - Reservas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da reserva a terminar
 *     responses:
 *       200:
 *         description: Reserva terminada com sucesso.
 *       400:
 *         description: A reserva não pode ser terminada (já acabou, foi cancelada ou ainda não começou).
 *       404:
 *         description: Reserva não encontrada ou não pertence ao utilizador.
 *       401:
 *         description: Não autenticado.
 */
router.put('/:id/end', verificarToken, [param('id').isInt()], validate, bookingController.endBookingEarly);

/**
 * @swagger
 * /api/bookings/{id}:
 *   put:
 *     summary: Atualizar uma reserva
 *     description: Permite ao utilizador alterar os dados (recurso, data/hora) de uma reserva existente.
 *     tags:
 *       - Reservas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resource_id:
 *                 type: integer
 *               start_time:
 *                 type: string
 *               end_time:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reserva atualizada com sucesso.
 *       400:
 *         description: Conflito de horários ou dados inválidos.
 */
router.put('/:id', verificarToken, updateBookingValidation, validate, bookingController.updateBooking);

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Listar as reservas do utilizador logado
 *     description: Devolve todas as reservas feitas pelo utilizador autenticado (A Minha Agenda).
 *     tags:
 *       - Reservas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de reservas recuperada com sucesso.
 *       401:
 *         description: Não autenticado.
 */
router.get('/', verificarToken, bookingController.getUserBookings);

/**
 * @swagger
 * /api/bookings/all:
 *   get:
 *     summary: Listar TODAS as reservas (Apenas Admin)
 *     description: Devolve todas as reservas de todos os utilizadores. Requer privilégios de administrador.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de todas as reservas recuperada com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado. Apenas administradores podem ver esta lista.
 */
router.get('/all', verificarToken, verificarAdmin, bookingController.getAllBookings);

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Criar uma nova reserva
 *     description: Permite a um utilizador autenticado reservar um recurso (Mesa, Sala, etc).
 *     tags:
 *       - Reservas
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resource_id:
 *                 type: integer
 *                 example: 1
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-10 09:00:00"
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-10 18:00:00"
 *     responses:
 *       201:
 *         description: Reserva efetuada com sucesso.
 *       400:
 *         description: Dados incompletos.
 *       401:
 *         description: Não autenticado.
 */
router.post('/', verificarToken, createBookingValidation, validate, bookingController.createBooking);

module.exports = router;