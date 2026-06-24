// ============================================================
//  config/database.js
//  -----------------------------------------------------------
//  Ce fichier gère la CONNEXION à la base de données MySQL.
//
//  Pourquoi un "pool" de connexions ?
//  Imagine que ta base de données est un guichet de banque.
//  Un pool, c'est avoir PLUSIEURS guichetiers disponibles
//  en même temps. Ainsi, si 10 utilisateurs envoient un
//  formulaire simultanément, chacun a son guichetier sans
//  attendre que le précédent ait fini. Plus performant !
// ============================================================

// "require" = importer un module (comme "import" en Python)
const mysql = require('mysql2/promise'); // mysql2 avec support des Promises (async/await)
const dotenv = require('dotenv');        // dotenv lit notre fichier .env

// Charge les variables du fichier .env dans process.env
// process.env.PORT, process.env.DB_HOST, etc. seront disponibles
dotenv.config();

// ── Création du pool de connexions ───────────────────────────
// createPool crée un "réservoir" de connexions réutilisables
const pool = mysql.createPool({

  host    : process.env.DB_HOST     || 'localhost', // adresse MySQL
  port    : process.env.DB_PORT     || 3306,        // port MySQL
  user    : process.env.DB_USER     || 'root',      // utilisateur
  password: process.env.DB_PASSWORD || '',          // mot de passe
  database: process.env.DB_NAME     || 'foretgarde',// nom de la BDD
  ssl     : { minVersion: 'TLSv1.2', rejectUnauthorized: true },

  // Nombre maximum de connexions simultanées dans le pool
  // 10 connexions suffisent largement pour une petite application
  connectionLimit: 10,

  // Attend que le serveur MySQL soit prêt si la connexion échoue
  waitForConnections: true,

  // Si toutes les connexions sont occupées, met en file d'attente
  // 0 = file d'attente illimitée
  queueLimit: 0,

  // Garde les connexions vivantes pour éviter les timeouts
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// ── Test de la connexion au démarrage ────────────────────────
// Cette fonction vérifie que la BDD est bien accessible
async function testConnection() {
  try {
    // On tente de récupérer une connexion du pool
    const connection = await pool.getConnection();
    console.log('✅ Connexion MySQL établie avec succès !');

    // Important : toujours "relâcher" la connexion pour la remettre
    // dans le pool après usage
    connection.release();
  } catch (error) {
    // Si la connexion échoue, on affiche l'erreur et on arrête l'app
    console.error('❌ Impossible de se connecter à MySQL :', error.message);
    console.error('👉 Vérifie ton fichier .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)');
    process.exit(1); // Arrête le serveur avec un code d'erreur
  }
}

// On exporte le pool pour pouvoir l'utiliser dans les autres fichiers
// et la fonction de test pour l'appeler au démarrage du serveur
module.exports = { pool, testConnection };
