// ============================================================
// MES EXPOSÉS 2026
// Script complet - Firebase Auth + Firestore
// ============================================================

// --- CONFIGURATION FIREBASE ---
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

// ============================================================
// FIREBASE : CONNEXION RÉSEAU + SESSION
// ============================================================

let firebaseReady = false;

async function initFirebase() {
  try {
    // Permet à la session Firebase de rester après un refresh
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // On force Firestore à utiliser le réseau
    try {
      await db.enableNetwork();
    } catch (networkError) {
      console.warn("Firestore réseau :", networkError);
    }

    firebaseReady = true;
    console.log("Firebase prêt.");
  } catch (error) {
    console.error("Erreur Firebase :", error);
    firebaseReady = false;
  }
}

initFirebase();

// ============================================================
// ÉLÉMENTS HTML
// ============================================================

const loginScreen = document.getElementById("login-screen");
const signupScreen = document.getElementById("signup-screen");
const studentScreen = document.getElementById("student-screen");
const loadingOverlay = document.getElementById("loading-overlay");

let pendingFile = null;
let editingId = null;
let lastExposesCache = [];

// ============================================================
// AFFICHAGE
// ============================================================

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

// ============================================================
// UTILITAIRES
// ============================================================

function emailFromUsername(username) {
  return (
    username
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "")
    + "@mesexposes-app.fake"
  );
}

function isOfflineError(error) {
  if (!error) return false;

  return (
    error.code === "unavailable" ||
    error.code === "failed-precondition" ||
    error.message?.toLowerCase().includes("offline") ||
    error.message?.toLowerCase().includes("client is offline") ||
    error.message?.toLowerCase().includes("network")
  );
}

function showFirebaseError(error, element) {
  if (!element) return;

  console.error(error);

  if (isOfflineError(error)) {
    element.textContent =
      "Impossible de contacter Firebase. Vérifie ta connexion Internet puis réessaie.";
    return;
  }

  switch (error.code) {
    case "permission-denied":
      element.textContent =
        "Accès refusé par Firebase. Vérifie les règles Firestore.";
      break;

    case "auth/operation-not-allowed":
      element.textContent =
        "La connexion par e-mail/mot de passe n'est pas activée dans Firebase.";
      break;

    case "auth/configuration-not-found":
      element.textContent =
        "La configuration Firebase est incomplète.";
      break;

    default:
      element.textContent =
        "Erreur : " + (error.message || "Erreur inconnue.");
  }
}

// ============================================================
// NAVIGATION CONNEXION / INSCRIPTION
// ============================================================

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

// ============================================================
// INSCRIPTION
// ============================================================

document
  .getElementById("signup-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const username = document
      .getElementById("signup-username")
      .value
      .trim();

    const password = document.getElementById("signup-password").value;

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

    if (!firebaseReady) {
      errorEl.textContent =
        "Firebase n'est pas encore prêt. Réessaie dans quelques secondes.";
      return;
    }

    showLoading(true, "Création du compte...");

    try {
      const email = emailFromUsername(username);

      const cred = await auth.createUserWithEmailAndPassword(
        email,
        password
      );

      await db
        .collection("users")
        .doc(cred.user.uid)
        .set({
          username: username,
          profile: {
            firstname: "",
            lastname: "",
            classe: ""
          },
          exposes: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      console.log("Compte créé :", cred.user.uid);

      // onAuthStateChanged affichera automatiquement le dashboard
    } catch (err) {
      console.error("Erreur inscription :", err);

      if (err.code === "auth/email-already-in-use") {
        errorEl.textContent = "Ce pseudo est déjà pris.";
      } else if (err.code === "auth/invalid-email") {
        errorEl.textContent = "Ce pseudo n'est pas valide.";
      } else if (err.code === "auth/weak-password") {
        errorEl.textContent =
          "Le mot de passe est trop faible.";
      } else {
        showFirebaseError(err, errorEl);
      }

      showLoading(false);
    }
  });

// ============================================================
// CONNEXION
// ============================================================

document
  .getElementById("login-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const username = document
      .getElementById("login-username")
      .value
      .trim();

    const password = document.getElementById("login-password").value;

    const errorEl = document.getElementById("login-error");

    errorEl.textContent = "";

    if (!username || !password) {
      errorEl.textContent =
        "Entre ton pseudo et ton mot de passe.";
      return;
    }

    if (!firebaseReady) {
      errorEl.textContent =
        "Firebase n'est pas encore prêt. Réessaie dans quelques secondes.";
      return;
    }

    showLoading(true, "Connexion...");

    try {
      const email = emailFromUsername(username);

      await auth.signInWithEmailAndPassword(
        email,
        password
      );

      // onAuthStateChanged s'occupe du dashboard
    } catch (err) {
      console.error("Erreur connexion :", err);

      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        errorEl.textContent =
          "Pseudo ou mot de passe incorrect.";
      } else if (isOfflineError(err)) {
        errorEl.textContent =
          "Firebase est hors ligne. Vérifie ta connexion Internet.";
      } else {
        showFirebaseError(err, errorEl);
      }

      showLoading(false);
    }
  });

