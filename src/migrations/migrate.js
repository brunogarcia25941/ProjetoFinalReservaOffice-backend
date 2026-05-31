const db = require('../config/db');

/**
 * Script de Migração de Base de Dados
 * Executa todas as alterações estruturais e tabelas necessárias.
 */
const runMigrations = async () => {
    let connection;
    try {
        connection = await db.getConnection();
        console.log('--- Iniciando Migrações da Base de Dados ---');

        // 1. Colunas para o Auth (Refresh Token e Reset Password)
        try {
            await connection.query("ALTER TABLE users ADD COLUMN refresh_token TEXT NULL");
            console.log('Coluna refresh_token adicionada.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255) NULL");
            await connection.query("ALTER TABLE users ADD COLUMN reset_password_expires DATETIME NULL");
            console.log('Colunas de recuperação de password verificadas.');
        } catch (e) { /* Colunas já existem */ }

        // 2. Colunas para os Recursos (Piso e Características JSON)
        try {
            await connection.query("ALTER TABLE resources ADD COLUMN floor INT NOT NULL DEFAULT 1");
            console.log('Coluna floor adicionada aos recursos.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE resources ADD COLUMN features JSON NULL");
            console.log('Coluna features (JSON) adicionada aos recursos.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE resources ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            console.log('Coluna created_at adicionada aos recursos.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0");
            console.log('Coluna token_version adicionada.');
        } catch (e) { /* Coluna já existe */ }

        // 3. Criar Tabela de Refresh Tokens para múltiplas sessões
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    token_hash VARCHAR(255) NOT NULL,
                    device_info TEXT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            console.log('Tabela refresh_tokens verificada/criada.');
        } catch (e) { 
            console.error('Erro ao criar tabela refresh_tokens:', e.message);
        }

        // 4. Criar Tabela de Histórico de Reservas para Auditoria
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS booking_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    booking_id INT NOT NULL,
                    action ENUM('create', 'update', 'cancel', 'delete') NOT NULL,
                    old_data JSON NULL,
                    new_data JSON NULL,
                    changed_by INT NOT NULL,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
                    FOREIGN KEY (changed_by) REFERENCES users(id)
                )
            `);
            console.log('Tabela booking_history verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela booking_history:', e.message);
        }

        // 5. Tabelas de Picklist para evitar ENUMs
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS resource_types (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50) NOT NULL UNIQUE,
                    label VARCHAR(100) NOT NULL,
                    active BOOLEAN DEFAULT TRUE
                )
            `);
            console.log('Tabela resource_types verificada.');
            
            // Inserir valores padrão se a tabela estiver vazia
            const [types] = await connection.query("SELECT COUNT(*) as total FROM resource_types");
            if (types[0].total === 0) {
                await connection.query(`
                    INSERT INTO resource_types (name, label) VALUES 
                    ('desk', 'Mesa de Trabalho'),
                    ('monitor', 'Monitor Extra'),
                    ('room', 'Sala de Reunião')
                `);
                console.log('Valores padrão inseridos em resource_types.');
            }
        } catch (e) { console.error('Erro em resource_types:', e.message); }

        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS user_roles (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50) NOT NULL UNIQUE,
                    label VARCHAR(100) NOT NULL,
                    active BOOLEAN DEFAULT TRUE
                )
            `);
            console.log('Tabela user_roles verificada.');

            const [roles] = await connection.query("SELECT COUNT(*) as total FROM user_roles");
            if (roles[0].total === 0) {
                await connection.query(`
                    INSERT INTO user_roles (name, label) VALUES 
                    ('user', 'Utilizador'),
                    ('admin', 'Administrador')
                `);
                console.log('Valores padrão inseridos em user_roles.');
            }
        } catch (e) { console.error('Erro em user_roles:', e.message); }

        // Migração de resources.type (ENUM -> FK)
        try {
            // Verificar se a coluna type_id já existe
            const [cols] = await connection.query("SHOW COLUMNS FROM resources LIKE 'type_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE resources ADD COLUMN type_id INT NULL");
                // Mapear dados antigos
                await connection.query("UPDATE resources r JOIN resource_types rt ON r.type = rt.name SET r.type_id = rt.id");
                await connection.query("ALTER TABLE resources MODIFY COLUMN type_id INT NOT NULL");
                await connection.query("ALTER TABLE resources ADD FOREIGN KEY (type_id) REFERENCES resource_types(id)");
                console.log('Migração de resources.type concluída.');
            }
        } catch (e) { console.error('Erro na migração de resources.type:', e.message); }
// Migração de users.role (ENUM -> FK)
try {
    const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'role_id'");
    if (cols.length === 0) {
        await connection.query("ALTER TABLE users ADD COLUMN role_id INT NULL");
    }

    // Inserir roles que existam na tabela users mas não na user_roles
    const [missingRoles] = await connection.query(`
        SELECT DISTINCT role FROM users 
        WHERE role IS NOT NULL 
        AND role NOT IN (SELECT name FROM user_roles)
    `);

    for (const row of missingRoles) {
        await connection.query("INSERT INTO user_roles (name, label) VALUES (?, ?)", [row.role, row.role.charAt(0).toUpperCase() + row.role.slice(1)]);
        console.log(`Nova role detetada e adicionada: ${row.role}`);
    }

    await connection.query("UPDATE users u JOIN user_roles ur ON u.role = ur.name SET u.role_id = ur.id WHERE u.role_id IS NULL");

    // Garantir que não há NULLs antes de aplicar NOT NULL
    const [nullCount] = await connection.query("SELECT COUNT(*) as total FROM users WHERE role_id IS NULL");
    if (nullCount[0].total === 0) {
        await connection.query("ALTER TABLE users MODIFY COLUMN role_id INT NOT NULL");
        try {
            await connection.query("ALTER TABLE users ADD FOREIGN KEY (role_id) REFERENCES user_roles(id)");
        } catch (e) { /* FK já pode existir */ }
        console.log('Migração de users.role concluída.');
    } else {
        console.warn(`Atenção: Existem ${nullCount[0].total} utilizadores sem role mapeada. Não foi possível aplicar NOT NULL.`);
    }
} catch (e) { console.error('Erro na migração de users.role:', e.message); }

        // 6. Criar Tabela de Logs de Email
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS email_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NULL,
                    email_type VARCHAR(50) NOT NULL,
                    recipient VARCHAR(255) NOT NULL,
                    subject VARCHAR(255) NULL,
                    status ENUM('sent', 'failed') NOT NULL,
                    error_message TEXT NULL,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('Tabela email_logs verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela email_logs:', e.message);
        }

        // 7. Sistema de Localização Escalável
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS locations (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    building VARCHAR(100) NOT NULL,
                    floor VARCHAR(50) NOT NULL,
                    zone VARCHAR(100) NULL,
                    active BOOLEAN DEFAULT TRUE,
                    UNIQUE KEY unique_loc (building, floor, zone)
                )
            `);
            console.log('Tabela locations verificada.');

            // Migração de resources.floor -> locations (FK)
            const [cols] = await connection.query("SHOW COLUMNS FROM resources LIKE 'location_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE resources ADD COLUMN location_id INT NULL");
                
                // Criar localizações baseadas nos pisos existentes
                const [existingFloors] = await connection.query("SELECT DISTINCT floor FROM resources");
                for (const row of existingFloors) {
                    const building = "Edifício Principal";
                    const floor = String(row.floor);
                    await connection.query(
                        "INSERT IGNORE INTO locations (building, floor) VALUES (?, ?)", 
                        [building, floor]
                    );
                    await connection.query(
                        "UPDATE resources SET location_id = (SELECT id FROM locations WHERE building = ? AND floor = ?) WHERE floor = ?",
                        [building, floor, row.floor]
                    );
                }

                await connection.query("ALTER TABLE resources MODIFY COLUMN location_id INT NOT NULL");
                await connection.query("ALTER TABLE resources ADD FOREIGN KEY (location_id) REFERENCES locations(id)");
                console.log('Migração de localização concluída.');
            }
        } catch (e) { console.error('Erro no sistema de localização:', e.message); }

        // 8. Tabela de Auditoria Geral (Audit Logs)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    pid INT,
                    log_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    method VARCHAR(10),
                    url TEXT,
                    status_code INT,
                    user_id VARCHAR(255) NULL,
                    remote_address VARCHAR(45),
                    request_data JSON NULL,
                    msg TEXT,
                    tracking_id VARCHAR(255)
                )
            `);
            console.log('Tabela audit_logs verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela audit_logs:', e.message);
        }

        // 9. Índices de Performance
        try {
            // Índice para acelerar a verificação de disponibilidade e listagem por data
            await connection.query("CREATE INDEX idx_bookings_time ON bookings (start_time, end_time)");
            console.log('Índice idx_bookings_time criado.');
        } catch (e) { /* Já existe */ }

        try {
            // Índice para acelerar a consulta de logs por data
            await connection.query("CREATE INDEX idx_audit_logs_date ON audit_logs (log_date)");
            console.log('Índice idx_audit_logs_date criado.');
        } catch (e) { /* Já existe */ }

        try {
            // Índice para acelerar a consulta de logs por utilizador
            await connection.query("CREATE INDEX idx_audit_logs_user ON audit_logs (user_id)");
            console.log('Índice idx_audit_logs_user criado.');
        } catch (e) { /* Já existe */ }

        try {
            // Índice para acelerar a pesquisa de recursos por nome
            await connection.query("CREATE INDEX idx_resources_name ON resources (name)");
            console.log('Índice idx_resources_name criado.');
        } catch (e) { /* Já existe */ }

        try {
            // Índice para acelerar o filtro de estado (ativo/manutenção)
            await connection.query("CREATE INDEX idx_resources_status ON resources (status)");
            console.log('Índice idx_resources_status criado.');
        } catch (e) { /* Já existe */ }

        console.log('--- Migrações Concluídas com Sucesso! ---');
        process.exit(0);
    } catch (err) {
        console.error('Erro durante as migrações:', err.message);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
};

runMigrations();