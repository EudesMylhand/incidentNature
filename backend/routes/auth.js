// ============================================================
//  routes/auth.js
//  Routes d'authentification (JWT + OAuth Google/Facebook)
// ============================================================

const express    = require('express');
const router     = express.Router();
const passport   = require('../config/passport');

const {
  inscrire,
  connecter,
  callbackOAuth,
  monProfil,
  deconnecter
} = require('../controllers/authController');

const { verifierToken } = require('../middleware/auth');

// Validation
const { body, validationResult } = require('express-validator');

const reglesInscription = [
  body('nom')
    .notEmpty().withMessage('Le nom est obligatoire')
    .isLength({ min: 2, max: 100 }).withMessage('Le nom doit avoir entre 2 et 100 caractères')
    .trim(),
  body('prenoms')
    .notEmpty().withMessage('Les prénoms sont obligatoires')
    .trim(),
  body('telephone')
    .notEmpty().withMessage('Le téléphone est obligatoire')
    .matches(/^(\+242|0)[0-9\s]{8,14}$/)
    .withMessage('Format téléphone invalide (ex: +242 06 123 4567)'),
  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Adresse e-mail invalide')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Le mot de passe est obligatoire')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit faire au moins 8 caractères')
];

const reglesConnexion = [
  body('identifiant')
    .notEmpty().withMessage('L\'identifiant est obligatoire')
    .trim(),
  body('password')
    .notEmpty().withMessage('Le mot de passe est obligatoire')
];

const gererErreurs = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
};

// ============================================================
//  ROUTES CLASSIQUES (prefixées /api/auth)
// ============================================================
router.post('/register', reglesInscription, gererErreurs, inscrire);
router.post('/login', reglesConnexion, gererErreurs, connecter);
router.get('/me', verifierToken, monProfil);
router.post('/logout', deconnecter);

// ============================================================
//  ROUTES OAUTH (prefixées /auth)
// ============================================================

// ── URL de base du frontend pour les redirections ──────────
// 🔧 FRONTEND_URL doit être l'URL racine de l'application (ex: https://monapp.onrender.com)
// En local : http://127.0.0.1:5500
const frontendURL = process.env.FRONTEND_URL || 'https://sosnature.onrender.com';

// Google
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

router.get('/google/callback',
  passport.authenticate('google', {
    // 🔧 Redirige vers la page d'accueil avec un paramètre d'erreur
    failureRedirect: `${frontendURL}/?error=google_failed`,
    session: false
  }),
  callbackOAuth // génère le JWT et redirige vers le frontend
);

// Facebook
router.get('/facebook',
  passport.authenticate('facebook', {
    scope: ['email', 'public_profile']
  })
);

router.get('/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${frontendURL}/?error=facebook_failed`,
    session: false
  }),
  callbackOAuth
);

module.exports = router;