const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/upload-prekeys', authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { preKeys } = req.body;
  if (!preKeys || !Array.isArray(preKeys)) {
    return res.status(400).json({ error: 'Formato inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const pk of preKeys) {
      await client.query(
        `INSERT INTO pre_keys (user_phone, key_id, public_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_phone, key_id) DO UPDATE SET public_key = EXCLUDED.public_key`,
        [phone, pk.keyId, pk.publicKey]
      );
    }
    await client.query('COMMIT');
    res.json({ message: `${preKeys.length} pre-key(s) armazenada(s).` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao guardar pre‑keys.' });
  } finally {
    client.release();
  }
});

router.get('/bundle/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const userResult = await pool.query(
      'SELECT identity_public_key FROM users WHERE phone = $1',
      [phone]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    const preKeyResult = await pool.query(
      `DELETE FROM pre_keys
       WHERE user_phone = $1
         AND id = (SELECT id FROM pre_keys WHERE user_phone = $1 ORDER BY uploaded_at ASC LIMIT 1)
       RETURNING key_id, public_key`,
      [phone]
    );

    if (preKeyResult.rows.length === 0) {
      return res.status(503).json({ error: 'Nenhuma pre‑key disponível.' });
    }

    res.json({
      identityPublicKey: userResult.rows[0].identity_public_key,
      preKey: {
        keyId: preKeyResult.rows[0].key_id,
        publicKey: preKeyResult.rows[0].public_key
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
