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
                    changed_by INT NULL,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
                    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('Tabela booking_history verificada/criada.');

            // Garantir que a coluna mudou para NULL e a FK para ON DELETE SET NULL para bases de dados antigas
            try {
                const [cols] = await connection.query("SHOW COLUMNS FROM booking_history LIKE 'changed_by'");
                if (cols.length > 0 && cols[0].Null === 'NO') {
                    console.log('Atualizando booking_history para permitir changed_by NULL (correção de DELETE)...');
                    await connection.query('ALTER TABLE booking_history MODIFY COLUMN changed_by INT NULL');
                    
                    try {
                        await connection.query('ALTER TABLE booking_history DROP FOREIGN KEY booking_history_ibfk_2');
                    } catch (dropErr) {
                        // FK pode ter outro nome ou já não existir
                    }
                    
                    try {
                        await connection.query('ALTER TABLE booking_history ADD CONSTRAINT booking_history_ibfk_2 FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL');
                    } catch (addErr) {
                        // FK pode já estar configurada
                    }
                    console.log('booking_history atualizada com sucesso.');
                }
            } catch (innerErr) {
                console.error('Erro ao migrar a FK de booking_history:', innerErr.message);
            }
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

        // 7. Sistema de Localização Escalável com Tabela de Escritórios (Offices)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS offices (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    address VARCHAR(255) NULL,
                    operating_hours_start TIME DEFAULT '09:00:00',
                    operating_hours_end TIME DEFAULT '18:00:00',
                    timezone VARCHAR(50) DEFAULT 'Europe/Lisbon',
                    active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Tabela offices verificada/criada.');

            // Inicializar com 'Edifício Principal' se estiver vazia
            const [countOffices] = await connection.query("SELECT COUNT(*) as total FROM offices");
            if (countOffices[0].total === 0) {
                await connection.query("INSERT IGNORE INTO offices (name) VALUES ('Edifício Principal')");
            }

            // Criar a tabela de localizações apontando para offices
            await connection.query(`
                CREATE TABLE IF NOT EXISTS locations (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    office_id INT NULL,
                    floor VARCHAR(50) NOT NULL,
                    zone VARCHAR(100) NULL,
                    active BOOLEAN DEFAULT TRUE
                )
            `);
            console.log('Tabela locations verificada.');

            // Migração de resources.floor -> locations (FK)
            const [colsResource] = await connection.query("SHOW COLUMNS FROM resources LIKE 'location_id'");
            if (colsResource.length === 0) {
                await connection.query("ALTER TABLE resources ADD COLUMN location_id INT NULL");
                
                // Criar localizações baseadas nos pisos existentes
                const [existingFloors] = await connection.query("SELECT DISTINCT floor FROM resources");
                // Garantir um escritório padrão
                const [firstOffice] = await connection.query("SELECT id FROM offices LIMIT 1");
                const defOfficeId = firstOffice.length > 0 ? firstOffice[0].id : 1;

                for (const row of existingFloors) {
                    const floor = String(row.floor);
                    
                    // Inserir localização temporária
                    await connection.query(
                        "INSERT INTO locations (office_id, floor) VALUES (?, ?)", 
                        [defOfficeId, floor]
                    );
                    
                    // Obter id inserido
                    const [insertedLoc] = await connection.query(
                        "SELECT id FROM locations WHERE office_id = ? AND floor = ? LIMIT 1",
                        [defOfficeId, floor]
                    );

                    if (insertedLoc.length > 0) {
                        await connection.query(
                            "UPDATE resources SET location_id = ? WHERE floor = ?",
                            [insertedLoc[0].id, row.floor]
                        );
                    }
                }

                await connection.query("ALTER TABLE resources MODIFY COLUMN location_id INT NOT NULL");
                await connection.query("ALTER TABLE resources ADD FOREIGN KEY (location_id) REFERENCES locations(id)");
                console.log('Migração de localização para recursos concluída.');
            }

            // Migração de locations.building -> locations.office_id
            const [colsLocation] = await connection.query("SHOW COLUMNS FROM locations LIKE 'office_id'");
            const [colsBuilding] = await connection.query("SHOW COLUMNS FROM locations LIKE 'building'");

            // Caso tenhamos a coluna antiga 'building' e 'office_id' ainda seja nula
            if (colsBuilding.length > 0) {
                // Adicionar office_id se não existir
                const [hasOfficeIdCol] = await connection.query("SHOW COLUMNS FROM locations LIKE 'office_id'");
                if (hasOfficeIdCol.length === 0) {
                    await connection.query("ALTER TABLE locations ADD COLUMN office_id INT NULL");
                }

                // Extrair edifícios para offices
                const [existingLocBuildings] = await connection.query("SELECT DISTINCT building FROM locations WHERE building IS NOT NULL");
                for (const row of existingLocBuildings) {
                    await connection.query("INSERT IGNORE INTO offices (name) VALUES (?)", [row.building]);
                }

                // Atualizar locations.office_id baseado no building
                await connection.query("UPDATE locations l JOIN offices o ON l.building = o.name SET l.office_id = o.id WHERE l.office_id IS NULL");
                
                // Mapear restantes
                const [defOffice] = await connection.query("SELECT id FROM offices LIMIT 1");
                if (defOffice.length > 0) {
                    await connection.query("UPDATE locations SET office_id = ? WHERE office_id IS NULL", [defOffice[0].id]);
                }

                // Tornar office_id NOT NULL
                await connection.query("ALTER TABLE locations MODIFY COLUMN office_id INT NOT NULL");
                
                // Tentar adicionar a FK
                try {
                    await connection.query("ALTER TABLE locations ADD FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE");
                } catch(err) { /* FK já existe */ }

                // Remover coluna antiga e índice
                try {
                    await connection.query("ALTER TABLE locations DROP INDEX unique_loc");
                } catch(err) {}

                try {
                    await connection.query("ALTER TABLE locations DROP COLUMN building");
                } catch(err) {}

                // Criar novo índice único
                try {
                    await connection.query("ALTER TABLE locations ADD UNIQUE KEY unique_loc (office_id, floor, zone)");
                } catch(err) {}

                console.log('Migração de locations.building para offices concluída.');
            } else {
                // Se building não existir mas office_id for nulo (caso inicial da tabela nova)
                const [nullOfficeIds] = await connection.query("SELECT COUNT(*) as total FROM locations WHERE office_id IS NULL");
                if (nullOfficeIds[0].total > 0 || (await connection.query("SHOW COLUMNS FROM locations LIKE 'office_id'"))[0].length > 0) {
                    const [defOffice] = await connection.query("SELECT id FROM offices LIMIT 1");
                    const defOfficeId = defOffice.length > 0 ? defOffice[0].id : 1;
                    
                    await connection.query("UPDATE locations SET office_id = ? WHERE office_id IS NULL", [defOfficeId]);
                    await connection.query("ALTER TABLE locations MODIFY COLUMN office_id INT NOT NULL");
                    
                    try {
                        await connection.query("ALTER TABLE locations ADD FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE");
                    } catch(err) {}
                    
                    try {
                        await connection.query("ALTER TABLE locations ADD UNIQUE KEY unique_loc (office_id, floor, zone)");
                    } catch(err) {}
                }
            }

        } catch (e) { console.error('Erro no sistema de localização/offices:', e.message); }

        // 7.2. Associação do Utilizador ao Escritório Base (Home Office)
        try {
            await connection.query("ALTER TABLE users ADD COLUMN home_office_id INT NULL");
            console.log('Coluna home_office_id adicionada à tabela users.');
        } catch (e) { /* Coluna já existe */ }

        try {
            await connection.query("ALTER TABLE users ADD FOREIGN KEY (home_office_id) REFERENCES offices(id) ON DELETE SET NULL");
            console.log('Chave estrangeira home_office_id adicionada.');
        } catch (e) { /* FK já existe */ }

        // 7.3. Tabela de Convidados em Reservas (booking_guests)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS booking_guests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    booking_id INT NOT NULL,
                    user_id INT NULL,
                    email VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NULL,
                    status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                    UNIQUE KEY unique_booking_guest (booking_id, email)
                )
            `);
            console.log('Tabela booking_guests verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela booking_guests:', e.message);
        }

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

        // 9.1 Adicionar parent_booking_id à tabela bookings
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'parent_booking_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE bookings ADD COLUMN parent_booking_id INT NULL");
                await connection.query("ALTER TABLE bookings ADD FOREIGN KEY (parent_booking_id) REFERENCES bookings(id) ON DELETE CASCADE");
                console.log('Coluna parent_booking_id e FK adicionadas à tabela bookings.');
            }
        } catch (e) {
            console.error('Erro ao adicionar parent_booking_id:', e.message);
        }

        // 9.1.5 Adicionar recurrence_group_id à tabela bookings
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'recurrence_group_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE bookings ADD COLUMN recurrence_group_id VARCHAR(36) NULL");
                console.log('Coluna recurrence_group_id adicionada à tabela bookings.');
            }
        } catch (e) {
            console.error('Erro ao adicionar recurrence_group_id:', e.message);
        }

        // 9.2 Adicionar role 'tecnico' às roles
        try {
            await connection.query("INSERT IGNORE INTO user_roles (name, label) VALUES ('tecnico', 'Técnico')");
            console.log("Role 'tecnico' verificada/inserida.");
        } catch (e) {
            console.error("Erro ao adicionar role 'tecnico':", e.message);
        }

        // 9.3 Criar Tabela de Tickets
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    resource_id INT NULL,
                    reported_by INT NOT NULL,
                    assigned_to INT NULL,
                    title VARCHAR(150) NOT NULL,
                    description TEXT NOT NULL,
                    urgency ENUM('low', 'medium', 'high') DEFAULT 'medium',
                    status ENUM('pending', 'in_progress', 'resolved', 'cancelled') DEFAULT 'pending',
                    resolution_notes TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    resolved_at DATETIME NULL,
                    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
                    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('Tabela tickets verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela tickets:', e.message);
        }

        // 10. Criar Tabela de Layouts de Escritórios (Mapas customizados, dimensões e paredes)
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS office_layouts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    office_name VARCHAR(100) NOT NULL,
                    floor INT NOT NULL,
                    map_image LONGTEXT NULL,
                    map_width INT DEFAULT 800,
                    map_height INT DEFAULT 500,
                    walls JSON NULL,
                    UNIQUE KEY unique_office_floor (office_name, floor)
                )
            `);
            console.log('Tabela office_layouts verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela office_layouts:', e.message);
        }

        // 11. Criar Tabela de Pedidos de Registo
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS registration_requests (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    reason TEXT NULL,
                    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at DATETIME NULL
                )
            `);
            console.log('Tabela registration_requests verificada/criada.');
        } catch (e) {
            console.error('Erro ao criar tabela registration_requests:', e.message);
        }

        // 12. Adicionar coluna must_change_password à tabela users
        try {
            await connection.query("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE");
            console.log('Coluna must_change_password adicionada à tabela users.');
        } catch (e) { /* Coluna já existe */ }

        // Adicionar colunas de posicionamento à tabela resources
        try {
            await connection.query("ALTER TABLE resources ADD COLUMN pos_x INT NULL, ADD COLUMN pos_y INT NULL, ADD COLUMN rotation INT NOT NULL DEFAULT 0");
            console.log('Colunas pos_x, pos_y e rotation adicionadas aos recursos.');
        } catch (e) { /* Colunas já existem */ }

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