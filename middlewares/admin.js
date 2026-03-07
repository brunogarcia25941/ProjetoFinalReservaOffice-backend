module.exports = (req, res, next) => {
    
    if (!req.user) {
        return res.status(401).json({ message: "Acesso negado. Utilizador não autenticado." });
    }

   
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            message: "Acesso negado. Apenas administradores podem realizar esta ação." 
        });
    }

    
    next();
};