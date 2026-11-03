# 🚀 SpeedTest Web (React + Python / Node.js)

Application web de test de vitesse de connexion réseau en temps réel (Mode 1 : Client direct ↔ Serveur).

---

## 📁 Architecture du projet

```text
testwifi/
├── backend/
│   ├── main.py           # Backend FastAPI (Python)
│   ├── requirements.txt  # Dépendances Python (fastapi, uvicorn)
│   ├── server.js         # Backend Express (Node.js prêt à l'emploi)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Interface React & moteur de mesure de vitesse
│   │   ├── index.css     # Design sombre moderne (Speedometer néon)
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
└── demarrer.bat          # Script de lancement en 1 clic
```

---

## ⚙️ Comment fonctionne la mesure (Mode 1) ?

1. **Ping & Gigue (Jitter)** :
   - Envoie 6 requêtes légères consécutives vers `/api/ping`.
   - Calcule le RTT moyen en millisecondes et la variation (gigue).
2. **Download (Téléchargement)** :
   - Reçoit un flux continu (ReadableStream) depuis `/api/download`.
   - Échantillonne les octets transférés toutes les 100 ms pour animer le compteur et la jauge en direct.
3. **Upload (Téléversement)** :
   - Émet un paquet de données en binaire vers `/api/upload` via `XMLHttpRequest.upload.onprogress`.
   - Calcule le débit montant en Mbps en temps réel.

---

## 🚀 Démarrage rapide

### Option 1 : Lancement en 1 clic (Recommandé)
Double-cliquez simplement sur le fichier **`demarrer.bat`** à la racine du projet.

---

### Option 2 : Lancement manuel via le terminal

#### 1. Démarrer le Backend
- **Avec Node.js (déjà configuré)** :
  ```bash
  cd backend
  node server.js
  ```
- **Avec Python (FastAPI)** *(dès que Python est installé)* :
  ```bash
  cd backend
  pip install -r requirements.txt
  python main.py
  ```
  Le serveur écoute sur `http://localhost:8000`.

#### 2. Démarrer le Frontend React
Ouvrez un autre terminal :
```bash
cd frontend
npm run dev
```
Ouvrez ensuite votre navigateur sur **`http://localhost:3000`**.

