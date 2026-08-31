// ============================================================
// MES EXPOSÉS 2026 — SCRIPT COMPLET
// Firebase Auth + Firestore
// ============================================================

// --- Configuration Firebase ---
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

function showLoading(on) {
  if (!loadingOverlay) return;

  if (on) {
    loadingOverlay.classList.remove("hidden");
  } else {
    loadingOverlay.classList.add("hidden");
  }
}

// Sécurité : empêche le chargement de rester bloqué
function hideLoadingAfterDelay() {
  setTimeout(() => {
    showLoading(false);
  }, 12000);
}

// ============================================================
// PSEUDO → EMAIL FIREBASE
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

// ============================================================
// NAVIGATION CONNEXION / INSCRIPTION
// ============================================================

document.getElementById("show-signup").addEventListener("click", e => {
  e.preventDefault();

  document.getElementById("signup-error").textContent = "";

  showScreen(signupScreen);
});

document.getElementById("show-login").addEventListener("click", e => {
  e.preventDefault();

  document.getElementById("login-error").textContent = "";

  showScreen(loginScreen);
});

// ============================================================
// INSCRIPTION
// ============================================================

document.getElementById("signup-form").addEventListener("submit", async e => {
  e.preventDefault();

  const username = document
    .getElementById("signup-username")
    .value
    .trim();

  const password = document.getElementById("signup-password").value;

  const errorEl = document.getElementById("signup-error");

  errorEl.textContent = "";

  if (!username || !password) {
    errorEl.textContent = "Remplis le pseudo et le mot de passe.";
    return;
  }

  if (password.length < 6) {
    errorEl.textContent =
      "Le mot de passe doit faire 6 caractères minimum.";
    return;
  }

  const email = emailFromUsername(username);

  showLoading(true);
  hideLoadingAfterDelay();

  try {
    const cred = await auth.createUserWithEmailAndPassword(
      email,
      password
    );

    await db.collection("users").doc(cred.user.uid).set({
      username: username,
      profile: {
        firstname: "",
        lastname: "",
        classe: ""
      },
      exposes: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Firebase va automatiquement déclencher onAuthStateChanged.
    // On ne cache pas manuellement ici pour éviter les conflits.
  } catch (err) {
    showLoading(false);

    if (err.code === "auth/email-already-in-use") {
      errorEl.textContent = "Ce pseudo est déjà pris.";
    } else if (err.code === "auth/invalid-email") {
      errorEl.textContent = "Ce pseudo n'est pas valide.";
    } else if (err.code === "auth/weak-password") {
      errorEl.textContent =
        "Le mot de passe est trop faible.";
    } else if (err.code === "auth/operation-not-allowed") {
      errorEl.textContent =
        "Active « Adresse e-mail/Mot de passe » dans Firebase.";
    } else {
      errorEl.textContent =
        "Erreur : " + (err.message || "Erreur inconnue.");
    }
  }
});

// ============================================================
// CONNEXION
// ============================================================

document.getElementById("login-form").addEventListener("submit", async e => {
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

  showLoading(true);
  hideLoadingAfterDelay();

  try {
    await auth.signInWithEmailAndPassword(
      emailFromUsername(username),
      password
    );

    // onAuthStateChanged s'occupe de l'affichage.
  } catch (err) {
    showLoading(false);

    if (
      err.code === "auth/operation-not-allowed"
    ) {
      errorEl.textContent =
        "Le fournisseur « Adresse e-mail/Mot de passe » est désactivé dans Firebase.";
    } else if (
      err.code === "auth/user-not-found" ||
      err.code === "auth/wrong-password" ||
      err.code === "auth/invalid-credential"
    ) {
      errorEl.textContent =
        "Pseudo ou mot de passe incorrect.";
    } else {
      errorEl.textContent =
        "Erreur de connexion : " +
        (err.message || "Erreur inconnue.");
    }
  }
});

// ============================================================
// DÉCONNEXION
// ============================================================

document.getElementById("logout-btn").addEventListener("click", async () => {
  showLoading(true);

  try {
    await auth.signOut();
  } catch (err) {
    console.error("Erreur déconnexion :", err);
    showLoading(false);
  }
});

// ============================================================
// SESSION FIREBASE
// ============================================================

auth.onAuthStateChanged(async user => {

  // Pas encore de décision
  if (user === undefined) {
    showLoading(true);
    return;
  }

  // ==========================================================
  // UTILISATEUR CONNECTÉ
  // ==========================================================

  if (user) {
    showLoading(true);

    try {
      const userRef = db.collection("users").doc(user.uid);
      const doc = await userRef.get();

      // Si le profil n'existe pas encore, on le crée.
      if (!doc.exists) {
        await userRef.set({
          username: "Élève",
          profile: {
            firstname: "",
            lastname: "",
            classe: ""
          },
          exposes: []
        });
      }

      const freshDoc = await userRef.get();
      const data = freshDoc.data() || {};

      const username = data.username || "Élève";
      const profile = data.profile || {};
      const exposes = Array.isArray(data.exposes)
        ? data.exposes
        : [];

      // Nom d'accueil
      document.getElementById("welcome-name").textContent =
        username;

      // Profil
      document.getElementById("profile-username").value =
        username;

      document.getElementById("profile-firstname").value =
        profile.firstname || "";

      document.getElementById("profile-lastname").value =
        profile.lastname || "";

      document.getElementById("profile-class").value =
        profile.classe || "";

      updateIdentityBadge(profile);

      // Thème
      applyStoredTheme();

      // Exposés
      renderExposes(exposes);

      // Afficher le dashboard
      showScreen(studentScreen);

      // Désactiver le chargement
      showLoading(false);

    } catch (err) {
      console.error("Erreur chargement utilisateur :", err);

      showLoading(false);

      // On affiche l'écran de connexion uniquement
      // si l'utilisateur n'est réellement plus connecté.
      if (!auth.currentUser) {
        showScreen(loginScreen);
      } else {
        alert(
          "Impossible de charger tes données Firebase.\n\n" +
          (err.message || "Erreur inconnue.")
        );

        showScreen(studentScreen);
      }
    }

    return;
  }

  // ==========================================================
  // UTILISATEUR DÉCONNECTÉ
  // ==========================================================

  showLoading(false);
  showScreen(loginScreen);
});

// ============================================================
// BADGE IDENTITÉ
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
// MENU / ONGlets
// ============================================================

document.querySelectorAll(".menu-item").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".menu-item")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    document.querySelectorAll(".tab-panel")
      .forEach(panel => panel.classList.add("hidden"));

    const target =
      document.getElementById("tab-" + btn.dataset.tab);

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
    localStorage.getItem("exposes-theme") === "dark";

  document.body.classList.toggle("dark", isDark);

  themeBtn.textContent =
    isDark
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

  // Limite actuelle conservée
  if (file.size > 700 * 1024) {
    alert(
      "Ce fichier est trop lourd.\n\n" +
      "Maximum : environ 700 Ko avec ce système."
    );
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {

    pendingFile = {
      name: file.name,
      type: file.type || "application/octet-stream",
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

fileDropLabel.addEventListener("dragover", e => {
  e.preventDefault();

  fileDropLabel.classList.add("dragover");
});

fileDropLabel.addEventListener("dragleave", () => {
  fileDropLabel.classList.remove("dragover");
});

fileDropLabel.addEventListener("drop", e => {

  e.preventDefault();

  fileDropLabel.classList.remove("dragover");

  handleFile(e.dataTransfer.files[0]);
});

// ============================================================
// RESET FORMULAIRE EXPOSÉ
// ============================================================

function resetExposeForm() {

  document.getElementById("expose-form").reset();

  document.getElementById("expose-id").value = "";

  pendingFile = null;
  editingId = null;

  fileDropText.textContent =
    "📎 Joindre une photo ou un fichier (ou glisse-le ici)";

  fileDropLabel.classList.remove("has-file");

  document.getElementById("expose-submit-btn").textContent =
    "Ajouter l'exposé";

  document.getElementById("expose-cancel-btn")
    .classList.add("hidden");
}

document
  .getElementById("expose-cancel-btn")
  .addEventListener("click", resetExposeForm);

// ============================================================
// FIRESTORE — CHARGER LES EXPOSÉS
// ============================================================

async function getExposesFromServer() {

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Tu n'es pas connecté.");
  }

  const doc =
    await db.collection("users")
      .doc(user.uid)
      .get();

  if (!doc.exists) {
    return [];
  }

  const data = doc.data() || {};

  return Array.isArray(data.exposes)
    ? data.exposes
    : [];
}

// ============================================================
// FIRESTORE — SAUVEGARDER LES EXPOSÉS
// ============================================================

async function saveExposesToServer(exposes) {

  const user = auth.currentUser;

  if (!user) {
    alert("Tu n'es plus connecté.");
    return false;
  }

  try {

    await db.collection("users")
      .doc(user.uid)
      .set(
        {
          exposes: exposes
        },
        {
          merge: true
        }
      );

    return true;

  } catch (err) {

    console.error("Erreur Firestore :", err);

    alert(
      "Erreur d'enregistrement :\n\n" +
      (err.message || "Erreur inconnue.")
    );

    return false;
  }
}

// ============================================================
// AJOUTER / MODIFIER UN EXPOSÉ
// ============================================================

document
  .getElementById("expose-form")
  .addEventListener("submit", async e => {

    e.preventDefault();

    const title =
      document.getElementById("expose-title")
        .value
        .trim();

    const subject =
      document.getElementById("expose-subject")
        .value
        .trim();

    const description =
      document.getElementById("expose-description")
        .value
        .trim();

    const due =
      document.getElementById("expose-due").value;

    const status =
      document.getElementById("expose-status").value;

    if (!title) {
      alert("Entre un titre pour ton exposé.");
      return;
    }

    if (!auth.currentUser) {
      alert("Ta session a expiré. Reconnecte-toi.");
      return;
    }

    showLoading(true);

    try {

      const exposes =
        await getExposesFromServer();

      // ======================================================
      // MODIFICATION
      // ======================================================

      if (editingId !== null) {

        const item =
          exposes.find(
            x => Number(x.id) === Number(editingId)
          );

        if (!item) {
          throw new Error(
            "Impossible de retrouver cet exposé."
          );
        }

        item.title = title;
        item.subject = subject;
        item.description = description;
        item.due = due;
        item.status = status;

        if (pendingFile) {
          item.file = pendingFile;
        }

      }

      // ======================================================
      // NOUVEL EXPOSÉ
      // ======================================================

      else {

        exposes.push({
          id: Date.now(),
          title: title,
          subject: subject,
          description: description,
          due: due,
          status: status,
          file: pendingFile
        });

      }

      // Sauvegarde
      const ok =
        await saveExposesToServer(exposes);

      if (!ok) {
        return;
      }

      // Mise à jour immédiate
      lastExposesCache = exposes;

      resetExposeForm();

      renderExposes(exposes);

    } catch (err) {

      console.error(
        "Erreur ajout/modification exposé :",
        err
      );

      alert(
        "Impossible d'enregistrer l'exposé.\n\n" +
        (err.message || "Erreur inconnue.")
      );

    } finally {

      // IMPORTANT :
      // même en cas d'erreur, le chargement disparaît.
      showLoading(false);

    }

  });

// ============================================================
// MODIFIER UN EXPOSÉ
// ============================================================

async function startEdit(id) {

  showLoading(true);

  try {

    const exposes =
      await getExposesFromServer();

    const item =
      exposes.find(
        x => Number(x.id) === Number(id)
      );

    if (!item) {
      alert("Exposé introuvable.");
      return;
    }

    editingId = Number(id);

    document.getElementById("expose-id").value =
      item.id;

    document.getElementById("expose-title").value =
      item.title || "";

    document.getElementById("expose-subject").value =
      item.subject || "";

    document.getElementById("expose-description").value =
      item.description || "";

    document.getElementById("expose-due").value =
      item.due || "";

    document.getElementById("expose-status").value =
      item.status || "En cours";

    document.getElementById("expose-submit-btn").textContent =
      "Enregistrer les modifications";

    document.getElementById("expose-cancel-btn")
      .classList.remove("hidden");

    // On ne remplace pas le fichier existant.
    // Il sera conservé si l'utilisateur n'en choisit pas un nouveau.
    pendingFile = null;

    if (item.file) {

      fileDropText.textContent =
        "✅ " +
        item.file.name +
        " (fichier actuel conservé si tu ne changes rien)";

      fileDropLabel.classList.add("has-file");
    }

    document
      .getElementById("expose-title")
      .scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

  } catch (err) {

    console.error("Erreur modification :", err);

    alert(
      "Impossible de modifier cet exposé.\n\n" +
      (err.message || "Erreur inconnue.")
    );

  } finally {

    showLoading(false);

  }
}

// ============================================================
// STATUT
// ============================================================

function statusClass(status) {

  if (status === "Prêt") {
    return "status-pret";
  }

  if (status === "Rendu") {
    return "status-rendu";
  }

  return "status-en-cours";
}

// ============================================================
// DATE DE RENDU
// ============================================================

function dueInfo(due) {

  if (!due) return "";

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(due);

  const diffDays = Math.round(
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
    document.getElementById("filter-subject");

  const current = select.value;

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
// PROTECTION DU HTML
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

  if (!Array.isArray(exposes)) {
    exposes = [];
  }

  lastExposesCache = exposes;

  const list =
    document.getElementById("exposes-list");

  // Statistiques
  document.getElementById("stat-count")
    .textContent = exposes.length;

  document.getElementById("stat-done")
    .textContent =
      exposes.filter(
        e => e.status === "Rendu"
      ).length;

  renderBadges(exposes.length);

  updateSubjectFilter(exposes);

  // Recherche
  const searchTerm =
    document.getElementById("search-input")
      .value
      .trim()
      .toLowerCase();

  const subjectFilter =
    document.getElementById("filter-subject").value;

  const filtered =
    exposes.filter(exp => {

      const title =
        String(exp.title || "")
          .toLowerCase();

      const subject =
        String(exp.subject || "");

      const matchesSearch =
        !searchTerm ||
        title.includes(searchTerm);

      const matchesSubject =
        !subjectFilter ||
        subject === subjectFilter;

      return matchesSearch && matchesSubject;
    });

  // Aucun résultat
  if (filtered.length === 0) {

    list.innerHTML =
      '<p class="empty-msg">' +
      (
        exposes.length === 0
          ? "Tu n'as encore ajouté aucun exposé."
          : "Aucun exposé ne correspond."
      ) +
      "</p>";

    return;
  }

  list.innerHTML = "";

  filtered.forEach(exp => {

    const item =
      document.createElement("div");

    item.className = "expose-item";

    // ========================================================
    // FICHIER
    // ========================================================

    let attachmentHtml = "";

    if (
      exp.file &&
      exp.file.data
    ) {

      const fileName =
        escapeHtml(exp.file.name || "fichier");

      const fileType =
        exp.file.type || "";

      const fileData =
        exp.file.data;

      if (fileType.startsWith("image/")) {

        attachmentHtml = `
          <a
            class="attachment"
            href="${fileData}"
            download="${fileName}"
          >
            <img
              src="${fileData}"
              alt="${fileName}"
            >
          </a>
        `;

      } else {

        attachmentHtml = `
          <a
            class="attachment"
            href="${fileData}"
            download="${fileName}"
          >
            📄 ${fileName}
          </a>
        `;
      }
    }

    // ========================================================
    // CARTE EXPOSÉ
    // ========================================================

    item.innerHTML = `
      <div>
        ${
          exp.subject
            ? `<span class="subject">${escapeHtml(exp.subject)}</span>`
            : ""
        }

        <span class="status-pill ${statusClass(exp.status)}">
          ${escapeHtml(exp.status || "En cours")}
        </span>

        <h4>
          ${escapeHtml(exp.title || "Sans titre")}
        </h4>

        <p>
          ${escapeHtml(exp.description || "")}
        </p>

        ${dueInfo(exp.due)}

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

  // ========================================================
  // BOUTONS MODIFIER
  // ========================================================

  list
    .querySelectorAll(".edit-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        startEdit(
          Number(btn.dataset.id)
        );

      });

    });

  // ========================================================
  // BOUTONS SUPPRIMER
  // ========================================================

  list
    .querySelectorAll(".delete-btn")
    .forEach(btn => {

      btn.addEventListener("click", async () => {

        const id =
          Number(btn.dataset.id);

        const confirmed =
          confirm(
            "Supprimer cet exposé ?"
          );

        if (!confirmed) {
          return;
        }

        showLoading(true);

        try {

          const exposes =
            await getExposesFromServer();

          const updated =
            exposes.filter(
              exp =>
                Number(exp.id) !== id
            );

          const ok =
            await saveExposesToServer(updated);

          if (ok) {

            lastExposesCache = updated;

            renderExposes(updated);
          }

        } catch (err) {

          console.error(
            "Erreur suppression :",
            err
          );

          alert(
            "Impossible de supprimer l'exposé.\n\n" +
            (err.message || "Erreur inconnue.")
          );

        } finally {

          showLoading(false);

        }

      });

    });
}

// ============================================================
// RECHERCHE
// ============================================================

document
  .getElementById("search-input")
  .addEventListener("input", () => {

    renderExposes(lastExposesCache);

  });

document
  .getElementById("filter-subject")
  .addEventListener("change", () => {

    renderExposes(lastExposesCache);

  });

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

  document.getElementById("badges-list").innerHTML =
    BADGE_DEFS
      .map(
        badge => `
          <span class="badge ${
            count >= badge.count
              ? "unlocked"
              : ""
          }">
            ${badge.label}
          </span>
        `
      )
      .join("");
}

// ============================================================
// PROFIL
// ============================================================

document
  .getElementById("save-profile-btn")
  .addEventListener("click", async () => {

    const newUsername =
      document.getElementById("profile-username")
        .value
        .trim();

    const newPassword =
      document.getElementById("profile-password")
        .value;

    const currentPassword =
      document.getElementById("profile-current-password")
        .value;

    const firstname =
      document.getElementById("profile-firstname")
        .value
        .trim();

    const lastname =
      document.getElementById("profile-lastname")
        .value
        .trim();

    const classe =
      document.getElementById("profile-class")
        .value
        .trim();

    const errorEl =
      document.getElementById("profile-error");

    const successEl =
      document.getElementById("profile-success");

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

    const user = auth.currentUser;

    if (!user) {
      errorEl.textContent =
        "Tu n'es plus connecté.";
      return;
    }

    showLoading(true);

    try {

      // ======================================================
      // REAUTHENTIFICATION
      // ======================================================

      const cred =
        firebase.auth.EmailAuthProvider.credential(
          user.email,
          currentPassword
        );

      await user.reauthenticateWithCredential(cred);

      // ======================================================
      // PROFIL ACTUEL
      // ======================================================

      const doc =
        await db.collection("users")
          .doc(user.uid)
          .get();

      const data =
        doc.data() || {};

      const currentUsername =
        data.username || "";

      // ======================================================
      // CHANGEMENT PSEUDO
      // ======================================================

      if (
        newUsername !== currentUsername
      ) {

        await user.updateEmail(
          emailFromUsername(newUsername)
        );
      }

      // ======================================================
      // CHANGEMENT MOT DE PASSE
      // ======================================================

      if (newPassword) {

        if (newPassword.length < 6) {

          errorEl.textContent =
            "Le nouveau mot de passe doit faire 6 caractères minimum.";

          return;
        }

        await user.updatePassword(
          newPassword
        );
      }

      // ======================================================
      // SAUVEGARDE FIRESTORE
      // ======================================================

      const profile = {
        firstname: firstname,
        lastname: lastname,
        classe: classe
      };

      await db.collection("users")
        .doc(user.uid)
        .set(
          {
            username: newUsername,
            profile: profile
          },
          {
            merge: true
          }
        );

      // ======================================================
      // ACTUALISATION
      // ======================================================

      document.getElementById("welcome-name")
        .textContent = newUsername;

      document.getElementById("profile-password")
        .value = "";

      document.getElementById("profile-current-password")
        .value = "";

      updateIdentityBadge(profile);

      successEl.textContent =
        "Profil mis à jour !";

    } catch (err) {

      console.error(
        "Erreur profil :",
        err
      );

      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {

        errorEl.textContent =
          "Mot de passe actuel incorrect.";

      } else if (
        err.code === "auth/email-already-in-use"
      ) {

        errorEl.textContent =
          "Ce pseudo est déjà pris.";

      } else if (
        err.code === "auth/requires-recent-login"
      ) {

        errorEl.textContent =
          "Reconnecte-toi puis réessaie.";

      } else {

        errorEl.textContent =
          "Erreur : " +
          (err.message || "Erreur inconnue.");
      }

    } finally {

      showLoading(false);

    }

  });

// ============================================================
// FIN
// ============================================================
