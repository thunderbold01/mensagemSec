const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
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

      CREATE INDEX idx_messages_recipient ON messages(recipient_phone, delivered);
    `);
    console.log('✅ Base de dados inicializada');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
