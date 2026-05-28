const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/send', authenticateToken, async (req, res) => {
  const { phone: senderPhone } = req.user;
  const { recipientPhone, ephemeralPublicKey, preKeyId, encryptedBody } = req.body;

  if (!recipientPhone || !ephemeralPublicKey || preKeyId == null || !encryptedBody) {
    return res.status(400).json({ error: 'Campos em falta.' });
  }

  try {
    await pool.query(
      `INSERT INTO messages (sender_phone, recipient_phone, ephemeral_public_key, pre_key_id, encrypted_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [senderPhone, recipientPhone, ephemeralPublicKey, preKeyId, encryptedBody]
    );
    res.status(201).json({ message: 'Mensagem encaminhada.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao guardar mensagem.' });
  }
});

router.get('/poll', authenticateToken, async (req, res) => {
  const { phone } = req.user;
  try {
    const result = await pool.query(
      `SELECT id, sender_phone, ephemeral_public_key, pre_key_id, encrypted_body, timestamp
       FROM messages
       WHERE recipient_phone = $1 AND delivered = FALSE
       ORDER BY timestamp ASC
       LIMIT 50`,
      [phone]
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map(r => r.id);
      await pool.query('UPDATE messages SET delivered = TRUE WHERE id = ANY($1)', [ids]);
    }

    res.json({ messages: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao obter mensagens.' });
  }
});

module.exports = router;
