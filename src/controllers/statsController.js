const db = require('../config/db');

exports.getSpaceStats = async (req, res) => {
    try {
        // 1. Contagens gerais por estado de reserva
        const [counts] = await db.execute(`
            SELECT status, COUNT(*) as count 
            FROM bookings 
            GROUP BY status
        `);

        // Inicializar com zeros
        let totalBookings = 0;
        let confirmed = 0;
        let completed = 0;
        let cancelled = 0;

        counts.forEach(row => {
            const countVal = Number(row.count);
            totalBookings += countVal;
            if (row.status === 'confirmed') confirmed = countVal;
            else if (row.status === 'completed') completed = countVal;
            else if (row.status === 'cancelled') cancelled = countVal;
        });

        // 2. Duração média das reservas confirmadas ou concluídas (em horas)
        const [avgDurationRow] = await db.execute(`
            SELECT AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) / 60.0 as avg_duration_hours
            FROM bookings
            WHERE status != 'cancelled'
        `);
        const avgDurationHours = avgDurationRow[0] && avgDurationRow[0].avg_duration_hours 
            ? parseFloat(Number(avgDurationRow[0].avg_duration_hours).toFixed(1)) 
            : 0;

        // 3. Reservas por tipo de recurso (desks vs rooms vs monitor)
        const [byResourceType] = await db.execute(`
            SELECT rt.name as resource_type, COUNT(b.id) as count
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            WHERE b.status != 'cancelled'
            GROUP BY rt.name
        `);

        // 4. Reservas por Escritório (Office)
        const [byOffice] = await db.execute(`
            SELECT o.name as office_name, COUNT(b.id) as count
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN locations l ON r.location_id = l.id
            JOIN offices o ON l.office_id = o.id
            WHERE b.status != 'cancelled'
            GROUP BY o.id, o.name
            ORDER BY count DESC
        `);

        // 5. Reservas por dia da semana
        const [byDayOfWeek] = await db.execute(`
            SELECT DAYOFWEEK(start_time) as day_of_week, COUNT(*) as count
            FROM bookings
            WHERE status != 'cancelled'
            GROUP BY DAYOFWEEK(start_time)
        `);

        // Mapear dias da semana (MySQL DAYOFWEEK: 1 = Domingo, 2 = Segunda, ..., 7 = Sábado)
        const daysOfWeekNames = {
            1: 'Domingo',
            2: 'Segunda',
            3: 'Terça',
            4: 'Quarta',
            5: 'Quinta',
            6: 'Sexta',
            7: 'Sábado'
        };

        const parsedDayOfWeek = Object.keys(daysOfWeekNames).map(num => {
            const row = byDayOfWeek.find(d => Number(d.day_of_week) === Number(num));
            return {
                day: daysOfWeekNames[num],
                count: row ? Number(row.count) : 0
            };
        });

        // 6. Reservas por hora de início (Distribuição por Hora)
        const [byStartHour] = await db.execute(`
            SELECT HOUR(start_time) as start_hour, COUNT(*) as count
            FROM bookings
            WHERE status != 'cancelled'
            GROUP BY HOUR(start_time)
            ORDER BY start_hour ASC
        `);

        // 7. Top 5 recursos mais reservados
        const [topResources] = await db.execute(`
            SELECT r.name as resource_name, rt.name as resource_type, COUNT(b.id) as count
            FROM bookings b
            JOIN resources r ON b.resource_id = r.id
            JOIN resource_types rt ON r.type_id = rt.id
            WHERE b.status != 'cancelled'
            GROUP BY r.id, r.name, rt.name
            ORDER BY count DESC
            LIMIT 5
        `);

        return res.status(200).json({
            totals: {
                totalBookings,
                confirmed,
                completed,
                cancelled,
                avgDurationHours
            },
            byResourceType,
            byOffice,
            byDayOfWeek: parsedDayOfWeek,
            byStartHour,
            topResources
        });

    } catch (error) {
        console.error("Erro ao gerar estatísticas de ocupação:", error);
        return res.status(500).json({ message: "Erro interno ao calcular estatísticas." });
    }
};
