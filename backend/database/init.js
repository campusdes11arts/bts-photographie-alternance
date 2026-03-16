const pool = require('./db');

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('admin','etudiant','entreprise')),
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entreprises (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      raison_sociale      TEXT NOT NULL,
      siret               TEXT,
      adresse             TEXT,
      tel                 TEXT,
      mail                TEXT,
      tuteur_nom          TEXT,
      tuteur_prenom       TEXT,
      tuteur_fonction     TEXT,
      score_conformite    INTEGER DEFAULT 0,
      verdict_conformite  TEXT
    );

    CREATE TABLE IF NOT EXISTS etudiants (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      nom           TEXT NOT NULL,
      prenom        TEXT NOT NULL,
      ddn           DATE,
      secu          TEXT,
      adresse       TEXT,
      tel           TEXT,
      mail          TEXT,
      statut_avant  TEXT,
      type_contrat  TEXT,
      date_debut    DATE,
      date_fin      DATE,
      salaire       REAL,
      entreprise_id INTEGER REFERENCES entreprises(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dossiers (
      id              SERIAL PRIMARY KEY,
      etudiant_id     INTEGER REFERENCES etudiants(id) ON DELETE CASCADE,
      entreprise_id   INTEGER REFERENCES entreprises(id) ON DELETE SET NULL,
      annee_promo     TEXT,
      fdr_json        TEXT DEFAULT '{}',
      cerfa_json      TEXT DEFAULT '{}',
      conformite_json TEXT DEFAULT '{}',
      signatures_json TEXT DEFAULT '{}',
      statut          TEXT DEFAULT 'en_cours' CHECK(statut IN ('en_cours','complet','valide')),
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visites (
      id               SERIAL PRIMARY KEY,
      dossier_id       INTEGER REFERENCES dossiers(id) ON DELETE CASCADE,
      numero           INTEGER NOT NULL CHECK(numero BETWEEN 1 AND 4),
      date_visite      DATE,
      compte_rendu     TEXT,
      evaluations_json TEXT DEFAULT '{}',
      statut           TEXT DEFAULT 'planifiee' CHECK(statut IN ('planifiee','faite'))
    );
  `);
  // Add signatures_json column if it doesn't exist (migration for existing databases)
  await pool.query(`
    ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS signatures_json TEXT DEFAULT '{}';
  `).catch(() => {});
  console.log('  ✅ Base de données initialisée');
}

module.exports = initDatabase;
