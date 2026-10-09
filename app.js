'use strict';
/* PFD Protocols — private paramedic reference. No protocol content lives in this
   bundle; everything loads from Firestore after an approved sign-in. */
const $ = id => document.getElementById(id);
const CATEGORIES = ['All','Cardiac','Respiratory','Environmental','Medical','Trauma','OB/Gyn','Pediatric','Procedures','Operations','Drugs','Reference'];

let db = null, auth = null, protocols = [], isAdmin = false, activeCat = 'All';

/* ---------- theme ---------- */
function applyTheme(){
  let dark = false;
  try { dark = localStorage.getItem('pfd-theme') === 'dark'; } catch(e){}
  if(!localStorage.getItem('pfd-theme')){
    dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark';
  try { localStorage.setItem('pfd-theme', cur ? 'light' : 'dark'); } catch(e){}
  applyTheme();
}
function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function normEmail(e){ return (e || '').trim().toLowerCase(); }

/* ---------- views ---------- */
const VIEWS = ['view-signin','view-pending','view-app','view-admin'];
function show(id){
  VIEWS.forEach(v => $(v).hidden = (v !== id));
  window.scrollTo(0,0);
}

/* ---------- auth ---------- */
function authError(msg){
  const el = $('signin-error');
  el.textContent = msg; el.hidden = false;
}
async function boot(){
  applyTheme();
  if(!window.firebase || firebaseConfig.apiKey === 'REPLACE_ME'){
    authError('App not configured yet — Firebase setup is incomplete.');
    return;
  }
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth(); db = firebase.firestore();
  try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch(e){}
  $('signin-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('signin-error').hidden = true;
    const email = normEmail($('signin-email').value);
    const pass = $('signin-pass').value;
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch(err){
      authError(err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Wrong email or password.' : 'Sign-in failed. Check your connection and try again.');
    }
  });
  $('signout-btn').addEventListener('click', () => auth.signOut());
  $('pending-signout').addEventListener('click', () => auth.signOut());
  $('theme-toggle').addEventListener('click', toggleTheme);
  $('theme-toggle2').addEventListener('click', toggleTheme);
  $('admin-btn').addEventListener('click', () => { show('view-admin'); loadAllowlist(); });
  $('admin-back').addEventListener('click', () => show('view-app'));
  $('allowlist-form').addEventListener('submit', onAllowlistAdd);
  $('search').addEventListener('input', render);
  auth.onAuthStateChanged(onAuth);
}

async function onAuth(user){
  closeFocus();
  if(!user){ show('view-signin'); return; }
  const email = normEmail(user.email);
  let doc;
  try {
    doc = await db.collection('allowlist').doc(email).get();
  } catch(err){
    // Permission denied here means rules are working as intended for non-members.
    authError('Could not verify access. Signing out.');
    await auth.signOut(); return;
  }
  if(!doc.exists){
    $('pending-email').textContent = email;
    show('view-pending'); return;
  }
  isAdmin = doc.data().role === 'admin';
  $('admin-btn').hidden = !isAdmin;
  await loadProtocols();
  buildChips();
  render();
  show('view-app');
}

/* ---------- data ---------- */
async function loadProtocols(){
  const snap = await db.collection('protocols').get();
  protocols = snap.docs.map(d => Object.assign({id: d.id}, d.data()));
  protocols.sort((a,b) => (a.code || '').localeCompare(b.code || ''));
}
function searchText(p){
  return (p.search_text || '').toLowerCase();
}

/* ---------- search & browse ---------- */
function buildChips(){
  const wrap = $('chips'); wrap.innerHTML = '';
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (c === activeCat ? ' active' : '');
    b.textContent = c;
    b.setAttribute('role','tab');
    b.addEventListener('click', () => { activeCat = c; buildChips(); render(); });
    wrap.appendChild(b);
  });
}
function filtered(){
  const q = $('search').value.trim().toLowerCase();
  return protocols.filter(p => {
    if(activeCat !== 'All' && p.category !== activeCat) return false;
    if(!q) return true;
    return searchText(p).includes(q);
  });
}
function highlight(text, q){
  const t = esc(text);
  if(!q) return t;
  try {
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');
    return t.replace(re, '<mark>$1</mark>');
  } catch(e){ return t; }
}
function render(){
  const q = $('search').value.trim();
  const list = filtered();
  $('result-count').textContent = list.length === protocols.length
    ? protocols.length + ' protocols & drugs'
    : list.length + ' result' + (list.length === 1 ? '' : 's');
  const wrap = $('results'); wrap.innerHTML = '';
  list.forEach(p => {
    const b = document.createElement('button');
    b.className = 'card';
    const preview = (p.includes || (p.actions && p.actions[0]) || (p.indications && p.indications[0]) || '');
    b.innerHTML = '<span class="code">' + esc(p.code) + '</span>'
      + '<h3>' + highlight(p.title, q) + '</h3>'
      + '<p>' + highlight(String(preview).slice(0, 140), q) + '</p>'
      + '<div class="meta">' + esc(p.category) + ' · ' + esc(p.population) + '</div>';
    b.addEventListener('click', () => openFocus(p, q));
    wrap.appendChild(b);
  });
}

