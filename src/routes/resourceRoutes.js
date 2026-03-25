const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');

/**
 * @swagger
 * tags:
 *   name: Recursos
 *   description: Gestão de Mesas e Salas
 */

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: Listar todos os recursos
 *     description: Retorna a lista de mesas e salas. Pode ser filtrado por piso.
 *     tags:
 *       - Recursos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: floor
 *         schema:
 *           type: integer
 *         description: "Filtrar recursos por um piso específico (ex: 1, 2, 3)"
 *     responses:
 *       200:
 *         description: Lista de recursos obtida com sucesso
 *       401:
 *         description: Não autenticado
 */
router.get('/', authMiddleware, resourceController.getAllResources);

/**
 * @swagger
 * /api/resources:
 *   post:
 *     summary: Criar um novo recurso (Apenas Admin)
 *     description: Permite criar mesas ou salas no sistema.
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
 *                 example: Mesa B-05
 *               type:
 *                 type: string
 *                 enum: [desk, room]
 *                 example: desk
 *               floor:
 *                 type: integer
 *                 example: 2
 *               features:
 *                 type: object
 *                 example:
 *                   monitores: 2
 *                   perto_janela: true
 *     responses:
 *       201:
 *         description: Recurso criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (Apenas Admin)
 */
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  resourceController.createResource
);

/**
 * @swagger
 * /api/resources/{id}:
 *   put:
 *     summary: Atualizar um recurso existente (Apenas Admin)
 *     description: Atualiza os dados de um recurso existente.
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
 *         description: ID do recurso
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
 *                 type: integer
 *               features:
 *                 type: object
 *     responses:
 *       200:
 *         description: Recurso atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (Apenas Admin)
 *       404:
 *         description: Recurso não encontrado
 */
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  resourceController.updateResource
);

/**
 * @swagger
 * /api/resources/availability:
 *  get:
 *    summary: Obter recursos com disponibilidade
 *    description: Retorna a lista de recursos e indica quais estão ocupados no intervalo de tempo fornecido.
 *    tags:
 *      - Recursos
 *    security:
 *      - bearerAuth: []
 *    parameters:
 *      - in: query
 *        name: start
 *        required: true
 *        schema:
 *          type: string
 *        description: Data e hora de início (formato YYYY-MM-DD HH:mm:00)
 *      - in: query
 *        name: end
 *        required: true
 *        schema:
 *          type: string
 *        description: Data e hora de fim (formato YYYY-MM-DD HH:mm:00)
 *    responses:
 *      200:
 *        description: Lista de recursos com a flag is_booked.
 *      400:
 *        description: Faltam os parâmetros start ou end.
 */
router.get(
  '/availability', 
  authMiddleware, 
  resourceController.getResourcesWithAvailability);

module.exports = router;