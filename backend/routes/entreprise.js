const router = require('express').Router();
const pool   = require('../database/db');

// GET /api/entreprise/profil
router.get('/profil', async (req, res, next) => {
  try {
    const { rows: [entreprise] } = await pool.query('SELECT * FROM entreprises WHERE user_id = $1', [req.user.id]);
    if (!entreprise) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(entreprise);
  } catch (e) { next(e); }
});

// PUT /api/entreprise/profil
router.put('/profil', async (req, res, next) => {
  try {
    const { raison_sociale, siret, adresse, tel, mail, tuteur_nom, tuteur_prenom, tuteur_fonction } = req.body;
    await pool.query(`
      UPDATE entreprises SET raison_sociale=$1, siret=$2, adresse=$3, tel=$4, mail=$5,
      tuteur_nom=$6, tuteur_prenom=$7, tuteur_fonction=$8 WHERE user_id=$9
    `, [raison_sociale, siret, adresse, tel, mail, tuteur_nom, tuteur_prenom, tuteur_fonction, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/entreprise/alternants
router.get('/alternants', async (req, res, next) => {
  try {
    const { rows: [entreprise] } = await pool.query('SELECT id FROM entreprises WHERE user_id = $1', [req.user.id]);
    if (!entreprise) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { rows } = await pool.query(`
      SELECT e.id, e.nom, e.prenom, e.mail, e.type_contrat, e.date_debut, e.date_fin,
             d.id as dossier_id, d.statut, d.annee_promo, ent.score_conformite
      FROM etudiants e
      LEFT JOIN dossiers d      ON d.etudiant_id = e.id
      LEFT JOIN entreprises ent ON ent.id = e.entreprise_id
      WHERE e.entreprise_id = $1
      ORDER BY e.nom
    `, [entreprise.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// PUT /api/entreprise/conformite
router.put('/conformite', async (req, res, next) => {
  try {
    const { score_conformite, verdict_conformite } = req.body;
    await pool.query(
      'UPDATE entreprises SET score_conformite=$1, verdict_conformite=$2 WHERE user_id=$3',
      [score_conformite, verdict_conformite, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Helpers pour vérifier qu'un alternant appartient à cette entreprise ─────
async function getEntrepriseId(userId) {
  const { rows: [ent] } = await pool.query('SELECT id FROM entreprises WHERE user_id = $1', [userId]);
  return ent ? ent.id : null;
}
async function checkAlternant(entrepriseId, alternantId) {
  const { rows: [e] } = await pool.query(
    'SELECT id FROM etudiants WHERE id = $1 AND entreprise_id = $2', [alternantId, entrepriseId]
  );
  return !!e;
}

// GET /api/entreprise/alternants/:id/dossier
router.get('/alternants/:id/dossier', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    const { rows: [e] } = await pool.query(
      `SELECT e.id, e.nom, e.prenom, e.mail, e.tel,
              d.fdr_json, d.cerfa_json, d.statut, d.signatures_json
       FROM etudiants e LEFT JOIN dossiers d ON d.etudiant_id = e.id
       WHERE e.id = $1`, [req.params.id]
    );
    if (!e) return res.status(404).json({ error: 'Alternant introuvable' });

    // Injecter nom/prénom dans le fdr_json pour que le CERFA les reçoive
    let fdr = {};
    try { fdr = e.fdr_json ? JSON.parse(e.fdr_json) : {}; } catch (_) {}
    if (!fdr.altNom)    fdr.altNom    = (e.nom    || '').toUpperCase();
    if (!fdr.altPrenom) fdr.altPrenom = e.prenom  || '';
    if (!fdr.altMail)   fdr.altMail   = e.mail    || '';
    if (!fdr.altTel)    fdr.altTel    = e.tel     || '';

    res.json({ ...e, fdr_json: JSON.stringify(fdr) });
  } catch (e) { next(e); }
});

// PUT /api/entreprise/alternants/:id/fdr  — MERGE (ne pas écraser les champs étudiant)
router.put('/alternants/:id/fdr', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    const { rows: [dossier] } = await pool.query('SELECT fdr_json FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    let existing = {};
    try { existing = (dossier && dossier.fdr_json) ? JSON.parse(dossier.fdr_json) : {}; } catch (_) {}

    const merged = { ...existing, ...req.body };
    await pool.query(
      'UPDATE dossiers SET fdr_json=$1, updated_at=CURRENT_TIMESTAMP WHERE etudiant_id=$2',
      [JSON.stringify(merged), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PUT /api/entreprise/alternants/:id/cerfa
router.put('/alternants/:id/cerfa', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    await pool.query(
      'UPDATE dossiers SET cerfa_json=$1, updated_at=CURRENT_TIMESTAMP WHERE etudiant_id=$2',
      [JSON.stringify(req.body), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PUT /api/entreprise/alternants/:id/signature-employeur
router.put('/alternants/:id/signature-employeur', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    const { signature } = req.body;
    if (!signature) return res.status(400).json({ error: 'Signature manquante' });

    const { rows: [dossier] } = await pool.query('SELECT signatures_json FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    let existing = {};
    try { existing = (dossier && dossier.signatures_json) ? JSON.parse(dossier.signatures_json) : {}; } catch (_) {}

    const merged = { ...existing, employeur: signature, employeur_at: new Date().toISOString() };
    await pool.query(
      'UPDATE dossiers SET signatures_json=$1, updated_at=CURRENT_TIMESTAMP WHERE etudiant_id=$2',
      [JSON.stringify(merged), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/entreprise/alternants/:id/visites
router.get('/alternants/:id/visites', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    const { rows: [dossier] } = await pool.query('SELECT id FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    if (!dossier) return res.json([]);
    const { rows: visites } = await pool.query('SELECT * FROM visites WHERE dossier_id = $1 ORDER BY numero', [dossier.id]);
    res.json(visites);
  } catch (e) { next(e); }
});

// PUT /api/entreprise/alternants/:id/visites/:num
router.put('/alternants/:id/visites/:num', async (req, res, next) => {
  try {
    const entId = await getEntrepriseId(req.user.id);
    if (!entId) return res.status(404).json({ error: 'Entreprise introuvable' });
    if (!await checkAlternant(entId, req.params.id)) return res.status(403).json({ error: 'Accès refusé' });

    const { rows: [dossier] } = await pool.query('SELECT id FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const { date_visite, compte_rendu, statut } = req.body;
    const num = parseInt(req.params.num);
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM visites WHERE dossier_id = $1 AND numero = $2', [dossier.id, num]
    );
    if (existing) {
      await pool.query(
        'UPDATE visites SET date_visite=$1, compte_rendu=$2, statut=$3 WHERE id=$4',
        [date_visite || null, compte_rendu || null, statut || 'planifiee', existing.id]
      );
    } else {
      await pool.query(
        'INSERT INTO visites (dossier_id, numero, date_visite, compte_rendu, statut) VALUES ($1,$2,$3,$4,$5)',
        [dossier.id, num, date_visite || null, compte_rendu || null, statut || 'planifiee']
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