/* ---------- focus mode ---------- */
function openFocus(p, q){
  const body = $('focus-body');
  let h = '<span class="code">' + esc(p.code) + '</span>';
  h += '<h1>' + highlight(p.title, q) + '</h1>';
  h += '<div class="src">' + esc(p.source || '') + '</div>';
  if(p.includes) h += '<h2>Scope</h2><p>' + highlight(p.includes, q) + '</p>';
  if(p.excludes) h += '<h2>Excludes</h2><p>' + highlight(p.excludes, q) + '</p>';
  if(p.drug_class) h += '<h2>Class</h2><p>' + highlight(p.drug_class, q) + '</p>';
  if(p.indications && p.indications.length){
    h += '<h2>Indications</h2><ul>' + p.indications.map(i => '<li>' + highlight(i, q) + '</li>').join('') + '</ul>';
  }
  if(p.contraindications && p.contraindications.length){
    h += '<h2>Contraindications</h2><ul>' + p.contraindications.map(i => '<li>' + highlight(i, q) + '</li>').join('') + '</ul>';
  }
  if(p.adult_dose || p.peds_dose){
    h += '<h2>Dosing</h2>';
    if(p.adult_dose) h += '<div class="med"><b>Adult:</b> ' + highlight(p.adult_dose, q) + '</div>';
    if(p.peds_dose) h += '<div class="med"><b>Pediatric:</b> ' + highlight(p.peds_dose, q) + '</div>';
  }
  if(p.actions && p.actions.length){
    h += '<h2>Actions</h2><ol>' + p.actions.map(a => '<li>' + highlight(a, q) + '</li>').join('') + '</ol>';
  }
  if(p.medications && p.medications.length){
    h += '<h2>Medications</h2>' + p.medications.map(m => {
      let t = '<div class="med"><b>' + highlight(m.drug, q) + '</b> — ' + highlight(m.dose || '', q);
      if(m.repeat) t += ' <span>(' + highlight(m.repeat, q) + ')</span>';
      if(m.max) t += '<br>Max: ' + highlight(m.max, q);
      if(m.note) t += '<br><i>' + highlight(m.note, q) + '</i>';
      return t + '</div>';
    }).join('');
  }
  if(p.adverse && p.adverse.length){
    h += '<h2>Adverse effects</h2><ul>' + p.adverse.map(i => '<li>' + highlight(i, q) + '</li>').join('') + '</ul>';
  }
  if(p.cautions && p.cautions.length){
    p.cautions.forEach(c => { h += '<div class="caution">⚠ ' + highlight(c, q) + '</div>'; });
  }
  if(p.notes && p.notes.length){
    h += '<h2>Notes</h2><ul>' + p.notes.map(i => '<li>' + highlight(i, q) + '</li>').join('') + '</ul>';
  }
  body.innerHTML = h;
  $('focus').hidden = false;
  document.body.style.overflow = 'hidden';
  $('focus').scrollTop = 0;
}
function closeFocus(){
  $('focus').hidden = true;
  document.body.style.overflow = '';
}
$('focus-back').addEventListener('click', closeFocus);
$('focus-back2').addEventListener('click', closeFocus);
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeFocus(); });

/* ---------- admin ---------- */
async function loadAllowlist(){
  const el = $('allowlist'); el.innerHTML = '<li>Loading…</li>';
  $('admin-error').hidden = true;
  try {
    const snap = await db.collection('allowlist').orderBy('email').get();
    el.innerHTML = '';
    snap.forEach(d => {
      const data = d.data();
      const li = document.createElement('li');
      li.innerHTML = '<span class="email">' + esc(data.email) + '</span>'
        + '<span class="role ' + (data.role === 'admin' ? '' : 'medic') + '">' + esc(data.role) + '</span>';
      const rm = document.createElement('button');
      rm.textContent = '✕'; rm.setAttribute('aria-label', 'Remove ' + data.email);
      rm.addEventListener('click', async () => {
        if(!confirm('Remove ' + data.email + '?')) return;
        await db.collection('allowlist').doc(d.id).delete();
        loadAllowlist();
      });
      li.appendChild(rm);
      el.appendChild(li);
    });
    if(!snap.size) el.innerHTML = '<li>No approved medics yet.</li>';
  } catch(err){
    $('admin-error').textContent = 'Could not load the list.'; $('admin-error').hidden = false;
  }
}
async function onAllowlistAdd(e){
  e.preventDefault();
  $('admin-error').hidden = true;
  const email = normEmail($('allowlist-email').value);
  const role = $('allowlist-admin').checked ? 'admin' : 'medic';
  if(!email) return;
  try {
    await db.collection('allowlist').doc(email).set({
      email, role,
      addedBy: normEmail(auth.currentUser.email),
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('allowlist-email').value = ''; $('allowlist-admin').checked = false;
    loadAllowlist();
  } catch(err){
    $('admin-error').textContent = 'Could not add — check your admin rights.';
    $('admin-error').hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', boot);
