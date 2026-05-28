const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.contact_phone, u.name, u.username, u.photo_url
       FROM contacts c
       LEFT JOIN users u ON c.contact_phone = u.phone
       WHERE c.owner_phone = $1
       ORDER BY u.name ASC`,
      [req.user.phone]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar contactos.' });
  }
});

router.post('/add', authenticateToken, async (req, res) => {
  const { contactPhone } = req.body;
  if (!contactPhone) return res.status(400).json({ error: 'Número em falta.' });

  try {
    await pool.query(
      `INSERT INTO contacts (owner_phone, contact_phone)
       VALUES ($1, $2)
       ON CONFLICT (owner_phone, contact_phone) DO NOTHING`,
      [req.user.phone, contactPhone]
    );
    res.json({ message: 'Contacto adicionado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar contacto.' });
  }
});

router.delete('/:phone', authenticateToken, async (req, res) => {
  const { phone } = req.params;
  try {
    await pool.query(
      'DELETE FROM contacts WHERE owner_phone = $1 AND contact_phone = $2',
      [req.user.phone, phone]
    );
    res.json({ message: 'Contacto removido.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover contacto.' });
  }
});

module.exports = router;
