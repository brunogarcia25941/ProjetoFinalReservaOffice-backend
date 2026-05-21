const bcrypt = require('bcrypt');
const db = require('./config/db'); 

async function runSeed() {
    console.log("--- Iniciando Verificação de Segurança da Base de Dados ---");

    try {
        console.log("A limpar tabelas antigas...");
        await db.query('DROP TABLE IF EXISTS bookings;');
        await db.query('DROP TABLE IF EXISTS users;');
        await db.query('DROP TABLE IF EXISTS resources;');


        console.log("A criar tabelas...");
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin') DEFAULT 'user',
                refresh_token TEXT NULL,
                reset_password_token VARCHAR(255) NULL,
                reset_password_expires DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type ENUM('desk', 'monitor', 'room') NOT NULL,
                floor INT NOT NULL DEFAULT 1,
                features JSON NULL,
                status ENUM('active', 'maintenance') DEFAULT 'active'
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                resource_id INT NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                status ENUM('confirmed', 'cancelled') DEFAULT 'confirmed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
            );
        `);

        // 2. INSERIR RECURSOS APENAS SE A TABELA ESTIVER VAZIA
        const [existingResources] = await db.query('SELECT COUNT(*) as total FROM resources');
        if (existingResources[0].total === 0) {
            console.log("Inserindo recursos iniciais...");
            await db.query(`
                INSERT INTO resources (name, type, floor, status) VALUES 
                ('Mesa D-301 (Janela)', 'desk', 1, 'active'),
                ('Mesa D-302', 'desk', 1, 'active'),
                ('Sala de Reuniões Norte', 'room', 2, 'active')
            `);
        } else {
            console.log("Recursos já existem. Ignorando inserção.");
        }

        // 3. CRIAR ADMIN APENAS SE NÃO EXISTIR
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordRaw = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPasswordRaw) {
            console.error("ERRO DE SEGURANÇA: ADMIN_EMAIL ou ADMIN_PASSWORD não estão definidos no ficheiro .env");
            process.exit(1);
        }

        const [adminExists] = await db.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
        
        if (adminExists.length === 0) {
            console.log("Criando utilizador Administrador...");
            const salt = await bcrypt.genSalt(10);
            const adminPasswordHash = await bcrypt.hash(adminPasswordRaw, salt); 
            
            await db.query(
                'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['Administrador', adminEmail, adminPasswordHash, 'admin']
            );
        } else {
            console.log("Administrador já existe. Ignorando criação.");
        }

        console.log("--- Processo de Seed Concluído com Segurança! ---");
        process.exit(0); 

    } catch (error) {
        console.error("Erro crítico no Seed:", error);
        process.exit(1); 
    }
}

runSeed();