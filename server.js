require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const messagesRoutes = require('./routes/messages');
const contactsRoutes = require('./routes/contacts');
const groupsRoutes = require('./routes/groups');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/groups', groupsRoutes);

app.get('/', (req, res) => res.send('MensagensSec API v2.0'));

const PORT = process.env.PORT || 10000;
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor à escuta na porta ${PORT}`));
});
