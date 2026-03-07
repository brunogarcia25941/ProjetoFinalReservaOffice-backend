require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const db = require('./config/db'); 


const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const app = express();

app.use(express.json());
app.use(cors());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Reserva Office API',
            version: '1.0.0',
            description: 'API do MVP para gestão de reservas e recursos.',
            contact: {
                name: 'Equipa de Desenvolvimento',
            }
        },
        servers: [
            { url: 'http://localhost:5000', description: 'Servidor Local' }
        ],
        // --- NOVA SECÇÃO: Adiciona o botão "Authorize" no Swagger ---
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                }
            }
        }
    },
    apis: ['./routes/*.js', './server.js'], // Adicionei o server.js para ele ler a rota de teste
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const verificarToken = require('./middlewares/auth');
/**
 * @swagger
 * /api/perfil:
 *   get:
 *     summary: Área VIP (Protegida)
 *     description: Retorna os dados do utilizador logado. Requer Token JWT válido.
 *     tags:
 *       - Perfil
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sucesso. Retorna os dados do utilizador.
 *       401:
 *         description: Acesso negado. Token não fornecido.
 *       403:
 *         description: Token inválido ou expirado.
 */
app.get('/api/perfil', verificarToken, (req, res) => {
    res.json({ 
        message: "Bem-vindo à área VIP!", 
        dados_do_utilizador: req.user 
    });
});
app.get('/', (req, res) => {
    res.send('API Reserva Office a funcionar! 🚀');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
    console.log(`Documentação disponível em: http://localhost:${PORT}/api-docs`);
});