const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Fazer login no sistema
 *     description: Autentica um utilizador e devolve um token JWT. (A usar Mock Data)
 *     tags: [Autenticação]
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
 *         description: Login efetuado com sucesso (Retorna o Token)
 *       401:
 *         description: Credenciais inválidas
 */
router.post('/login', (req, res) => {
    const { email, password } = req.body;

   
    const mockUser = { 
        id: 1, 
        email: "admin@softinsa.pt", 
        password_hash: "123456", 
        role: "admin" 
    };

    
    if (email === mockUser.email && password === mockUser.password_hash) {
        
        
        const secret = process.env.JWT_SECRET || 'chave_super_secreta_provisoria';
        const token = jwt.sign(
            { id: mockUser.id, role: mockUser.role }, 
            secret, 
            { expiresIn: '1h' } 
        );

        return res.json({ message: "Login com sucesso!", token });
    }

    
    return res.status(401).json({ message: "Credenciais inválidas" });
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registar um novo utilizador
 *     description: Cria uma nova conta de utilizador no sistema. (A usar Mock Data)
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
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
 *         description: Utilizador criado com sucesso.
 *       400:
 *         description: Dados inválidos ou email já registado.
 */
router.post('/register', (req, res) => {
    const { nome, email, password } = req.body;

    // 1. Validação simples: verificar se os dados vieram todos
    if (!nome || !email || !password) {
        return res.status(400).json({ message: "Por favor, preencha todos os campos." });
    }

    // 2. MOCK DATA: Simular que vamos à Base de Dados ver se o email já existe
    if (email === "admin@softinsa.pt") {
        return res.status(400).json({ message: "Este email já se encontra registado." });
    }

    // 3. MOCK DATA: Simular a criação do utilizador na Base de Dados
    const newUser = {
        id: Math.floor(Math.random() * 1000),
        nome: nome,
        email: email,
        role: "user"
    };

    // 4. Responder com sucesso
    return res.status(201).json({ 
        message: "Utilizador criado com sucesso!", 
        user: newUser 
    });
});


module.exports = router;