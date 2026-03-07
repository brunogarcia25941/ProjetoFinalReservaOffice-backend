const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {

    const authHeader = req.header('Authorization');

   
    if (!authHeader) {
        return res.status(401).json({ message: "Acesso negado. Nenhum token fornecido." });
    }


    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Acesso negado. Formato de token inválido." });
    }

    try {
        
        const secret = process.env.JWT_SECRET || 'chave_super_secreta_provisoria';
        const decoded = jwt.verify(token, secret);

        
        req.user = decoded;

       
        next();
    } catch (error) {
       
        return res.status(403).json({ message: "Acesso negado. Token inválido ou expirado." });
    }
};