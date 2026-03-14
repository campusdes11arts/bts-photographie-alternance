const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../database/db');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable' });

    // Les admins doivent toujours fournir un mot de passe
    if (user.role === 'admin') {
      if (!password || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
    }
    // Étudiants et entreprises : connexion par email seul

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth(), (req, res) => {
  res.json(req.user);
});

module.exports = router;
