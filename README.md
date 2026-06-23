# 🌿 ForêtGarde — Guide d'installation complet

Système de déclaration de sinistres agricoles du Congo-Brazzaville.

---

## 📁 Structure du projet

```
foretgarde-projet/
│
├── frontend/                       ← Pages HTML (ouvrir avec Live Server)
│   ├── foretgarde-auth.html        ← Portail connexion / inscription
│   └── rapport_incident.html       ← Formulaire de déclaration (protégé)
│
└── backend/                        ← Serveur Node.js (port 3000)
    ├── server.js                   ← Point d'entrée
    ├── database.sql                ← Schéma MySQL à exécuter une fois
    ├── package.json                ← Dépendances npm
    ├── .env.example                ← Modèle de configuration → copier en .env
    ├── config/
    │   ├── database.js             ← Pool de connexions MySQL
    │   └── passport.js             ← Stratégies OAuth Google + Facebook
    ├── middleware/
    │   ├── auth.js                 ← Vérification JWT + contrôle rôle admin
    │   ├── upload.js               ← Upload fichiers (Multer)
    │   └── validate.js             ← Validation des données
    ├── routes/
    │   ├── auth.js                 ← /api/auth/* + /auth/google + /auth/facebook
    │   └── incidents.js            ← /api/incidents/* (toutes protégées par JWT)
    ├── controllers/
    │   ├── authController.js       ← Logique login / register / OAuth / profil
    │   └── incidentController.js   ← CRUD incidents avec transactions MySQL
    └── uploads/                    ← Fichiers joints (créé automatiquement)
```

---

## 🚀 Installation étape par étape

### Prérequis
| Outil | Version | Lien |
|---|---|---|
| Node.js | 18+ LTS | https://nodejs.org |
| MySQL | 8.0+ | https://dev.mysql.com/downloads/ |
| VSCode + Live Server | — | https://code.visualstudio.com |

---

### Étape 1 — Créer la base de données

```bash
# Ouvre un terminal et connecte-toi à MySQL
mysql -u root -p

# Dans le terminal MySQL, exécute le schéma complet
source /chemin/vers/foretgarde-projet/backend/database.sql

# Vérifie que les tables sont créées
USE foretgarde;
SHOW TABLES;
# → doit afficher : users, incidents, victimes, individualites,
#                   cooperatives, causes_sinistre, natures_sinistre, pieces_jointes

# Quitte MySQL
exit
```

---

### Étape 2 — Configurer le backend

```bash
cd foretgarde-projet/backend

# Copie le fichier de configuration
cp .env.example .env

# Ouvre .env avec un éditeur et remplis ces valeurs OBLIGATOIRES :
#   DB_PASSWORD=ton_mot_de_passe_mysql
#   JWT_SECRET=une_chaine_longue_et_aleatoire
#   ADMIN_SECRET_CODE=ton_code_admin_secret
```

Pour générer un JWT_SECRET sécurisé, exécute dans le terminal :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Étape 3 — Installer les dépendances Node.js

```bash
cd foretgarde-projet/backend
npm install
```
> ⏳ Prend 1-2 minutes. Crée un dossier `node_modules/`.

---

### Étape 4 — Démarrer le serveur backend

```bash
npm run dev
```

Tu dois voir :
```
✅ Connexion MySQL établie avec succès !
╔════════════════════════════════════════════════╗
║       🌿  Serveur ForêtGarde démarré           ║
╠════════════════════════════════════════════════╣
║  Local    :  http://localhost:3000              ║
║  Auth     :  http://localhost:3000/api/auth     ║
║  Incidents:  http://localhost:3000/api/incidents║
╚════════════════════════════════════════════════╝
```

---

### Étape 5 — Ouvrir le frontend

1. Ouvre le dossier `foretgarde-projet/frontend/` dans VSCode
2. Clic droit sur `foretgarde-auth.html` → **"Open with Live Server"**
3. Le navigateur s'ouvre sur `http://127.0.0.1:5500/foretgarde-auth.html`

