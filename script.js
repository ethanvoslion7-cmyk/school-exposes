// ============================================================
// MES EXPOSÉS 2026
// SCRIPT COMPLET - VERSION CORRIGÉE
// Firebase Auth + Firestore
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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();


// ------------------------------------------------------------
// 2. ÉLÉMENTS HTML
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
let authListenerStarted = false;
let currentUserUid = null;


// ------------------------------------------------------------
// 4. OUTILS GÉNÉRAUX
// ------------------------------------------------------------

function showScreen(screen) {
  [loginScreen, signupScreen, studentScreen].forEach(element => {
    if (element) {
      element.classList.add("hidden");
    }
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


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getErrorMessage(error) {
  if (!error) {
    return "Une erreur inconnue est survenue.";
  }

  switch (error.code) {
    case "auth/user-not-found":
      return "Pseudo ou mot de passe incorrect.";

    case "auth/wrong-password":
      return "Pseudo ou mot de passe incorrect.";

    case "auth/invalid-login-credentials":
      return "Pseudo ou mot de passe incorrect.";

    case "auth/email-already-in-use":
      return "Ce pseudo est déjà pris.";

    case "auth/invalid-email":
      return "Ce pseudo n'est pas valide.";

    case "auth/weak-password":
      return "Le mot de passe doit faire au moins 6 caractères.";

    case "auth/operation-not-allowed":
      return "La connexion par e-mail/mot de passe est désactivée dans Firebase.";

    case "auth/network-request-failed":
      return "Firebase n'arrive pas à se connecter à Internet.";

    case "auth/too-many-requests":
      return "Trop de tentatives. Attends un peu avant de réessayer.";

    case "permission-denied":
      return "Firebase refuse l'accès à ces données. Vérifie les règles Firestore.";

    case "unavailable":
      return "Firebase est temporairement indisponible.";

    case "failed-precondition":
      return "Firebase n'est pas correctement configuré.";

    case "deadline-exceeded":
      return "Firebase met trop de temps à répondre.";

    default:
      return error.message || "Une erreur est survenue.";
  }
}


function isNetworkError(error) {
  if (!error) return false;

  const code = error.code || "";

  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "failed-precondition" ||
    code === "auth/network-request-failed" ||
    code === "network-request-failed"
  );
}


// ------------------------------------------------------------
// 5. TIMEOUT POUR ÉVITER LE CHARGEMENT INFINI
// ------------------------------------------------------------

function withTimeout(promise, milliseconds = 12000) {
  return Promise.race([
    promise,

    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(
          "Firebase met trop de temps à répondre."
        );

        error.code = "deadline-exceeded";
        reject(error);
      }, milliseconds);
    })
  ]);
}


// ------------------------------------------------------------
// 6. EMAIL FABRIQUÉ À PARTIR DU PSEUDO
// ------------------------------------------------------------

function emailFromUsername(username) {
  const cleaned = String(username || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

  return cleaned + "@mesexposes-app.fake";
}


// ------------------------------------------------------------
// 7. VALIDATION DU PSEUDO
// ------------------------------------------------------------

function isValidUsername(username) {
  if (!username) return false;

  if (username.length < 2) return false;

  if (username.length > 30) return false;

  return /^[a-zA-Z0-9_-]+$/.test(username);
}


// ------------------------------------------------------------
// 8. FIREBASE : ACTIVER LA CONNEXION
// ------------------------------------------------------------

async function activateFirebaseNetwork() {
  try {
    await db.enableNetwork();
  } catch (error) {
    // Si Firebase est déjà connecté, cette erreur n'est pas grave.
    console.warn("Activation réseau Firebase :", error);
  }
}


// ------------------------------------------------------------
// 9. FIREBASE : LECTURE AVEC RETRY
// ------------------------------------------------------------

async function getUserDocument(uid) {
  if (!uid) {
    throw new Error("Utilisateur Firebase introuvable.");
  }

  const reference = db.collection("users").doc(uid);

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await activateFirebaseNetwork();

      const snapshot = await withTimeout(
        reference.get(),
        10000
      );

      return snapshot;
    } catch (error) {
      lastError = error;

      console.warn(
        `Lecture Firebase échouée (tentative ${attempt}/3)`,
        error
      );

      if (attempt < 3) {
        await sleep(800 * attempt);
      }
    }
  }

  // Dernière tentative avec le cache local.
  try {
    const cachedSnapshot = await reference.get({
      source: "cache"
    });

    return cachedSnapshot;
  } catch (cacheError) {
    console.warn("Cache Firebase indisponible :", cacheError);
  }

  throw lastError || new Error("Impossible de contacter Firebase.");
}


