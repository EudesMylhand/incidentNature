// ============================================================
//  server.js — POINT D'ENTRÉE PRINCIPAL
//  -----------------------------------------------------------
//  Démarrage :
//    npm run dev   ← mode développement (redémarrage auto)
//    npm start     ← mode production
// ============================================================

require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const path           = require('path');
const session        = require('express-session');
const passport       = require('./config/passport');
const { testConnection } = require('./config/database');

const incidentRoutes = require('./routes/incidents');
const authRoutes     = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  MIDDLEWARES GLOBAUX
// ============================================================

// ── 1. CORS ────────────────────────────────────────────────
app.use(cors({
  origin     : process.env.FRONTEND_URL || 'http://127.0.0.1:5500',
  methods    : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ── 2. Parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 3. Sessions Express ────────────────────────────────────
// ⚠️ En production, MemoryStore sera perdu au redémarrage.
// Pour un vrai déploiement, utilise connect-redis ou connect-mongo.
// Pour l'instant, ça suffit pour le flux OAuth (la session dure
// seulement le temps de la redirection).
app.use(session({
  secret           : process.env.SESSION_SECRET || process.env.JWT_SECRET || 'sonsnature_session_secret',
  resave           : false,
  saveUninitialized: false,
  cookie: {
    secure  : process.env.NODE_ENV === 'production', // HTTPS forcé sur Render
    httpOnly: true,
    maxAge  : 10 * 60 * 1000 // 10 minutes
  }
}));

// ── 4. Initialisation de Passport ─────────────────────────
app.use(passport.initialize());


// ── 5. Fichiers statiques ─────────────────────────────────
// Dossier uploads accessible publiquement
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🔧 NOUVEAU : servir le frontend (pages HTML) directement depuis Express
// Cela permet d'accéder au site sur https://ton-app.onrender.com/
// sans avoir besoin de Live Server séparé.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ============================================================
//  MONTAGE DES ROUTES
// ============================================================

// Routes API "auth" classiques (login, register, me, logout)
app.use('/api/auth', authRoutes);

// Routes OAuth Google/Facebook (callback sans préfixe /api)
app.use('/auth', authRoutes);

// Routes CRUD incidents
app.use('/api/incidents', incidentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status : 'ok',
    message: 'Serveur ForêtGarde opérationnel 🌿',
    heure  : new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' })
  });
});

// ── Fallback pour SPA ──────────────────────────────────────
// 🔧 MODIFIÉ : au lieu de renvoyer une erreur JSON, on sert la page
// d'accueil pour toute route non API (ex: /truc, /rapport_incident.html)
// Cela permet de naviguer côté client sans 404.
app.get('*', (req, res) => {
  // Si la route commence par /api ou /auth, elle a déjà été traitée
  // Sinon, renvoie le fichier foretgarde-auth.html
  res.sendFile(path.join(__dirname, '..', 'frontend', 'foretgarde-auth.html'));
});

// ── Gestionnaire d'erreurs global ─────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Erreur non gérée :', err.message);

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
//  DÉMARRAGE
// ============================================================
async function demarrer() {
  console.log('\n🌿 Démarrage du serveur Sosnature...\n');
  await testConnection();

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