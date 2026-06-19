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
        const query = `
            SELECT u.id, ur.name as role, u.token_version, u.password_hash, u.must_change_password 
            FROM users u 
            JOIN user_roles ur ON u.role_id = ur.id 
            WHERE u.email = ? AND ur.active = TRUE
        `;
        const [users] = await db.execute(query, [email]);
        if (users.length === 0) return res.status(401).json({ message: 'Credenciais inválidas.' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ message: 'Credenciais inválidas.' });


        const accessToken = jwt.sign(
            { id: user.id, role: user.role, version: user.token_version }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        );

       
        const refreshToken = jwt.sign(
            { id: user.id, version: user.token_version }, 
            process.env.JWT_REFRESH_SECRET, 
            { expiresIn: '7d' }
        );

        const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        
        // Data de expiração para a BD (7 dias)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        const mysqlExpiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        // Guardar na tabela refresh_tokens em vez de diretamente no user
        await db.execute(
            'INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?)', 
            [user.id, hashedRefreshToken, req.headers['user-agent'] || 'Desconhecido', mysqlExpiresAt]
        );

       
        res.json({
            message: 'Login com sucesso',
            accessToken,
            refreshToken,
            mustChangePassword: user.must_change_password ? true : false
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
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
        
        // Verificar se o token existe na tabela e não expirou
        const [tokens] = await db.execute(
            'SELECT t.user_id, u.role, u.token_version FROM refresh_tokens t JOIN users u ON t.user_id = u.id WHERE t.token_hash = ? AND t.expires_at > NOW()', 
            [hashedRefreshToken]
        );
        
        if (tokens.length === 0) {
            return res.status(403).json({ message: 'Refresh Token inválido, expirado ou revogado.' });
        }

        const user = tokens[0];

        // Se a versão do utilizador mudou (ex: logout global), invalidamos este token
        if (user.token_version !== decoded.version) {
            await db.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashedRefreshToken]);
            return res.status(403).json({ message: 'Sessão invalidada. Por favor, faz login novamente.' });
        }

  
        const newAccessToken = jwt.sign(
            { id: user.user_id, role: user.role, version: user.token_version }, 
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
    const { refreshToken } = req.body;

    try {
        if (refreshToken) {
            const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
            // Eliminar apenas esta sessão específica
            await db.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash = ?', [id, hashedRefreshToken]);
        } else {
            // Se não for passado o token, podemos optar por limpar todos os tokens deste user 
            // (Comportamento de segurança extra se o token se perder)
            await db.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);
        }
        res.json({ message: 'Sessão terminada com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao terminar sessão.' });
    }
};

/**
 * Invalida todas as sessões de um utilizador (Logout Global)
 */
exports.logoutAll = async (req, res) => {
    const { id } = req.user;
    try {
        // Incrementa a versão do token e remove todos os refresh tokens
        await db.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id]);
        await db.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);
        res.json({ message: 'Todas as sessões foram encerradas com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao encerrar todas as sessões.' });
    }
};

/**
 * Funções auxiliares de validação
 */
const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validatePassword = (password) => {
    // Pelo menos 8 caracteres, uma letra maiúscula, uma minúscula e um número
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
};

/**
 * Regista um novo utilizador no sistema.
 * Recebe os dados do utilizador, verifica se o email já está em uso,
 * e guarda o novo registo na base de dados (idealmente com a password encriptada).
 * * @param {Object} req - Pedido HTTP que contém nome, email e password no body.
 * @param {Object} res - Resposta HTTP.
 */
