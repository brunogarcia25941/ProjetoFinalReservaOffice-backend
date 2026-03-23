const bcrypt = require('bcrypt');
const db = require('./config/db'); 

async function runSeed() {
    console.log("A iniciar o Seed da Base de Dados...");

    try {
        console.log("A limpar tabelas antigas...");
        await db.query('DROP TABLE IF EXISTS bookings;');
        await db.query('DROP TABLE IF EXISTS users;');
        await db.query('DROP TABLE IF EXISTS resources;');


        console.log("A criar tabelas...");
        
        await db.query(`
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin') DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type ENUM('desk', 'monitor', 'room') NOT NULL,
                status ENUM('active', 'maintenance') DEFAULT 'active'
            );
        `);

        await db.query(`
            CREATE TABLE bookings (
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

        console.log("A inserir recursos (mesas e salas)...");
        await db.query(`
            INSERT INTO resources (name, type, status) VALUES 
            ('Mesa D-301 (Janela)', 'desk', 'active'),
            ('Mesa D-302', 'desk', 'active'),
            ('Mesa D-303 (Acessibilidade)', 'desk', 'active'),
            ('Monitor Duplo 27"', 'monitor', 'active'),
            ('Sala de Reuniões Norte', 'room', 'active'),
            ('Mesa D-401', 'desk', 'maintenance');
        `);

        console.log("A criar utilizador Administrador...");
        const salt = await bcrypt.genSalt(10);
        const adminPassword = await bcrypt.hash('123456', salt); 
        
        await db.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            ['Administrador', 'admin@softinsa.pt', adminPassword, 'admin']
        );

        console.log("Seed concluído com sucesso! A base de dados está pronta a usar.");
        process.exit(0); 

    } catch (error) {
        console.error("Erro ao correr o Seed:", error);
        process.exit(1); 
    }
}

runSeed();