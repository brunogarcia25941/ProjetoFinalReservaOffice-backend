# Reserva Office - Backend API

Este é o repositório do Backend para a aplicação **Reserva Office**. Trata-se de uma API RESTful de alta performance desenvolvida em Node.js (Express) responsável por gerir a autenticação de utilizadores, controlo de acessos, gestão de recursos (mesas, monitores, salas) e toda a lógica concorrente de reservas.

---

## Tecnologias Utilizadas

* **Node.js** & **Express.js** (v5)
* **MySQL2** (Base de Dados Relacional com suporte a Promises e Pool de Ligações)
* **JSON Web Tokens (JWT)** (Autenticação com rotação de Refresh Tokens)
* **Swagger** (Documentação automática e interativa OpenAPI 3.0)
* **Pino & Pino-HTTP** (Logging estruturado ultrarrápido com higienização de dados confidenciais)
* **Helmet & CORS** (Headers de segurança contra injeções HTTP e controlo de domínios autorizados)
* **Express Rate Limit** (Prevenção contra ataques DoS/brute-force)

---

## Arquitetura e Boas Práticas implementadas

* **Segurança e Encriptação:**
  * Palavras-passe guardadas com hash seguro via **Bcrypt**.
  * Tokens de sessão curtos (Access Token: 15m) e Refresh Tokens longos (7 dias). 
  * Os Refresh Tokens são guardados na base de dados **encriptados com SHA-256** para mitigar riscos de fuga caso a base de dados seja comprometida.
  * Proteção do tamanho dos payloads (`limit: '10kb'`) no Express JSON parse para evitar Denial of Service (DoS) por memória.

* **Integridade das Reservas (Evitar Concorrência):**
  * Toda a criação de reservas ocorre dentro de **Transações SQL**.
  * A verificação de conflitos de horário utiliza bloqueio de escrita pessimista (`FOR UPDATE`) para garantir que dois pedidos concorrentes no mesmo microssegundo não resultem em double-booking.

* **Audit Log (Logging Higienizado):**
  * Implementação de UUID único por pedido (`X-Request-ID`).
  * Remoção automática (*redaction*) de campos sensíveis como palavras-passe e tokens de autenticação nos logs do servidor.

---

## Estrutura do Projeto

A arquitetura do código segue uma separação limpa de responsabilidades:

```text
src/
├── config/         # Configuração do Pool MySQL (db.js) com suporte SSL (Aiven)
├── controllers/    # Lógica de negócio (reservas, recursos, utilizadores, tickets)
├── middlewares/    # Intercetores (verificação de JWT, validação de inputs e controlo de Admin)
├── migrations/     # Scripts de migração de base de dados
├── routes/         # Endpoints agrupados da API
└── server.js       # Ponto de entrada, segurança e configuração de Swagger
```

---

## Pré-requisitos

Para correres este servidor localmente ou em produção, precisas de:

* [Node.js](https://nodejs.org/) (versão 18 ou superior)
* Um servidor [MySQL](https://dev.mysql.com/downloads/mysql/) local ou uma base de dados na nuvem (ex: Aiven MySQL).
* Servidor SMTP de e-mail (para envio de notificações e convites via Nodemailer).

---

## Como Configurar e Correr Localmente

### 1. Instalação das Dependências
Navega até à raiz do backend no terminal e executa:
```bash
npm install
```

### 2. Configurar Base de Dados
Podes popular e estruturar as tabelas na base de dados correndo as migrações integradas:
```bash
npm run migrate
```
E podes preencher a base de dados com dados de teste iniciais correndo:
```bash
npm run seed
```

### 3. Variáveis de Ambiente (.env)
Cria um ficheiro chamado `.env` na raiz do backend e preenche com os seguintes parâmetros:
```env
PORT=5000
DB_HOST=teu_host_mysql
DB_USER=teu_utilizador
DB_PASSWORD=tua_password
DB_NAME=reserva_office
DB_PORT=3306
DB_SSL=true          # Define 'true' se usares ligação SSL como na Aiven Cloud
JWT_SECRET=segredo_do_access_token_jwt
JWT_REFRESH_SECRET=segredo_do_refresh_token_jwt
```

### 4. Iniciar o Servidor
Para iniciar o servidor em modo de desenvolvimento com hot-reload automático (nodemon):
```bash
npm run dev
```
Para iniciar em modo de produção:
```bash
npm start
```

---

## Documentação da API (Swagger)

A API possui documentação OpenAPI gerada dinamicamente pelo Swagger.
Com o servidor a correr, acede no teu navegador a:
**`http://localhost:5000/api-docs`**

A partir da interface Swagger, podes:
* Consultar todas as rotas e tipos de parâmetros esperados.
* Fazer pedidos diretamente (Try it out).
* Testar rotas protegidas injetando o JWT Token no botão "Authorize".

---

**Desenvolvido por:** Bruno Garcia e Bernardo Alves - Projeto Final MVP