exports.register = async (req, res) => {
    const { name, email, password, home_office_id } = req.body;

    // 1. Validação de Campos Obrigatórios
    if (!name || !name.trim() || !email || !password) {
        return res.status(400).json({ message: "Por favor, preencha todos os campos obrigatórios." });
    }

    // 2. Validação de Formato de Email
    if (!validateEmail(email)) {
        return res.status(400).json({ message: "O formato do email é inválido." });
    }

    // 3. Validação de Password Forte
    if (!validatePassword(password)) {
        return res.status(400).json({ 
            message: "A password deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula e um número." 
        });
    }

    try {
        const [existingUsers] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "Este email já se encontra registado." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Obter o ID do cargo 'user'
        const [roles] = await db.execute('SELECT id FROM user_roles WHERE name = ?', ['user']);
        const roleId = roles[0].id;

        const [result] = await db.execute(
            'INSERT INTO users (name, email, password_hash, role_id, home_office_id) VALUES (?, ?, ?, ?, ?)',
            [name.trim(), email, hashedPassword, roleId, home_office_id || null]
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
        const [users] = await db.execute('SELECT id, email FROM users WHERE email = ?', [email]);
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
        await db.execute(
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
                message: message,
                user_id: user.id,
                email_type: 'password_reset'
            });
            res.status(200).json({ message: 'Email de recuperação enviado! Verifica a tua caixa de correio.' });
        } catch (emailError) {
            console.error('Erro a enviar email:', emailError);
            
            await db.execute('UPDATE users SET reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?', [user.id]);
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

    // Validação de Password Forte
    if (!validatePassword(newPassword)) {
        return res.status(400).json({ 
            message: "A password deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula e um número." 
        });
    }

    try {
       
        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        
        const [users] = await db.execute('SELECT id, reset_password_expires FROM users WHERE reset_password_token = ?', [resetPasswordToken]);
        
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

        
        await db.execute(
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
        const query = `
            SELECT u.id, u.name, u.email, ur.name as role, u.created_at, u.home_office_id, o.name as home_office
            FROM users u 
            JOIN user_roles ur ON u.role_id = ur.id
            LEFT JOIN offices o ON u.home_office_id = o.id
        `;
        const [users] = await db.execute(query);
        res.status(200).json(users);
    } catch (error) {
        console.error('Erro ao listar users:', error);
        res.status(500).json({ message: 'Erro ao obter utilizadores.' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role, home_office_id } = req.body;

    // 1. Validação de Campos Obrigatórios
    if (!name || !name.trim() || !email || !role) {
        return res.status(400).json({ message: "Por favor, preencha todos os campos obrigatórios." });
    }

    // 2. Validação de Formato de Email
    if (!validateEmail(email)) {
        return res.status(400).json({ message: "O formato do email é inválido." });
    }

    try {
        const [userExists] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }

        // Verificar se o email já está em uso por outro utilizador
        const [emailInUse] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
        if (emailInUse.length > 0) {
            return res.status(400).json({ message: "Este email já se encontra registado por outro utilizador." });
        }

        // Obter o ID do cargo
        const [roles] = await db.execute('SELECT id FROM user_roles WHERE name = ?', [role]);
        if (roles.length === 0) {
            return res.status(400).json({ message: "O cargo (role) selecionado é inválido." });
        }
        const roleId = roles[0].id;

        await db.execute(
            'UPDATE users SET name = ?, email = ?, role_id = ?, home_office_id = ? WHERE id = ?',
            [name.trim(), email, roleId, home_office_id || null, id]
        );

        res.json({ message: 'Utilizador atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar utilizador:', error);
        res.status(500).json({ message: 'Erro ao atualizar dados.' });
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.id; // ID do administrador que está a fazer o pedido

    // 1. Impedir que um administrador se elimine a si próprio
    if (parseInt(id) === parseInt(adminId)) {
        return res.status(400).json({ message: 'Não podes eliminar a tua própria conta de administrador.' });
    }

    try {
        // 2. Verificar se o utilizador a eliminar é um administrador
        const query = `
            SELECT ur.name as role 
            FROM users u 
            JOIN user_roles ur ON u.role_id = ur.id 
            WHERE u.id = ?
        `;
        const [userToDelete] = await db.execute(query, [id]);
        
        if (userToDelete.length === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }

        // 3. Se for um administrador, garantir que não é o único no sistema
        if (userToDelete[0].role === 'admin') {
            const [adminCount] = await db.execute(
                'SELECT COUNT(*) as total FROM users u JOIN user_roles ur ON u.role_id = ur.id WHERE ur.name = ?', 
                ['admin']
            );
            
            if (adminCount[0].total <= 1) {
                return res.status(400).json({ message: 'Não é possível eliminar o único administrador do sistema.' });
            }
        }

        const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }
        res.json({ message: 'Utilizador removido com sucesso.' });
    } catch (error) {
        console.error('Erro ao eliminar utilizador:', error);
        res.status(500).json({ message: 'Erro ao remover utilizador.' });
    }
};


// Devolve os dados atualizados do utilizador autenticado, incluindo o nome, email e role. Lê diretamente da base de dados com base no ID presente no token.
exports.getMe = async (req, res) => {
    try {
        // req.user.id é injetado pelo middleware de segurança (verificarToken)
        const [users] = await db.execute(
            `SELECT u.id, u.name, u.email, u.home_office_id, o.name AS home_office, u.must_change_password 
             FROM users u 
             LEFT JOIN offices o ON u.home_office_id = o.id 
             WHERE u.id = ?`,
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'Utilizador não encontrado.' });
        }

        // Retorna os dados
        res.json(users[0]);
    } catch (error) {
        console.error('Erro ao obter perfil:', error);
        res.status(500).json({ message: 'Erro ao obter dados do utilizador.' });
    }
};

// 1. Pedido de registo pelo utilizador
exports.submitRegistrationRequest = async (req, res) => {
    const { name, email, reason } = req.body;

    if (!name || !name.trim() || !email) {
        return res.status(400).json({ message: 'Nome e email são obrigatórios.' });
    }

    try {
        const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'Já existe uma conta ativa com este email.' });
        }

        const [existingRequest] = await db.execute(
            "SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'",
            [email]
        );
        if (existingRequest.length > 0) {
            return res.status(400).json({ message: 'Já existe um pedido de registo pendente para este email.' });
        }

        await db.execute(
            'INSERT INTO registration_requests (name, email, reason) VALUES (?, ?, ?)',
            [name.trim(), email, reason || null]
        );

        res.status(201).json({ message: 'Pedido de registo enviado com sucesso! Aguarde a aprovação do administrador.' });
    } catch (error) {
        console.error('Erro ao submeter pedido de registo:', error);
        res.status(500).json({ message: 'Erro interno ao submeter o pedido.' });
    }
};

