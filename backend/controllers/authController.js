// ============================================================
//  controllers/authController.js
//  -----------------------------------------------------------
//  Gère l'authentification :
//    - register : inscription avec vrai mot de passe hashé
//    - login    : connexion par NOM ou TÉLÉPHONE + mot de passe
//    - OAuth    : callback Google / Facebook
//    - me       : profil de l'utilisateur connecté
//    - logout   : déconnexion
// ============================================================

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/database');


// ⚠️ FRONTEND_URL doit pointer vers l'URL publique de l'application
const frontendURL = process.env.FRONTEND_URL || 'https://sosnature.onrender.com';

// ── Génère un JWT pour un utilisateur ───────────────────────
function genererToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, nom: user.nom },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ── Nettoie l'objet user Prépare l'objet user à renvoyer (sans le hash du mdp)  ───────────────────────────────────
function nettoyerUser(user) {
  const { password_hash, ...propres } = user;
  return propres;
}



// ============================================================
//  INSCRIPTION
//  POST /api/auth/register
//  Corps : { nom, prenoms, telephone, email, password, role, adminCode }
// ============================================================
const inscrire = async (req, res) => {
  try {
    const { nom, prenoms, telephone, email, password, role, adminCode } = req.body;

    // ── 1. Champs obligatoires ───────────────────────────────
    if (!nom || !prenoms || !telephone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nom, prénoms, téléphone et mot de passe sont obligatoires.'
      });
    }

    // ── 2. Longueur minimale du mot de passe ─────────────────
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères.',
        field  : 'password'
      });
    }

    // ── 3. Vérification du code admin ────────────────────────
    if (role === 'admin') {
      if (!adminCode || adminCode !== process.env.ADMIN_SECRET_CODE) {
        return res.status(403).json({
          success: false,
          message: 'Code administrateur incorrect.',
          field  : 'adminCode'
        });
      }
    }

    const telNettoye = telephone.replace(/\s/g, '');

    // ── 4. Téléphone déjà utilisé ? ──────────────────────────
    const [[existingTel]] = await pool.execute(
      'SELECT id FROM users WHERE telephone = ?', [telNettoye]
    );
    if (existingTel) {
      return res.status(409).json({
        success: false,
        message: 'Ce numéro de téléphone est déjà utilisé.',
        field  : 'telephone'
      });
    }

    // ── 5. Email déjà utilisé ? ──────────────────────────────
    if (email) {
      const [[existingEmail]] = await pool.execute(
        'SELECT id FROM users WHERE email = ?', [email.toLowerCase()]
      );
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'Cette adresse e-mail est déjà utilisée.',
          field  : 'email'
        });
      }
    }

    // ── 6. Hasher le mot de passe avec bcrypt ────────────────
    // bcrypt.hash(motDePasse, rounds)
    // rounds = 10 → bon équilibre sécurité / performance
    // Le hash résultant est différent à chaque appel (sel aléatoire)
    const hash = await bcrypt.hash(password, 10);

    // ── 7. Insérer l'utilisateur ─────────────────────────────
    const [result] = await pool.execute(
      `INSERT INTO users (nom, prenoms, telephone, email, password_hash, role, last_login)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        nom.toUpperCase().trim(),
        prenoms.trim(),
        telNettoye,
        email ? email.toLowerCase().trim() : null,
        hash,
        role === 'admin' ? 'admin' : 'user'
      ]
    );

    const [[newUser]] = await pool.execute(
      'SELECT * FROM users WHERE id = ?', [result.insertId]
    );

    // ── 8. Générer le token et répondre ─────────────────────
    const token = genererToken(newUser);
    res.status(201).json({
      success : true,
      message : `Compte créé avec succès ! Bienvenue ${prenoms} 🌿`,
      token,
      user    : nettoyerUser(newUser),
      redirect: 'rapport_incident.html'
    });

  } catch (error) {
    console.error('❌ Erreur inscription :', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'inscription.',
      error  : process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// ============================================================
//  CONNEXION
//  POST /api/auth/login
//  Corps : { identifiant, password }
//  L'identifiant peut être un NOM ou un NUMÉRO DE TÉLÉPHONE
// ============================================================
const connecter = async (req, res) => {
  try {
    const { identifiant, password } = req.body;

    if (!identifiant || !password) {
      return res.status(400).json({
        success: false,
        message: 'L\'identifiant et le mot de passe sont obligatoires.'
      });
    }

    const id = identifiant.trim().replace(/\s/g, '');

    // ── 1. Détecter si c'est un téléphone ou un nom ──────────
    // On considère que c'est un téléphone si ça commence par +
    // ou par un chiffre (format congolais)
    const estTelephone = /^(\+|0[0-9])/.test(id) || /^\d{6,}$/.test(id);

    let user = null;

    if (estTelephone) {
      // ── Recherche par téléphone (exact) ───────────────────
      const [[u]] = await pool.execute(
        'SELECT * FROM users WHERE telephone = ? AND statut = "actif"',
        [id]
      );
      user = u;
    } else {
      // ── Recherche par nom (insensible à la casse) ─────────
      // UPPER() convertit en majuscules côté MySQL pour comparer
      const [[u]] = await pool.execute(
        `SELECT * FROM users
         WHERE UPPER(nom) LIKE UPPER(?)
         AND statut = "actif"
         LIMIT 1`,
        [`%${id}%`]
      );
      user = u;
    }

    // ── 2. Utilisateur introuvable ───────────────────────────
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Identifiant ou mot de passe incorrect.'
      });
    }

    // ── 3. Compte sans mot de passe (utilisateur OAuth) ──────
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Ce compte utilise la connexion Google ou Facebook. Utilise le bouton correspondant.'
      });
    }

    // ── 4. Vérifier le mot de passe ──────────────────────────
    // bcrypt.compare compare le mot de passe en clair
    // avec le hash stocké en BDD
    const motDePasseCorrect = await bcrypt.compare(password, user.password_hash);
    if (!motDePasseCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Identifiant ou mot de passe incorrect.'
      });
    }

    // ── 5. Mettre à jour la date de dernière connexion ───────
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]
    );

    // ── 6. Générer le token et répondre ─────────────────────
    const token = genererToken(user);
    res.json({
      success : true,
      message : `Bienvenue ${user.prenoms} !`,
      token,
      user    : nettoyerUser(user),
      redirect: 'rapport_incident.html'
    });

  } catch (error) {
    console.error('❌ Erreur connexion :', error.message);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion.',
      error  : process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// ============================================================
//  CALLBACK OAUTH (Google / Facebook)
// ============================================================
const callbackOAuth = (req, res) => {
  try {
    if (!req.user) {
      // Redirection absolue vers la page d'accueil avec message d'erreur
      return res.redirect(`${FRONTEND_URL}/?error=oauth_failed`);
    }
    const token = genererToken(req.user);
    // Redirection vers la page protégée avec le token et les infos user
    res.redirect(
      `${FRONTEND_URL}/rapport_incident.html?token=${token}&nom=${encodeURIComponent(req.user.nom)}&role=${req.user.role}`
    );
  } catch (error) {
    console.error('❌ Erreur OAuth callback :', error.message);
    res.redirect(`${FRONTEND_URL}/?error=server_error`);
  }
};


// ============================================================
//  PROFIL CONNECTÉ
//  GET /api/auth/me  (protégée par JWT)
// ============================================================
const monProfil = async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT id, nom, prenoms, telephone, email, role, avatar_url, created_at, last_login
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ Erreur profil :', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
};


// ============================================================
//  DÉCONNEXION
//  POST /api/auth/logout
// ============================================================
const deconnecter = (req, res) => {
  // Avec JWT stateless, la déconnexion se fait côté client
  // (suppression du token dans localStorage)
  res.json({
    success : true,
    message : 'Déconnexion réussie.',
    redirect: 'foretgarde-auth.html'
  });
};


module.exports = { inscrire, connecter, callbackOAuth, monProfil, deconnecter };
