// ============================================================
//  controllers/incidentController.js — CRUD Incidents
//  Compatible stockage local (dev) ET Cloudinary (prod)
// ============================================================
const { pool } = require('../config/database');
const path     = require('path');
const fs       = require('fs');

// ── Détecte le chemin/URL du fichier selon le mode actif ──────
// En mode Cloudinary : file.path est déjà l'URL complète (https://res.cloudinary.com/...)
// En mode local       : file.path est un chemin disque, on le convertit en /uploads/xxx
function cheminFichier(file) {
  if (file.path && file.path.startsWith('http')) {
    // Mode Cloudinary — l'URL est directement utilisable
    return file.path;
  }
  // Mode local — chemin relatif servi par express.static
  return `/uploads/${file.filename}`;
}

// ── CRÉER UN INCIDENT ─────────────────────────────────────────
const creerIncident = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      reference, date_heure, departement, district, gps_lat, gps_lng, description,
      type_victime, individNom, individTel,
      coopNom, coopAgreement, coopSiege, coopPromoteur, coopTel, coopMasc, coopFem,
      production, causeAnimal, causeNombre, natureSinistre
    } = req.body;

    // 1. Incident principal
    const [incidentResult] = await connection.execute(
      `INSERT INTO incidents (reference,date_heure,departement,district,gps_lat,gps_lng,description,user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [reference, date_heure, departement, district||null, gps_lat||null, gps_lng||null, description||null, req.user?.id||null]
    );
    const incidentId = incidentResult.insertId;

    // 2. Victime
    const prodArray    = Array.isArray(production) ? production : (production ? [production] : []);
    const prodAnimale  = prodArray.includes('animale')  ? 1 : 0;
    const prodVegetale = prodArray.includes('vegetale') ? 1 : 0;

    const [victimeResult] = await connection.execute(
      'INSERT INTO victimes (incident_id,type_victime,prod_animale,prod_vegetale) VALUES (?,?,?,?)',
      [incidentId, type_victime, prodAnimale, prodVegetale]
    );
    const victimeId = victimeResult.insertId;

    // 3. Individualités
    if (type_victime === 'individualite' && individNom) {
      const noms = Array.isArray(individNom) ? individNom : [individNom];
      const tels = Array.isArray(individTel) ? individTel : [individTel];
      for (let i = 0; i < noms.length; i++) {
        if (noms[i]?.trim()) {
          await connection.execute(
            'INSERT INTO individualites (victime_id,nom,telephone) VALUES (?,?,?)',
            [victimeId, noms[i].trim(), tels[i]||null]
          );
        }
      }
    }

    // 4. Coopérative
    if (type_victime === 'cooperative' && coopNom) {
      const masc = parseInt(coopMasc)||0;
      const fem  = parseInt(coopFem) ||0;
      await connection.execute(
        `INSERT INTO cooperatives (victime_id,nom,numero_agrement,siege_social,promoteur_nom,promoteur_tel,membres_masc,membres_fem)
         VALUES (?,?,?,?,?,?,?,?)`,
        [victimeId, coopNom, coopAgreement||null, coopSiege||null, coopPromoteur||null, coopTel||null, masc, fem]
      );
    }

    // 5. Causes
    if (causeAnimal) {
      const animaux = Array.isArray(causeAnimal) ? causeAnimal : [causeAnimal];
      const nombres = Array.isArray(causeNombre) ? causeNombre : [causeNombre];
      for (let i = 0; i < animaux.length; i++) {
        if (animaux[i]) {
          await connection.execute(
            'INSERT INTO causes_sinistre (incident_id,animal,nombre) VALUES (?,?,?)',
            [incidentId, animaux[i], parseInt(nombres[i])||1]
          );
        }
      }
    }

    // 6. Natures
    if (natureSinistre) {
      const natures = Array.isArray(natureSinistre) ? natureSinistre : [natureSinistre];
      const vals    = natures.map(()=>'(?,?)').join(',');
      const params  = natures.flatMap(n=>[incidentId, n]);
      await connection.execute(`INSERT INTO natures_sinistre (incident_id,type_nature) VALUES ${vals}`, params);
    }

    // 7. Pièces jointes — compatible Cloudinary (URL) et local (chemin disque)
    if (req.files?.length > 0) {
      for (const file of req.files) {
        await connection.execute(
          'INSERT INTO pieces_jointes (incident_id,nom_fichier,chemin,taille_octets,type_mime) VALUES (?,?,?,?,?)',
          [incidentId, file.originalname, cheminFichier(file), file.size, file.mimetype]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Incident enregistré avec succès',
      data   : { id: incidentId, reference }
    });

  } catch (error) {
    await connection.rollback();
    // Nettoyage des fichiers locaux uniquement (Cloudinary gère son propre stockage)
    if (req.files?.length > 0) {
      req.files.forEach(f => {
        if (f.path && !f.path.startsWith('http')) fs.unlink(f.path, ()=>{});
      });
    }
    console.error('❌ Erreur création incident :', error.message);
    res.status(500).json({ success:false, message:'Erreur serveur.', error: process.env.NODE_ENV==='development'?error.message:undefined });
  } finally {
    connection.release();
  }
};

// ── LISTER LES INCIDENTS ──────────────────────────────────────
const listerIncidents = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)   || 1;
    const limite = parseInt(req.query.limite) || 10;
    const dept   = req.query.departement      || null;
    const offset = (page - 1) * limite;

    let where  = '';
    let params = [];
    if (dept) { where = 'WHERE i.departement=?'; params.push(dept); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM incidents i ${where}`, params
    );
    const [incidents] = await pool.execute(
      `SELECT i.id,i.reference,i.date_heure,i.departement,i.district,i.gps_lat,i.gps_lng,i.statut,i.created_at,
              v.type_victime, u.nom AS user_nom, u.prenoms AS user_prenoms
       FROM incidents i
       LEFT JOIN victimes v ON v.incident_id=i.id
       LEFT JOIN users    u ON u.id=i.user_id
       ${where}
       ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    );

    res.json({ success:true, data:incidents, pagination:{ page, par_page:limite, total, total_pages:Math.ceil(total/limite) } });
  } catch (error) {
    console.error('❌ Liste incidents :', error.message);
    res.status(500).json({ success:false, message:'Erreur serveur.' });
  }
};

// ── DÉTAIL D'UN INCIDENT ──────────────────────────────────────
const getIncident = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success:false, message:'ID invalide.' });

    const [[incident]] = await pool.execute('SELECT * FROM incidents WHERE id=?', [id]);
    if (!incident) return res.status(404).json({ success:false, message:'Incident introuvable.' });

    const [victimes] = await pool.execute('SELECT * FROM victimes WHERE incident_id=?', [id]);
    for (const v of victimes) {
      if (v.type_victime === 'individualite') {
        [v.individualites] = await pool.execute('SELECT * FROM individualites WHERE victime_id=?', [v.id]);
      } else {
        [[v.cooperative]] = await pool.execute('SELECT * FROM cooperatives WHERE victime_id=?', [v.id]);
      }
    }

    const [causes]  = await pool.execute('SELECT * FROM causes_sinistre WHERE incident_id=?',  [id]);
    const [natures] = await pool.execute('SELECT * FROM natures_sinistre WHERE incident_id=?', [id]);
    const [pieces]  = await pool.execute('SELECT * FROM pieces_jointes WHERE incident_id=?',   [id]);

    res.json({ success:true, data:{ ...incident, victimes, causes, natures, pieces_jointes:pieces } });
  } catch (error) {
    console.error('❌ Détail incident :', error.message);
    res.status(500).json({ success:false, message:'Erreur serveur.' });
  }
};

// ── METTRE À JOUR LE STATUT ───────────────────────────────────
const mettreAJourStatut = async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const { statut } = req.body;
    const valides = ['brouillon','soumis','en_traitement','cloture'];
    if (!valides.includes(statut)) return res.status(400).json({ success:false, message:'Statut invalide.' });

    const [result] = await pool.execute('UPDATE incidents SET statut=? WHERE id=?', [statut, id]);
    if (result.affectedRows === 0) return res.status(404).json({ success:false, message:'Incident introuvable.' });
    res.json({ success:true, message:`Statut mis à jour : ${statut}` });
  } catch (error) {
    res.status(500).json({ success:false, message:'Erreur serveur.' });
  }
};

// ── SUPPRIMER ─────────────────────────────────────────────────
// Note : en mode Cloudinary, ce code ne supprime pas le fichier
// distant (nécessiterait l'API Admin Cloudinary). Les fichiers
// resteront sur Cloudinary mais ne seront plus liés à un incident.
const supprimerIncident = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = parseInt(req.params.id);

    const [pieces] = await connection.execute('SELECT chemin FROM pieces_jointes WHERE incident_id=?', [id]);
    const [result] = await connection.execute('DELETE FROM incidents WHERE id=?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success:false, message:'Incident introuvable.' });
    }

    // Supprime uniquement les fichiers stockés localement
    pieces.forEach(p => {
      if (!p.chemin.startsWith('http')) {
        fs.unlink(path.join(__dirname,'..', p.chemin), ()=>{});
      }
    });

    await connection.commit();
    res.json({ success:true, message:'Incident supprimé avec succès.' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success:false, message:'Erreur serveur.' });
  } finally {
    connection.release();
  }
};

module.exports = { creerIncident, listerIncidents, getIncident, mettreAJourStatut, supprimerIncident };
