// ============================================================
//  config/passport.js
//  -----------------------------------------------------------
//  Ce fichier configure PASSPORT.JS, la bibliothèque qui gère
//  l'authentification via Google et Facebook (OAuth2).
//
//  Comment fonctionne OAuth2 en résumé ?
//  ┌──────────────┐    ① clic "Se connecter avec Google"
//  │  Navigateur  │──────────────────────────────────────→ /auth/google
//  └──────────────┘                                        │
//         ↑                                                ▼
//         │                                         Passport redirige
//         │                                         vers Google.com
//         │  ④ Passport reçoit le profil           │
//         │     crée/met à jour l'user en BDD      │
//         │     génère un JWT                      │
//         │     redirige → rapport_incident.html   ▼
//         └──────────────── ③ callback ────── Google renvoie le profil
//                                              (email, nom, photo)
// ============================================================
// ============================================================
//  config/passport.js
//  -----------------------------------------------------------
//  Configure les stratégies OAuth Google et Facebook.
//  Si les clés ne sont pas dans le .env, la stratégie est
//  simplement ignorée (pas de crash au démarrage).
// ============================================================

const passport         = require('passport');
const GoogleStrategy   = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { pool }         = require('./database');

// ── Stratégie Google ──────────────────────────────────────────
// On vérifie que les clés existent AVANT de charger la stratégie
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CLIENT_ID !== 'ton_google_client_id.apps.googleusercontent.com') {

  passport.use(new GoogleStrategy(
    {
      clientID    : process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL : 'http://localhost:3000/auth/google/callback',
      scope       : ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email    = profile.emails?.[0]?.value || null;
        const nom      = profile.name?.familyName  || profile.displayName || 'Inconnu';
        const prenoms  = profile.name?.givenName   || '';
        const avatar   = profile.photos?.[0]?.value || null;

        const [[existing]] = await pool.execute(
          'SELECT * FROM users WHERE google_id = ?', [googleId]
        );

        if (existing) {
          await pool.execute(
            'UPDATE users SET avatar_url = ?, last_login = NOW() WHERE google_id = ?',
            [avatar, googleId]
          );
          return done(null, existing);
        }

        const [result] = await pool.execute(
          `INSERT INTO users (nom, prenoms, telephone, email, google_id, avatar_url, role, last_login)
           VALUES (?, ?, ?, ?, ?, ?, 'user', NOW())`,
          [nom, prenoms, `GOOGLE_${googleId}`, email, googleId, avatar]
        );

        const [[newUser]] = await pool.execute(
          'SELECT * FROM users WHERE id = ?', [result.insertId]
        );
        return done(null, newUser);

      } catch (err) {
        return done(err, null);
      }
    }
  ));

  console.log('✅ Stratégie Google OAuth activée');

} else {
  console.log('⚠️  Google OAuth désactivé (GOOGLE_CLIENT_ID absent dans .env)');
}


// ── Stratégie Facebook ────────────────────────────────────────
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET &&
    process.env.FACEBOOK_APP_ID !== 'ton_facebook_app_id') {

  passport.use(new FacebookStrategy(
    {
      clientID    : process.env.FACEBOOK_APP_ID,     // ← clientID (pas appID)
      clientSecret: process.env.FACEBOOK_APP_SECRET,  // ← clientSecret (pas appSecret)
      callbackURL : 'http://localhost:3000/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'name', 'email', 'picture.type(large)']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const facebookId = profile.id;
        const email      = profile.emails?.[0]?.value || null;
        const nom        = profile.name?.familyName  || profile.displayName || 'Inconnu';
        const prenoms    = profile.name?.givenName   || '';
        const avatar     = profile.photos?.[0]?.value || null;

        const [[existing]] = await pool.execute(
          'SELECT * FROM users WHERE facebook_id = ?', [facebookId]
        );

        if (existing) {
          await pool.execute(
            'UPDATE users SET avatar_url = ?, last_login = NOW() WHERE facebook_id = ?',
            [avatar, facebookId]
          );
          return done(null, existing);
        }

        const [result] = await pool.execute(
          `INSERT INTO users (nom, prenoms, telephone, email, facebook_id, avatar_url, role, last_login)
           VALUES (?, ?, ?, ?, ?, ?, 'user', NOW())`,
          [nom, prenoms, `FACEBOOK_${facebookId}`, email, facebookId, avatar]
        );

        const [[newUser]] = await pool.execute(
          'SELECT * FROM users WHERE id = ?', [result.insertId]
        );
        return done(null, newUser);

      } catch (err) {
        return done(err, null);
      }
    }
  ));

  console.log('✅ Stratégie Facebook OAuth activée');

} else {
  console.log('⚠️  Facebook OAuth désactivé (FACEBOOK_APP_ID absent dans .env)');
}


// ── Sérialisation (requis par Passport même sans session active) ──
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT id, nom, prenoms, telephone, email, role, avatar_url FROM users WHERE id = ?',
      [id]
    );
    done(null, user || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;