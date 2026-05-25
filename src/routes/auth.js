const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');

// Configuração de Rate Limiting para proteger endpoints sensíveis
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Limita a 5 tentativas por IP
    message: { message: "Demasiadas tentativas de login. Tenta novamente após 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // Limita a 3 registos por IP por hora
    message: { message: "Demasiadas contas criadas a partir deste IP. Tenta novamente mais tarde." },
    standardHeaders: true,
    legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // Limita a 3 pedidos de recuperação por hora
    message: { message: "Demasiados pedidos de recuperação de password. Tenta novamente mais tarde." },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Fazer login no sistema
 *     description: Autentica um utilizador verificando na Base de Dados e devolve um Access Token e um Refresh Token.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@softinsa.pt
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login efetuado com sucesso (Retorna os Tokens)
 *       401:
 *         description: Credenciais inválidas
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Gerar um novo Access Token
 *     description: Recebe um Refresh Token válido e devolve um novo Access Token.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Novo Access Token gerado com sucesso
 *       401:
 *         description: Refresh Token ausente
 *       403:
 *         description: Refresh Token inválido ou revogado
 */
router.post('/refresh', authController.refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Terminar sessão (Logout)
 *     description: Remove o Refresh Token específico da base de dados. Se nenhum token for enviado, remove todas as sessões do utilizador.
 *     tags:
 *       - Autenticação
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sessão terminada com sucesso
 */
router.post('/logout', authMiddleware, authController.logout);

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Terminar todas as sessões (Logout Global)
 *     description: Remove todos os Refresh Tokens do utilizador e incrementa a versão do token para invalidar Access Tokens.
 *     tags:
 *       - Autenticação
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todas as sessões terminadas
 */
router.post('/logout-all', authMiddleware, authController.logoutAll);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registar um novo utilizador
 *     description: Cria uma nova conta de utilizador na Base de Dados.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "João Silva"
 *               email:
 *                 type: string
 *                 example: "joao.silva@softinsa.pt"
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       201:
 *         description: Utilizador criado com sucesso
 *       400:
 *         description: Dados inválidos ou email já registado
 */
router.post('/register', registerLimiter, authController.register);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Pedir recuperação de password
 *     description: Envia um email com um link mágico para redefinir a password.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: o_teu_email_pessoal@gmail.com
 *     responses:
 *       200:
 *         description: Email de recuperação enviado com sucesso
 *       404:
 *         description: Utilizador não encontrado
 */
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Redefinir a password
 *     description: Recebe o token enviado por email e a nova password do utilizador.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password redefinida com sucesso
 *       400:
 *         description: Token inválido ou expirado
 */
router.post('/reset-password', authController.resetPassword);

module.exports = router;