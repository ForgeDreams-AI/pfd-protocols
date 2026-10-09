'use strict';
/* PFD Protocols — private paramedic reference.
   Zero-backend privacy: protocols ship as AES-256-GCM ciphertext
   (protocols.enc.json). The access code is never stored; the derived key
   lives in memory + tab-scoped sessionStorage only. Close the tab → locked. */
const $ = id => document.getElementById(id);
const CATEGORIES = ['All','Cardiac','Respiratory','Environmental','Medical','Trauma','OB/Gyn','Pediatric','Procedures','Operations','Drugs','Reference'];
const KEY_STORE = 'pfd-key-v1';

let protocols = [], activeCat = 'All', cryptoKey = null;

const te = new TextEncoder();
function b64ToBytes(s){
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

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

/* ---------- views ---------- */
const VIEWS = ['view-gate','view-app'];
function show(id){
  VIEWS.forEach(v => $(v).hidden = (v !== id));
  window.scrollTo(0,0);
}

/* ---------- crypto gate ---------- */
function gateError(msg){
  const el = $('gate-error');
  el.textContent = msg; el.hidden = false;
}
async function deriveKey(code, salt, iterations){
  const base = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations, hash: 'SHA-256'},
    base, {name: 'AES-GCM', length: 256}, true, ['decrypt']);
}
async function unlockWithKey(key){
  const res = await fetch('protocols.enc.json', {cache: 'no-store'});
  if(!res.ok) throw new Error('fetch');
  const blob = await res.json();
  const salt = b64ToBytes(blob.salt), iv = b64ToBytes(blob.iv), ct = b64ToBytes(blob.ct);
  const derived = key || await deriveKey($('gate-code').value, salt, blob.iter || 210000);
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, derived, ct);
  const text = new TextDecoder().decode(pt);
  protocols = JSON.parse(text);
  protocols.sort((a,b) => (a.code || '').localeCompare(b.code || ''));
  cryptoKey = derived;
  // keep the derived key tab-scoped only: closing the tab re-locks the app
  try {
    const jwk = await crypto.subtle.exportKey('jwk', derived);
    sessionStorage.setItem(KEY_STORE, JSON.stringify(jwk));
  } catch(e){}
  $('gate-code').value = '';
  buildChips(); render(); show('view-app');
  setTimeout(() => $('search').focus(), 60);
}
async function trySilentUnlock(){
  let jwk = null;
  try { jwk = JSON.parse(sessionStorage.getItem(KEY_STORE) || 'null'); } catch(e){}
  if(!jwk) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'AES-GCM', length: 256}, true, ['decrypt']);
    await unlockWithKey(key);
    return true;
  } catch(e){
    try { sessionStorage.removeItem(KEY_STORE); } catch(_){}
    return false;
  }
}
function lock(){
  protocols = []; cryptoKey = null;
  try { sessionStorage.removeItem(KEY_STORE); } catch(e){}
  closeFocus();
  $('search').value = ''; activeCat = 'All';
  $('results').innerHTML = ''; $('result-count').textContent = '';
  show('view-gate');
  setTimeout(() => $('gate-code').focus(), 60);
}

/* ---------- search & browse ---------- */
function searchText(p){
  if(p._st) return p._st;
  const parts = [p.code, p.title, p.category, p.population, p.source,
    p.includes, p.excludes, p.drug_class, p.adult_dose, p.peds_dose];
  ['indications','contraindications','actions','adverse','cautions','notes']
    .forEach(k => { if(Array.isArray(p[k])) parts.push(p[k].join(' ')); });
  if(Array.isArray(p.medications)) p.medications.forEach(m =>
    parts.push(m.drug, m.dose, m.repeat, m.max, m.note));
  p._st = parts.filter(Boolean).join(' ').toLowerCase();
  return p._st;
}
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

/* ---------- boot ---------- */
async function boot(){
  applyTheme();
  if(!window.crypto || !crypto.subtle){
    gateError('This browser cannot do the encryption this app needs. Use a current Chrome, Safari, or Edge.');
    return;
  }
  $('gate-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('gate-error').hidden = true;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Unlocking…';
    try {
      await unlockWithKey(null);
    } catch(err){
      gateError('Wrong code. Try again.');
      try { sessionStorage.removeItem(KEY_STORE); } catch(_){}
    }
    btn.disabled = false; btn.textContent = 'Unlock';
  });
  $('lock-btn').addEventListener('click', lock);
  $('theme-toggle').addEventListener('click', toggleTheme);
  $('theme-toggle2').addEventListener('click', toggleTheme);
  $('search').addEventListener('input', render);
  $('focus-back').addEventListener('click', closeFocus);
  $('focus-back2').addEventListener('click', closeFocus);
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeFocus(); });
  const ok = await trySilentUnlock();
  if(!ok){ show('view-gate'); setTimeout(() => $('gate-code').focus(), 60); }
}

document.addEventListener('DOMContentLoaded', boot);
