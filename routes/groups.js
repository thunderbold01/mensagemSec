const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  const { name, description, members } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do grupo obrigatório.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groupResult = await client.query(
      `INSERT INTO groups_table (name, description, creator_phone)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, description || '', req.user.phone]
    );
    const groupId = groupResult.rows[0].id;

    await client.query(
      `INSERT INTO group_members (group_id, user_phone, role)
       VALUES ($1, $2, 'admin')`,
      [groupId, req.user.phone]
    );

    if (members && Array.isArray(members)) {
      for (const phone of members) {
        await client.query(
          `INSERT INTO group_members (group_id, user_phone, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (group_id, user_phone) DO NOTHING`,
          [groupId, phone]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Grupo criado.', groupId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar grupo.' });
  } finally {
    client.release();
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.name, g.description, g.creator_phone, g.created_at
       FROM groups_table g
       INNER JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_phone = $1`,
      [req.user.phone]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar grupos.' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const groupResult = await pool.query('SELECT * FROM groups_table WHERE id = $1', [id]);
    if (groupResult.rows.length === 0) return res.status(404).json({ error: 'Grupo não encontrado.' });

    const membersResult = await pool.query(
      `SELECT gm.user_phone, u.name, u.username, gm.role
       FROM group_members gm
       LEFT JOIN users u ON gm.user_phone = u.phone
       WHERE gm.group_id = $1`,
      [id]
    );

    const messagesResult = await pool.query(
      `SELECT id, sender_phone, encrypted_body, timestamp
       FROM group_messages
       WHERE group_id = $1
       ORDER BY timestamp ASC
       LIMIT 100`,
      [id]
    );

    res.json({
      ...groupResult.rows[0],
      members: membersResult.rows,
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao obter grupo.' });
  }
});

router.post('/:id/messages', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { encryptedBody } = req.body;
  if (!encryptedBody) return res.status(400).json({ error: 'Mensagem em falta.' });

  try {
    const member = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_phone = $2',
      [id, req.user.phone]
    );
    if (member.rows.length === 0) return res.status(403).json({ error: 'Não pertence ao grupo.' });

    await pool.query(
      `INSERT INTO group_messages (group_id, sender_phone, encrypted_body)
       VALUES ($1, $2, $3)`,
      [id, req.user.phone, encryptedBody]
    );
    res.status(201).json({ message: 'Mensagem enviada.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

router.post('/:id/members', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone em falta.' });

  try {
    const isAdmin = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_phone = $2 AND role = $3',
      [id, req.user.phone, 'admin']
    );
    if (isAdmin.rows.length === 0) return res.status(403).json({ error: 'Apenas administradores podem adicionar membros.' });

    await pool.query(
      `INSERT INTO group_members (group_id, user_phone)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_phone) DO NOTHING`,
      [id, phone]
    );
    res.json({ message: 'Membro adicionado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar membro.' });
  }
});

router.delete('/:id/members/:phone', authenticateToken, async (req, res) => {
  const { id, phone } = req.params;
  const requestingPhone = req.user.phone;

  try {
    if (requestingPhone === phone) {
      await pool.query(
        'DELETE FROM group_members WHERE group_id = $1 AND user_phone = $2',
        [id, phone]
      );
      return res.json({ message: 'Saiu do grupo.' });
    }

    const isAdmin = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_phone = $2 AND role = $3',
      [id, requestingPhone, 'admin']
    );
    if (isAdmin.rows.length === 0) return res.status(403).json({ error: 'Apenas administradores podem remover membros.' });

    await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_phone = $2',
      [id, phone]
    );
    res.json({ message: 'Membro removido.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover membro.' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const isCreator = await pool.query(
      'SELECT * FROM groups_table WHERE id = $1 AND creator_phone = $2',
      [id, req.user.phone]
    );
    if (isCreator.rows.length === 0) {
      const isAdmin = await pool.query(
        'SELECT * FROM group_members WHERE group_id = $1 AND user_phone = $2 AND role = $3',
        [id, req.user.phone, 'admin']
      );
      if (isAdmin.rows.length === 0) return res.status(403).json({ error: 'Apenas administradores podem apagar o grupo.' });
    }

    await pool.query('DELETE FROM group_messages WHERE group_id = $1', [id]);
    await pool.query('DELETE FROM group_members WHERE group_id = $1', [id]);
    await pool.query('DELETE FROM groups_table WHERE id = $1', [id]);
    res.json({ message: 'Grupo apagado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao apagar grupo.' });
  }
});

module.exports = router;
