const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// REGISTO
router.post('/register', async (req, res) => {
  const { phone, name, email, password, identityPublicKey, username, photoUrl } = req.body;
  if (!phone || !name || !email || !password || !identityPublicKey) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta.' });
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
      `INSERT INTO users (phone, name, email, username, photo_url, password_hash, identity_public_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING phone, name, email, username, photo_url, identity_public_key`,
      [phone, name, email, username || null, photoUrl || null, passwordHash, identityPublicKey]
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
        username: user.username,
        photoUrl: user.photo_url,
        identityPublicKey: user.identity_public_key
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// PERFIL (obter)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT phone, name, email, username, photo_url, identity_public_key FROM users WHERE phone = $1',
      [req.user.phone]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// PERFIL (atualizar)
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, username, photoUrl } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (username) { updates.push(`username = $${idx++}`); values.push(username); }
    if (photoUrl !== undefined) { updates.push(`photo_url = $${idx++}`); values.push(photoUrl); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

    values.push(req.user.phone);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE phone = $${idx}`,
      values
    );
    const result = await pool.query(
      'SELECT phone, name, email, username, photo_url FROM users WHERE phone = $1',
      [req.user.phone]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

// VERIFICAR SE NÚMERO ESTÁ REGISTADO
router.get('/check/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const result = await pool.query('SELECT phone FROM users WHERE phone = $1', [phone]);
    res.json({ registered: result.rows.length > 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao verificar utilizador.' });
  }
});

module.exports = router;
