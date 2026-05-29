const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// UPLOAD DE PRE-KEYS (CHAVES DESCARTÁVEIS)
router.post('/upload-prekeys', authenticateToken, async (req, res) => {
  const { phone } = req.user;
  const { preKeys } = req.body;
  
  if (!preKeys || !Array.isArray(preKeys) || preKeys.length === 0) {
    return res.status(400).json({ error: 'Formato inválido. Envie { preKeys: [{ keyId, publicKey }] }' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const pk of preKeys) {
      if (!pk.keyId || !pk.publicKey) continue;
      await client.query(
        `INSERT INTO pre_keys (user_phone, key_id, public_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_phone, key_id) 
         DO UPDATE SET public_key = EXCLUDED.public_key, uploaded_at = CURRENT_TIMESTAMP`,
        [phone, pk.keyId, pk.publicKey]
      );
    }
    await client.query('COMMIT');
    res.json({ message: `${preKeys.length} pre-key(s) armazenada(s).` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro upload pre-keys:', error);
    res.status(500).json({ error: 'Erro ao guardar pre-keys.' });
  } finally {
    client.release();
  }
});

// OBTER PACOTE DE CHAVES DE UM UTILIZADOR (IDENTIDADE + 1 PRE-KEY)
router.get('/bundle/:phone', async (req, res) => {
  const { phone } = req.params;
  
  try {
    // Buscar chave de identidade
    const userResult = await pool.query(
      'SELECT identity_public_key FROM users WHERE phone = $1',
      [phone]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    // Buscar e REMOVER uma pre-key (uso único)
    const preKeyResult = await pool.query(
      `DELETE FROM pre_keys
       WHERE user_phone = $1
         AND id = (
           SELECT id FROM pre_keys 
           WHERE user_phone = $1 
           ORDER BY uploaded_at ASC 
           LIMIT 1
         )
       RETURNING key_id, public_key`,
      [phone]
    );

    if (preKeyResult.rows.length === 0) {
      return res.status(503).json({ 
        error: 'Nenhuma pre-key disponível.',
        hint: 'O utilizador precisa fazer upload de pre-keys primeiro.'
      });
    }

    res.json({
      identityPublicKey: userResult.rows[0].identity_public_key,
      preKey: {
        keyId: preKeyResult.rows[0].key_id,
        publicKey: preKeyResult.rows[0].public_key
      }
    });
  } catch (error) {
    console.error('Erro ao obter bundle:', error);
    res.status(500).json({ error: 'Erro interno ao obter chaves.' });
  }
});

// VERIFICAR QUANTAS PRE-KEYS RESTANTES
router.get('/prekeys-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM pre_keys WHERE user_phone = $1',
      [req.user.phone]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao contar pre-keys.' });
  }
});

module.exports = router;
