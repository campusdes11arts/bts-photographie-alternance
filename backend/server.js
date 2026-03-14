require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const initDatabase    = require('./database/init');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// ── API ───────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/admin',      requireAuth('admin'),       require('./routes/admin'));
app.use('/api/etudiant',   requireAuth('etudiant'),    require('./routes/etudiant'));
app.use('/api/entreprise', requireAuth('entreprise'),  require('./routes/entreprise'));

// ── FRONTENDS ─────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');

app.use('/admin',      express.static(path.join(__dirname, 'dashboard')));
app.get('/admin/{*splat}', (req, res) =>
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));

app.use('/etudiant',   express.static(path.join(ROOT, 'app-etudiant')));
app.get('/etudiant/{*splat}', (req, res) =>
  res.sendFile(path.join(ROOT, 'app-etudiant', 'login.html')));

app.use('/entreprise', express.static(path.join(ROOT, 'app-entreprise')));
app.get('/entreprise/{*splat}', (req, res) =>
  res.sendFile(path.join(ROOT, 'app-entreprise', 'login.html')));

app.get('/', (req, res) => res.redirect('/admin'));

// ── ERREURS ───────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ── DÉMARRAGE ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ██████╗ ██╗  ██╗ ██████╗ ████████╗ ██████╗ ');
    console.log('  ██╔══██╗██║  ██║██╔═══██╗╚══██╔══╝██╔═══██╗');
    console.log('  ██████╔╝███████║██║   ██║   ██║   ██║   ██║');
    console.log('  ██╔═══╝ ██╔══██║██║   ██║   ██║   ██║   ██║');
    console.log('  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝');
    console.log('  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ');
    console.log('');
    console.log(`  ✅  Serveur     → http://localhost:${PORT}`);
    console.log(`  🔐  Admin       → http://localhost:${PORT}/admin`);
    console.log(`  🎓  Étudiants   → http://localhost:${PORT}/etudiant`);
    console.log(`  🏢  Entreprises → http://localhost:${PORT}/entreprise`);
    console.log('');
  });
}).catch(err => {
  console.error('❌ Impossible de se connecter à la base de données :', err.message);
  process.exit(1);
});