// 2. Obter todos os pedidos de registo (Apenas Admin)
exports.getRegistrationRequests = async (req, res) => {
    try {
        const [requests] = await db.execute('SELECT * FROM registration_requests ORDER BY created_at DESC');
        res.json(requests);
    } catch (error) {
        console.error('Erro ao obter pedidos de registo:', error);
        res.status(500).json({ message: 'Erro interno ao obter pedidos.' });
    }
};

// 3. Resolver pedido de registo (Aprovado / Recusado) (Apenas Admin)
exports.resolveRegistrationRequest = async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;

    if (!action || !['approved', 'rejected'].includes(action)) {
        return res.status(400).json({ message: 'Ação inválida. Use "approved" ou "rejected".' });
    }

    try {
        const [requests] = await db.execute('SELECT * FROM registration_requests WHERE id = ?', [id]);
        if (requests.length === 0) {
            return res.status(404).json({ message: 'Pedido de registo não encontrado.' });
        }

        const request = requests[0];
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Este pedido já foi resolvido anteriormente.' });
        }

        if (action === 'approved') {
            const [roles] = await db.execute("SELECT id FROM user_roles WHERE name = 'user'");
            const roleId = roles.length > 0 ? roles[0].id : 1;

            const tempPassword = crypto.randomBytes(5).toString('hex');

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(tempPassword, salt);

            await db.execute(
                'INSERT INTO users (name, email, password_hash, role_id, must_change_password) VALUES (?, ?, ?, ?, TRUE)',
                [request.name, request.email, hashedPassword, roleId]
            );

            try {
                await sendEmail({
                    email: request.email,
                    subject: 'Pedido de Registo Aprovado - Password Temporária',
                    message: `Olá ${request.name},\n\nO teu pedido de registo foi aprovado pelo administrador!\n\nAs tuas credenciais de acesso são:\nEmail: ${request.email}\nPassword Temporária: ${tempPassword}\n\nNota: Terás de alterar esta password no teu primeiro login.`,
                    email_type: 'registration_approved'
                });
            } catch (emailError) {
                console.error('Erro ao enviar email de aprovação. Password provisória:', tempPassword);
            }

            await db.execute(
                "UPDATE registration_requests SET status = 'approved', resolved_at = NOW() WHERE id = ?",
                [id]
            );

            res.json({ 
                message: 'Pedido aprovado com sucesso! Utilizador criado.',
                tempPassword
            });
        } else {
            await db.execute(
                "UPDATE registration_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?",
                [id]
            );

            try {
                await sendEmail({
                    email: request.email,
                    subject: 'Pedido de Registo - Informação',
                    message: `Olá ${request.name},\n\nLamentamos informar que o teu pedido de registo foi recusado pelo administrador do portal Reserva Office.\n\nPara mais informações, entra em contacto com o suporte do teu escritório.`,
                    email_type: 'registration_rejected'
                });
            } catch (emailError) {
                console.error('Erro ao enviar email de rejeição');
            }

            res.json({ message: 'Pedido recusado com sucesso.' });
        }
    } catch (error) {
        console.error('Erro ao resolver pedido de registo:', error);
        res.status(500).json({ message: 'Erro interno ao resolver pedido.' });
    }
};

// 4. Alterar password temporária (primeiro login)
exports.changeTemporaryPassword = async (req, res) => {
    const userId = req.user.id;
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ message: 'A nova password é obrigatória.' });
    }

    const validatePassword = (pwd) => {
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        return re.test(pwd);
    };

    if (!validatePassword(newPassword)) {
        return res.status(400).json({
            message: "A password deve conter pelo menos 8 caracteres, uma letra maiúscula, uma minúscula e um número."
        });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.execute(
            'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({ message: 'Password atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao redefinir password temporária:', error);
        res.status(500).json({ message: 'Erro interno ao redefinir a password.' });
    }
};