// ------------------------------------------------------------
// 10. FIREBASE : SAUVEGARDE AVEC RETRY
// ------------------------------------------------------------

async function updateUserDocument(uid, data) {
  if (!uid) {
    throw new Error("Utilisateur Firebase introuvable.");
  }

  const reference = db.collection("users").doc(uid);

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await activateFirebaseNetwork();

      await withTimeout(
        reference.update(data),
        12000
      );

      return true;
    } catch (error) {
      lastError = error;

      console.warn(
        `Sauvegarde Firebase échouée (tentative ${attempt}/3)`,
        error
      );

      if (attempt < 3) {
        await sleep(900 * attempt);
      }
    }
  }

  throw lastError || new Error("Impossible d'enregistrer les données.");
}


// ------------------------------------------------------------
// 11. FIREBASE : CRÉATION DU PROFIL
// ------------------------------------------------------------

async function createUserDocument(uid, username) {
  const reference = db.collection("users").doc(uid);

  await withTimeout(
    reference.set({
      username: username,
      profile: {
        firstname: "",
        lastname: "",
        classe: ""
      },
      exposes: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }),
    12000
  );
}


// ------------------------------------------------------------
// 12. NAVIGATION CONNEXION / INSCRIPTION
// ------------------------------------------------------------

document.getElementById("show-signup").addEventListener("click", event => {
  event.preventDefault();

  document.getElementById("login-error").textContent = "";

  showScreen(signupScreen);
});


document.getElementById("show-login").addEventListener("click", event => {
  event.preventDefault();

  document.getElementById("signup-error").textContent = "";

  showScreen(loginScreen);
});


// ------------------------------------------------------------
// 13. INSCRIPTION
// ------------------------------------------------------------

document.getElementById("signup-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const username = document
      .getElementById("signup-username")
      .value
      .trim();

    const password = document
      .getElementById("signup-password")
      .value;

    const errorElement = document.getElementById("signup-error");

    errorElement.textContent = "";

    if (!isValidUsername(username)) {
      errorElement.textContent =
        "Le pseudo doit contenir 2 à 30 caractères : lettres, chiffres, _ ou -.";

      return;
    }

    if (!password) {
      errorElement.textContent =
        "Remplis ton mot de passe.";

      return;
    }

    if (password.length < 6) {
      errorElement.textContent =
        "Le mot de passe doit faire au moins 6 caractères.";

      return;
    }

    const email = emailFromUsername(username);

    showLoading(true, "Création du compte...");

    try {
      await activateFirebaseNetwork();

      const credential = await withTimeout(
        auth.createUserWithEmailAndPassword(
          email,
          password
        ),
        12000
      );

      if (!credential.user) {
        throw new Error("Firebase n'a pas créé l'utilisateur.");
      }

      await createUserDocument(
        credential.user.uid,
        username
      );

      // Firebase connectera automatiquement l'utilisateur.
      // onAuthStateChanged affichera ensuite le dashboard.

    } catch (error) {
      console.error("Erreur inscription :", error);

      showLoading(false);

      errorElement.textContent =
        "Erreur : " + getErrorMessage(error);
    }
  }
);


// ------------------------------------------------------------
// 14. CONNEXION
// ------------------------------------------------------------

document.getElementById("login-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const username = document
      .getElementById("login-username")
      .value
      .trim();

    const password = document
      .getElementById("login-password")
      .value;

    const errorElement = document.getElementById("login-error");

    errorElement.textContent = "";

    if (!username || !password) {
      errorElement.textContent =
        "Entre ton pseudo et ton mot de passe.";

      return;
    }

    if (!isValidUsername(username)) {
      errorElement.textContent =
        "Pseudo ou mot de passe incorrect.";

      return;
    }

    showLoading(true, "Connexion...");

    try {
      await activateFirebaseNetwork();

      await withTimeout(
        auth.signInWithEmailAndPassword(
          emailFromUsername(username),
          password
        ),
        12000
      );

      // onAuthStateChanged prend ensuite le relais.

    } catch (error) {
      console.error("Erreur connexion :", error);

      showLoading(false);

      errorElement.textContent =
        getErrorMessage(error);
    }
  }
);


