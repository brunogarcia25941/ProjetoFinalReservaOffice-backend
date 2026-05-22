const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');


/**
 * Autentica um utilizador e gera um Token de Sessão (JWT).
 * Valida as credenciais inseridas comparando-as com as da base de dados.
 * Se forem válidas, assina um token que contém o ID e o Role (cargo) do utilizador.
 * * @param {Object} req - Pedido HTTP que contém email e password.
 * @param {Object} res - Resposta HTTP que contém a mensagem de sucesso e o Token.
 */
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ message: 'Credenciais inválidas.' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ message: 'Credenciais inválidas.' });


        const accessToken = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        );

       
        const refreshToken = jwt.sign(
            { id: user.id }, 
            process.env.JWT_REFRESH_SECRET, 
            { expiresIn: '7d' }
        );

        const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await db.query('UPDATE users SET refresh_token = ? WHERE id = ?', [hashedRefreshToken, user.id]);

       
        res.json({
            message: 'Login com sucesso',
            accessToken,
            refreshToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('Erro detalhado no login:', error);
        res.status(500).json({ 
            message: 'Erro interno no servidor.', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
exports.refreshToken = async (req, res) => {
    
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh Token é obrigatório.' });
    }

    try {
    
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const [users] = await db.query('SELECT * FROM users WHERE id = ? AND refresh_token = ?', [decoded.id, hashedRefreshToken]);
        
        if (users.length === 0) {
            return res.status(403).json({ message: 'Refresh Token inválido ou revogado. Faz login novamente.' });
        }

  
        const newAccessToken = jwt.sign(
            { id: users[0].id, role: users[0].role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        );

        res.json({ accessToken: newAccessToken });

    } catch (error) {
        console.error('Erro no refresh token:', error);
        res.status(403).json({ message: 'Refresh Token expirado ou inválido. Faz login novamente.' });
    }
};

exports.logout = async (req, res) => {
    const { id } = req.user; 
    try {
        await db.query('UPDATE users SET refresh_token = NULL WHERE id = ?', [id]);
        res.json({ message: 'Sessão terminada com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao terminar sessão.' });
    }
};

/**
 * Regista um novo utilizador no sistema.
 * Recebe os dados do utilizador, verifica se o email já está em uso,
 * e guarda o novo registo na base de dados (idealmente com a password encriptada).
 * * @param {Object} req - Pedido HTTP que contém nome, email e password no body.
 * @param {Object} res - Resposta HTTP.
 */
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "Por favor, preencha todos os campos." });
    }

    try {
        const [existingUsers] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "Este email já se encontra registado." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const role = "user";

        const [result] = await db.execute(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role]
        );

        return res.status(201).json({ 
            message: "Utilizador criado com sucesso!", 
            userId: result.insertId 
        });

    } catch (error) {
        console.error("Erro no registo:", error);
        return res.status(500).json({ message: "Erro interno ao criar utilizador." });
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'O email é obrigatório.' });

    try {
        // Verificar se o utilizador existe
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
        return res.status(200).json({ message: 'Email de recuperação enviado! Verifica a tua caixa de correio.' });
        }
        const user = users[0];

        // Gerar um token aleatório e seguro
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Encriptar o token para guardar na BD (para maior segurança)
        const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Definir a validade para daqui a 1 hora
        const expireDate = new Date();
        expireDate.setHours(expireDate.getHours() + 1);
        const mysqlExpireDate = expireDate.toISOString().slice(0, 19).replace('T', ' ');

        // Guardar na base de dados
        await db.query(
            'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
            [resetPasswordToken, mysqlExpireDate, user.id]
        );

        // Criar o link de redefinição apontando para o frontend em produção
        const frontendUrl = process.env.FRONTEND_URL || 'https://projeto-final-reserva-office.vercel.app';
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
        const message = `Esqueceste-te da password?\n\nClica neste link para redefinir a tua password (válido por 1 hora):\n${resetUrl}\n\nSe não pediste a alteração, podes ignorar este email de forma segura.`;

        
        try {
            await sendEmail({
                email: user.email,
                subject: 'Recuperação de Password - Reserva Office',
                message: message
            });
            res.status(200).json({ message: 'Email de recuperação enviado! Verifica a tua caixa de correio.' });
        } catch (emailError) {
            console.error('Erro a enviar email:', emailError);
            
            await db.query('UPDATE users SET reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?', [user.id]);
            return res.status(500).json({ message: 'Erro ao enviar o email. Tenta novamente mais tarde.' });
        }

    } catch (error) {
        console.error('Erro no forgotPassword:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};


exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token e nova password são obrigatórios.' });
    }

    try {
       
        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        
        const [users] = await db.query('SELECT * FROM users WHERE reset_password_token = ?', [resetPasswordToken]);
        
        if (users.length === 0) {
            return res.status(400).json({ message: 'Token inválido.' });
        }

        const user = users[0];

        
        const now = new Date();
        const expireDate = new Date(user.reset_password_expires);
        if (now > expireDate) {
            return res.status(400).json({ message: 'O link expirou. Por favor, pede uma nova recuperação de password.' });
        }

        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        
        await db.query(
            'UPDATE users SET password_hash = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        res.status(200).json({ message: 'Password atualizada com sucesso! Já podes fazer login.' });
    } catch (error) {
        console.error('Erro no resetPassword:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};
exports.getAllUsers = async (req, res) => {
    try {
       
        const [users] = await db.query('SELECT id, name, email, role FROM users');
        res.status(200).json(users);
    } catch (error) {
        console.error('Erro ao listar users:', error);
        res.status(500).json({ message: 'Erro ao obter utilizadores.' });
    }
};
exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, name, email, role, created_at FROM users');
        res.status(200).json(users);
    } catch (error) {
        console.error('Erro ao listar users:', error);
        res.status(500).json({ message: 'Erro ao obter utilizadores.' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;

    try {
        const [userExists] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }

        await db.query(
            'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
            [name, email, role, id]
        );

        res.json({ message: 'Utilizador atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar utilizador:', error);
        res.status(500).json({ message: 'Erro ao atualizar dados.' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }
        res.json({ message: 'Utilizador removido com sucesso.' });
    } catch (error) {
        console.error('Erro ao eliminar utilizador:', error);
        res.status(500).json({ message: 'Erro ao remover utilizador.' });
    }
};