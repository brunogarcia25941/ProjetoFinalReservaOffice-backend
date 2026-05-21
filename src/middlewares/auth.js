const jwt = require('jsonwebtoken');

/**
 * Middleware para proteger rotas.
 * Verifica se o pedido contém um token JWT válido no cabeçalho 'Authorization'.
 */
module.exports = (req, res, next) => {

    // 1. Vai buscar o cabeçalho de autorização
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ message: "Acesso negado. Nenhum token fornecido." });
    }

    // 2. Extrai o token real (formato esperado: "Bearer <token_aqui>")
    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Acesso negado. Formato de token inválido." });
    }

    try {
        // 3. Verifica e descodifica o token usando a chave secreta
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          return res.status(500).json({ message: 'Erro Crítico: JWT_SECRET não está definido no servidor.' });
        }
        const decoded = jwt.verify(token, secret);

        // 4. Injeta os dados do utilizador descodificados no objeto do pedido (req)
        // Isto permite que os controladores saibam quem fez o pedido
        req.user = decoded;

        // 5. Passa o controlo para a próxima função (o controlador da rota)
        next();
    } catch (error) {
       
        return res.status(403).json({ message: "Acesso negado. Token inválido ou expirado." });
    }
};