// ============================================================
// DÉCONNEXION
// ============================================================

document
  .getElementById("logout-btn")
  .addEventListener("click", async () => {
    try {
      showLoading(true, "Déconnexion...");

      await auth.signOut();

      showLoading(false);
    } catch (error) {
      console.error(error);
      showLoading(false);
    }
  });

// ============================================================
// AUTH : RESTER CONNECTÉ APRÈS REFRESH
// ============================================================

auth.onAuthStateChanged(async user => {
  console.log(
    "État Firebase :",
    user ? "CONNECTÉ" : "DÉCONNECTÉ"
  );

  if (!user) {
    showLoading(false);
    showScreen(loginScreen);
    return;
  }

  showLoading(true, "Chargement de ton espace...");

  try {
    // Réactive le réseau si Firebase était passé hors ligne
    try {
      await db.enableNetwork();
    } catch (e) {
      console.warn("Impossible de réactiver Firestore :", e);
    }

    const doc = await db
      .collection("users")
      .doc(user.uid)
      .get();

    let data = doc.exists ? doc.data() : null;

    // Si le document utilisateur n'existe pas
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

      await db
        .collection("users")
        .doc(user.uid)
        .set(data, { merge: true });
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

    renderExposes(exposes);

    showScreen(studentScreen);
    showLoading(false);

  } catch (error) {
    console.error(
      "Impossible de charger le compte :",
      error
    );

    showLoading(false);

    if (isOfflineError(error)) {
      showScreen(studentScreen);

      alert(
        "Firebase est actuellement hors ligne.\n\n" +
        "Vérifie ta connexion Internet puis recharge la page."
      );

      return;
    }

    alert(
      "Impossible de charger ton compte Firebase.\n\n" +
      error.message
    );
  }
});

// ============================================================
// IDENTITÉ
// ============================================================

function updateIdentityBadge(profile) {
  const name = [
    profile.firstname,
    profile.lastname
  ]
    .filter(Boolean)
    .join(" ");

  document.getElementById("identity-name").textContent =
    name || "Ton prénom Nom";

  document.getElementById("identity-class").textContent =
    profile.classe || "Classe";
}

// ============================================================
// MENU / ONGLETS
// ============================================================

document.querySelectorAll(".menu-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".menu-item")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    document
      .querySelectorAll(".tab-panel")
      .forEach(panel => panel.classList.add("hidden"));

    const target = document.getElementById(
      "tab-" + btn.dataset.tab
    );

    if (target) {
      target.classList.remove("hidden");
    }
  });
});

// ============================================================
// MODE SOMBRE
// ============================================================

const themeBtn =
  document.getElementById("theme-toggle");

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const dark =
    document.body.classList.contains("dark");

  localStorage.setItem(
    "exposes-theme",
    dark ? "dark" : "light"
  );

  themeBtn.textContent = dark
    ? "☀️ Mode clair"
    : "🌙 Mode sombre";
});

function applyStoredTheme() {
  const dark =
    localStorage.getItem("exposes-theme") === "dark";

  document.body.classList.toggle("dark", dark);

  themeBtn.textContent = dark
    ? "☀️ Mode clair"
    : "🌙 Mode sombre";
}

// ============================================================
// FICHIERS
// ============================================================

const fileInput =
  document.getElementById("expose-file");

const fileDropLabel =
  document.getElementById("file-drop-label");

const fileDropText =
  document.getElementById("file-drop-text");

