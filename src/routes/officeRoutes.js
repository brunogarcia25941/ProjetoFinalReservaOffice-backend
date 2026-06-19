const express = require('express');
const router = express.Router();
const officeController = require('../controllers/officeController');
const authMiddleware = require('../middlewares/auth');
const adminMiddleware = require('../middlewares/admin');

// Listar todos os escritórios (Utilizadores Autenticados)
router.get('/', authMiddleware, officeController.getAllOffices);

// Obter layout de um escritório/piso (Utilizadores Autenticados)
router.get('/layout', authMiddleware, officeController.getOfficeLayout);

// Guardar ou atualizar layout (Apenas Admin)
router.post('/layout', authMiddleware, adminMiddleware, officeController.saveOfficeLayout);

// Criar escritório (Apenas Admin)
router.post('/', authMiddleware, adminMiddleware, officeController.createOffice);

// Atualizar escritório (Apenas Admin)
router.put('/:id', authMiddleware, adminMiddleware, officeController.updateOffice);

// Desativar escritório (Apenas Admin)
router.delete('/:id', authMiddleware, adminMiddleware, officeController.deleteOffice);

module.exports = router;
