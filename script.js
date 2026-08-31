// --- Config Firebase (ton projet ExposerSite) ---
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

const loginScreen = document.getElementById('login-screen');
const signupScreen = document.getElementById('signup-screen');
const studentScreen = document.getElementById('student-screen');
const loadingOverlay = document.getElementById('loading-overlay');

let pendingFile = null;
let editingId = null;
let lastExposesCache = [];

function showScreen(screen) {
  [loginScreen, signupScreen, studentScreen].forEach(s => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}
function showLoading(on) { loadingOverlay.classList.toggle('hidden', !on); }

// Firebase Auth veut un email : on en fabrique un à partir du pseudo
function emailFromUsername(username) {
  return username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@mesexposes-app.fake';
}

// --- Navigation login/signup ---
document.getElementById('show-signup').addEventListener('click', e => { e.preventDefault(); showScreen(signupScreen); });
document.getElementById('show-login').addEventListener('click', e => { e.preventDefault(); showScreen(loginScreen); });

// --- Création de compte ---
document.getElementById('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';

  if (!username || !password) { errorEl.textContent = 'Remplis le pseudo et le mot de passe.'; return; }
  if (password.length < 6) { errorEl.textContent = 'Le mot de passe doit faire 6 caractères minimum.'; return; }

  showLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(emailFromUsername(username), password);
    await db.collection('users').doc(cred.user.uid).set({
      username, profile: { firstname: '', lastname: '', classe: '' }, exposes: []
    });
  } catch (err) {
    showLoading(false);
    if (err.code === 'auth/email-already-in-use') errorEl.textContent = 'Ce pseudo est déjà pris.';
    else errorEl.textContent = "Erreur : " + err.message;
  }
});

// --- Connexion ---
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  showLoading(true);
  try {
    await auth.signInWithEmailAndPassword(emailFromUsername(username), password);
  } catch (err) {
    showLoading(false);
    errorEl.textContent = 'Pseudo ou mot de passe incorrect.';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());

// --- Réagit automatiquement à la connexion/déconnexion (marche pareil sur tous les appareils) ---
auth.onAuthStateChanged(async user => {
  if (user) {
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.data() || { username: 'Élève', profile: {}, exposes: [] };

    document.getElementById('welcome-name').textContent = data.username;
    document.getElementById('profile-username').value = data.username;

    const profile = data.profile || {};
    document.getElementById('profile-firstname').value = profile.firstname || '';
    document.getElementById('profile-lastname').value = profile.lastname || '';
    document.getElementById('profile-class').value = profile.classe || '';
    updateIdentityBadge(profile);

    applyStoredTheme();
    renderExposes(data.exposes || []);
    showLoading(false);
    showScreen(studentScreen);
  } else {
    showLoading(false);
    showScreen(loginScreen);
  }
});

function updateIdentityBadge(profile) {
  const name = [profile.firstname, profile.lastname].filter(Boolean).join(' ');
  document.getElementById('identity-name').textContent = name || 'Ton prénom Nom';
  document.getElementById('identity-class').textContent = profile.classe || 'Classe';
}

// --- Menu / onglets ---
document.querySelectorAll('.menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// --- Mode sombre (réglage d'affichage, reste local à l'appareil) ---
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('exposes-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  themeBtn.textContent = document.body.classList.contains('dark') ? '☀️ Mode clair' : '🌙 Mode sombre';
});
function applyStoredTheme() {
  const isDark = localStorage.getItem('exposes-theme') === 'dark';
  document.body.classList.toggle('dark', isDark);
  themeBtn.textContent = isDark ? '☀️ Mode clair' : '🌙 Mode sombre';
}

// --- Fichier : sélection + glisser-déposer ---
const fileInput = document.getElementById('expose-file');
const fileDropLabel = document.getElementById('file-drop-label');
const fileDropText = document.getElementById('file-drop-text');

