const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../database/db');

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { rows: [{ total }]    } = await pool.query("SELECT COUNT(*) as total FROM dossiers");
    const { rows: [{ complets }] } = await pool.query("SELECT COUNT(*) as complets FROM dossiers WHERE statut = 'complet'");
    const { rows: [{ valides }]  } = await pool.query("SELECT COUNT(*) as valides FROM dossiers WHERE statut = 'valide'");
    const { rows: [{ visites }]  } = await pool.query("SELECT COUNT(*) as visites FROM visites WHERE statut = 'faite'");
    res.json({ total, complets, valides, visites });
  } catch (e) { next(e); }
});

// GET /api/admin/etudiants
router.get('/etudiants', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, u.email, ent.raison_sociale,
             d.id as dossier_id, d.statut, d.annee_promo, d.updated_at
      FROM etudiants e
      LEFT JOIN users u        ON u.id = e.user_id
      LEFT JOIN entreprises ent ON ent.id = e.entreprise_id
      LEFT JOIN dossiers d     ON d.etudiant_id = e.id
      ORDER BY e.nom, e.prenom
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/admin/etudiants
router.post('/etudiants', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, password, nom, prenom, annee_promo, ...rest } = req.body;
    if (!email || !nom || !prenom)
      return res.status(400).json({ error: 'email, nom, prenom requis' });

    await client.query('BEGIN');
    // Mot de passe optionnel — les étudiants se connectent par email seul
    const hash = bcrypt.hashSync(password || Math.random().toString(36), 10);

    const { rows: [u] } = await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [email.toLowerCase(), hash, 'etudiant']
    );
    const { rows: [e] } = await client.query(`
      INSERT INTO etudiants (user_id, nom, prenom, ddn, secu, adresse, tel, mail, statut_avant, type_contrat, date_debut, date_fin, salaire, entreprise_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id
    `, [u.id, nom, prenom,
        rest.ddn||null, rest.secu||null, rest.adresse||null, rest.tel||null,
        rest.mail||null, rest.statut_avant||null, rest.type_contrat||null,
        rest.date_debut||null, rest.date_fin||null, rest.salaire||null,
        rest.entreprise_id||null]);

    await client.query(
      'INSERT INTO dossiers (etudiant_id, annee_promo) VALUES ($1, $2)',
      [e.id, annee_promo || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true, id: e.id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    next(err);
  } finally { client.release(); }
});

// GET /api/admin/etudiants/:id
router.get('/etudiants/:id', async (req, res, next) => {
  try {
    const { rows: [etudiant] } = await pool.query(`
      SELECT e.*, u.email, ent.raison_sociale, ent.tuteur_nom, ent.tuteur_prenom,
             d.id as dossier_id, d.statut, d.annee_promo,
             d.fdr_json, d.cerfa_json, d.conformite_json, d.updated_at
      FROM etudiants e
      LEFT JOIN users u         ON u.id = e.user_id
      LEFT JOIN entreprises ent  ON ent.id = e.entreprise_id
      LEFT JOIN dossiers d       ON d.etudiant_id = e.id
      WHERE e.id = $1
    `, [req.params.id]);
    if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });

    const { rows: visites } = await pool.query(
      'SELECT * FROM visites WHERE dossier_id = $1 ORDER BY numero', [etudiant.dossier_id]
    );
    res.json({ ...etudiant, visites });
  } catch (e) { next(e); }
});

