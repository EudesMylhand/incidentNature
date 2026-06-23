// ============================================================
//  routes/incidents.js
//  -----------------------------------------------------------
//  TOUTES les routes des incidents sont PROTÉGÉES par JWT.
//  Un utilisateur non connecté recevra un 401 Unauthorized.
//
//  Chaîne de middlewares pour chaque route :
//
//  Requête → verifierToken → (verifierAdmin?) → upload? → validate? → Controller → BDD
//                ↓
//          401 si pas de token
// ============================================================

// ============================================================
//  routes/incidents.js
// ============================================================

const express  = require('express');
const router   = express.Router();

const { verifierToken, verifierAdmin } = require('../middleware/auth');
const upload     = require('../middleware/upload');
const { validateIncident, handleValidationErrors } = require('../middleware/validate');
const {
  creerIncident,
  listerIncidents,
  getIncident,
  mettreAJourStatut,
  supprimerIncident
} = require('../controllers/incidentController');


// ── GET /api/incidents/next-ref ──────────────────────────────
// DOIT être AVANT /:id sinon Express capterait "next-ref" comme un ID
router.get('/next-ref', verifierToken, async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const [[row]] = await pool.execute(
      'SELECT reference FROM incidents ORDER BY id DESC LIMIT 1'
    );
    let nextSeq = 1;
    if (row && row.reference) {
      const match = row.reference.match(/(\d{4})$/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }
    res.json({
      success : true,
      next_seq: String(nextSeq).padStart(4, '0')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/incidents ──────────────────────────────────────
router.post('/',
  verifierToken,
  upload.array('pieces_jointes', 5),
  validateIncident,
  handleValidationErrors,
  creerIncident
);

// ── GET /api/incidents ───────────────────────────────────────
router.get('/', verifierToken, listerIncidents);

// ── GET /api/incidents/:id ───────────────────────────────────
router.get('/:id', verifierToken, getIncident);

// ── PATCH /api/incidents/:id/statut ─────────────────────────
router.patch('/:id/statut', verifierToken, verifierAdmin, mettreAJourStatut);

// ── DELETE /api/incidents/:id ────────────────────────────────
router.delete('/:id', verifierToken, verifierAdmin, supprimerIncident);


module.exports = router;