function handleFile(file) {
  if (!file) return;

  // Limite volontaire pour éviter de remplir Firestore
  if (file.size > 700 * 1024) {
    alert(
      "Ce fichier est trop lourd.\n\n" +
      "Taille maximale : environ 700 Ko."
    );

    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    pendingFile = {
      name: file.name,
      type: file.type,
      data: reader.result
    };

    fileDropText.textContent =
      "✅ " + file.name;

    fileDropLabel.classList.add("has-file");
  };

  reader.onerror = () => {
    alert("Impossible de lire ce fichier.");
  };

  reader.readAsDataURL(file);
}

fileInput.addEventListener("change", () => {
  handleFile(fileInput.files[0]);
});

fileDropLabel.addEventListener(
  "dragover",
  e => {
    e.preventDefault();
    fileDropLabel.classList.add("dragover");
  }
);

fileDropLabel.addEventListener(
  "dragleave",
  () => {
    fileDropLabel.classList.remove("dragover");
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

// ============================================================
// RESET FORMULAIRE EXPOSÉ
// ============================================================

function resetExposeForm() {
  document
    .getElementById("expose-form")
    .reset();

  document.getElementById(
    "expose-id"
  ).value = "";

  pendingFile = null;
  editingId = null;

  fileDropText.textContent =
    "📎 Joindre une photo ou un fichier (ou glisse-le ici)";

  fileDropLabel.classList.remove(
    "has-file"
  );

  document.getElementById(
    "expose-submit-btn"
  ).textContent = "Ajouter l'exposé";

  document.getElementById(
    "expose-cancel-btn"
  ).classList.add("hidden");
}

document
  .getElementById("expose-cancel-btn")
  .addEventListener(
    "click",
    resetExposeForm
  );

// ============================================================
// FIRESTORE : RÉCUPÉRER LES EXPOSÉS
// ============================================================

async function getExposesFromServer() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Aucun utilisateur connecté."
    );
  }

  // Important : on tente de remettre Firestore en ligne
  try {
    await db.enableNetwork();
  } catch (e) {
    console.warn(e);
  }

  const doc = await db
    .collection("users")
    .doc(user.uid)
    .get();

  if (!doc.exists) {
    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          username: user.email
            ? user.email.split("@")[0]
            : "Élève",
          profile: {
            firstname: "",
            lastname: "",
            classe: ""
          },
          exposes: []
        },
        { merge: true }
      );

    return [];
  }

  const data = doc.data() || {};

  return Array.isArray(data.exposes)
    ? data.exposes
    : [];
}

// ============================================================
// FIRESTORE : SAUVEGARDER
// ============================================================

async function saveExposesToServer(exposes) {
  const user = auth.currentUser;

  if (!user) {
    alert(
      "Tu n'es plus connecté. Recharge la page."
    );
    return false;
  }

  try {
    try {
      await db.enableNetwork();
    } catch (e) {
      console.warn(e);
    }

    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          exposes: exposes
        },
        {
          merge: true
        }
      );

    console.log(
      "Exposés sauvegardés :",
      exposes.length
    );

    return true;

  } catch (error) {
    console.error(
      "Erreur sauvegarde :",
      error
    );

    if (isOfflineError(error)) {
      alert(
        "Firebase est hors ligne.\n\n" +
        "Ton exposé n'a pas été perdu dans l'application, " +
        "mais il n'a pas pu être enregistré sur le serveur.\n\n" +
        "Vérifie Internet puis réessaie."
      );
    } else if (error.code === "permission-denied") {
      alert(
        "Firebase refuse l'enregistrement.\n\n" +
        "Il faut vérifier les règles Firestore."
      );
    } else {
      alert(
        "Erreur d'enregistrement :\n" +
        error.message
      );
    }

    return false;
  }
}

// ============================================================
// AJOUT / MODIFICATION D'UN EXPOSÉ
// ============================================================

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
        document.getElementById(
          "expose-due"
        ).value;

      const status =
        document.getElementById(
          "expose-status"
        ).value;

      if (!title) {
        alert(
          "Entre un titre pour ton exposé."
        );
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
              x => x.id === editingId
            );

          if (!item) {
            showLoading(false);

            alert(
              "Cet exposé n'existe plus."
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

        renderExposes(exposes);

        showLoading(false);

      } catch (error) {
        console.error(
          "Erreur ajout exposé :",
          error
        );

        showLoading(false);

        if (isOfflineError(error)) {
          alert(
            "Le client Firebase est hors ligne.\n\n" +
            "Vérifie ta connexion Internet puis réessaie."
          );
        } else {
          alert(
            "Impossible d'enregistrer l'exposé :\n" +
            error.message
          );
        }
      }
    }
  );

