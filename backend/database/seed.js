require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('./db');
const initDatabase = require('./init');

(async () => {
  await initDatabase();

  const email = 'admin@sup-photo.fr';
  const password = 'admin123';

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length) {
    console.log('  ℹ️  Compte admin déjà existant.');
    process.exit(0);
  }

  const hash = bcrypt.hashSync(password, 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
    [email, hash, 'admin']
  );

  console.log('  ✅ Compte admin créé :');
  console.log(`     Email        : ${email}`);
  console.log(`     Mot de passe : ${password}`);
  console.log('  ⚠️  Changez le mot de passe après la première connexion !');
  process.exit(0);
})();