---

## 🔐 Flux d'authentification complet

```
┌─────────────────────────────────────────────────────┐
│              PORTAIL foretgarde-auth.html           │
│                                                     │
│  [Connexion]  Nom + Téléphone → POST /api/auth/login│
│  [Inscription] Nom+Prénoms+Tél+Email → POST /register│
│  [Google]  → GET /auth/google → Google → callback  │
│  [Facebook] → GET /auth/facebook → FB → callback   │
└───────────────────────┬─────────────────────────────┘
                        │ Token JWT sauvegardé dans
                        │ localStorage (fg_token)
                        ↓
┌─────────────────────────────────────────────────────┐
│          FORMULAIRE rapport_incident.html           │
│                                                     │
│  Au chargement : vérifie fg_token via GET /api/auth/me│
│  Si invalide → redirige vers foretgarde-auth.html   │
│  Si valide → affiche la topbar + le formulaire      │
│                                                     │
│  Soumission → POST /api/incidents                   │
│               Header: Authorization: Bearer <token> │
└─────────────────────────────────────────────────────┘
```

---

## 👤 Compte admin par défaut (pour les premiers tests)

| Champ | Valeur |
|---|---|
| Nom | ADMIN |
| Téléphone | +242000000001 |
| Rôle | admin |

> Ce compte est créé par le `database.sql`. Change le mot de passe en production !

---

## 🌐 Endpoints de l'API REST

### Authentification (pas de JWT requis)
| Méthode | URL | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Créer un compte |
| `POST` | `/api/auth/login` | Se connecter |
| `GET` | `/auth/google` | Connexion via Google |
| `GET` | `/auth/facebook` | Connexion via Facebook |

### Authentification (JWT requis)
| Méthode | URL | Description |
|---|---|---|
| `GET` | `/api/auth/me` | Mon profil |
| `POST` | `/api/auth/logout` | Se déconnecter |

### Incidents (JWT requis pour tous)
| Méthode | URL | Rôle requis | Description |
|---|---|---|---|
| `POST` | `/api/incidents` | user / admin | Créer un incident |
| `GET` | `/api/incidents` | user / admin | Lister les incidents |
| `GET` | `/api/incidents/:id` | user / admin | Détail d'un incident |
| `PATCH` | `/api/incidents/:id/statut` | **admin** | Changer le statut |
| `DELETE` | `/api/incidents/:id` | **admin** | Supprimer |

---

## ⚙️ Configuration OAuth Google et Facebook (optionnel)

### Google
1. Va sur https://console.cloud.google.com
2. Crée un projet → **APIs & Services** → **Identifiants**
3. Crée des identifiants **OAuth 2.0** (type: Application Web)
4. URI de redirection autorisée : `http://localhost:3000/auth/google/callback`
5. Copie `Client ID` et `Client Secret` dans ton `.env`

### Facebook
1. Va sur https://developers.facebook.com
2. Crée une App → **Connexion Facebook** → **Paramètres**
3. URI de redirection : `http://localhost:3000/auth/facebook/callback`
4. Copie `App ID` et `App Secret` dans ton `.env`

---

## ❓ Problèmes fréquents

| Erreur | Cause | Solution |
|---|---|---|
| `ECONNREFUSED 3306` | MySQL éteint | `sudo service mysql start` |
| `Access denied for user` | Mauvais mot de passe | Vérifie `DB_PASSWORD` dans `.env` |
| `Table 'foretgarde.users' doesn't exist` | BDD non créée | Exécute `database.sql` dans MySQL |
| `401 Unauthorized` sur les incidents | Token manquant | Vérifie que `fg_token` est dans localStorage |
| `CORS error` | Mauvais `FRONTEND_URL` | Mets `http://127.0.0.1:5500` dans `.env` |
| Port 3000 déjà utilisé | Autre serveur | Change `PORT=3001` dans `.env` |