// ============================================================
// MODIFICATION
// ============================================================

async function startEdit(id) {
  try {
    showLoading(
      true,
      "Chargement de l'exposé..."
    );

    const exposes =
      await getExposesFromServer();

    const item =
      exposes.find(
        x => x.id === id
      );

    if (!item) {
      showLoading(false);

      alert(
        "Exposé introuvable."
      );

      return;
    }

    editingId = id;

    document.getElementById(
      "expose-id"
    ).value = id;

    document.getElementById(
      "expose-title"
    ).value = item.title || "";

    document.getElementById(
      "expose-subject"
    ).value = item.subject || "";

    document.getElementById(
      "expose-description"
    ).value =
      item.description || "";

    document.getElementById(
      "expose-due"
    ).value = item.due || "";

    document.getElementById(
      "expose-status"
    ).value =
      item.status || "En cours";

    document.getElementById(
      "expose-submit-btn"
    ).textContent =
      "Enregistrer les modifications";

    document
      .getElementById(
        "expose-cancel-btn"
      )
      .classList.remove("hidden");

    if (item.file) {
      fileDropText.textContent =
        "✅ " +
        item.file.name +
        " (garde le même fichier si tu ne changes rien)";

      fileDropLabel.classList.add(
        "has-file"
      );

      pendingFile = null;
    }

    document
      .getElementById("expose-title")
      .scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

    showLoading(false);

  } catch (error) {
    console.error(error);

    showLoading(false);

    alert(
      "Impossible de charger l'exposé :\n" +
      error.message
    );
  }
}

// ============================================================
// STATUT
// ============================================================

function statusClass(status) {
  if (status === "Prêt")
    return "status-pret";

  if (status === "Rendu")
    return "status-rendu";

  return "status-en-cours";
}

// ============================================================
// DATE DE RENDU
// ============================================================

function dueInfo(due) {
  if (!due) return "";

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const dueDate =
    new Date(due);

  const diffDays =
    Math.round(
      (dueDate - today) /
      (1000 * 60 * 60 * 24)
    );

  if (diffDays < 0) {
    return `
      <div class="due-info due-late">
        ⏰ En retard (${due})
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
        ⏰ Dans ${diffDays} jour(s) (${due})
      </div>
    `;
  }

  return `
    <div class="due-info due-ok">
      📅 Rendu prévu le ${due}
    </div>
  `;
}

// ============================================================
// FILTRE MATIÈRES
// ============================================================

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

// ============================================================
// PROTECTION TEXTE HTML
// ============================================================

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

// ============================================================
// AFFICHAGE DES EXPOSÉS
// ============================================================

