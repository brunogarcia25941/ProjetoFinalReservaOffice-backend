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

    console.log(`aqui 1 `);

    try {
        console.log(`aqui 5 `);
        // 3. Verifica e descodifica o token usando a chave secreta
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.log(`aqui 4 `);
          return res.status(500).json({ message: 'Erro Crítico: JWT_SECRET não está definido no servidor.' });
        }
        
        const decoded = jwt.verify(token, secret);
        console.log(`aqui 3 `);
        console.log(decoded);

        // 4. VERIFICAÇÃO DE VERSÃO (Invalidação no Logout)
        // Comparamos a versão no token com a versão atual na Base de Dados
        const [users] = await db.query('SELECT token_version FROM users WHERE id = ?', [decoded.id]);
        console.log(`aqui 2 `);
        console.log(users);
        console.log(`Token versão: ${decoded.version}, DB versão: ${users.length > 0 ? users[0].token_version : 'N/A'}`);
        if (users.length === 0 || users[0].token_version !== decoded.version) {
            console.log(`aqui 60 `);
            return res.status(401).json({ message: "Sessão expirada ou terminada. Faça login novamente." });
        }
        
        // 5. Injeta os dados do utilizador descodificados no objeto do pedido (req)
        req.user = decoded;


        
        req.log.child({ userId: 'teste' }); // Adiciona o ID do utilizador ao logger para logs futuros


        console.log(`Autenticação bem-sucedida para o utilizador ID: ${req.user.id}`);
        res.setHeader('X-User-ID', req.user.id);
        console.log(`Cabeçalho X-User-ID definido para: ${req.user.id}`);

        // 6. Passa o controlo para a próxima função
        next();
    } catch (error) {
        console.log(`(error) Erro na autenticação: ${error.message}`);
       
        return res.status(401).json({ message: "Acesso negado. Token inválido ou expirado." });
    }
};