require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db'); 

const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const app = express();

// 1. CORS
app.use(cors({
    origin: [
        'http://localhost:3000', 
        'https://projeto-final-reserva-office-backen.vercel.app',
        'https://projeto-final-reserva-office-backend-m33kqm420.vercel.app'
    ], 
    credentials: true 
}));

app.use(express.json());

// 2. ROTAS
const resourceRoutes = require('./routes/resourceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const authRoutes = require('./routes/auth');

app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);

// 3. SWAGGER
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Reserva Office API',
            version: '1.0.0',
            description: 'API do MVP para gestão de reservas e recursos.',
        },
        servers: [
            { 
                url: 'https://projeto-final-reserva-office-backen.vercel.app',
                description: 'Domínio Principal (Vercel)' 
            },
            { 
                url: 'https://projeto-final-reserva-office-backend-m33kqm420.vercel.app',
                description: 'Domínio de Produção' 
            },
            { 
                url: 'http://localhost:5000',
                description: 'Servidor Local' 
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: { 
                    type: 'http', 
                    scheme: 'bearer', 
                    bearerFormat: 'JWT' 
                }
            }
        }
    },
    // ✔️ Corrigido (não precisas de duplicar src se não usas)
    apis: ['./routes/*.js', './server.js'], 
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// FIX Swagger Vercel (CDN)
const SWAGGER_ASSETS_URL = "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5";

app.use('/api-docs', swaggerUi.serve, (req, res) => {
    const html = swaggerUi.generateHTML(swaggerDocs, {
        customCss: '.swagger-ui .topbar { display: none }',
        customCssUrl: `${SWAGGER_ASSETS_URL}/swagger-ui.min.css`,
        customJs: [
            `${SWAGGER_ASSETS_URL}/swagger-ui-bundle.js`,
            `${SWAGGER_ASSETS_URL}/swagger-ui-standalone-preset.js`
        ]
    });
    res.send(html);
});

// 4. ROTAS PROTEGIDAS
const verificarToken = require('./middlewares/auth');
const verificarAdmin = require('./middlewares/admin');

/**
 * @swagger
 * /api/perfil:
 *   get:
 *     summary: Área VIP (Protegida)
 *     tags:
 *       - Perfil
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sucesso.
 */
app.get('/api/perfil', verificarToken, (req, res) => {
    res.json({ 
        message: "Bem-vindo à área VIP!", 
        dados_do_utilizador: req.user 
    });
});

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Área Exclusiva de Administração
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bem-vindo Admin.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Acesso negado.
 */
app.get('/api/admin/dashboard', verificarToken, verificarAdmin, (req, res) => {
    res.json({ 
        message: "Bem-vindo ao Painel de Administração Supremo!", 
        acesso_concedido: true 
    });
});

// ROTA BASE
app.get('/', (req, res) => {
    res.send('API Reserva Office Online na Vercel! 🚀');
});

// 5. INICIALIZAÇÃO
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Servidor na porta ${PORT}`);
        console.log(`Swagger: http://localhost:${PORT}/api-docs`);
    });
}

// OBRIGATÓRIO PARA VERCEL
module.exports = app;