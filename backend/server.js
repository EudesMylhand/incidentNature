// ============================================================
//  server.js — POINT D'ENTRÉE PRINCIPAL
//  -----------------------------------------------------------
//  C'est le premier fichier exécuté quand tu lances le serveur.
//
//  Pour démarrer :
//    npm run dev   ← mode développement (redémarre auto)
//    npm start     ← mode production
// ============================================================

// Chargement des variables .env EN PREMIER
require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const path           = require('path');
const session        = require('express-session'); // requis par Passport
const passport       = require('./config/passport');
const { testConnection } = require('./config/database');

// Import des routes
const incidentRoutes = require('./routes/incidents');
const authRoutes     = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3000;


// ============================================================
//  MIDDLEWARES GLOBAUX
//  (exécutés dans l'ordre pour chaque requête)
// ============================================================

// ── 1. CORS ────────────────────────────────────────────────
// Autorise le navigateur à appeler cette API depuis le frontend.
// Sans ça, le navigateur bloque les requêtes cross-origin.
app.use(cors({
  origin     : process.env.FRONTEND_URL || 'http://127.0.0.1:5500',
  methods    : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // autorise l'envoi de cookies
}));

// ── 2. Parsers ─────────────────────────────────────────────
// Permet de lire req.body dans les requêtes JSON
app.use(express.json({ limit: '1mb' }));
// Permet de lire les formulaires HTML classiques
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 3. Sessions Express ────────────────────────────────────
// Passport a besoin des sessions pour gérer l'état OAuth
// (même si on utilise des JWT, la session est nécessaire
//  pendant le flux de redirection OAuth)
app.use(session({
  secret           : process.env.JWT_SECRET || 'foretgarde_session_secret',
  resave           : false,
  saveUninitialized: false,
  cookie: {
    secure  : process.env.NODE_ENV === 'production', // HTTPS en prod
    httpOnly: true,  // inaccessible depuis JavaScript (sécurité)
    maxAge  : 10 * 60 * 1000 // 10 minutes (juste pour le flux OAuth)
  }
}));

// ── 4. Initialisation de Passport ─────────────────────────
// passport.initialize() = prépare passport pour chaque requête
// passport.session()    = restaure l'état d'auth depuis la session
app.use(passport.initialize());
app.use(passport.session());

// ── 5. Fichiers statiques ──────────────────────────────────
// Rend le dossier /uploads accessible via URL
// Ex: http://localhost:3000/uploads/ma_photo.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── 6. Fichiers frontend statiques (optionnel) ─────────────
// Si tu veux servir tes HTML directement depuis Node.js
// (au lieu d'utiliser Live Server VSCode), décommente ces lignes :
//
// app.use(express.static(path.join(__dirname, '..', 'frontend')));
// Avec ça, tes HTML seront accessibles sur http://localhost:3000/


// ============================================================
//  MONTAGE DES ROUTES
// ============================================================

// Routes d'authentification classiques (login, register, me, logout)
// → accessibles sur http://localhost:3000/api/auth/...
app.use('/api/auth/me', authRoutes);

// Routes OAuth (Google, Facebook) — sans préfixe /api
// car les URLs de redirection sont fixes (http://localhost:3000/auth/google/callback)
// → accessibles sur http://localhost:3000/auth/...
app.use('/auth', authRoutes);

// Routes des incidents (CRUD rapports de sinistres)
// → accessibles sur http://localhost:3000/api/incidents/...
app.use('/api/incidents', incidentRoutes);

// ── Health check ───────────────────────────────────────────
// Route de test : GET http://localhost:3000/api/health
app.get('/api/health', (req, res) => {
  res.json({
    status : 'ok',
    message: 'Serveur ForêtGarde opérationnel 🌿',
    heure  : new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
  });
});

// ── Route 404 ─────────────────────────────────────────────
// Si aucune route ne correspond, renvoie une erreur propre
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route introuvable : ${req.method} ${req.originalUrl}`
  });
});

// ── Gestionnaire d'erreurs global ─────────────────────────
// Express intercepte les erreurs non gérées ici
// Les 4 paramètres (err, req, res, next) sont OBLIGATOIRES
app.use((err, req, res, next) => {
  console.error('💥 Erreur non gérée :', err.message);

  // Erreurs Multer (upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Fichier trop volumineux (max 10 Mo).' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ success: false, message: 'Maximum 5 fichiers autorisés.' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur interne du serveur'
  });
});


// ============================================================
//  DÉMARRAGE DU SERVEUR
// ============================================================
async function demarrer() {
  console.log('\n🌿 Démarrage du serveur ForêtGarde...\n');

  // 1. Vérifier la connexion BDD avant d'accepter des requêtes
  await testConnection();

  // 2. Démarrer l'écoute HTTP
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║       🌿  Serveur ForêtGarde démarré           ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  Local    :  http://localhost:${PORT}               ║`);
    console.log(`║  Santé    :  http://localhost:${PORT}/api/health     ║`);
    console.log(`║  Auth     :  http://localhost:${PORT}/api/auth       ║`);
    console.log(`║  Incidents:  http://localhost:${PORT}/api/incidents  ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log('💡 Pour tester: ouvre http://localhost:3000/api/health\n');
  });
}

demarrer().catch(err => {
  console.error('💥 Impossible de démarrer :', err.message);
  process.exit(1);
});
