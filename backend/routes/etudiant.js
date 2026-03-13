const router = require('express').Router();
const pool   = require('../database/db');

// GET /api/etudiant/dossier
router.get('/dossier', async (req, res, next) => {
  try {
    const { rows: [etudiant] } = await pool.query('SELECT * FROM etudiants WHERE user_id = $1', [req.user.id]);
    if (!etudiant) return res.status(404).json({ error: 'Dossier introuvable' });

    const { rows: [dossier] } = await pool.query('SELECT * FROM dossiers WHERE etudiant_id = $1', [etudiant.id]);
    const { rows: visites }   = dossier
      ? await pool.query('SELECT * FROM visites WHERE dossier_id = $1 ORDER BY numero', [dossier.id])
      : { rows: [] };
    const { rows: [entreprise] } = etudiant.entreprise_id
      ? await pool.query('SELECT * FROM entreprises WHERE id = $1', [etudiant.entreprise_id])
      : { rows: [null] };

    res.json({ ...etudiant, dossier, visites, entreprise });
  } catch (e) { next(e); }
});

// PUT /api/etudiant/dossier/fdr
router.put('/dossier/fdr', async (req, res, next) => {
  try {
    const { rows: [etudiant] } = await pool.query('SELECT id FROM etudiants WHERE user_id = $1', [req.user.id]);
    if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });

    await pool.query(
      'UPDATE dossiers SET fdr_json = $1, updated_at = CURRENT_TIMESTAMP WHERE etudiant_id = $2',
      [JSON.stringify(req.body), etudiant.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/etudiant/dossier/visites
router.get('/dossier/visites', async (req, res, next) => {
  try {
    const { rows: [etudiant] } = await pool.query('SELECT id FROM etudiants WHERE user_id = $1', [req.user.id]);
    if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });
    const { rows: [dossier] } = await pool.query('SELECT id FROM dossiers WHERE etudiant_id = $1', [etudiant.id]);
    const { rows: visites }   = dossier
      ? await pool.query('SELECT * FROM visites WHERE dossier_id = $1 ORDER BY numero', [dossier.id])
      : { rows: [] };
    res.json(visites);
  } catch (e) { next(e); }
});

module.exports = router;
