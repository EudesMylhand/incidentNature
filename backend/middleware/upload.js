// ============================================================
//  middleware/upload.js — Version production (Cloudinary)
//  -----------------------------------------------------------
//  Pourquoi changer de stratégie de stockage ?
//  Sur Render (et la plupart des hébergeurs gratuits), le disque
//  du serveur est "éphémère" : à chaque redéploiement, TOUT ce
//  qui a été écrit sur le disque est effacé, y compris le dossier
//  uploads/. Si on garde le stockage local, toutes les photos
//  de sinistres disparaîtraient au premier redéploiement.
//
//  Solution : on envoie les fichiers vers Cloudinary, un service
//  de stockage cloud gratuit (25 Go), qui les garde de façon
//  permanente et nous renvoie une URL publique (https://...)
//  qu'on stocke simplement dans la colonne `chemin` de MySQL.
//
//  MODE AUTOMATIQUE : si les clés Cloudinary sont présentes dans
//  le .env, on les utilise. Sinon, on retombe sur le stockage
//  local (pratique pour développer sur ta machine sans compte
//  Cloudinary).
// ============================================================

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Détecte si Cloudinary est configuré ──────────────────────
const cloudinaryActif =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET &&
  !process.env.CLOUDINARY_CLOUD_NAME.includes('ton_cloud_name');

let upload;

if (cloudinaryActif) {
  // ════════════════════════════════════════════════════════
  //  MODE PRODUCTION — Stockage Cloudinary (persistant)
  // ════════════════════════════════════════════════════════
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key   : process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'foretgarde-incidents',
      // Cloudinary accepte tous types de fichiers avec resource_type "auto"
      resource_type: 'auto',
      allowed_formats: ['jpg','jpeg','png','gif','webp','pdf','doc','docx']
    }
  });

  upload = multer({
    storage,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
      files: 5
    }
  });

  console.log('✅ Stockage des fichiers : Cloudinary (production)');

} else {
  // ════════════════════════════════════════════════════════
  //  MODE DÉVELOPPEMENT — Stockage local (disque du serveur)
  // ════════════════════════════════════════════════════════
  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename   : (req, file, cb) => {
      const safe = file.originalname.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_.-]/g,'');
      cb(null, `${Date.now()}_${safe}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Type non autorisé : ${file.mimetype}`), false);
  };

  upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
      files: 5
    }
  });

  console.log('⚠️  Stockage des fichiers : LOCAL (dev uniquement — non persistant en prod)');
}

module.exports = upload;