// ------------------------------------------------------------
// 15. DÉCONNEXION
// ------------------------------------------------------------

document.getElementById("logout-btn").addEventListener(
  "click",
  async () => {

    showLoading(true, "Déconnexion...");

    try {
      await withTimeout(
        auth.signOut(),
        10000
      );
    } catch (error) {
      console.error("Erreur déconnexion :", error);

      showLoading(false);

      alert(
        "Impossible de se déconnecter : " +
        getErrorMessage(error)
      );
    }
  }
);


// ------------------------------------------------------------
// 16. IDENTITÉ
// ------------------------------------------------------------

function updateIdentityBadge(profile) {
  const firstname = profile?.firstname || "";
  const lastname = profile?.lastname || "";
  const classe = profile?.classe || "";

  const name = [firstname, lastname]
    .filter(Boolean)
    .join(" ");

  document.getElementById("identity-name").textContent =
    name || "Ton prénom Nom";

  document.getElementById("identity-class").textContent =
    classe || "Classe";
}


// ------------------------------------------------------------
// 17. CHARGEMENT DU PROFIL
// ------------------------------------------------------------

async function loadUserInterface(user) {
  if (!user) {
    return;
  }

  currentUserUid = user.uid;

  let snapshot;

  try {
    snapshot = await getUserDocument(user.uid);
  } catch (error) {
    console.error("Impossible de charger le profil :", error);

    showLoading(false);

    showScreen(studentScreen);

    const errorElement = document.getElementById("profile-error");

    if (errorElement) {
      errorElement.textContent =
        "Firebase n'arrive pas à charger tes données. " +
        getErrorMessage(error);
    }

    return;
  }

  let data = snapshot.exists
    ? snapshot.data()
    : null;

  if (!data) {
    data = {
      username: "Élève",
      profile: {
        firstname: "",
        lastname: "",
        classe: ""
      },
      exposes: []
    };
  }

  const username = data.username || "Élève";

  const profile = data.profile || {};

  const exposes = Array.isArray(data.exposes)
    ? data.exposes
    : [];

  document.getElementById("welcome-name").textContent =
    username;

  document.getElementById("profile-username").value =
    username;

  document.getElementById("profile-firstname").value =
    profile.firstname || "";

  document.getElementById("profile-lastname").value =
    profile.lastname || "";

  document.getElementById("profile-class").value =
    profile.classe || "";

  updateIdentityBadge(profile);

  applyStoredTheme();

  lastExposesCache = exposes;

  renderExposes(exposes);

  showScreen(studentScreen);

  showLoading(false);
}


// ------------------------------------------------------------
// 18. FIREBASE AUTH PERSISTANT
// ------------------------------------------------------------

async function initializeAuthentication() {
  try {
    await auth.setPersistence(
      firebase.auth.Auth.Persistence.LOCAL
    );
  } catch (error) {
    console.warn(
      "Impossible d'activer la persistance Firebase :",
      error
    );
  }

  auth.onAuthStateChanged(async user => {

    if (user) {
      await loadUserInterface(user);
    } else {
      currentUserUid = null;

      showLoading(false);

      showScreen(loginScreen);
    }
  });

  authListenerStarted = true;
}


// ------------------------------------------------------------
// 19. DÉMARRAGE
// ------------------------------------------------------------

async function startApplication() {
  try {
    showLoading(true, "Connexion à Firebase...");

    await activateFirebaseNetwork();

    await initializeAuthentication();

    firebaseReady = true;

  } catch (error) {
    console.error("Erreur démarrage :", error);

    firebaseReady = false;

    showLoading(false);

    showScreen(loginScreen);

    const errorElement =
      document.getElementById("login-error");

    if (errorElement) {
      errorElement.textContent =
        "Firebase n'est pas disponible : " +
        getErrorMessage(error);
    }
  }
}


// ------------------------------------------------------------
// 20. MENU / ONGLETS
// ------------------------------------------------------------

document.querySelectorAll(".menu-item").forEach(button => {

  button.addEventListener("click", () => {

    document
      .querySelectorAll(".menu-item")
      .forEach(item => {
        item.classList.remove("active");
      });

    button.classList.add("active");

    document
      .querySelectorAll(".tab-panel")
      .forEach(panel => {
        panel.classList.add("hidden");
      });

    const tabName = button.dataset.tab;

    const panel =
      document.getElementById("tab-" + tabName);

    if (panel) {
      panel.classList.remove("hidden");
    }
  });

});


