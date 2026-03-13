const jwt  = require('jsonwebtoken');
const pool = require('../database/db');

function requireAuth(...roles) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [payload.id]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

module.exports = { requireAuth };
