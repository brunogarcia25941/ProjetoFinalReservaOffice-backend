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

module.exports = router;