function handleFile(file) {
  if (!file) return;
  if (file.size > 700 * 1024) {
    alert("Ce fichier est trop lourd (max ~700 Ko avec ce système). Choisis une photo plus légère.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingFile = { name: file.name, type: file.type, data: reader.result };
    fileDropText.textContent = '✅ ' + file.name;
    fileDropLabel.classList.add('has-file');
  };
  reader.readAsDataURL(file);
}
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
fileDropLabel.addEventListener('dragover', e => { e.preventDefault(); fileDropLabel.classList.add('dragover'); });
fileDropLabel.addEventListener('dragleave', () => fileDropLabel.classList.remove('dragover'));
fileDropLabel.addEventListener('drop', e => { e.preventDefault(); fileDropLabel.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });

function resetExposeForm() {
  document.getElementById('expose-form').reset();
  document.getElementById('expose-id').value = '';
  pendingFile = null;
  editingId = null;
  fileDropText.textContent = '📎 Joindre une photo ou un fichier (ou glisse-le ici)';
  fileDropLabel.classList.remove('has-file');
  document.getElementById('expose-submit-btn').textContent = "Ajouter l'exposé";
  document.getElementById('expose-cancel-btn').classList.add('hidden');
}
document.getElementById('expose-cancel-btn').addEventListener('click', resetExposeForm);

// --- Charger / sauvegarder les exposés dans Firestore ---
async function getExposesFromServer() {
  const doc = await db.collection('users').doc(auth.currentUser.uid).get();
  return (doc.data() && doc.data().exposes) || [];
}
async function saveExposesToServer(exposes) {
  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ exposes });
    return true;
  } catch (err) {
    alert("Erreur d'enregistrement : " + err.message);
    return false;
  }
}

// --- Ajouter / modifier un exposé ---
document.getElementById('expose-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = document.getElementById('expose-title').value.trim();
  const subject = document.getElementById('expose-subject').value.trim();
  const description = document.getElementById('expose-description').value.trim();
  const due = document.getElementById('expose-due').value;
  const status = document.getElementById('expose-status').value;
  if (!title) return;

  showLoading(true);
  const exposes = await getExposesFromServer();

  if (editingId) {
    const item = exposes.find(x => x.id === editingId);
    Object.assign(item, { title, subject, description, due, status });
    if (pendingFile) item.file = pendingFile;
  } else {
    exposes.push({ id: Date.now(), title, subject, description, due, status, file: pendingFile });
  }

  const ok = await saveExposesToServer(exposes);
  showLoading(false);
  if (!ok) return;

  resetExposeForm();
  renderExposes(exposes);
});

