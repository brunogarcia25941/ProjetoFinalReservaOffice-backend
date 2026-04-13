const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');

// --- ROTAS PÚBLICAS / UTILIZADOR NORMAL ---

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: Listar todos os recursos
 *     tags:
 *       - Recursos
 *     responses:
 *       200:
 *         description: Sucesso.
 */
router.get('/', resourceController.getAllResources);

/**
 * @swagger
 * /api/resources/availability:
 *   get:
 *     summary: Obter recursos com disponibilidade
 *     tags:
 *       - Recursos
 *     responses:
 *       200:
 *         description: Sucesso.
 */
router.get('/availability', resourceController.getAvailableResources);


// --- ROTAS DE ADMINISTRADOR ---

/**
 * @swagger
 * /api/resources:
 *   post:
 *     summary: Criar um novo recurso (Apenas Admin)
 *     tags:
 *       - Recursos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [desk, room]
 *               floor:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, maintenance]
 *     responses:
 *       201:
 *         description: Recurso criado com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 */
router.post('/', authMiddleware, adminMiddleware, resourceController.createResource);

/**
 * @swagger
 * /api/resources/{id}:
 *   put:
 *     summary: Atualizar um recurso existente (Apenas Admin)
 *     tags:
 *       - Recursos
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
 *               type:
 *                 type: string
 *               floor:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Recurso atualizado com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 *       404:
 *         description: Recurso não encontrado.
 */
router.put('/:id', authMiddleware, adminMiddleware, resourceController.updateResource);

/**
 * @swagger
 * /api/resources/{id}:
 *   delete:
 *     summary: Eliminar um recurso (Apenas Admin)
 *     tags:
 *       - Recursos
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
 *         description: Recurso apagado com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 *       404:
 *         description: Recurso não encontrado.
 */
router.delete('/:id', authMiddleware, adminMiddleware, resourceController.deleteResource);

module.exports = router;