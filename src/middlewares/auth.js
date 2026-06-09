const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Middleware para proteger rotas.
 * Verifica se o pedido contém um token JWT válido no cabeçalho 'Authorization'.
 */
module.exports = async (req, res, next) => {

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

        // 4. VERIFICAÇÃO DE VERSÃO (Invalidação no Logout)
        // Comparamos a versão no token com a versão atual na Base de Dados
        const [users] = await db.query('SELECT token_version FROM users WHERE id = ?', [decoded.id]);
        if (users.length === 0 || users[0].token_version !== decoded.version) {
            return res.status(401).json({ message: "Sessão expirada ou terminada. Faça login novamente." });
        }
        
        // 5. Injeta os dados do utilizador descodificados no objeto do pedido (req)
        req.user = decoded;
        
        // Adiciona o ID do utilizador ao logger para logs futuros
        req.log = req.log.child({ userId: req.user.id });

        res.setHeader('X-User-ID', req.user.id);

        // 6. Passa o controlo para a próxima função
        next();
    } catch (error) {
        req.log.error({ err: error }, `Erro na autenticação: ${error.message}`);
        return res.status(401).json({ message: "Acesso negado. Token inválido ou expirado." });
    }
};