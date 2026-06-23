// ============================================================
//  middleware/validate.js
//  -----------------------------------------------------------
//  Ce fichier contient les règles de VALIDATION des données
//  envoyées par le formulaire.
//
//  Pourquoi valider côté serveur ?
//  Le formulaire HTML valide déjà en frontend (dans le navigateur),
//  mais un utilisateur malveillant peut contourner ça.
//  La validation serveur est donc INDISPENSABLE pour protéger
//  ta base de données.
//
//  On utilise la bibliothèque "express-validator" qui fournit
//  des fonctions de validation prêtes à l'emploi.
// ============================================================

const { body, validationResult } = require('express-validator');

// ── Règles de validation pour la création d'un incident ──────
// C'est un tableau de règles. Chaque règle vérifie un champ
// du formulaire.
const validateIncident = [

  // -- Référence --
  body('reference')
    .notEmpty()                        // ne doit pas être vide
    .withMessage('La référence est obligatoire')
    .matches(/^NAT-\d{2}-\d{2}-\d{4} \d{3}$/) // doit respecter le format NAT-DD-MM-YYYY NNN
    .withMessage('Format de référence invalide (ex: NAT-15-03-2026 001)'),

  // -- Date et heure --
  body('date_heure')
    .notEmpty()
    .withMessage('La date et heure sont obligatoires')
    .isISO8601()                       // vérifie que c'est une date valide
    .withMessage('Format de date invalide'),

  // -- Département --
  body('departement')
    .notEmpty()
    .withMessage('Le département est obligatoire')
    .isIn([                            // doit être une valeur de cette liste
      'bouenza','brazzaville','cuvette','cuvette_ouest',
      'kouilou','lekoumou','likouala','niari',
      'plateaux','pointe_noire','pool','sangha'
    ])
    .withMessage('Département invalide'),

  // -- District (optionnel mais validé s'il est présent) --
  body('district')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nom de district invalide'),

  // -- Coordonnées GPS (optionnelles) --
  body('gps_lat')
    .optional({ checkFalsy: true })   // optionnel ET peut être vide
    .isFloat({ min: -90, max: 90 })   // latitude valide entre -90 et 90
    .withMessage('Latitude invalide (doit être entre -90 et 90)'),

  body('gps_lng')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 }) // longitude valide entre -180 et 180
    .withMessage('Longitude invalide (doit être entre -180 et 180)'),

  // -- Type de victime --
  body('type_victime')
    .notEmpty()
    .withMessage('Le type de victime est obligatoire')
    .isIn(['individualite', 'cooperative'])
    .withMessage('Type de victime invalide'),

  // -- Description (optionnelle) --
  body('description')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('La description ne peut pas dépasser 5000 caractères')
    .trim()                           // supprime les espaces au début et à la fin
    .escape(),                        // convertit < > & en entités HTML (sécurité)
];

// ── Middleware de traitement des erreurs de validation ────────
// Cette fonction est appelée APRÈS les règles de validation.
// Elle vérifie s'il y a des erreurs et renvoie une réponse
// si c'est le cas.
const handleValidationErrors = (req, res, next) => {
  // validationResult() collecte toutes les erreurs trouvées
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Il y a des erreurs : on renvoie un code 422 (Unprocessable Entity)
    // avec le détail des erreurs en JSON
    return res.status(422).json({
      success: false,
      message: 'Données invalides. Vérifie les champs du formulaire.',
      errors: errors.array() // tableau des erreurs avec field + message
    });
  }

  // Pas d'erreurs → on passe au middleware/controller suivant
  // next() = "continue le traitement"
  next();
};

module.exports = { validateIncident, handleValidationErrors };