async function startEdit(id) {
  const exposes = await getExposesFromServer();
  const item = exposes.find(x => x.id === id);
  if (!item) return;

  editingId = id;
  document.getElementById('expose-id').value = id;
  document.getElementById('expose-title').value = item.title;
  document.getElementById('expose-subject').value = item.subject || '';
  document.getElementById('expose-description').value = item.description || '';
  document.getElementById('expose-due').value = item.due || '';
  document.getElementById('expose-status').value = item.status || 'En cours';
  document.getElementById('expose-submit-btn').textContent = "Enregistrer les modifications";
  document.getElementById('expose-cancel-btn').classList.remove('hidden');

  if (item.file) {
    fileDropText.textContent = '✅ ' + item.file.name + ' (garde le même fichier si tu ne changes rien)';
    fileDropLabel.classList.add('has-file');
  }
  document.getElementById('expose-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function statusClass(status) {
  if (status === 'Prêt') return 'status-pret';
  if (status === 'Rendu') return 'status-rendu';
  return 'status-en-cours';
}

function dueInfo(due) {
  if (!due) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const dueDate = new Date(due);
  const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `<div class="due-info due-late">⏰ En retard (${due})</div>`;
  if (diffDays === 0) return `<div class="due-info due-soon">⏰ À rendre aujourd'hui !</div>`;
  if (diffDays <= 3) return `<div class="due-info due-soon">⏰ Dans ${diffDays} jour(s) (${due})</div>`;
  return `<div class="due-info due-ok">📅 Rendu prévu le ${due}</div>`;
}

function updateSubjectFilter(exposes) {
  const select = document.getElementById('filter-subject');
  const current = select.value;
  const subjects = [...new Set(exposes.map(e => e.subject).filter(Boolean))];
  select.innerHTML = '<option value="">Toutes les matières</option>' + subjects.map(s => `<option value="${s}">${s}</option>`).join('');
  select.value = subjects.includes(current) ? current : '';
}

function renderExposes(exposes) {
  lastExposesCache = exposes;
  const list = document.getElementById('exposes-list');

  document.getElementById('stat-count').textContent = exposes.length;
  document.getElementById('stat-done').textContent = exposes.filter(e => e.status === 'Rendu').length;
  renderBadges(exposes.length);
  updateSubjectFilter(exposes);

  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const subjectFilter = document.getElementById('filter-subject').value;
  const filtered = exposes.filter(exp => {
    const matchesSearch = !searchTerm || exp.title.toLowerCase().includes(searchTerm);
    const matchesSubject = !subjectFilter || exp.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-msg">Aucun exposé ne correspond.</p>';
    return;
  }

  list.innerHTML = '';
  filtered.forEach(exp => {
    const item = document.createElement('div');
    item.className = 'expose-item';
    let attachmentHtml = '';
    if (exp.file) {
      attachmentHtml = exp.file.type.startsWith('image/')
        ? `<a class="attachment" href="${exp.file.data}" download="${exp.file.name}"><img src="${exp.file.data}" alt="${exp.file.name}"></a>`
        : `<a class="attachment" href="${exp.file.data}" download="${exp.file.name}">📄 ${exp.file.name}</a>`;
    }
    item.innerHTML = `
      <div>
        ${exp.subject ? `<span class="subject">${exp.subject}</span>` : ''}
        <span class="status-pill ${statusClass(exp.status)}">${exp.status || 'En cours'}</span>
        <h4>${exp.title}</h4>
        <p>${exp.description || ''}</p>
        ${dueInfo(exp.due)}
        ${attachmentHtml}
      </div>
      <div class="item-actions">
        <button class="edit-btn" data-id="${exp.id}">✏️</button>
        <button class="delete-btn" data-id="${exp.id}">🗑️</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(Number(btn.dataset.id))));
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      showLoading(true);
      const exposes = await getExposesFromServer();
      const updated = exposes.filter(exp => exp.id !== Number(btn.dataset.id));
      await saveExposesToServer(updated);
      showLoading(false);
      renderExposes(updated);
    });
  });
}

document.getElementById('search-input').addEventListener('input', () => renderExposes(lastExposesCache));
document.getElementById('filter-subject').addEventListener('change', () => renderExposes(lastExposesCache));

// --- Badges ---
const BADGE_DEFS = [
  { count: 1, label: '🥉 Premier exposé' },
  { count: 5, label: '🥈 5 exposés' },
  { count: 10, label: '🥇 10 exposés' },
  { count: 20, label: '🏆 Champion des exposés' }
];
function renderBadges(count) {
  document.getElementById('badges-list').innerHTML = BADGE_DEFS.map(b =>
    `<span class="badge ${count >= b.count ? 'unlocked' : ''}">${b.label}</span>`
  ).join('');
}

// --- Profil : prénom, nom, classe, pseudo, mot de passe ---
document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const newUsername = document.getElementById('profile-username').value.trim();
  const newPassword = document.getElementById('profile-password').value;
  const currentPassword = document.getElementById('profile-current-password').value;
  const firstname = document.getElementById('profile-firstname').value.trim();
  const lastname = document.getElementById('profile-lastname').value.trim();
  const classe = document.getElementById('profile-class').value.trim();
  const errorEl = document.getElementById('profile-error');
  const successEl = document.getElementById('profile-success');
  errorEl.textContent = ''; successEl.textContent = '';

  if (!newUsername) { errorEl.textContent = 'Le pseudo ne peut pas être vide.'; return; }
  if (!currentPassword) { errorEl.textContent = 'Entre ton mot de passe actuel pour confirmer.'; return; }

  const user = auth.currentUser;
  showLoading(true);
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    await user.reauthenticateWithCredential(cred);

    const doc = await db.collection('users').doc(user.uid).get();
    const currentUsername = doc.data().username;

    if (newUsername !== currentUsername) {
      await user.updateEmail(emailFromUsername(newUsername));
    }
    if (newPassword) {
      if (newPassword.length < 6) { showLoading(false); errorEl.textContent = 'Le nouveau mot de passe doit faire 6 caractères minimum.'; return; }
      await user.updatePassword(newPassword);
    }

    const profile = { firstname, lastname, classe };
    await db.collection('users').doc(user.uid).update({ username: newUsername, profile });

    document.getElementById('welcome-name').textContent = newUsername;
    document.getElementById('profile-password').value = '';
    document.getElementById('profile-current-password').value = '';
    updateIdentityBadge(profile);
    successEl.textContent = 'Profil mis à jour !';
  } catch (err) {
    if (err.code === 'auth/wrong-password') errorEl.textContent = 'Mot de passe actuel incorrect.';
    else if (err.code === 'auth/email-already-in-use') errorEl.textContent = 'Ce pseudo est déjà pris.';
    else errorEl.textContent = "Erreur : " + err.message;
  }
  showLoading(false);
});