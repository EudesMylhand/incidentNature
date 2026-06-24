-- ============================================================
--  database.sql — SCHÉMA COMPLET DE LA BASE DE DONNÉES
--  -----------------------------------------------------------
--  Exécution : mysql -u root -p < database.sql
--  Ou copie-colle dans phpMyAdmin → onglet SQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS sosnaturedb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sosnaturedb;

-- ─────────────────────────────────────────────────────────────
-- TABLE USERS — Comptes utilisateurs et administrateurs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  nom             VARCHAR(100)    NOT NULL,
  prenoms         VARCHAR(150)    NOT NULL,
  telephone       VARCHAR(25)     NOT NULL UNIQUE,
  email           VARCHAR(180)    UNIQUE,
  password_hash   VARCHAR(255)    DEFAULT NULL,
  role            ENUM('user','admin') NOT NULL DEFAULT 'user',
  google_id       VARCHAR(100)    DEFAULT NULL UNIQUE,
  facebook_id     VARCHAR(100)    DEFAULT NULL UNIQUE,
  avatar_url      VARCHAR(500)    DEFAULT NULL,
  statut          ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login      TIMESTAMP       DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE INCIDENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  reference     VARCHAR(25)     NOT NULL UNIQUE,
  date_heure    DATETIME        NOT NULL,
  departement   VARCHAR(50)     NOT NULL,
  district      VARCHAR(100),
  gps_lat       DECIMAL(10,7),
  gps_lng       DECIMAL(10,7),
  description   TEXT,
  statut        ENUM('brouillon','soumis','en_traitement','cloture') DEFAULT 'soumis',
  user_id       INT UNSIGNED    DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE VICTIMES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS victimes (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  incident_id   INT UNSIGNED    NOT NULL,
  type_victime  ENUM('individualite','cooperative') NOT NULL,
  prod_animale  TINYINT(1)      DEFAULT 0,
  prod_vegetale TINYINT(1)      DEFAULT 0,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE INDIVIDUALITÉS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS individualites (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  victime_id    INT UNSIGNED    NOT NULL,
  nom           VARCHAR(200)    NOT NULL,
  telephone     VARCHAR(25),
  FOREIGN KEY (victime_id) REFERENCES victimes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE COOPÉRATIVES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cooperatives (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  victime_id      INT UNSIGNED  NOT NULL,
  nom             VARCHAR(200)  NOT NULL,
  numero_agrement VARCHAR(60)   UNIQUE,
  siege_social    TEXT,
  promoteur_nom   VARCHAR(200),
  promoteur_tel   VARCHAR(25),
  membres_masc    INT UNSIGNED  DEFAULT 0,
  membres_fem     INT UNSIGNED  DEFAULT 0,
  total_membres   INT UNSIGNED  GENERATED ALWAYS AS (membres_masc + membres_fem) STORED,
  FOREIGN KEY (victime_id) REFERENCES victimes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE CAUSES DU SINISTRE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS causes_sinistre (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  incident_id   INT UNSIGNED    NOT NULL,
  animal        VARCHAR(100)    NOT NULL,
  nombre        INT UNSIGNED    NOT NULL DEFAULT 1,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE NATURE DU SINISTRE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS natures_sinistre (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  incident_id   INT UNSIGNED    NOT NULL,
  type_nature   ENUM('humain','materiel','production_agricole') NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- TABLE PIÈCES JOINTES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pieces_jointes (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  incident_id   INT UNSIGNED    NOT NULL,
  nom_fichier   VARCHAR(255)    NOT NULL,
  chemin        VARCHAR(500)    NOT NULL,
  taille_octets INT UNSIGNED,
  type_mime     VARCHAR(80),
  uploaded_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- INDEX pour améliorer les performances
-- ─────────────────────────────────────────────────────────────
CREATE INDEX idx_users_telephone  ON users(telephone);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_incidents_dept   ON incidents(departement);
CREATE INDEX idx_incidents_date   ON incidents(date_heure);
CREATE INDEX idx_incidents_statut ON incidents(statut);
CREATE INDEX idx_incidents_user   ON incidents(user_id);

-- ─────────────────────────────────────────────────────────────
-- COMPTE ADMIN PAR DÉFAUT  |  mot de passe : Admin@2026
-- CHANGE CE MOT DE PASSE AVANT LA MISE EN PRODUCTION !
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO users (nom, prenoms, telephone, email, password_hash, role)
VALUES (
  'ADMIN',
  'ForêtGarde',
  '+242000000001',
  'admin@sosnature.cg',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh4.',
  'admin'
);
-- USE sosnaturedb;

-- -- Remet le mot de passe du compte admin par défaut
-- -- Nouveau mot de passe : Admin@2026
-- UPDATE users
-- SET password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh4.'
-- WHERE telephone = '+242000000001';

-- -- Vide les anciens hash (téléphone hashé) des autres comptes
-- -- Ces utilisateurs devront créer un nouveau mot de passe via l'inscription
-- UPDATE users
-- SET password_hash = NULL
-- WHERE telephone != '+242000000001';