// ------------------------------------------------------------
// 21. MODE SOMBRE
// ------------------------------------------------------------

const themeButton =
  document.getElementById("theme-toggle");


themeButton.addEventListener("click", () => {

  const dark =
    document.body.classList.toggle("dark");

  localStorage.setItem(
    "exposes-theme",
    dark ? "dark" : "light"
  );

  themeButton.textContent =
    dark
      ? "☀️ Mode clair"
      : "🌙 Mode sombre";
});


function applyStoredTheme() {

  const dark =
    localStorage.getItem("exposes-theme") === "dark";

  document.body.classList.toggle(
    "dark",
    dark
  );

  themeButton.textContent =
    dark
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

  if (!file) {
    return;
  }

  // Limite conservée à environ 700 Ko.
  // On vérifie aussi la taille finale du document avant Firebase.
  if (file.size > 700 * 1024) {

    alert(
      "Ce fichier est trop lourd. " +
      "La limite est d'environ 700 Ko."
    );

    fileInput.value = "";

    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {

    alert(
      "Impossible de lire ce fichier."
    );

  };

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

  reader.readAsDataURL(file);
}


fileInput.addEventListener(
  "change",
  () => {
    handleFile(fileInput.files[0]);
  }
);


fileDropLabel.addEventListener(
  "dragover",
  event => {

    event.preventDefault();

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
  event => {

    event.preventDefault();

    fileDropLabel.classList.remove(
      "dragover"
    );

    const file =
      event.dataTransfer.files[0];

    handleFile(file);
  }
);


// ------------------------------------------------------------
// 23. RESET FORMULAIRE EXPOSÉ
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

  fileInput.value = "";

  fileDropText.textContent =
    "📎 Joindre une photo ou un fichier (ou glisse-le ici)";

  fileDropLabel.classList.remove(
    "has-file"
  );

  document
    .getElementById("expose-submit-btn")
    .textContent = "Ajouter l'exposé";

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
// 24. RÉCUPÉRER LES EXPOSÉS
// ------------------------------------------------------------

async function getExposesFromServer() {

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Tu n'es plus connecté."
    );
  }

  const snapshot =
    await getUserDocument(user.uid);

  if (!snapshot.exists) {
    return [];
  }

  const data =
    snapshot.data() || {};

  return Array.isArray(data.exposes)
    ? data.exposes
    : [];
}


// ------------------------------------------------------------
// 25. VÉRIFICATION TAILLE FIRESTORE
// ------------------------------------------------------------

function checkFirestoreDataSize(exposes) {

  try {

    const json =
      JSON.stringify(exposes);

    const bytes =
      new Blob([json]).size;

    // Firestore limite les documents à environ 1 MiB.
    // On garde une marge de sécurité.
    const safeLimit =
      900 * 1024;

    if (bytes > safeLimit) {

      return {
        ok: false,
        bytes
      };
    }

    return {
      ok: true,
      bytes
    };

  } catch (error) {

    console.error(
      "Erreur calcul taille :",
      error
    );

    return {
      ok: false,
      bytes: Infinity
    };
  }
}


// ------------------------------------------------------------
// 26. SAUVEGARDER LES EXPOSÉS
// ------------------------------------------------------------

async function saveExposesToServer(exposes) {

  const user = auth.currentUser;

  if (!user) {

    alert(
      "Tu n'es plus connecté. Recharge la page."
    );

    return false;
  }

  const sizeCheck =
    checkFirestoreDataSize(exposes);

  if (!sizeCheck.ok) {

    alert(
      "Tes exposés prennent trop de place dans Firebase.\n\n" +
      "Supprime quelques anciennes pièces jointes " +
      "ou utilise des fichiers plus légers."
    );

    return false;
  }

  try {

    await updateUserDocument(
      user.uid,
      {
        exposes: exposes
      }
    );

    return true;

  } catch (error) {

    console.error(
      "Erreur sauvegarde exposés :",
      error
    );

    alert(
      "Erreur d'enregistrement :\n\n" +
      getErrorMessage(error)
    );

    return false;
  }
}


