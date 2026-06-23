// ============================================================
//  middleware/auth.js
//  -----------------------------------------------------------
//  Ce middleware vérifie que l'utilisateur est bien connecté
//  avant de lui laisser accéder à certaines routes protégées.
//
//  Comment fonctionne un JWT (JSON Web Token) ?
//  ─────────────────────────────────────────────
//  Un JWT c'est comme un badge d'entrée numérique.
//  Quand tu te connectes, le serveur te donne un token.
//  Ce token contient tes infos (id, rôle) et est signé
//  avec une clé secrète.
//
//  Pour chaque requête protégée, tu envoies ce token.
//  Le serveur vérifie la signature → si c'est valide,
//  il sait qui tu es sans avoir à interroger la BDD.
//
//  Format du token dans la requête HTTP :
//  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
//                 ↑ mot-clé  ↑ le token JWT
// ============================================================

const jwt  = require('jsonwebtoken');
const { pool } = require('../config/database');

// ── Middleware : vérifie que l'utilisateur est connecté ───────
const verifierToken = async (req, res, next) => {

  // 1. Récupère l'en-tête Authorization de la requête
  const authHeader = req.headers['authorization'];

  // 2. Extrait le token (format: "Bearer <token>")
  //    split(' ')[1] prend la partie après "Bearer "
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Pas de token → utilisateur non connecté
    return res.status(401).json({
      success: false,
      message: 'Accès refusé. Tu dois être connecté.',
      redirect: '/foretgarde-auth.html' // indique au frontend où aller
    });
  }

  try {
    // 3. Vérifie et décode le token avec la clé secrète
    //    jwt.verify lance une erreur si le token est invalide ou expiré
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Récupère les infos fraîches de l'utilisateur en BDD
    //    (pour s'assurer qu'il n'a pas été désactivé entre-temps)
    const [[user]] = await pool.execute(
      'SELECT id, nom, prenoms, telephone, email, role, statut FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user || user.statut === 'inactif') {
      return res.status(401).json({
        success: false,
        message: 'Compte introuvable ou désactivé.',
        redirect: '/foretgarde-auth.html'
      });
    }

    // 5. Attache l'utilisateur à la requête pour les controllers
    //    Maintenant, dans n'importe quel controller,
    //    tu peux faire req.user.id, req.user.role, etc.
    req.user = user;

    // 6. Tout est bon → passe au middleware/controller suivant
    next();

  } catch (error) {
    // Token invalide, mal formé, ou expiré
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expirée. Reconnecte-toi.',
        redirect: '/foretgarde-auth.html'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Token invalide.',
      redirect: '/foretgarde-auth.html'
    });
  }
};

// ── Middleware : vérifie que l'utilisateur est ADMIN ──────────
// S'utilise APRÈS verifierToken
// Exemple dans une route : router.delete('/:id', verifierToken, verifierAdmin, controller)
const verifierAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next(); // est admin → continue
  } else {
    res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs.'
    });
  }
};

module.exports = { verifierToken, verifierAdmin };
