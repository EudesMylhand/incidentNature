// ============================================================
//  config/database.js
//  -----------------------------------------------------------
//  Pool de connexions MySQL avec configuration dynamique
//  adaptée à Render et aux bases cloud.
// ============================================================

const mysql = require('mysql2/promise');

// Ne recharge pas dotenv si déjà chargé (mais ne fait pas de mal)
require('dotenv').config();

// Détermine si on active SSL (obligatoire sur la plupart des clouds)
const useSSL = process.env.DB_SSL === 'true';  // Par défaut false en local

// Configuration du pool
const pool = mysql.createPool({
  host    : process.env.DB_HOST     || 'localhost',
  port    : Number(process.env.DB_PORT) || 4000,  // ⚠️ Convertit en nombre
  user    : process.env.DB_USER     || 'ne6Hd76LELwuL54.root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'sosnaturedb',

  // 🔧 SSL : flexible, autorise les certificats auto-signés si DB_SSL_REJECT_UNAUTHORIZED=false
  ssl     : useSSL
    ? {
        minVersion       : 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      }
    : false,

  connectionLimit     : 10,
  waitForConnections  : true,
  queueLimit          : 0,
  enableKeepAlive     : true,
  keepAliveInitialDelay: 0
});

// ── Test de connexion au démarrage ──────────────────────────
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connexion MySQL établie avec succès !');
    connection.release();
  } catch (error) {
    console.error('❌ Impossible de se connecter à MySQL :', error.message);
    console.error('👉 Vérifie les variables DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    console.error('👉 SSL : DB_SSL=' + process.env.DB_SSL + ', rejectUnauthorized=' + process.env.DB_SSL_REJECT_UNAUTHORIZED);
    process.exit(1);
  }
}

// ⚠️ Important : on exporte bien les deux éléments (pool pour les controllers)
module.exports = { pool, testConnection };