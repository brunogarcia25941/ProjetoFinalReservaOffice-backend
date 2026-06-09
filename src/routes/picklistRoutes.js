const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * @swagger
 * /api/picklists:
 *   get:
 *     summary: Obter todas as picklists para o frontend
 *     tags: [Picklists]
 */
router.get('/', async (req, res) => {
    try {
        const [roles] = await db.execute('SELECT name as id, label FROM user_roles WHERE active = TRUE');
        const [resourceTypes] = await db.execute('SELECT name as id, label FROM resource_types WHERE active = TRUE');
        
        // Picklist estática para estados (para manter consistência com o resto do sistema)
        const resourceStatuses = [
            { id: 'active', label: 'Ativo (Livre)' },
            { id: 'maintenance', label: 'Em Manutenção' }
        ];

        res.json({
            roles,
            resourceTypes,
            resourceStatuses
        });
    } catch (error) {
        console.error("Erro ao obter picklists:", error);
        res.status(500).json({ message: "Erro ao carregar dados auxiliares." });
    }
});

/**
 * @swagger
 * /api/picklists/resource-types:
 *   get:
 *     summary: Obter tipos de recursos ativos
 *     tags: [Picklists]
 */
router.get('/resource-types', async (req, res) => {
    try {
        const [types] = await db.execute('SELECT name, label FROM resource_types WHERE active = TRUE');
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: "Erro ao obter tipos de recursos." });
    }
});

/**
 * @swagger
 * /api/picklists/user-roles:
 *   get:
 *     summary: Obter cargos de utilizador ativos
 *     tags: [Picklists]
 */
router.get('/user-roles', async (req, res) => {
    try {
        const [roles] = await db.execute('SELECT name, label FROM user_roles WHERE active = TRUE');
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: "Erro ao obter cargos." });
    }
});

/**
 * @swagger
 * /api/picklists/locations:
 *   get:
 *     summary: Obter localizações (edifícios, pisos, zonas) ativas
 *     tags: [Picklists]
 */
router.get('/locations', async (req, res) => {
    try {
        const query = `
            SELECT l.id, o.name AS building, l.floor, l.zone 
            FROM locations l
            JOIN offices o ON l.office_id = o.id
            WHERE l.active = TRUE AND o.active = TRUE
        `;
        const [locations] = await db.execute(query);
        res.json(locations);
    } catch (error) {
        res.status(500).json({ message: "Erro ao obter localizações." });
    }
});

/**
 * @swagger
 * /api/picklists/users:
 *   get:
 *     summary: Obter utilizadores para autocompletar convidados
 *     tags: [Picklists]
 *     security:
 *       - bearerAuth: []
 */
const verificarToken = require('../middlewares/auth');
router.get('/users', verificarToken, async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, name, email FROM users');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Erro ao obter utilizadores." });
    }
});

module.exports = router;