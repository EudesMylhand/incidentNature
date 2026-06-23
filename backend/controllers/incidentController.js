// ============================================================
//  controllers/incidentController.js
//  -----------------------------------------------------------
//  Le "Controller" contient toute la LOGIQUE MÉTIER.
//  C'est lui qui :
//    1. Reçoit les données validées de la route
//    2. Les traite (formate, calcule, etc.)
//    3. Les enregistre en base de données
//    4. Renvoie une réponse au client
//
//  Schéma d'une requête complète :
//  Client (formulaire)
//    → Route (définit l'URL)
//    → Middleware (upload + validation)
//    → Controller (logique + BDD) ← on est ici
//    → Réponse JSON au client
// ============================================================

const { pool } = require('../config/database');
const path     = require('path');
const fs       = require('fs');

// ============================================================
//  CRÉER UN NOUVEL INCIDENT
//  Méthode HTTP : POST /api/incidents
// ============================================================
const creerIncident = async (req, res) => {
  // "async" = cette fonction utilise des opérations asynchrones
  // (requêtes BDD, lecture fichiers) qui prennent du temps.
  // Avec async/await, on attend la fin de chaque opération
  // avant de passer à la suivante.

  // ── Récupérer une connexion du pool ──────────────────────
  // On récupère une connexion dédiée pour gérer une TRANSACTION
  const connection = await pool.getConnection();

  try {
    // ── Démarrer une TRANSACTION ──────────────────────────
    // Une transaction, c'est un ensemble d'opérations SQL
    // qui réussissent TOUTES ou ÉCHOUENT TOUTES.
    // Exemple : si l'incident s'enregistre mais que les victimes
    // échouent, la transaction annule tout (ROLLBACK).
    // Ainsi, on n'a jamais de données à moitié enregistrées.
    await connection.beginTransaction();

    // ── 1. EXTRAIRE LES DONNÉES DU FORMULAIRE ────────────
    // req.body contient les champs texte du formulaire
    // req.files contient les fichiers uploadés (via multer)
    const {
      reference,
      date_heure,
      departement,
      district,
      gps_lat,
      gps_lng,
      description,
      type_victime,
      // Champs individualité
      individNom,    // peut être un tableau si plusieurs: ['Jean', 'Paul']
      individTel,
      // Champs coopérative
      coopNom,
      coopAgreement,
      coopSiege,
      coopPromoteur,
      coopTel,
      coopMasc,
      coopFem,
      // Productions
      production,    // tableau de valeurs: ['animale', 'vegetale']
      // Cause du sinistre
      causeAnimal,   // tableau: ['Éléphant', 'Buffle']
      causeNombre,   // tableau: ['3', '1']
      // Nature du sinistre
      natureSinistre // tableau: ['humain', 'production_agricole']
    } = req.body;


    // ── 2. INSÉRER L'INCIDENT PRINCIPAL ──────────────────
    // La syntaxe "?" est un placeholder (anti-injection SQL).
    // MySQL remplace chaque "?" par la valeur correspondante
    // dans le tableau, en échappant les caractères dangereux.
    // NE JAMAIS concaténer des variables directement dans le SQL !
    //
    // ❌ DANGEREUX : `INSERT INTO ... VALUES ('${reference}')` 
    // ✅ SÉCURISÉ  : `INSERT INTO ... VALUES (?)`, [reference]
    const [incidentResult] = await connection.execute(
      `INSERT INTO incidents 
         (reference, date_heure, departement, district, gps_lat, gps_lng, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        date_heure,
        departement,
        district   || null, // null si le champ n'est pas renseigné
        gps_lat    || null,
        gps_lng    || null,
        description|| null
      ]
    );

    // insertId = l'ID auto-généré par MySQL pour la ligne qu'on vient d'insérer
    // On en a besoin pour créer les enregistrements liés (victimes, causes, etc.)
    const incidentId = incidentResult.insertId;
    console.log(`📋 Incident créé avec l'ID: ${incidentId}`);


    // ── 3. INSÉRER LA VICTIME ─────────────────────────────
    // On convertit le tableau "production" en flags booléens
    // Si production = ['animale', 'vegetale'], alors :
    //   prodAnimale  = 1 (true)
    //   prodVegetale = 1 (true)
    const prodArray    = Array.isArray(production) ? production : (production ? [production] : []);
    const prodAnimale  = prodArray.includes('animale')  ? 1 : 0;
    const prodVegetale = prodArray.includes('vegetale') ? 1 : 0;

    const [victimeResult] = await connection.execute(
      `INSERT INTO victimes (incident_id, type_victime, prod_animale, prod_vegetale)
       VALUES (?, ?, ?, ?)`,
      [incidentId, type_victime, prodAnimale, prodVegetale]
    );
    const victimeId = victimeResult.insertId;


    // ── 4A. INSÉRER LES INDIVIDUALITÉS ────────────────────
    if (type_victime === 'individualite' && individNom) {
      // Le formulaire peut envoyer soit un seul nom (string)
      // soit plusieurs noms (tableau).
      // On normalise toujours en tableau pour simplifier.
      const noms = Array.isArray(individNom) ? individNom : [individNom];
      const tels = Array.isArray(individTel) ? individTel : [individTel];

      // On insère chaque individualité dans une boucle
      for (let i = 0; i < noms.length; i++) {
        if (noms[i] && noms[i].trim()) { // on ignore les entrées vides
          await connection.execute(
            `INSERT INTO individualites (victime_id, nom, telephone)
             VALUES (?, ?, ?)`,
            [victimeId, noms[i].trim(), tels[i] || null]
          );
        }
      }
      console.log(`👤 ${noms.length} individualité(s) enregistrée(s)`);
    }


    // ── 4B. INSÉRER LA COOPÉRATIVE ────────────────────────
    if (type_victime === 'cooperative' && coopNom) {
      const masc  = parseInt(coopMasc) || 0; // parseInt convertit "18" → 18
      const fem   = parseInt(coopFem)  || 0; // || 0 = si NaN, utilise 0

      await connection.execute(
        `INSERT INTO cooperatives 
           (victime_id, nom, numero_agrement, siege_social, 
            promoteur_nom, promoteur_tel, membres_masc, membres_fem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          victimeId,
          coopNom,
          coopAgreement || null,
          coopSiege     || null,
          coopPromoteur || null,
          coopTel       || null,
          masc,
          fem
        ]
      );
      console.log(`🏢 Coopérative "${coopNom}" enregistrée (${masc + fem} membres)`);
    }


    // ── 5. INSÉRER LES CAUSES DU SINISTRE ─────────────────
    if (causeAnimal) {
      const animaux  = Array.isArray(causeAnimal)  ? causeAnimal  : [causeAnimal];
      const nombres  = Array.isArray(causeNombre)  ? causeNombre  : [causeNombre];

      for (let i = 0; i < animaux.length; i++) {
        if (animaux[i]) {
          await connection.execute(
            `INSERT INTO causes_sinistre (incident_id, animal, nombre)
             VALUES (?, ?, ?)`,
            [incidentId, animaux[i], parseInt(nombres[i]) || 1]
          );
        }
      }
      console.log(`🐘 ${animaux.length} cause(s) enregistrée(s)`);
    }


    // ── 6. INSÉRER LES NATURES DU SINISTRE ───────────────
    if (natureSinistre) {
      const natures = Array.isArray(natureSinistre)
        ? natureSinistre
        : [natureSinistre];

      // INSERT en une seule requête avec plusieurs lignes
      // C'est plus efficace qu'une boucle avec plusieurs INSERT
      const valeurs = natures.map(() => '(?, ?)').join(', ');
      const params  = natures.flatMap(n => [incidentId, n]);

      await connection.execute(
        `INSERT INTO natures_sinistre (incident_id, type_nature) VALUES ${valeurs}`,
        params
      );
      console.log(`📋 ${natures.length} nature(s) enregistrée(s)`);
    }


    // ── 7. ENREGISTRER LES PIÈCES JOINTES ─────────────────
    // req.files est le tableau des fichiers uploadés par Multer
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await connection.execute(
          `INSERT INTO pieces_jointes 
             (incident_id, nom_fichier, chemin, taille_octets, type_mime)
           VALUES (?, ?, ?, ?, ?)`,
          [
            incidentId,
            file.originalname,          // nom original du fichier
            `/uploads/${file.filename}`, // chemin relatif sur le serveur
            file.size,                  // taille en octets
            file.mimetype               // type MIME (image/jpeg, etc.)
          ]
        );
      }
      console.log(`📎 ${req.files.length} pièce(s) jointe(s) enregistrée(s)`);
    }


    // ── 8. VALIDER LA TRANSACTION (COMMIT) ────────────────
    // COMMIT = tout s'est bien passé, on confirme toutes les insertions
    await connection.commit();
    console.log(`✅ Transaction validée pour l'incident ${reference}`);


    // ── 9. RÉPONSE DE SUCCÈS ──────────────────────────────
    // On renvoie un code HTTP 201 (Created) avec les détails
    // 201 = "La ressource a bien été créée"
    res.status(201).json({
      success   : true,
      message   : 'Incident enregistré avec succès',
      data: {
        id       : incidentId,
        reference: reference
      }
    });

  } catch (error) {
    // ── ANNULER LA TRANSACTION EN CAS D'ERREUR (ROLLBACK) ──
    // Si une des insertions a échoué, on annule TOUT
    // pour ne pas laisser des données incomplètes en BDD
    await connection.rollback();
    console.error('❌ Erreur lors de la création de l\'incident :', error.message);

    // Si des fichiers ont été uploadés mais que la BDD a échoué,
    // on supprime les fichiers du serveur (nettoyage)
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error('Impossible de supprimer le fichier :', file.path);
        });
      });
    }

    // Code 500 = erreur interne du serveur
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'enregistrement',
      error  : process.env.NODE_ENV === 'development' ? error.message : undefined
      // On n'expose le détail de l'erreur qu'en mode développement
      // En production, on cache les détails techniques par sécurité
    });

  } finally {
    // "finally" s'exécute TOUJOURS, qu'il y ait une erreur ou non
    // On libère la connexion pour qu'elle retourne dans le pool
    connection.release();
  }
};


