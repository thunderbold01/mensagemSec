const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const router = express.Router();

// REGISTO
router.post('/register', async (req, res) => {
  const { phone, name, email, password, identityPublicKey } = req.body;
  if (!phone || !name || !email || !password || !identityPublicKey) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email ou telefone já registado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (phone, name, email, password_hash, identity_public_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING phone, name, email, identity_public_key`,
      [phone, name, email, passwordHash, identityPublicKey]
    );

    res.status(201).json({ message: 'Registo efetuado com sucesso.', user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha obrigatórios.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { phone: user.phone, id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login bem-sucedido.',
      token,
      user: {
        phone: user.phone,
        name: user.name,
        email: user.email,
        identityPublicKey: user.identity_public_key
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

module.exports = router;
