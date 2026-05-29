const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Criar tabelas base
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE,
        photo_url TEXT,
        password_hash VARCHAR(255) NOT NULL,
        identity_public_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pre_keys (
        id SERIAL PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL REFERENCES users(phone),
        key_id INTEGER NOT NULL,
        public_key TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_phone, key_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_phone VARCHAR(20) NOT NULL,
        recipient_phone VARCHAR(20) NOT NULL,
        ephemeral_public_key TEXT NOT NULL,
        pre_key_id INTEGER NOT NULL,
        encrypted_body TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        owner_phone VARCHAR(20) NOT NULL,
        contact_phone VARCHAR(20) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_phone, contact_phone)
      );

      CREATE TABLE IF NOT EXISTS groups_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        creator_phone VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups_table(id),
        user_phone VARCHAR(20) NOT NULL,
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_phone)
      );

      CREATE TABLE IF NOT EXISTS group_messages (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups_table(id),
        sender_phone VARCHAR(20) NOT NULL,
        encrypted_body TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_phone, delivered);
      CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
    `);

    // Migração: adicionar colunas que podem faltar em tabelas existentes
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_public_key TEXT`);

    console.log('✅ Base de dados inicializada/atualizada');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