// ============================================================
//  RÉCUPÉRER TOUS LES INCIDENTS
//  Méthode HTTP : GET /api/incidents
// ============================================================
const listerIncidents = async (req, res) => {
  try {
    // req.query contient les paramètres de l'URL
    // Exemple : GET /api/incidents?page=2&limite=10&departement=pool
    const page        = parseInt(req.query.page)        || 1;
    const limite      = parseInt(req.query.limite)      || 10;
    const departement = req.query.departement            || null;

    // OFFSET = combien d'enregistrements sauter
    // Page 1 → skip 0, Page 2 → skip 10, Page 3 → skip 20, etc.
    const offset = (page - 1) * limite;

    // Construction de la requête de base
    let sqlBase  = `FROM incidents i
                    LEFT JOIN victimes v ON v.incident_id = i.id`;
    let params   = [];

    // Filtre optionnel par département
    let whereClause = '';
    if (departement) {
      whereClause = ' WHERE i.departement = ?';
      params.push(departement);
    }

    // Compter le total pour la pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total ${sqlBase} ${whereClause}`,
      params
    );

    // Requête principale avec pagination
    const [incidents] = await pool.execute(
      `SELECT 
         i.id, i.reference, i.date_heure,
         i.departement, i.district,
         i.gps_lat, i.gps_lng,
         i.statut, i.created_at,
         v.type_victime,
         v.prod_animale, v.prod_vegetale
       ${sqlBase}
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    );

    // Réponse avec métadonnées de pagination
    res.json({
      success: true,
      data: incidents,
      pagination: {
        page_actuelle : page,
        par_page      : limite,
        total_incidents: total,
        total_pages   : Math.ceil(total / limite)
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la liste des incidents :', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};


// ============================================================
//  RÉCUPÉRER UN INCIDENT PAR SON ID
//  Méthode HTTP : GET /api/incidents/:id
// ============================================================
const getIncident = async (req, res) => {
  try {
    // req.params.id = la valeur du segment :id dans l'URL
    // Exemple : GET /api/incidents/42 → req.params.id = "42"
    const incidentId = parseInt(req.params.id);

    if (isNaN(incidentId)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    // Récupérer l'incident
    const [[incident]] = await pool.execute(
      'SELECT * FROM incidents WHERE id = ?',
      [incidentId]
    );

    if (!incident) {
      // Code 404 = ressource non trouvée
      return res.status(404).json({
        success: false,
        message: `Aucun incident trouvé avec l'ID ${incidentId}`
      });
    }

    // Récupérer les victimes liées à cet incident
    const [victimes] = await pool.execute(
      'SELECT * FROM victimes WHERE incident_id = ?',
      [incidentId]
    );

    // Pour chaque victime, récupérer ses détails (individualité ou coopérative)
    for (const victime of victimes) {
      if (victime.type_victime === 'individualite') {
        const [individus] = await pool.execute(
          'SELECT * FROM individualites WHERE victime_id = ?',
          [victime.id]
        );
        victime.individualites = individus;
      } else {
        const [[coop]] = await pool.execute(
          'SELECT * FROM cooperatives WHERE victime_id = ?',
          [victime.id]
        );
        victime.cooperative = coop;
      }
    }

    // Récupérer les causes, natures et pièces jointes
    const [causes]  = await pool.execute(
      'SELECT * FROM causes_sinistre WHERE incident_id = ?',  [incidentId]);
    const [natures] = await pool.execute(
      'SELECT * FROM natures_sinistre WHERE incident_id = ?', [incidentId]);
    const [pieces]  = await pool.execute(
      'SELECT * FROM pieces_jointes WHERE incident_id = ?',   [incidentId]);

    // Assembler la réponse complète
    res.json({
      success: true,
      data: {
        ...incident,       // ...spread = décompose l'objet (copie toutes ses propriétés)
        victimes,
        causes,
        natures,
        pieces_jointes: pieces
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'incident :', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};


// ============================================================
//  METTRE À JOUR LE STATUT D'UN INCIDENT
//  Méthode HTTP : PATCH /api/incidents/:id/statut
// ============================================================
const mettreAJourStatut = async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id);
    const { statut } = req.body;

    // Statuts valides (doivent correspondre à l'ENUM MySQL)
    const statutsValides = ['brouillon', 'soumis', 'en_traitement', 'cloture'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(', ')}`
      });
    }

    const [result] = await pool.execute(
      'UPDATE incidents SET statut = ? WHERE id = ?',
      [statut, incidentId]
    );

    // affectedRows = nombre de lignes modifiées
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Incident non trouvé' });
    }

    res.json({ success: true, message: `Statut mis à jour : ${statut}` });

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour :', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};


// ============================================================
//  SUPPRIMER UN INCIDENT
//  Méthode HTTP : DELETE /api/incidents/:id
// ============================================================
const supprimerIncident = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const incidentId = parseInt(req.params.id);

    // Récupérer les pièces jointes AVANT de supprimer
    // pour pouvoir supprimer les fichiers physiques
    const [pieces] = await connection.execute(
      'SELECT chemin FROM pieces_jointes WHERE incident_id = ?',
      [incidentId]
    );

    // Supprimer l'incident (le CASCADE dans MySQL supprime automatiquement
    // les enregistrements liés dans les autres tables)
    const [result] = await connection.execute(
      'DELETE FROM incidents WHERE id = ?',
      [incidentId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Incident non trouvé' });
    }

    // Supprimer les fichiers physiques du serveur
    pieces.forEach(piece => {
      const cheminAbsolu = path.join(__dirname, '..', piece.chemin);
      fs.unlink(cheminAbsolu, err => {
        if (err) console.warn('Fichier déjà supprimé ou introuvable :', cheminAbsolu);
      });
    });

    await connection.commit();
    res.json({ success: true, message: 'Incident supprimé avec succès' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur lors de la suppression :', error.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};


// ── Exporter toutes les fonctions du controller ───────────────
// Elles seront importées et utilisées dans les routes
module.exports = {
  creerIncident,
  listerIncidents,
  getIncident,
  mettreAJourStatut,
  supprimerIncident
};
