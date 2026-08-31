```javascript
// ============================================================
// MES EXPOSÉS — SCRIPT COMPLET
// Firebase Auth + Firestore
// Version renforcée : session, cache, hors-ligne, reconnexion
// ============================================================


// ------------------------------------------------------------
// 1. CONFIGURATION FIREBASE
// ------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyAWWOZWN77qf9myxODhGBwTKo5xr7opeOc",
  authDomain: "exposersite-27529.firebaseapp.com",
  projectId: "exposersite-27529",
  storageBucket: "exposersite-27529.firebasestorage.app",
  messagingSenderId: "1092127185821",
  appId: "1:1092127185821:web:a3f12532571edf795a6d74"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();


// ------------------------------------------------------------
// 2. ELEMENTS HTML
// ------------------------------------------------------------

const loginScreen = document.getElementById("login-screen");
const signupScreen = document.getElementById("signup-screen");
const studentScreen = document.getElementById("student-screen");
const loadingOverlay = document.getElementById("loading-overlay");


// ------------------------------------------------------------
// 3. VARIABLES
// ------------------------------------------------------------

let pendingFile = null;
let editingId = null;
let lastExposesCache = [];
let firebaseReady = false;
let currentUserUid = null;

const FIRESTORE_TIMEOUT = 10000;


// ------------------------------------------------------------
// 4. UTILITAIRES
// ------------------------------------------------------------

function showScreen(screen) {
  [loginScreen, signupScreen, studentScreen].forEach(s => {
    if (s) s.classList.add("hidden");
  });

  if (screen) {
    screen.classList.remove("hidden");
  }
}

function showLoading(on, text = "Chargement...") {
  if (!loadingOverlay) return;

  loadingOverlay.textContent = text;
  loadingOverlay.classList.toggle("hidden", !on);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ------------------------------------------------------------
// 5. TIMEOUT POUR EVITER LE CHARGEMENT INFINI
// ------------------------------------------------------------

function withTimeout(promise, timeout = FIRESTORE_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(
          "Firebase met trop de temps à répondre."
        );
        error.code = "app/timeout";
        reject(error);
      }, timeout);
    })
  ]);
}


// ------------------------------------------------------------
// 6. SECURISATION AFFICHAGE HTML
// ------------------------------------------------------------

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ------------------------------------------------------------
// 7. EMAIL FABRIQUE A PARTIR DU PSEUDO
// ------------------------------------------------------------

function emailFromUsername(username) {
  return (
    username
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "")
    + "@mesexposes-app.fake"
  );
}


// ------------------------------------------------------------
// 8. CACHE LOCAL
// ------------------------------------------------------------

function cacheKey(uid) {
  return "mes-exposes-cache-" + uid;
}

function saveLocalUserData(uid, data) {
  if (!uid || !data) return;

  try {
    localStorage.setItem(
      cacheKey(uid),
      JSON.stringify(data)
    );
  } catch (err) {
    console.warn("Impossible de sauvegarder le cache local :", err);
  }
}

function getLocalUserData(uid) {
  if (!uid) return null;

  try {
    const raw = localStorage.getItem(cacheKey(uid));

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (err) {
    console.warn("Cache local invalide :", err);
    return null;
  }
}


// ------------------------------------------------------------
// 9. FIREBASE : PERSISTANCE AUTH
// ------------------------------------------------------------

async function configureFirebase() {
  try {
    await auth.setPersistence(
      firebase.auth.Auth.Persistence.LOCAL
    );

    console.log("Firebase Auth : persistance LOCAL activée.");
  } catch (err) {
    console.warn(
      "Impossible d'activer la persistance Auth :",
      err
    );
  }

  // Firestore hors-ligne.
  try {
    await db.enablePersistence({
      synchronizeTabs: true
    });

    console.log("Firestore : cache hors-ligne activé.");
  } catch (err) {
    // Plusieurs onglets peuvent empêcher la persistence.
    // Ce n'est pas bloquant.
    if (err.code === "failed-precondition") {
      console.warn(
        "Firestore : plusieurs onglets ouverts, cache multi-onglets indisponible."
      );
    } else if (err.code === "unimplemented") {
      console.warn(
        "Firestore : cache hors-ligne non supporté par ce navigateur."
      );
    } else {
      console.warn(
        "Firestore persistence :",
        err
      );
    }
  }

  firebaseReady = true;
}


// ------------------------------------------------------------
// 10. RECONNEXION FIRESTORE
// ------------------------------------------------------------

async function reconnectFirebase() {
  if (!navigator.onLine) {
    return false;
  }

  try {
    await db.enableNetwork();
    console.log("Firebase : connexion réseau activée.");
    return true;
  } catch (err) {
    console.warn(
      "Firebase : impossible de réactiver le réseau.",
      err
    );

    return false;
  }
}


// ------------------------------------------------------------
// 11. DETECTION INTERNET
// ------------------------------------------------------------

window.addEventListener("online", async () => {
  console.log("Internet revenu.");

  await reconnectFirebase();

  if (auth.currentUser) {
    try {
      const data = await getUserData(auth.currentUser.uid);

      if (data) {
        applyUserData(data);
      }
    } catch (err) {
      console.warn(
        "Impossible de resynchroniser les données.",
        err
      );
    }
  }
});

window.addEventListener("offline", () => {
  console.log("Navigateur hors-ligne.");

  // On ne déconnecte surtout PAS l'utilisateur.
});


// ------------------------------------------------------------
// 12. NAVIGATION CONNEXION / INSCRIPTION
// ------------------------------------------------------------

document.getElementById("show-signup").addEventListener("click", e => {
  e.preventDefault();

  document.getElementById("login-error").textContent = "";

  showScreen(signupScreen);
});

document.getElementById("show-login").addEventListener("click", e => {
  e.preventDefault();

  document.getElementById("signup-error").textContent = "";

  showScreen(loginScreen);
});


// ------------------------------------------------------------
// 13. CREATION DE COMPTE
// ------------------------------------------------------------

document.getElementById("signup-form").addEventListener(
  "submit",
  async e => {
    e.preventDefault();

    const username = document
      .getElementById("signup-username")
      .value
      .trim();

    const password = document
      .getElementById("signup-password")
      .value;

    const errorEl = document.getElementById("signup-error");

    errorEl.textContent = "";

    if (!username || !password) {
      errorEl.textContent =
        "Remplis le pseudo et le mot de passe.";
      return;
    }

    if (username.length < 3) {
      errorEl.textContent =
        "Le pseudo doit faire au moins 3 caractères.";
      return;
    }

    if (password.length < 6) {
      errorEl.textContent =
        "Le mot de passe doit faire 6 caractères minimum.";
      return;
    }

    if (!navigator.onLine) {
      errorEl.textContent =
        "Tu es actuellement hors connexion. Connecte-toi à Internet pour créer ton compte.";
      return;
    }

    showLoading(true, "Création du compte...");

    try {
      await auth.setPersistence(
        firebase.auth.Auth.Persistence.LOCAL
      );

      const email = emailFromUsername(username);

      const cred =
        await withTimeout(
          auth.createUserWithEmailAndPassword(
            email,
            password
          )
        );

      const userData = {
        username: username,
        profile: {
          firstname: "",
          lastname: "",
          classe: ""
        },
        exposes: []
      };

      await withTimeout(
        db
          .collection("users")
          .doc(cred.user.uid)
          .set(userData)
      );

      saveLocalUserData(
        cred.user.uid,
        userData
      );

      console.log("Compte créé.");

      showLoading(false);

      // onAuthStateChanged ouvrira automatiquement le dashboard

    } catch (err) {
      console.error("Erreur inscription :", err);

      showLoading(false);

      if (err.code === "auth/email-already-in-use") {
        errorEl.textContent =
          "Ce pseudo est déjà pris.";
      } else if (err.code === "auth/invalid-email") {
        errorEl.textContent =
          "Ce pseudo n'est pas valide.";
      } else if (err.code === "app/timeout") {
        errorEl.textContent =
          "Firebase met trop de temps à répondre. Vérifie ta connexion.";
      } else {
        errorEl.textContent =
          "Erreur : " +
          (err.message || "Impossible de créer le compte.");
      }
    }
  }
);


// ------------------------------------------------------------
// 14. CONNEXION
// ------------------------------------------------------------

document.getElementById("login-form").addEventListener(
  "submit",
  async e => {
    e.preventDefault();

    const username = document
      .getElementById("login-username")
      .value
      .trim();

    const password = document
      .getElementById("login-password")
      .value;

    const errorEl = document.getElementById("login-error");

    errorEl.textContent = "";

    if (!username || !password) {
      errorEl.textContent =
        "Entre ton pseudo et ton mot de passe.";
      return;
    }

    if (!navigator.onLine) {
      errorEl.textContent =
        "Tu es hors connexion. Une première connexion nécessite Internet.";
      return;
    }

    showLoading(true, "Connexion...");

    try {
      await auth.setPersistence(
        firebase.auth.Auth.Persistence.LOCAL
      );

      await withTimeout(
        auth.signInWithEmailAndPassword(
          emailFromUsername(username),
          password
        )
      );

      console.log("Connexion réussie.");

      // onAuthStateChanged s'occupe du dashboard

    } catch (err) {
      console.error("Erreur connexion :", err);

      showLoading(false);

      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        errorEl.textContent =
          "Pseudo ou mot de passe incorrect.";
      } else if (err.code === "auth/too-many-requests") {
        errorEl.textContent =
          "Trop de tentatives. Réessaie dans quelques instants.";
      } else if (err.code === "app/timeout") {
        errorEl.textContent =
          "Firebase ne répond pas. Vérifie ta connexion Internet.";
      } else {
        errorEl.textContent =
          "Erreur Firebase : " +
          (err.message || "Connexion impossible.");
      }
    }
  }
);


// ------------------------------------------------------------
// 15. DECONNEXION
// ------------------------------------------------------------

document
  .getElementById("logout-btn")
  .addEventListener("click", async () => {

    try {
      await auth.signOut();

      currentUserUid = null;
      lastExposesCache = [];
      pendingFile = null;
      editingId = null;

      showLoading(false);
      showScreen(loginScreen);

    } catch (err) {
      console.error(
        "Erreur de déconnexion :",
        err
      );
    }
  });


// ------------------------------------------------------------
// 16. CHARGEMENT DONNEES UTILISATEUR
// ------------------------------------------------------------

async function getUserData(uid) {
  if (!uid) return null;

  // Toujours essayer le serveur si Internet est disponible.
  if (navigator.onLine) {
    try {
      await reconnectFirebase();

      const doc = await withTimeout(
        db
          .collection("users")
          .doc(uid)
          .get()
      );

      if (doc.exists) {
        const data = doc.data();

        saveLocalUserData(uid, data);

        return data;
      }
    } catch (err) {
      console.warn(
        "Impossible de récupérer Firebase. Utilisation du cache.",
        err
      );
    }
  }

  // Si le serveur ne répond pas : cache local.
  const cached = getLocalUserData(uid);

  if (cached) {
    console.log(
      "Données récupérées depuis le cache local."
    );

    return cached;
  }

  // Dernière tentative depuis le cache Firestore.
  try {
    const doc = await withTimeout(
      db
        .collection("users")
        .doc(uid)
        .get({
          source: "cache"
        }),
      3000
    );

    if (doc.exists) {
      const data = doc.data();

      saveLocalUserData(uid, data);

      return data;
    }
  } catch (err) {
    console.warn(
      "Aucune donnée locale Firestore disponible.",
      err
    );
  }

  return null;
}


// ------------------------------------------------------------
// 17. APPLICATION DES DONNEES SUR LE DASHBOARD
// ------------------------------------------------------------

function applyUserData(data) {
  const safeData = data || {};

  const username =
    safeData.username || "Élève";

  const profile =
    safeData.profile || {};

  const exposes =
    Array.isArray(safeData.exposes)
      ? safeData.exposes
      : [];

  document.getElementById(
    "welcome-name"
  ).textContent = username;

  document.getElementById(
    "profile-username"
  ).value = username;

  document.getElementById(
    "profile-firstname"
  ).value = profile.firstname || "";

  document.getElementById(
    "profile-lastname"
  ).value = profile.lastname || "";

  document.getElementById(
    "profile-class"
  ).value = profile.classe || "";

  updateIdentityBadge(profile);

  applyStoredTheme();

  lastExposesCache = exposes;

  renderExposes(exposes);
}


// ------------------------------------------------------------
// 18. AUTH STATE
// ------------------------------------------------------------

auth.onAuthStateChanged(async user => {

  console.log(
    "Auth state :",
    user ? user.email : "déconnecté"
  );

  if (!user) {
    currentUserUid = null;

    showLoading(false);
    showScreen(loginScreen);

    return;
  }

  currentUserUid = user.uid;

  // IMPORTANT :
  // on affiche le dashboard immédiatement.
  // Cela évite de rester bloqué sur "Chargement".
  showScreen(studentScreen);

  showLoading(true, "Chargement de ton espace...");

  try {

    const data = await getUserData(user.uid);

    if (data) {
      applyUserData(data);
    } else {
      // Même si Firestore ne répond pas,
      // on laisse l'utilisateur entrer.
      applyUserData({
        username: "Élève",
        profile: {
          firstname: "",
          lastname: "",
          classe: ""
        },
        exposes: []
      });

      console.warn(
        "Profil Firebase indisponible."
      );
    }

  } catch (err) {

    console.error(
      "Erreur chargement utilisateur :",
      err
    );

    // Surtout :
    // NE PAS déconnecter l'utilisateur.
    const cached = getLocalUserData(user.uid);

    if (cached) {
      applyUserData(cached);
    }

  } finally {

    showLoading(false);

  }
});


// ------------------------------------------------------------
// 19. BADGE IDENTITE
// ------------------------------------------------------------

function updateIdentityBadge(profile) {

  const name = [
    profile.firstname,
    profile.lastname
  ]
    .filter(Boolean)
    .join(" ");

  document.getElementById(
    "identity-name"
  ).textContent =
    name || "Ton prénom Nom";

  document.getElementById(
    "identity-class"
  ).textContent =
    profile.classe || "Classe";
}


// ------------------------------------------------------------
// 20. MENU
// ------------------------------------------------------------

document
  .querySelectorAll(".menu-item")
  .forEach(btn => {

    btn.addEventListener("click", () => {

      document
        .querySelectorAll(".menu-item")
        .forEach(b =>
          b.classList.remove("active")
        );

      btn.classList.add("active");

      document
        .querySelectorAll(".tab-panel")
        .forEach(p =>
          p.classList.add("hidden")
        );

      const target =
        document.getElementById(
          "tab-" + btn.dataset.tab
        );

      if (target) {
        target.classList.remove("hidden");
      }
    });

  });


// ------------------------------------------------------------
// 21. MODE SOMBRE
// ------------------------------------------------------------

const themeBtn =
  document.getElementById("theme-toggle");

themeBtn.addEventListener("click", () => {

  document.body.classList.toggle("dark");

  const isDark =
    document.body.classList.contains("dark");

  localStorage.setItem(
    "exposes-theme",
    isDark ? "dark" : "light"
  );

  themeBtn.textContent =
    isDark
      ? "☀️ Mode clair"
      : "🌙 Mode sombre";
});

function applyStoredTheme() {

  const isDark =
    localStorage.getItem(
      "exposes-theme"
    ) === "dark";

  document.body.classList.toggle(
    "dark",
    isDark
  );

  themeBtn.textContent =
    isDark
      ? "☀️ Mode clair"
      : "🌙 Mode sombre";
}


// ------------------------------------------------------------
// 22. FICHIERS
// ------------------------------------------------------------

const fileInput =
  document.getElementById("expose-file");

const fileDropLabel =
  document.getElementById("file-drop-label");

const fileDropText =
  document.getElementById("file-drop-text");


function handleFile(file) {

  if (!file) return;

  // Limite actuelle conservée.
  if (file.size > 700 * 1024) {

    alert(
      "Ce fichier est trop lourd (maximum environ 700 Ko)."
    );

    return;
  }

  const reader =
    new FileReader();

  reader.onload = () => {

    pendingFile = {
      name: file.name,
      type: file.type || "application/octet-stream",
      data: reader.result
    };

    fileDropText.textContent =
      "✅ " + file.name;

    fileDropLabel.classList.add(
      "has-file"
    );
  };

  reader.onerror = () => {

    alert(
      "Impossible de lire ce fichier."
    );
  };

  reader.readAsDataURL(file);
}


fileInput.addEventListener(
  "change",
  () => {
    handleFile(
      fileInput.files[0]
    );
  }
);


fileDropLabel.addEventListener(
  "dragover",
  e => {
    e.preventDefault();

    fileDropLabel.classList.add(
      "dragover"
    );
  }
);


fileDropLabel.addEventListener(
  "dragleave",
  () => {
    fileDropLabel.classList.remove(
      "dragover"
    );
  }
);


fileDropLabel.addEventListener(
  "drop",
  e => {

    e.preventDefault();

    fileDropLabel.classList.remove(
      "dragover"
    );

    handleFile(
      e.dataTransfer.files[0]
    );
  }
);


// ------------------------------------------------------------
// 23. RESET FORMULAIRE EXPOSE
// ------------------------------------------------------------

function resetExposeForm() {

  document
    .getElementById("expose-form")
    .reset();

  document
    .getElementById("expose-id")
    .value = "";

  pendingFile = null;
  editingId = null;

  fileDropText.textContent =
    "📎 Joindre une photo ou un fichier (ou glisse-le ici)";

  fileDropLabel.classList.remove(
    "has-file"
  );

  document
    .getElementById("expose-submit-btn")
    .textContent =
    "Ajouter l'exposé";

  document
    .getElementById("expose-cancel-btn")
    .classList.add("hidden");
}


document
  .getElementById("expose-cancel-btn")
  .addEventListener(
    "click",
    resetExposeForm
  );


// ------------------------------------------------------------
// 24. RECUPERER LES EXPOSES
// ------------------------------------------------------------

async function getExposesFromServer() {

  const user = auth.currentUser;

  if (!user) {
    return [];
  }

  const data =
    await getUserData(user.uid);

  if (!data) {
    return lastExposesCache || [];
  }

  const exposes =
    Array.isArray(data.exposes)
      ? data.exposes
      : [];

  lastExposesCache = exposes;

  return exposes;
}


// ------------------------------------------------------------
// 25. SAUVEGARDER LES EXPOSES
// ------------------------------------------------------------

async function saveExposesToServer(exposes) {

  const user =
    auth.currentUser;

  if (!user) {
    alert(
      "Tu n'es plus connecté à ton compte."
    );

    return false;
  }

  const uid = user.uid;

  const dataToSave = {
    exposes: exposes
  };

  // Mise à jour immédiate du cache.
  const currentData =
    getLocalUserData(uid) || {};

  saveLocalUserData(uid, {
    ...currentData,
    ...dataToSave
  });

  lastExposesCache = exposes;

  try {

    if (navigator.onLine) {
      await reconnectFirebase();
    }

    // set + merge est plus robuste que update.
    await withTimeout(
      db
        .collection("users")
        .doc(uid)
        .set(
          dataToSave,
          { merge: true }
        )
    );

    console.log(
      "Exposés sauvegardés sur Firebase."
    );

    return true;

  } catch (err) {

    console.error(
      "Erreur sauvegarde Firebase :",
      err
    );

    // Les données restent dans le cache local.
    // On ne bloque donc plus complètement l'utilisateur.

    if (
      err.code === "app/timeout" ||
      err.code === "unavailable" ||
      err.code === "failed-precondition"
    ) {

      alert(
        "Firebase ne répond pas actuellement.\n\n" +
        "Ton exposé a été conservé localement et Firebase pourra le synchroniser lorsque la connexion reviendra."
      );

      return true;
    }

    alert(
      "Erreur d'enregistrement : " +
      (err.message || "Erreur Firebase.")
    );

    return false;
  }
}


// ------------------------------------------------------------
// 26. AJOUT / MODIFICATION EXPOSE
// ------------------------------------------------------------

document
  .getElementById("expose-form")
  .addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      const title =
        document
          .getElementById("expose-title")
          .value
          .trim();

      const subject =
        document
          .getElementById("expose-subject")
          .value
          .trim();

      const description =
        document
          .getElementById("expose-description")
          .value
          .trim();

      const due =
        document
          .getElementById("expose-due")
          .value;

      const status =
        document
          .getElementById("expose-status")
          .value;

      if (!title) {

        alert(
          "Entre un titre pour ton exposé."
        );

        return;
      }

      if (!auth.currentUser) {

        alert(
          "Tu dois être connecté."
        );

        return;
      }

      showLoading(
        true,
        editingId
          ? "Modification..."
          : "Enregistrement..."
      );

      try {

        const exposes =
          await getExposesFromServer();

        if (editingId) {

          const item =
            exposes.find(
              x => Number(x.id) === Number(editingId)
            );

          if (!item) {

            showLoading(false);

            alert(
              "Impossible de retrouver cet exposé."
            );

            return;
          }

          Object.assign(
            item,
            {
              title,
              subject,
              description,
              due,
              status
            }
          );

          if (pendingFile) {
            item.file = pendingFile;
          }

        } else {

          exposes.push({
            id: Date.now(),
            title,
            subject,
            description,
            due,
            status,
            file: pendingFile
          });
        }

        const ok =
          await saveExposesToServer(
            exposes
          );

        if (!ok) {
          showLoading(false);
          return;
        }

        resetExposeForm();

        renderExposes(
          exposes
        );

        showLoading(false);

      } catch (err) {

        console.error(
          "Erreur exposé :",
          err
        );

        showLoading(false);

        alert(
          "Impossible d'enregistrer l'exposé.\n\n" +
          (err.message || "")
        );
      }
    }
  );


// ------------------------------------------------------------
// 27. MODIFIER UN EXPOSE
// ------------------------------------------------------------

async function startEdit(id) {

  try {

    const exposes =
      await getExposesFromServer();

    const item =
      exposes.find(
        x => Number(x.id) === Number(id)
      );

    if (!item) {
      alert(
        "Exposé introuvable."
      );
      return;
    }

    editingId = Number(id);

    document
      .getElementById("expose-id")
      .value = id;

    document
      .getElementById("expose-title")
      .value =
      item.title || "";

    document
      .getElementById("expose-subject")
      .value =
      item.subject || "";

    document
      .getElementById("expose-description")
      .value =
      item.description || "";

    document
      .getElementById("expose-due")
      .value =
      item.due || "";

    document
      .getElementById("expose-status")
      .value =
      item.status || "En cours";

    document
      .getElementById("expose-submit-btn")
      .textContent =
      "Enregistrer les modifications";

    document
      .getElementById("expose-cancel-btn")
      .classList.remove("hidden");

    // Important :
    // on ne met PAS l'ancien fichier dans pendingFile.
    // Il sera conservé automatiquement si aucun nouveau fichier
    // n'est choisi.

    if (item.file) {

      fileDropText.textContent =
        "✅ " +
        item.file.name +
        " (conservé si tu ne changes pas de fichier)";

      fileDropLabel.classList.add(
        "has-file"
      );
    }

    document
      .getElementById("expose-title")
      .scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

  } catch (err) {

    console.error(
      "Erreur modification :",
      err
    );

    alert(
      "Impossible d'ouvrir cet exposé."
    );
  }
}


// ------------------------------------------------------------
// 28. STATUT
// ------------------------------------------------------------

function statusClass(status) {

  if (status === "Prêt") {
    return "status-pret";
  }

  if (status === "Rendu") {
    return "status-rendu";
  }

  return "status-en-cours";
}


// ------------------------------------------------------------
// 29. DATE DE RENDU
// ------------------------------------------------------------

function dueInfo(due) {

  if (!due) return "";

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const dueDate =
    new Date(due + "T00:00:00");

  const diffDays =
    Math.round(
      (
        dueDate - today
      ) /
      (1000 * 60 * 60 * 24)
    );

  if (diffDays < 0) {

    return `
      <div class="due-info due-late">
        ⏰ En retard (${escapeHtml(due)})
      </div>
    `;
  }

  if (diffDays === 0) {

    return `
      <div class="due-info due-soon">
        ⏰ À rendre aujourd'hui !
      </div>
    `;
  }

  if (diffDays <= 3) {

    return `
      <div class="due-info due-soon">
        ⏰ Dans ${diffDays} jour(s) (${escapeHtml(due)})
      </div>
    `;
  }

  return `
    <div class="due-info due-ok">
      📅 Rendu prévu le ${escapeHtml(due)}
    </div>
  `;
}


// ------------------------------------------------------------
// 30. FILTRE MATIERES
// ------------------------------------------------------------

function updateSubjectFilter(exposes) {

  const select =
    document.getElementById(
      "filter-subject"
    );

  const current =
    select.value;

  const subjects =
    [
      ...new Set(
        exposes
          .map(e => e.subject)
          .filter(Boolean)
      )
    ];

  select.innerHTML =
    '<option value="">Toutes les matières</option>' +
    subjects
      .map(
        s =>
          `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`
      )
      .join("");

  select.value =
    subjects.includes(current)
      ? current
      : "";
}


// ------------------------------------------------------------
// 31. AFFICHER LES EXPOSES
// ------------------------------------------------------------

function renderExposes(exposes) {

  if (!Array.isArray(exposes)) {
    exposes = [];
  }

  lastExposesCache =
    exposes;

  const list =
    document.getElementById(
      "exposes-list"
    );

  document.getElementById(
    "stat-count"
  ).textContent =
    exposes.length;

  document.getElementById(
    "stat-done"
  ).textContent =
    exposes.filter(
      e => e.status === "Rendu"
    ).length;

  renderBadges(
    exposes.length
  );

  updateSubjectFilter(
    exposes
  );

  const searchTerm =
    document
      .getElementById("search-input")
      .value
      .trim()
      .toLowerCase();

  const subjectFilter =
    document
      .getElementById("filter-subject")
      .value;

  const filtered =
    exposes.filter(exp => {

      const title =
        String(
          exp.title || ""
        ).toLowerCase();

      const subject =
        exp.subject || "";

      const matchesSearch =
        !searchTerm ||
        title.includes(searchTerm);

      const matchesSubject =
        !subjectFilter ||
        subject === subjectFilter;

      return (
        matchesSearch &&
        matchesSubject
      );
    });

  if (filtered.length === 0) {

    list.innerHTML =
      `<p class="empty-msg">
        ${
          exposes.length === 0
            ? "Tu n'as encore ajouté aucun exposé."
            : "Aucun exposé ne correspond."
        }
      </p>`;

    return;
  }

  list.innerHTML = "";

  filtered.forEach(exp => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "expose-item";

    let attachmentHtml = "";

    if (exp.file && exp.file.data) {

      const safeName =
        escapeHtml(
          exp.file.name || "fichier"
        );

      const safeData =
        String(
          exp.file.data
        );

      if (
        exp.file.type &&
        exp.file.type.startsWith("image/")
      ) {

        attachmentHtml = `
          <a
            class="attachment"
            href="${safeData}"
            download="${safeName}"
          >
            <img
              src="${safeData}"
              alt="${safeName}"
            >
          </a>
        `;

      } else {

        attachmentHtml = `
          <a
            class="attachment"
            href="${safeData}"
            download="${safeName}"
          >
            📄 ${safeName}
          </a>
        `;
      }
    }

    item.innerHTML = `
      <div>

        ${
          exp.subject
            ? `
              <span class="subject">
                ${escapeHtml(exp.subject)}
              </span>
            `
            : ""
        }

        <span
          class="status-pill ${statusClass(exp.status)}"
        >
          ${escapeHtml(
            exp.status || "En cours"
          )}
        </span>

        <h4>
          ${escapeHtml(
            exp.title || "Sans titre"
          )}
        </h4>

        <p>
          ${escapeHtml(
            exp.description || ""
          )}
        </p>

        ${dueInfo(exp.due)}

        ${attachmentHtml}

      </div>

      <div class="item-actions">

        <button
          class="edit-btn"
          data-id="${Number(exp.id)}"
          title="Modifier"
        >
          ✏️
        </button>

        <button
          class="delete-btn"
          data-id="${Number(exp.id)}"
          title="Supprimer"
        >
          🗑️
        </button>

      </div>
    `;

    list.appendChild(item);
  });


  // Boutons modifier
  list
    .querySelectorAll(".edit-btn")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {
          startEdit(
            Number(btn.dataset.id)
          );
        }
      );

    });


  // Boutons supprimer
  list
    .querySelectorAll(".delete-btn")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        async () => {

          const confirmed =
            confirm(
              "Supprimer cet exposé ?"
            );

          if (!confirmed) {
            return;
          }

          showLoading(
            true,
            "Suppression..."
          );

          try {

            const exposes =
              await getExposesFromServer();

            const updated =
              exposes.filter(
                exp =>
                  Number(exp.id) !==
                  Number(btn.dataset.id)
              );

            const ok =
              await saveExposesToServer(
                updated
              );

            if (ok) {

              renderExposes(
                updated
              );
            }

          } catch (err) {

            console.error(
              "Erreur suppression :",
              err
            );

            alert(
              "Impossible de supprimer cet exposé."
            );

          } finally {

            showLoading(false);

          }
        }
      );

    });
}


// ------------------------------------------------------------
// 32. RECHERCHE
// ------------------------------------------------------------

document
  .getElementById("search-input")
  .addEventListener(
    "input",
    () => {
      renderExposes(
        lastExposesCache
      );
    }
  );


document
  .getElementById("filter-subject")
  .addEventListener(
    "change",
    () => {
      renderExposes(
        lastExposesCache
      );
    }
  );


// ------------------------------------------------------------
// 33. BADGES
// ------------------------------------------------------------

const BADGE_DEFS = [

  {
    count: 1,
    label: "🥉 Premier exposé"
  },

  {
    count: 5,
    label: "🥈 5 exposés"
  },

  {
    count: 10,
    label: "🥇 10 exposés"
  },

  {
    count: 20,
    label: "🏆 Champion des exposés"
  }

];


function renderBadges(count) {

  document.getElementById(
    "badges-list"
  ).innerHTML =
    BADGE_DEFS
      .map(
        badge => `
          <span
            class="badge ${
              count >= badge.count
                ? "unlocked"
                : ""
            }"
          >
            ${badge.label}
          </span>
        `
      )
      .join("");
}


// ------------------------------------------------------------
// 34. PROFIL
// ------------------------------------------------------------

document
  .getElementById("save-profile-btn")
  .addEventListener(
    "click",
    async () => {

      const newUsername =
        document
          .getElementById(
            "profile-username"
          )
          .value
          .trim();

      const newPassword =
        document
          .getElementById(
            "profile-password"
          )
          .value;

      const currentPassword =
        document
          .getElementById(
            "profile-current-password"
          )
          .value;

      const firstname =
        document
          .getElementById(
            "profile-firstname"
          )
          .value
          .trim();

      const lastname =
        document
          .getElementById(
            "profile-lastname"
          )
          .value
          .trim();

      const classe =
        document
          .getElementById(
            "profile-class"
          )
          .value
          .trim();

      const errorEl =
        document.getElementById(
          "profile-error"
        );

      const successEl =
        document.getElementById(
          "profile-success"
        );

      errorEl.textContent = "";
      successEl.textContent = "";

      if (!newUsername) {

        errorEl.textContent =
          "Le pseudo ne peut pas être vide.";

        return;
      }

      if (!currentPassword) {

        errorEl.textContent =
          "Entre ton mot de passe actuel pour confirmer.";

        return;
      }

      const user =
        auth.currentUser;

      if (!user) {

        errorEl.textContent =
          "Tu n'es plus connecté.";

        return;
      }

      showLoading(
        true,
        "Mise à jour du profil..."
      );

      try {

        // Re-authentification.
        const cred =
          firebase.auth.EmailAuthProvider.credential(
            user.email,
            currentPassword
          );

        await withTimeout(
          user.reauthenticateWithCredential(
            cred
          )
        );


        const doc =
          await withTimeout(
            db
              .collection("users")
              .doc(user.uid)
              .get()
          );

        const data =
          doc.exists
            ? doc.data()
            : {};

        const currentUsername =
          data.username || "";


        // Changement du pseudo.
        if (
          newUsername !==
          currentUsername
        ) {

          if (!navigator.onLine) {

            errorEl.textContent =
              "Une connexion Internet est nécessaire pour changer le pseudo.";

            showLoading(false);

            return;
          }

          await withTimeout(
            user.updateEmail(
              emailFromUsername(
                newUsername
              )
            )
          );
        }


        // Changement mot de passe.
        if (newPassword) {

          if (
            newPassword.length < 6
          ) {

            errorEl.textContent =
              "Le nouveau mot de passe doit faire 6 caractères minimum.";

            showLoading(false);

            return;
          }

          await withTimeout(
            user.updatePassword(
              newPassword
            )
          );
        }


        const profile = {
          firstname,
          lastname,
          classe
        };


        const newData = {
          ...data,
          username: newUsername,
          profile
        };


        // Cache immédiat.
        saveLocalUserData(
          user.uid,
          newData
        );


        // Firebase.
        await withTimeout(
          db
            .collection("users")
            .doc(user.uid)
            .set(
              {
                username: newUsername,
                profile
              },
              {
                merge: true
              }
            )
        );


        document.getElementById(
          "welcome-name"
        ).textContent =
          newUsername;

        document.getElementById(
          "profile-password"
        ).value = "";

        document.getElementById(
          "profile-current-password"
        ).value = "";

        updateIdentityBadge(
          profile
        );

        successEl.textContent =
          "Profil mis à jour !";

      } catch (err) {

        console.error(
          "Erreur profil :",
          err
        );

        if (
          err.code ===
          "auth/wrong-password"
        ) {

          errorEl.textContent =
            "Mot de passe actuel incorrect.";

        } else if (
          err.code ===
          "auth/invalid-credential"
        ) {

          errorEl.textContent =
            "Mot de passe actuel incorrect.";

        } else if (
          err.code ===
          "auth/email-already-in-use"
        ) {

          errorEl.textContent =
            "Ce pseudo est déjà pris.";

        } else if (
          err.code ===
          "app/timeout"
        ) {

          errorEl.textContent =
            "Firebase ne répond pas. Vérifie ta connexion Internet.";

        } else {

          errorEl.textContent =
            "Erreur : " +
            (
              err.message ||
              "Impossible de mettre à jour le profil."
            );
        }

      } finally {

        showLoading(false);

      }
    }
  );


// ------------------------------------------------------------
// 35. INITIALISATION FINALE
// ------------------------------------------------------------

(async function initApp() {

  console.log(
    "Initialisation de Mes Exposés..."
  );

  try {

    await configureFirebase();

    console.log(
      "Firebase initialisé correctement."
    );

  } catch (err) {

    console.error(
      "Erreur initialisation Firebase :",
      err
    );

    firebaseReady = false;

  }

})();
```
