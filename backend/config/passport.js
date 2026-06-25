// ============================================================
//  config/passport.js
//  -----------------------------------------------------------
//  Configure les stratégies OAuth Google et Facebook.
//  Les callbacks utilisent BASE_URL (défini dans l'environnement)
//  pour pointer vers l'URL publique de l'application.
// ============================================================

const passport         = require('passport');
const GoogleStrategy   = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { pool }         = require('./database');

// 🔧 Construction dynamique de l'URL de callback
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Stratégie Google ─────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CLIENT_ID !== 'ton_google_client_id.apps.googleusercontent.com') {

  passport.use(new GoogleStrategy(
    {
      clientID    : process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // 🔧 IMPORTANT : callbackURL dynamique (plus de localhost en dur)
      callbackURL : `${BASE_URL}/auth/google/callback`,
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

        // Insertion du nouvel utilisateur
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

  console.log('✅ Stratégie Google OAuth activée (callback : ' + `${BASE_URL}/auth/google/callback` + ')');

} else {
  console.log('⚠️  Google OAuth désactivé (clés manquantes)');
}



// ── Stratégie Facebook ───────────────────────────────────────
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET &&
    process.env.FACEBOOK_APP_ID !== 'ton_facebook_app_id') {

  passport.use(new FacebookStrategy(
    {
      clientID    : process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      // 🔧 callbackURL dynamique
      callbackURL : `${BASE_URL}/auth/facebook/callback`,
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

  console.log('✅ Stratégie Facebook OAuth activée (callback : ' + `${BASE_URL}/auth/facebook/callback` + ')');

} else {
  console.log('⚠️  Facebook OAuth désactivé (clés manquantes)');
}


// ── Sérialisation / Désérialisation ──────────────────────────
// ⚠️ Inutile si on utilise session: false dans les routes OAuth.
//    Mais Passport exige ces fonctions si passport.session() est appelé.
//    On les laisse vides pour éviter des erreurs, mais on peut les commenter.
passport.serializeUser((user, done) => {
  // Pas utilisé car session: false
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  // Pas utilisé car session: false
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