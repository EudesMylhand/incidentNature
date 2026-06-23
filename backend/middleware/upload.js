// ============================================================
//  middleware/upload.js
//  -----------------------------------------------------------
//  Ce fichier configure MULTER, la bibliothèque qui gère
//  l'upload (envoi) de fichiers vers le serveur.
//
//  Un "middleware" en Express, c'est une fonction qui
//  s'exécute ENTRE la requête du client et la réponse
//  du serveur. C'est comme un filtre ou un traitement
//  intermédiaire.
//
//  Schéma : Client → [middleware upload] → Controller → BDD
// ============================================================

const multer = require('multer');
const path   = require('path'); // module Node.js pour manipuler les chemins de fichiers
const fs     = require('fs');   // module Node.js pour manipuler le système de fichiers

// ── Dossier de destination des fichiers ──────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Crée le dossier "uploads" s'il n'existe pas encore
// { recursive: true } = crée aussi les dossiers parents si nécessaire
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Dossier uploads/ créé');
}

// ── Configuration du stockage des fichiers ───────────────────
// diskStorage = stocker les fichiers sur le disque dur du serveur
const storage = multer.diskStorage({

  // "destination" définit DANS QUEL DOSSIER sauvegarder le fichier
  destination: function (req, file, cb) {
    // cb = callback (fonction de rappel), convention Node.js
    // cb(erreur, chemin_du_dossier)
    // null = pas d'erreur
    cb(null, UPLOAD_DIR);
  },

  // "filename" définit SOUS QUEL NOM sauvegarder le fichier
  filename: function (req, file, cb) {
    // On génère un nom unique pour éviter les conflits
    // Exemple : 1710498234567_rapport_photo.jpg
    //           └─ timestamp ──┘ └─ nom original ─┘

    const timestamp  = Date.now(); // nombre de millisecondes depuis 1970
    const originalName = file.originalname
      .toLowerCase()
      .replace(/\s+/g, '_')       // remplace les espaces par des _
      .replace(/[^a-z0-9_.-]/g, ''); // supprime les caractères spéciaux

    const uniqueName = `${timestamp}_${originalName}`;
    cb(null, uniqueName);
  }
});

// ── Filtre de type de fichiers autorisés ─────────────────────
// On accepte uniquement les images, PDF et documents Word
const fileFilter = function (req, file, cb) {

  // Liste des types MIME acceptés
  // Le type MIME, c'est l'identifiant standard d'un format de fichier
  const allowedMimes = [
    'image/jpeg',       // .jpg, .jpeg
    'image/png',        // .png
    'image/gif',        // .gif
    'image/webp',       // .webp
    'application/pdf',  // .pdf
    'application/msword',                                       // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
  ];

  if (allowedMimes.includes(file.mimetype)) {
    // true = accepter ce fichier
    cb(null, true);
  } else {
    // false = refuser ce fichier + envoyer une erreur
    cb(
      new Error(`Type de fichier non autorisé : ${file.mimetype}. Acceptés : images, PDF, Word`),
      false
    );
  }
};

// ── Création de l'instance Multer ────────────────────────────
const upload = multer({
  storage   : storage,
  fileFilter: fileFilter,

  limits: {
    // Taille max par fichier (depuis .env ou 10 Mo par défaut)
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,

    // Nombre max de fichiers par requête
    files: 5
  }
});

// On exporte "upload" pour l'utiliser dans les routes
// Exemple d'utilisation dans une route :
//   router.post('/incidents', upload.array('pieces_jointes', 5), controller)
module.exports = upload;
