const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verificarToken = require('../middlewares/auth');
const verificarAdmin = require('../middlewares/admin');

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
        const [locations] = await db.execute('SELECT id, building, floor, zone FROM locations WHERE active = TRUE');
        res.json(locations);
    } catch (error) {
        res.status(500).json({ message: "Erro ao obter localizações." });
    }
});

module.exports = router;