// ------------------------------------------------------------
// 27. AJOUT / MODIFICATION EXPOSÉ
// ------------------------------------------------------------

document
  .getElementById("expose-form")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();

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
          "Tu n'es plus connecté à Firebase."
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
              expose =>
                Number(expose.id) ===
                Number(editingId)
            );

          if (!item) {

            throw new Error(
              "Cet exposé n'existe plus."
            );
          }

          item.title =
            title;

          item.subject =
            subject;

          item.description =
            description;

          item.due =
            due;

          item.status =
            status;

          if (pendingFile) {
            item.file =
              pendingFile;
          }

        } else {

          exposes.push({

            id: Date.now(),

            title: title,

            subject: subject,

            description: description,

            due: due,

            status: status,

            file: pendingFile
              ? pendingFile
              : null
          });
        }

        const saved =
          await saveExposesToServer(
            exposes
          );

        if (!saved) {
          return;
        }

        resetExposeForm();

        lastExposesCache =
          exposes;

        renderExposes(
          exposes
        );

      } catch (error) {

        console.error(
          "Erreur ajout/modification :",
          error
        );

        alert(
          "Impossible d'enregistrer l'exposé :\n\n" +
          getErrorMessage(error)
        );

      } finally {

        showLoading(false);
      }
    }
  );


// ------------------------------------------------------------
// 28. MODIFIER UN EXPOSÉ
// ------------------------------------------------------------

async function startEdit(id) {

  if (!auth.currentUser) {

    alert(
      "Tu n'es plus connecté."
    );

    return;
  }

  showLoading(
    true,
    "Chargement de l'exposé..."
  );

  try {

    const exposes =
      await getExposesFromServer();

    const item =
      exposes.find(
        expose =>
          Number(expose.id) ===
          Number(id)
      );

    if (!item) {

      alert(
        "Exposé introuvable."
      );

      return;
    }

    editingId =
      Number(id);

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
      .classList.remove(
        "hidden"
      );

    if (item.file) {

      pendingFile = null;

      fileDropText.textContent =
        "✅ " +
        item.file.name +
        " (garde le même fichier si tu ne changes rien)";

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

  } catch (error) {

    console.error(
      "Erreur modification :",
      error
    );

    alert(
      "Impossible de charger l'exposé :\n\n" +
      getErrorMessage(error)
    );

  } finally {

    showLoading(false);
  }
}


// ------------------------------------------------------------
// 29. STATUT
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
// 30. DATE DE RENDU
// ------------------------------------------------------------

function dueInfo(due) {

  if (!due) {
    return "";
  }

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
      (
        1000 *
        60 *
        60 *
        24
      )
    );

  const safeDate =
    escapeHtml(due);

  if (diffDays < 0) {

    return `
      <div class="due-info due-late">
        ⏰ En retard (${safeDate})
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
        ⏰ Dans ${diffDays} jour(s) (${safeDate})
      </div>
    `;
  }

  return `
    <div class="due-info due-ok">
      📅 Rendu prévu le ${safeDate}
    </div>
  `;
}


// ------------------------------------------------------------
// 31. FILTRE MATIÈRES
// ------------------------------------------------------------

function updateSubjectFilter(exposes) {

  const select =
    document.getElementById(
      "filter-subject"
    );

  const current =
    select.value;

  const subjects = [
    ...new Set(
      exposes
        .map(expose => expose.subject)
        .filter(Boolean)
    )
  ].sort();

  select.innerHTML =
    '<option value="">Toutes les matières</option>';

  subjects.forEach(subject => {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      subject;

    option.textContent =
      subject;

    select.appendChild(
      option
    );
  });

  select.value =
    subjects.includes(current)
      ? current
      : "";
}


