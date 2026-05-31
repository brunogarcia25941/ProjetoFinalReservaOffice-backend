require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./config/db'); 
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const logger = require('./logger');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');

const app = express();

// 0.1 LOGGING (Auditoria com Pino)
const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
    customProps: (req, res) => {
        // Obter o corpo do pedido, removendo dados sensíveis
        const body = req.body ? { ...req.body } : {};
        const sensitiveFields = ['password', 'newPassword', 'token', 'refreshToken'];
        sensitiveFields.forEach(field => {
            if (body[field]) body[field] = '********';
        });

        return {
            userId: req.user ? req.user.id : null,
            remoteAddress: req.ip || req.connection.remoteAddress,
            requestData: Object.keys(body).length > 0 ? body : null
        };
    },
    customSuccessObject: (req, res, val) => ({
        ...val,
        statusCode: res.statusCode,
    }),
    customErrorObject: (req, res, err, val) => ({
        ...val,
        statusCode: res.statusCode,
        errorMessage: err.message,
    }),
    serializers: {
        req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
        }),
        res: (res) => ({
            statusCode: res.statusCode,
        }),
    },
});

app.use(httpLogger);

// 0. Confiar em Proxies (Vercel, Cloudflare, etc.) para o Rate Limiting funcionar por IP real
app.set('trust proxy', 1);

// 1. SEGURANÇA (Headers HTTP e CORS)
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false // Desativar CSP em dev para não quebrar o Swagger
}));

app.use(cors({
    origin: [
        'http://localhost:3000', 
        'https://projeto-final-reserva-office-backen.vercel.app',
        'https://projeto-final-reserva-office-backend-m33kqm420.vercel.app',
        'https://projeto-final-reserva-office.vercel.app'
    ], 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true 
}));

app.use(express.json({ limit: '10kb' }));

// 2. ROTAS
const resourceRoutes = require('./routes/resourceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/adminRoutes');
const picklistRoutes = require('./routes/picklistRoutes');

app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/picklists', picklistRoutes);

// 3. SWAGGER (Apenas em Desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
    const swaggerOptions = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Reserva Office API',
                version: '1.0.0',
                description: 'API do MVP para gestão de reservas e recursos.',
            },
            servers: [
                { url: 'http://localhost:5000' }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
                }
            }
        },
        apis: [
            path.join(__dirname, './routes/*.js'),
            path.join(__dirname, './server.js')
        ], 
    };

    const swaggerDocs = swaggerJsDoc(swaggerOptions);
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
}

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