const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');
const auditController = require('../controllers/auditController');
const statsController = require('../controllers/statsController');

const updateUserValidation = [
    param('id').isInt(),
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('role').isString().notEmpty(),
    body('home_office_id').optional({ nullable: true }).isInt()
];

const deleteUserValidation = [
    param('id').isInt()
];

// Aplica a proteção de Token e de Admin a TODAS as rotas deste ficheiro
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: Listar logs de auditoria (Apenas Admin)
 *     description: Devolve a lista das últimas operações realizadas no sistema.
 *     tags:
 *       - Admin - Auditoria
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Lista de logs obtida com sucesso.
 */
router.get('/audit-logs', auditController.getAllLogs);

/**
 * @swagger
 * /api/admin/audit-logs/{id}:
 *   get:
 *     summary: Ver detalhes de um log (Apenas Admin)
 *     tags:
 *       - Admin - Auditoria
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes do log.
 */
router.get('/audit-logs/:id', auditController.getLogById);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Listar todos os utilizadores (Apenas Admin)
 *     description: Devolve a lista de todos os utilizadores registados.
 *     tags:
 *       - Admin - Gestão de Utilizadores
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de utilizadores obtida com sucesso
 */
router.get('/users', authController.getAllUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: Editar um utilizador (Apenas Admin)
 *     description: Permite alterar o nome, email ou cargo (role) de um utilizador.
 *     tags:
 *       - Admin - Gestão de Utilizadores
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
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin, tecnico]
 *     responses:
 *       200:
 *         description: Utilizador atualizado com sucesso.
 *       400:
 *         description: Dados inválidos.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 *       404:
 *         description: Utilizador não encontrado.
 */
router.put('/users/:id', updateUserValidation, validate, authController.updateUser);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Eliminar um utilizador (Apenas Admin)
 *     description: Remove permanentemente uma conta do sistema.
 *     tags:
 *       - Admin - Gestão de Utilizadores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Utilizador eliminado com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 *       404:
 *         description: Utilizador não encontrado.
 */
router.delete('/users/:id', deleteUserValidation, validate, authController.deleteUser);

// Rota de estatísticas de ocupação
router.get('/stats', statsController.getSpaceStats);

// Gestão de Pedidos de Registo
router.get('/registration-requests', authController.getRegistrationRequests);
router.post('/registration-requests/:id/resolve', authController.resolveRegistrationRequest);

module.exports = router;