// ------------------------------------------------------------
// 32. AFFICHAGE EXPOSÉS
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

  document
    .getElementById(
      "stat-count"
    )
    .textContent =
      exposes.length;

  document
    .getElementById(
      "stat-done"
    )
    .textContent =
      exposes.filter(
        expose =>
          expose.status === "Rendu"
      ).length;

  renderBadges(
    exposes.length
  );

  updateSubjectFilter(
    exposes
  );

  const searchTerm =
    document
      .getElementById(
        "search-input"
      )
      .value
      .trim()
      .toLowerCase();

  const subjectFilter =
    document
      .getElementById(
        "filter-subject"
      )
      .value;

  const filtered =
    exposes.filter(
      expose => {

        const title =
          String(
            expose.title || ""
          ).toLowerCase();

        const subject =
          String(
            expose.subject || ""
          );

        const matchesSearch =
          !searchTerm ||
          title.includes(
            searchTerm
          );

        const matchesSubject =
          !subjectFilter ||
          subject === subjectFilter;

        return (
          matchesSearch &&
          matchesSubject
        );
      }
    );

  if (filtered.length === 0) {

    list.innerHTML =
      '<p class="empty-msg">Aucun exposé ne correspond.</p>';

    return;
  }

  list.innerHTML = "";

  filtered.forEach(expose => {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "expose-item";

    const safeTitle =
      escapeHtml(
        expose.title || ""
      );

    const safeSubject =
      escapeHtml(
        expose.subject || ""
      );

    const safeDescription =
      escapeHtml(
        expose.description || ""
      );

    const safeId =
      Number(expose.id);

    let attachmentHtml =
      "";

    if (
      expose.file &&
      expose.file.data
    ) {

      const fileName =
        escapeHtml(
          expose.file.name || "fichier"
        );

      const fileType =
        String(
          expose.file.type || ""
        );

      if (
        fileType.startsWith(
          "image/"
        )
      ) {

        attachmentHtml = `
          <a
            class="attachment"
            href="${expose.file.data}"
            download="${fileName}"
          >
            <img
              src="${expose.file.data}"
              alt="${fileName}"
            >
          </a>
        `;

      } else {

        attachmentHtml = `
          <a
            class="attachment"
            href="${expose.file.data}"
            download="${fileName}"
          >
            📄 ${fileName}
          </a>
        `;
      }
    }

    item.innerHTML = `
      <div>

        ${
          safeSubject
            ? `<span class="subject">${safeSubject}</span>`
            : ""
        }

        <span
          class="status-pill ${statusClass(
            expose.status
          )}"
        >
          ${escapeHtml(
            expose.status || "En cours"
          )}
        </span>

        <h4>
          ${safeTitle}
        </h4>

        <p>
          ${safeDescription}
        </p>

        ${dueInfo(expose.due)}

        ${attachmentHtml}

      </div>

      <div class="item-actions">

        <button
          class="edit-btn"
          data-id="${safeId}"
          type="button"
          title="Modifier"
        >
          ✏️
        </button>

        <button
          class="delete-btn"
          data-id="${safeId}"
          type="button"
          title="Supprimer"
        >
          🗑️
        </button>

      </div>
    `;

    list.appendChild(
      item
    );
  });


  // ----------------------------------------------------------
  // BOUTONS MODIFIER
  // ----------------------------------------------------------

  list
    .querySelectorAll(
      ".edit-btn"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          startEdit(
            Number(
              button.dataset.id
            )
          );
        }
      );
    });


  // ----------------------------------------------------------
  // BOUTONS SUPPRIMER
  // ----------------------------------------------------------

  list
    .querySelectorAll(
      ".delete-btn"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const confirmed =
            confirm(
              "Supprimer cet exposé ?"
            );

          if (!confirmed) {
            return;
          }

          if (!auth.currentUser) {

            alert(
              "Tu n'es plus connecté."
            );

            return;
          }

          showLoading(
            true,
            "Suppression..."
          );

          try {

            const exposes =
              await getExposesFromServer();

            const id =
              Number(
                button.dataset.id
              );

            const updated =
              exposes.filter(
                expose =>
                  Number(expose.id) !== id
              );

            const saved =
              await saveExposesToServer(
                updated
              );

            if (saved) {

              lastExposesCache =
                updated;

              renderExposes(
                updated
              );
            }

          } catch (error) {

            console.error(
              "Erreur suppression :",
              error
            );

            alert(
              "Impossible de supprimer l'exposé :\n\n" +
              getErrorMessage(error)
            );

          } finally {

            showLoading(false);
          }
        }
      );
    });
}


// ------------------------------------------------------------
// 33. RECHERCHE
// ------------------------------------------------------------

document
  .getElementById(
    "search-input"
  )
  .addEventListener(
    "input",
    () => {

      renderExposes(
        lastExposesCache
      );
    }
  );


document
  .getElementById(
    "filter-subject"
  )
  .addEventListener(
    "change",
    () => {

      renderExposes(
        lastExposesCache
      );
    }
  );


