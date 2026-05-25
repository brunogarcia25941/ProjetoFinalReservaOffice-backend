const db = require('./src/config/db');

const testQuery = async () => {
    try {
        console.log('--- Testando Query de Recursos ---');
        const query = `
            SELECT 
                r.id, r.name, rt.name as type, 
                l.building, l.floor, l.zone,
                r.status, r.features, r.created_at 
            FROM resources r 
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
        `;
        const [resources] = await db.execute(query);
        console.log(`Sucesso! Encontrados ${resources.length} recursos.`);
        if (resources.length > 0) {
            console.log('Exemplo do primeiro recurso:', resources[0]);
        }

        console.log('--- Testando Query de Disponibilidade ---');
        const queryAvail = `
            SELECT 
                r.id, r.name, rt.name as type, r.status, 
                l.building, l.floor, l.zone, r.features,
                (SELECT COUNT(*) FROM bookings b 
                 WHERE b.resource_id = r.id 
                 AND b.status = 'confirmed'
                 AND b.start_time < '2026-05-25 23:59:59' 
                 AND b.end_time > '2026-05-25 00:00:00'   
                ) > 0 AS is_booked
            FROM resources r
            LEFT JOIN resource_types rt ON r.type_id = rt.id
            LEFT JOIN locations l ON r.location_id = l.id
            WHERE (rt.active = TRUE OR rt.id IS NULL) AND (l.active = TRUE OR l.id IS NULL)
        `;
        const [avail] = await db.execute(queryAvail);
        console.log(`Sucesso! Encontrados ${avail.length} recursos com disponibilidade.`);

        process.exit(0);
    } catch (err) {
        console.error('ERRO NA QUERY:', err.message);
        console.error('SQL State:', err.sqlState);
        process.exit(1);
    }
};

testQuery();