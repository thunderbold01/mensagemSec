require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const messagesRoutes = require('./routes/messages');

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/messages', messagesRoutes);

// Health check
app.get('/', (req, res) => res.send('MensagensSec API OK'));

const PORT = process.env.PORT || 10000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor à escuta na porta ${PORT}`);
  });
});