// ------------------------------------------------------------
// 34. BADGES
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

  const badges =
    document.getElementById(
      "badges-list"
    );

  badges.innerHTML =
    BADGE_DEFS
      .map(badge => {

        const unlocked =
          count >= badge.count;

        return `
          <span
            class="badge ${
              unlocked
                ? "unlocked"
                : ""
            }"
          >
            ${badge.label}
          </span>
        `;
      })
      .join("");
}


// ------------------------------------------------------------
// 35. PROFIL
// ------------------------------------------------------------

document
  .getElementById(
    "save-profile-btn"
  )
  .addEventListener(
    "click",
    async () => {

      const user =
        auth.currentUser;

      if (!user) {

        alert(
          "Tu n'es plus connecté."
        );

        return;
      }

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

      const errorElement =
        document.getElementById(
          "profile-error"
        );

      const successElement =
        document.getElementById(
          "profile-success"
        );

      errorElement.textContent =
        "";

      successElement.textContent =
        "";

      if (
        !isValidUsername(
          newUsername
        )
      ) {

        errorElement.textContent =
          "Le pseudo doit contenir 2 à 30 caractères : lettres, chiffres, _ ou -.";

        return;
      }

      if (!currentPassword) {

        errorElement.textContent =
          "Entre ton mot de passe actuel pour confirmer.";

        return;
      }

      showLoading(
        true,
        "Mise à jour du profil..."
      );

      try {

        // ----------------------------------------------------
        // REAUTHENTIFICATION
        // ----------------------------------------------------

        const credential =
          firebase.auth.EmailAuthProvider.credential(
            user.email,
            currentPassword
          );

        await withTimeout(
          user.reauthenticateWithCredential(
            credential
          ),
          12000
        );


        // ----------------------------------------------------
        // RÉCUPÉRATION PROFIL ACTUEL
        // ----------------------------------------------------

        const snapshot =
          await getUserDocument(
            user.uid
          );

        const data =
          snapshot.exists
            ? snapshot.data()
            : {};

        const currentUsername =
          data.username || "";


        // ----------------------------------------------------
        // CHANGEMENT PSEUDO
        // ----------------------------------------------------

        if (
          newUsername !==
          currentUsername
        ) {

          await withTimeout(
            user.updateEmail(
              emailFromUsername(
                newUsername
              )
            ),
            12000
          );
        }


        // ----------------------------------------------------
        // CHANGEMENT MOT DE PASSE
        // ----------------------------------------------------

        if (newPassword) {

          if (
            newPassword.length < 6
          ) {

            errorElement.textContent =
              "Le nouveau mot de passe doit faire au moins 6 caractères.";

            return;
          }

          await withTimeout(
            user.updatePassword(
              newPassword
            ),
            12000
          );
        }


        // ----------------------------------------------------
        // SAUVEGARDE PROFIL FIRESTORE
        // ----------------------------------------------------

        const profile = {

          firstname:
            firstname,

          lastname:
            lastname,

          classe:
            classe
        };

        await updateUserDocument(
          user.uid,
          {
            username:
              newUsername,

            profile:
              profile
          }
        );


        // ----------------------------------------------------
        // MISE À JOUR INTERFACE
        // ----------------------------------------------------

        document
          .getElementById(
            "welcome-name"
          )
          .textContent =
            newUsername;

        document
          .getElementById(
            "profile-password"
          )
          .value =
            "";

        document
          .getElementById(
            "profile-current-password"
          )
          .value =
            "";

        updateIdentityBadge(
          profile
        );

        successElement.textContent =
          "Profil mis à jour !";

      } catch (error) {

        console.error(
          "Erreur profil :",
          error
        );

        errorElement.textContent =
          "Erreur : " +
          getErrorMessage(error);

      } finally {

        showLoading(false);
      }
    }
  );


// ------------------------------------------------------------
// 36. GESTION DES ERREURS JAVASCRIPT
// ------------------------------------------------------------

window.addEventListener(
  "error",
  event => {

    console.error(
      "Erreur JavaScript :",
      event.error || event.message
    );

    showLoading(false);
  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "Promise non gérée :",
      event.reason
    );

    showLoading(false);
  }
);


// ------------------------------------------------------------
// 37. LANCEMENT DE L'APPLICATION
// ------------------------------------------------------------

startApplication();
