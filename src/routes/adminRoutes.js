const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');

// Aplica a proteção de Token e de Admin a TODAS as rotas deste ficheiro
router.use(authMiddleware);
router.use(adminMiddleware);

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
router.put('/users/:id', authController.updateUser);

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
router.delete('/users/:id', authController.deleteUser);

module.exports = router;