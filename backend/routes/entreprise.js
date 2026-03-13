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
      SELECT e.nom, e.prenom, e.mail, e.type_contrat, e.date_debut, e.date_fin,
             d.statut, d.annee_promo, ent.score_conformite
      FROM etudiants e
      LEFT JOIN dossiers d    ON d.etudiant_id = e.id
      LEFT JOIN entreprises ent ON ent.id = e.entreprise_id
      WHERE e.entreprise_id = $1
      ORDER BY e.nom
    `, [entreprise.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