function renderExposes(exposes) {
  lastExposesCache = Array.isArray(exposes)
    ? exposes
    : [];

  const list =
    document.getElementById(
      "exposes-list"
    );

  document.getElementById(
    "stat-count"
  ).textContent =
    lastExposesCache.length;

  document.getElementById(
    "stat-done"
  ).textContent =
    lastExposesCache.filter(
      e => e.status === "Rendu"
    ).length;

  renderBadges(
    lastExposesCache.length
  );

  updateSubjectFilter(
    lastExposesCache
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
    document.getElementById(
      "filter-subject"
    ).value;

  const filtered =
    lastExposesCache.filter(
      exp => {
        const title =
          String(
            exp.title || ""
          ).toLowerCase();

        const subject =
          String(
            exp.subject || ""
          );

        const matchesSearch =
          !searchTerm ||
          title.includes(
            searchTerm
          );

        const matchesSubject =
          !subjectFilter ||
          subject ===
            subjectFilter;

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
          exp.file.name ||
            "fichier"
        );

      const safeData =
        exp.file.data;

      if (
        String(
          exp.file.type || ""
        ).startsWith(
          "image/"
        )
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
            ? `<span class="subject">${escapeHtml(exp.subject)}</span>`
            : ""
        }

        <span
          class="status-pill ${statusClass(
            exp.status
          )}"
        >
          ${escapeHtml(
            exp.status ||
              "En cours"
          )}
        </span>

        <h4>
          ${escapeHtml(
            exp.title ||
              "Sans titre"
          )}
        </h4>

        <p>
          ${escapeHtml(
            exp.description ||
              ""
          )}
        </p>

        ${dueInfo(
          exp.due
        )}

        ${attachmentHtml}
      </div>

      <div class="item-actions">
        <button
          class="edit-btn"
          data-id="${exp.id}"
          title="Modifier"
        >
          ✏️
        </button>

        <button
          class="delete-btn"
          data-id="${exp.id}"
          title="Supprimer"
        >
          🗑️
        </button>
      </div>
    `;

    list.appendChild(item);
  });

  // --- Boutons modifier ---

  list
    .querySelectorAll(
      ".edit-btn"
    )
    .forEach(btn => {
      btn.addEventListener(
        "click",
        () =>
          startEdit(
            Number(
              btn.dataset.id
            )
          )
      );
    });

  // --- Boutons supprimer ---

  list
    .querySelectorAll(
      ".delete-btn"
    )
    .forEach(btn => {
      btn.addEventListener(
        "click",
        async () => {
          const id =
            Number(
              btn.dataset.id
            );

          const confirmDelete =
            confirm(
              "Supprimer cet exposé ?"
            );

          if (!confirmDelete) {
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
                  exp.id !== id
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

          } catch (error) {
            console.error(
              error
            );

            alert(
              "Impossible de supprimer l'exposé :\n" +
              error.message
            );
          }

          showLoading(false);
        }
      );
    });
}

// ============================================================
// RECHERCHE / FILTRE
// ============================================================

document
  .getElementById(
    "search-input"
  )
  .addEventListener(
    "input",
    () =>
      renderExposes(
        lastExposesCache
      )
  );

document
  .getElementById(
    "filter-subject"
  )
  .addEventListener(
    "change",
    () =>
      renderExposes(
        lastExposesCache
      )
  );

// ============================================================
// BADGES
// ============================================================

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
    BADGE_DEFS.map(
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
    ).join("");
}

// ============================================================
// PROFIL
// ============================================================

document
  .getElementById(
    "save-profile-btn"
  )
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
        document.getElementById(
          "profile-password"
        ).value;

      const currentPassword =
        document.getElementById(
          "profile-current-password"
        ).value;

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
        // Vérification du mot de passe actuel
        const cred =
          firebase.auth.EmailAuthProvider.credential(
            user.email,
            currentPassword
          );

        await user.reauthenticateWithCredential(
          cred
        );

        const doc =
          await db
            .collection("users")
            .doc(user.uid)
            .get();

        const data =
          doc.data() || {};

        const currentUsername =
          data.username || "";

        // Changement du pseudo
        if (
          newUsername !==
          currentUsername
        ) {
          await user.updateEmail(
            emailFromUsername(
              newUsername
            )
          );
        }

        // Changement mot de passe
        if (newPassword) {
          if (
            newPassword.length <
            6
          ) {
            errorEl.textContent =
              "Le nouveau mot de passe doit faire 6 caractères minimum.";

            showLoading(false);
            return;
          }

          await user.updatePassword(
            newPassword
          );
        }

        const profile = {
          firstname,
          lastname,
          classe
        };

        await db
          .collection("users")
          .doc(user.uid)
          .set(
            {
              username:
                newUsername,
              profile
            },
            {
              merge: true
            }
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
          "auth/email-already-in-use"
        ) {
          errorEl.textContent =
            "Ce pseudo est déjà pris.";

        } else if (
          err.code ===
          "auth/requires-recent-login"
        ) {
          errorEl.textContent =
            "Reconnecte-toi avant de modifier ces informations.";

        } else if (
          isOfflineError(err)
        ) {
          errorEl.textContent =
            "Firebase est hors ligne. Vérifie ta connexion.";

        } else {
          errorEl.textContent =
            "Erreur : " +
            err.message;
        }
      }

      showLoading(false);
    }
  );

// ============================================================
// TEST FIREBASE DANS LA CONSOLE
// ============================================================

console.log(
  "%cMes Exposés 2026",
  "font-size:20px;font-weight:bold;"
);

console.log(
  "Firebase initialisé."
);
