// ============================================================
//  routes/auth.js
//  -----------------------------------------------------------
//  Ce fichier définit toutes les routes liées à
//  l'authentification des utilisateurs.
//
//  Toutes ces routes seront préfixées dans server.js :
//    app.use('/api/auth', authRoutes)  → routes classiques
//    app.use('/auth', authRoutes)      → routes OAuth (Google/FB)
// ============================================================

const express    = require('express');
const router     = express.Router();
const passport   = require('../config/passport');

// Import du controller (la logique)
const {
  inscrire,
  connecter,
  callbackOAuth,
  monProfil,
  deconnecter
} = require('../controllers/authController');

// Import du middleware de vérification JWT
const { verifierToken } = require('../middleware/auth');

// ── Validation des champs ─────────────────────────────────────
const { body, validationResult } = require('express-validator');

// Règles pour l'inscription
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

// Règles pour la connexion
const reglesConnexion = [
   body('identifiant')
    .notEmpty().withMessage('L\'identifiant est obligatoire')
    .trim(),
  body('password')
    .notEmpty().withMessage('Le mot de passe est obligatoire')
];

// Middleware qui renvoie les erreurs de validation
const gererErreurs = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: errors.array()[0].msg, // renvoie la première erreur
      errors: errors.array()
    });
  }
  next();
};


// ============================================================
//  ROUTES CLASSIQUES (utilisateur + mot de passe)
// ============================================================

// POST /api/auth/register → Créer un nouveau compte
router.post('/register', reglesInscription, gererErreurs, inscrire);

// POST /api/auth/login  — identifiant (nom ou tél) + password
router.post('/login', reglesConnexion, gererErreurs, connecter);

// GET /api/auth/auth → Récupérer son propre profil (route protégée)
router.get('/auth', verifierToken, monProfil);

// POST /api/auth/logout → Se déconnecter
router.post('/logout', deconnecter);


// ============================================================
//  ROUTES OAUTH GOOGLE
//  Ces routes ne sont pas préfixées par /api/auth
//  mais par /auth (voir server.js)
// ============================================================

// GET /auth/google → Démarre le flux OAuth Google
// Redirige l'utilisateur vers la page de connexion Google
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    // prompt: 'select_account' = demande à l'utilisateur de choisir son compte Google
    prompt: 'select_account'
  })
);

// GET /auth/google/callback → Google renvoie l'utilisateur ici
// Passport traite la réponse de Google
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/index.html?error=google_failed`,
    session: false // On utilise JWT, pas de sessions
  }),
  callbackOAuth // Si succès → notre fonction génère le JWT et redirige
);


// ============================================================
//  ROUTES OAUTH FACEBOOK
// ============================================================

// GET /auth/facebook → Démarre le flux OAuth Facebook
router.get('/facebook',
  passport.authenticate('facebook', {
    scope: ['email', 'public_profile']
  })
);

// GET /auth/facebook/callback → Facebook renvoie l'utilisateur ici
router.get('/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${process.env.FRONTEND_URL}/index.html?error=facebook_failed`,
    session: false
  }),
  callbackOAuth
);


module.exports = router;