// PATCH /api/admin/etudiants/:id
router.patch('/etudiants/:id', async (req, res, next) => {
  try {
    const { statut, conformite_json, fdr_json, cerfa_json, entreprise_id } = req.body;

    // Lier/délier une entreprise à l'étudiant
    if (entreprise_id !== undefined) {
      await pool.query('UPDATE etudiants SET entreprise_id=$1 WHERE id=$2', [entreprise_id || null, req.params.id]);
    }

    const sets = [], vals = [];
    let i = 1;
    if (statut)          { sets.push(`statut=$${i++}`);          vals.push(statut); }
    if (conformite_json) { sets.push(`conformite_json=$${i++}`); vals.push(JSON.stringify(conformite_json)); }
    if (fdr_json)        { sets.push(`fdr_json=$${i++}`);        vals.push(JSON.stringify(fdr_json)); }
    if (cerfa_json)      { sets.push(`cerfa_json=$${i++}`);      vals.push(JSON.stringify(cerfa_json)); }
    if (sets.length) {
      sets.push('updated_at=CURRENT_TIMESTAMP');
      vals.push(req.params.id);
      await pool.query(`UPDATE dossiers SET ${sets.join(',')} WHERE etudiant_id=$${i}`, vals);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/admin/etudiants/:id
router.delete('/etudiants/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [e] } = await client.query('SELECT user_id FROM etudiants WHERE id = $1', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'Étudiant introuvable' });
    await client.query('DELETE FROM etudiants WHERE id = $1', [req.params.id]);
    if (e.user_id) await client.query('DELETE FROM users WHERE id = $1', [e.user_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); next(err);
  } finally { client.release(); }
});

// POST /api/admin/entreprises
router.post('/entreprises', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { email, password, raison_sociale, siret, adresse, tel, mail, tuteur_nom, tuteur_prenom, tuteur_fonction } = req.body;
    if (!email || !raison_sociale)
      return res.status(400).json({ error: 'email, raison_sociale requis' });

    await client.query('BEGIN');
    // Mot de passe optionnel — les entreprises se connectent par email seul
    const hash = bcrypt.hashSync(password || Math.random().toString(36), 10);
    const { rows: [u] } = await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id',
      [email.toLowerCase(), hash, 'entreprise']
    );
    const { rows: [ent] } = await client.query(`
      INSERT INTO entreprises (user_id, raison_sociale, siret, adresse, tel, mail, tuteur_nom, tuteur_prenom, tuteur_fonction)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [u.id, raison_sociale, siret||null, adresse||null, tel||null, mail||null, tuteur_nom||null, tuteur_prenom||null, tuteur_fonction||null]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, id: ent.id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    next(err);
  } finally { client.release(); }
});

// GET /api/admin/entreprises
router.get('/entreprises', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT ent.*, u.email FROM entreprises ent LEFT JOIN users u ON u.id = ent.user_id');
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /api/admin/entreprises/:id
router.patch('/entreprises/:id', async (req, res, next) => {
  try {
    const { raison_sociale, siret, adresse, tel, mail, tuteur_nom, tuteur_prenom, tuteur_fonction } = req.body;
    await pool.query(`
      UPDATE entreprises SET
        raison_sociale   = COALESCE($1, raison_sociale),
        siret            = COALESCE($2, siret),
        adresse          = COALESCE($3, adresse),
        tel              = COALESCE($4, tel),
        mail             = COALESCE($5, mail),
        tuteur_nom       = COALESCE($6, tuteur_nom),
        tuteur_prenom    = COALESCE($7, tuteur_prenom),
        tuteur_fonction  = COALESCE($8, tuteur_fonction)
      WHERE id = $9
    `, [raison_sociale||null, siret||null, adresse||null, tel||null, mail||null,
        tuteur_nom||null, tuteur_prenom||null, tuteur_fonction||null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/admin/entreprises/:id
router.delete('/entreprises/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ent] } = await client.query('SELECT user_id FROM entreprises WHERE id = $1', [req.params.id]);
    if (!ent) return res.status(404).json({ error: 'Entreprise introuvable' });
    // Délier les étudiants avant suppression
    await client.query('UPDATE etudiants SET entreprise_id = NULL WHERE entreprise_id = $1', [req.params.id]);
    await client.query('DELETE FROM entreprises WHERE id = $1', [req.params.id]);
    if (ent.user_id) await client.query('DELETE FROM users WHERE id = $1', [ent.user_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); next(err);
  } finally { client.release(); }
});

// PUT /api/admin/etudiants/:id/visites/:num
router.put('/etudiants/:id/visites/:num', async (req, res, next) => {
  try {
    const { rows: [dossier] } = await pool.query('SELECT id FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const { date_visite, compte_rendu, evaluations_json, statut } = req.body;
    const num = parseInt(req.params.num);
    const eval_str = JSON.stringify(evaluations_json || {});

    const { rows: [existing] } = await pool.query(
      'SELECT id FROM visites WHERE dossier_id = $1 AND numero = $2', [dossier.id, num]
    );
    if (existing) {
      await pool.query(
        'UPDATE visites SET date_visite=$1, compte_rendu=$2, evaluations_json=$3, statut=$4 WHERE id=$5',
        [date_visite, compte_rendu, eval_str, statut||'planifiee', existing.id]
      );
    } else {
      await pool.query(
        'INSERT INTO visites (dossier_id, numero, date_visite, compte_rendu, evaluations_json, statut) VALUES ($1,$2,$3,$4,$5,$6)',
        [dossier.id, num, date_visite, compte_rendu, eval_str, statut||'planifiee']
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/admin/etudiants/:id/signatures
router.get('/etudiants/:id/signatures', async (req, res, next) => {
  try {
    const { rows: [dossier] } = await pool.query('SELECT signatures_json FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    if (!dossier) return res.json({});
    let sigs = {};
    try { sigs = dossier.signatures_json ? JSON.parse(dossier.signatures_json) : {}; } catch (_) {}
    res.json(sigs);
  } catch (e) { next(e); }
});

// PUT /api/admin/etudiants/:id/signature-cfa
router.put('/etudiants/:id/signature-cfa', async (req, res, next) => {
  try {
    const { signature } = req.body;
    if (!signature) return res.status(400).json({ error: 'Signature manquante' });

    const { rows: [dossier] } = await pool.query('SELECT signatures_json FROM dossiers WHERE etudiant_id = $1', [req.params.id]);
    let existing = {};
    try { existing = (dossier && dossier.signatures_json) ? JSON.parse(dossier.signatures_json) : {}; } catch (_) {}

    const merged = { ...existing, cfa: signature, cfa_at: new Date().toISOString() };
    await pool.query(
      'UPDATE dossiers SET signatures_json=$1, updated_at=CURRENT_TIMESTAMP WHERE etudiant_id=$2',
      [JSON.stringify(merged), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
