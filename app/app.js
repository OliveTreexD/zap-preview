/* Zap: focus buddy where other Zap users are your accountability partners.
   Vanilla JS PWA. Focus sessions live on this device; profiles, pairing, approvals
   and partner chat go through Zap's small server. */
(() => {
'use strict';
const KEY = 'zap.v3';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const view = $('#view');

// ---------- state ----------
const defaults = () => ({ token: null, me: null, skipped: false, bolts: 0, settings: { accountability: true, sound: true }, session: null, tasks: [], pendingJoin: null });
let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = defaults(); }
S.settings = Object.assign(defaults().settings, S.settings || {});
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const task = (id) => S.tasks.find((t) => t.id === id) || null;
const partners = () => (S.me && S.me.partners) || [];
const partnerNames = () => { const p = partners().map((x) => x.name); return p.length ? p.length === 1 ? p[0] : p.slice(0, -1).join(', ') + ' or ' + p[p.length - 1] : 'your partner'; };

// ---------- lines ----------
let LINES = {};
const linesReady = fetch('script.json').then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
const say = (cat, fallback) => { const l = LINES[cat]; return l && l.length ? pick(l).text : fallback; };
const ACC = {
  ask: ['Nice! Before the bolts go in the jar, let\u2019s show {b}.', 'Done! Send it to {b}. Their tap makes it official.', 'Look at you go. Let\u2019s tell {b}, then the bolts are all yours.'],
  waiting: ['It\u2019s in {b}\u2019s To approve list. I\u2019ll keep an eye out.', 'Sent! {b} will see it next time they open Zap. No rush.', 'You did the thing. Now we wait for {b}\u2019s thumbs up, together.'],
  approved: ['{b} approved it! Bolts in the jar. Robot dance time.', 'Thumbs up from {b}! That\u2019s official now. Legend.', '{b} says yes! My bulb is flashing.'],
  notyet: ['{b} says not yet. That\u2019s okay, it\u2019s just a little more to do. I\u2019m still here.', 'Not quite yet, says {b}. No stress. One more small push and we ask again.', '{b} reckons a tiny bit more. Totally normal. Want to keep going together?'],
};
const acc = (k, b) => pick(ACC[k]).replace(/\{b\}/g, b || 'your partner');
const COMMENT_PRESETS = ['Nice work!', 'Proud of you.', 'You smashed it.', 'Love the progress.', 'Almost there, keep going!', 'Just the last little bit to go.'];
function greeting() {
  const h = new Date().getHours();
  const cat = h >= 5 && h < 12 ? 'greeting_morning' : h >= 12 && h < 17 ? 'greeting_afternoon' : h >= 17 && h < 22 ? 'greeting_evening' : 'greeting_late_night';
  return say(cat, 'Hi! What\u2019s one small thing we can do?');
}

// ---------- api ----------
let apiBase = null;
async function api(path, opts = {}) {
  if (!apiBase) {
    if (location.hostname.endsWith('github.io')) {
      const r = await fetch('../api.json?ts=' + Date.now(), { cache: 'no-store' });
      apiBase = (await r.json()).api.replace(/\/$/, '');
    } else apiBase = location.origin;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let r;
  try { r = await fetch(apiBase + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' }); }
  catch { apiBase = null; throw new Error('Can\u2019t reach Zap\u2019s server right now. Your stuff is safe, try again in a bit.'); }
  if (opts.raw) return r;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wobbly. Try again?'), { status: r.status });
  return j;
}
async function refreshMe() {
  if (!S.token) return null;
  try { const m = await api('/api/me'); S.me = m; save(); badges(); return m; }
  catch (e) { if (e.status === 401) { S.token = null; S.me = null; save(); } return null; }
}
function badges() {
  const m = S.me; const bi = $('#b-inbox'), bp = $('#b-partners');
  const n = m ? m.toApprove : 0; bi.textContent = n; bi.classList.toggle('hidden', !n);
  const u = m ? m.partners.reduce((a, p) => a + p.unread, 0) + m.incoming.length : 0; bp.textContent = u; bp.classList.toggle('hidden', !u);
}

// ---------- ui helpers ----------
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
let chime;
function ding() { if (!S.settings.sound) return; try { chime = chime || new Audio('chime.wav'); chime.currentTime = 0; chime.play().catch(() => {}); } catch {} }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('div'); c.className = 'confetti';
  for (let i = 0; i < 60; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + 'vw'; p.style.background = pick(['#C8663B', '#7EE2C4', '#FFB347', '#1E2A3A', '#F4E6CF']); p.style.animationDelay = Math.random() * .8 + 's'; c.appendChild(p); }
  document.body.appendChild(c); setTimeout(() => c.remove(), 3500);
}
const zapImg = (pose, cls = 'float') => `<img class="zap ${cls}" src="img/zap-${pose}.png" alt="Zap the robot, ${{ busy: 'busy sorting bolts', celebrate: 'celebrating', wave: 'waving', idle: 'smiling' }[pose]}">`;
const header = () => `<header class="top"><span class="brand">Zap</span><span class="bolts" aria-label="${S.bolts} bolts">\u{1F529} ${S.bolts}</span></header>`;
const fmtMin = (m) => m < 1 ? 'under a minute' : m === 1 ? '1 minute' : m + ' minutes';
const boltsFor = (mins) => Math.min(mins, 90) * 2 + 10;
const avatar = (n) => `<span class="avatar" aria-hidden="true">${esc((n || '?').trim().charAt(0).toUpperCase())}</span>`;
const when = (ts) => { const d = new Date(ts); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
const statusBadge = (s) => ({ draft: '<span class="status pending">Not sent yet</span>', pending: '<span class="status pending">Waiting for approval</span>', approved: '<span class="status approved">Approved</span>', notyet: '<span class="status notyet">Not yet</span>', done: '<span class="status approved">Done</span>', stopped: '<span class="status notyet">Gave it a go</span>' }[s] || '');
function setTab(name) { document.querySelectorAll('#tabs a').forEach((a) => { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); $('#tabs').classList.toggle('hidden', name === 'focus' || name === 'onboard'); }
const appLink = () => location.href.split('#')[0].replace(/index\.html$/, '');

// ---------- router ----------
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const h = location.hash.replace(/^#\/?/, '');
  const [r, arg] = h.split('/');
  window.scrollTo(0, 0);
  if (r === 'join' && arg) { S.pendingJoin = arg.toUpperCase(); save(); return go(S.token ? '#/partners' : '#/'); }
  if (S.session && r !== 'focus') return go('#/focus');
  if (!S.token && !S.skipped && r !== 'focus') return renderOnboard();
  if (r === 'focus') return S.session ? renderFocus() : go('#/');
  if (r === 'task' && task(arg)) return renderTask(task(arg));
  if (r === 'inbox') return needProfile('inbox') || renderInbox();
  if (r === 'partners') return needProfile('partners') || renderPartners();
  if (r === 'chat' && arg) return needProfile('partners') || renderChat(arg);
  if (r === 'me') return renderMe();
  renderHome();
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
window.addEventListener('hashchange', route);
function needProfile(tab) { if (S.token) return false; setTab(tab); renderOnboard(true); return true; }

// ---------- onboarding ----------
function renderOnboard(inline) {
  setTab(inline ? 'partners' : 'onboard');
  view.innerHTML = `${header()}
  ${zapImg('wave')}
  <div class="bubble">Hi, I\u2019m Zap! I sit with you while you do one thing. Other Zap people can be your partners and cheer you on.</div>
  <h1>Make your Zap profile</h1>
  <p class="muted">A nickname is perfect. No real name, email or password needed.</p>
  <label class="lab" for="dn">Display name</label><input id="dn" type="text" maxlength="30" placeholder="e.g. Olive" autocomplete="nickname">
  <label class="lab" for="hd">Handle</label><input id="hd" type="text" maxlength="20" placeholder="e.g. olive_tree" autocapitalize="none" autocomplete="off" spellcheck="false">
  <p class="muted">Partners can find you by @handle. 3 to 20 letters, numbers or _.</p>
  <label class="check"><input type="checkbox" id="age"><span>I\u2019m 16 or older, and I\u2019ll keep things kind.</span></label>
  <button class="btn primary" id="join">Join Zap</button>
  <details style="margin-top:16px"><summary class="muted">Already on Zap on another device?</summary>
    <label class="lab" for="key">Paste your sign-in key (from Me, on your other device)</label><input id="key" type="text" autocomplete="off">
    <button class="btn ghost small" id="restore">Sign in with key</button></details>
  ${inline ? '' : '<button class="btn ghost small" id="skip">Just focus solo for now</button>'}`;
  $('#hd').oninput = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); };
  $('#join').onclick = async () => {
    const btn = $('#join'); btn.disabled = true;
    try {
      const r = await api('/api/signup', { method: 'POST', body: { name: $('#dn').value, handle: $('#hd').value, age16: $('#age').checked } });
      S.token = r.token; S.me = r; S.skipped = false; save(); badges(); toast(`Welcome, ${r.user.name}!`);
      go(S.pendingJoin ? '#/partners' : '#/partners');
    } catch (e) { toast(e.message); btn.disabled = false; }
  };
  $('#restore').onclick = async () => {
    S.token = $('#key').value.trim(); const m = await refreshMe();
    if (m) { toast(`Welcome back, ${m.user.name}!`); go('#/'); } else toast('That key didn\u2019t work. Check it and try again.');
  };
  if ($('#skip')) $('#skip').onclick = () => { S.skipped = true; save(); go('#/'); };
}

// ---------- home ----------
function renderHome() {
  setTab('home');
  const waiting = S.tasks.filter((t) => ['pending', 'notyet', 'draft'].includes(t.status));
  let minutes = 25;
  const canAcc = !!S.token && partners().length > 0;
  let accOn = S.settings.accountability && canAcc;
  view.innerHTML = `${header()}
  ${zapImg('idle')}
  <div class="bubble" id="greet">${esc(greeting())}</div>
  ${S.me && S.me.toApprove ? `<a class="card" href="#/inbox" style="display:block;text-decoration:none;color:inherit"><b>${S.me.toApprove} waiting for your thumbs up</b><br><span class="muted">A partner finished something. Tap to have a look.</span></a>` : ''}
  ${waiting.length ? `<div class="card"><b>Your tasks with partners</b>${waiting.map((t) => `<a class="item" href="#/task/${t.id}" style="text-decoration:none;color:inherit"><span class="t">${esc(t.title)}</span>${statusBadge(t.status)}</a>`).join('')}</div>` : ''}
  <label class="lab" for="title">What\u2019s the one thing?</label>
  <input id="title" type="text" maxlength="140" placeholder="e.g. Sort tax docs into two piles" autocomplete="off">
  <label class="lab">How long?</label>
  <div class="chips" id="mins">${[10, 25, 45, 0].map((m) => `<button class="chip" data-m="${m}" aria-pressed="${m === minutes}">${m ? m + ' min' : 'Until I\u2019m done'}</button>`).join('')}</div>
  <div class="toggle"><span><b>Partner check</b><small>${canAcc ? `${esc(partnerNames())} approves it. Bolts land when they do.` : 'Pair up with a Zap partner to turn this on.'}</small></span>
    <label class="switch"><input type="checkbox" id="acc" ${accOn ? 'checked' : ''} ${canAcc ? '' : 'disabled'} aria-label="Partner check for this task"><span></span></label></div>
  ${canAcc ? '' : `<a class="btn ghost small" href="#/partners">Find a partner</a>`}
  <button class="btn primary" id="start">Start with Zap</button>`;
  $('#mins').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; minutes = Number(b.dataset.m); document.querySelectorAll('#mins .chip').forEach((c) => c.setAttribute('aria-pressed', c === b)); };
  $('#acc').onchange = (e) => { accOn = e.target.checked; };
  $('#start').onclick = () => {
    const title = $('#title').value.trim();
    if (!title) { $('#title').focus(); toast('Pop one small thing in first.'); return; }
    S.session = { title, minutes, startedAt: Date.now(), accountable: accOn, line: say('session_start', 'One thing at a time. That\u2019s the whole plan.'), checkedIn: false };
    save(); go('#/focus');
  };
  linesReady.then(() => { const g = $('#greet'); if (g && !g.dataset.set) { g.textContent = greeting(); g.dataset.set = '1'; } });
}

// ---------- focus ----------
function renderFocus() {
  setTab('focus');
  const s = S.session;
  view.innerHTML = `${header()}
  ${zapImg('busy', 'bounce')}
  <div class="bubble" id="line">${esc(s.line)}</div>
  <div class="task-title">${esc(s.title)}</div>
  <div class="timer" id="clock" aria-live="off">--:--</div>
  <p class="muted center" id="sub"></p>
  <div id="checkin"></div>
  <button class="btn mint" id="done">I\u2019m done!</button>
  <button class="btn ghost" id="stop">Stop for now</button>`;
  const tick = () => {
    const el = Math.floor((Date.now() - s.startedAt) / 1000); const target = s.minutes * 60;
    const shown = target ? Math.max(0, target - el) : el;
    $('#clock').textContent = `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`;
    $('#sub').textContent = target ? (shown ? 'left on the timer' : 'Timer\u2019s done. Finish up, or keep cruising.') : 'and counting';
    if (!s.checkedIn && el >= (target ? target / 2 : 600) && el > 60) { s.checkedIn = true; save(); checkIn(); }
    if (target && shown === 0 && !s.timeUp) { s.timeUp = true; save(); ding(); $('#line').textContent = 'Ding! That\u2019s the timer. Tap \u201cI\u2019m done\u201d, or keep going if you\u2019re in the zone.'; }
  };
  tick(); const iv = setInterval(tick, 1000); cleanup = () => clearInterval(iv);
  $('#done').onclick = () => finishSession(false);
  $('#stop').onclick = () => finishSession(true);
}
function checkIn() {
  const l = LINES.check_in && LINES.check_in.length ? pick(LINES.check_in) : { text: 'How\u2019s it going over there?', replies: [{ label: 'Going well', response: { text: 'Ripper. Keep cruising.' } }] };
  $('#line').textContent = l.text;
  $('#checkin').innerHTML = `<div class="chips" style="justify-content:center">${(l.replies || []).map((r, i) => `<button class="chip" data-i="${i}">${esc(r.label)}</button>`).join('')}</div>`;
  $('#checkin').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; const r = l.replies[Number(b.dataset.i)]; $('#line').textContent = r.response.text; $('#checkin').innerHTML = '';
    if (r.next === 'session_finished') finishSession(false); else if (r.next === 'stopped_early') finishSession(true); };
}
function finishSession(early) {
  const s = S.session; if (!s) return;
  const mins = Math.round((Date.now() - s.startedAt) / 60000);
  if (s.resumeOf && task(s.resumeOf)) { S.session = null; save(); return go('#/task/' + s.resumeOf); }
  const t = { id: uid(), title: s.title, minutes: mins, finishedAt: Date.now(), accountable: !early && s.accountable, note: '', comment: '', bolts: 0, awarded: false, status: 'done' };
  if (early) { t.status = 'stopped'; t.bolts = mins >= 2 ? Math.max(5, Math.min(mins, 90) * 2) : 0; t.awarded = true; S.bolts += t.bolts; }
  else if (t.accountable) { t.status = 'draft'; t.bolts = boltsFor(mins); }
  else { t.bolts = boltsFor(mins); t.awarded = true; S.bolts += t.bolts; }
  S.session = null; S.tasks.unshift(t); save();
  if (!t.accountable) { ding(); if (!early) confetti(); }
  go('#/task/' + t.id);
}

// ---------- my task: send / waiting / approved / not yet ----------
function renderTask(t) {
  setTab('me');
  if (t.status === 'draft') return renderDraft(t);
  const who = esc(t.decidedBy || partnerNames());
  let body = '';
  if (t.status === 'pending') {
    body = `${zapImg('wave')}
    <div class="bubble">${esc(acc('waiting', t.decidedBy || partnerNames()))}</div>
    <h1 class="center">${esc(t.title)}</h1><p class="center">${statusBadge('pending')}</p>
    <p class="muted center">${fmtMin(t.minutes)} \u00b7 ${t.bolts} bolts waiting for a partner\u2019s tap</p>
    ${partners().slice(0, 3).map((p) => `<a class="btn ghost small" href="#/chat/${p.id}">Message ${esc(p.name)}</a>`).join('')}
    <button class="btn ghost small" id="check">Check now</button>
    <a class="btn primary" href="#/">Pick the next small thing</a>`;
  } else if (t.status === 'approved') {
    body = `${zapImg('celebrate', 'bounce')}
    <div class="bubble">${esc(acc('approved', t.decidedBy))}</div>
    <h1 class="center">${esc(t.title)}</h1><p class="center">${statusBadge('approved')}</p>
    <div class="big-bolts">+${t.bolts} bolts</div>
    <p class="muted center">${esc(pick(['+{bolts} bolts! Into the jar they go.', 'You earned {bolts} bolts. Shiny ones, too.', 'Cha-ching! {bolts} bolts added.', '{bolts} fresh bolts. Nice haul!']).replace('{bolts}', t.bolts))}</p>
    ${t.comment ? `<div class="card"><b>${who} said:</b><br>${esc(t.comment)}</div>` : ''}
    <a class="btn primary" href="#/">Pick the next small thing</a>`;
  } else if (t.status === 'notyet') {
    body = `${zapImg('idle')}
    <div class="bubble">${esc(acc('notyet', t.decidedBy))}</div>
    <h1 class="center">${esc(t.title)}</h1><p class="center">${statusBadge('notyet')}</p>
    ${t.comment ? `<div class="card"><b>${who} said:</b><br>${esc(t.comment)}</div>` : ''}
    <p class="muted center">Your ${t.bolts} bolts are safe. They land as soon as a partner says yes.</p>
    <button class="btn primary" id="again">Keep going on it with Zap</button>
    <button class="btn ghost" id="reask">I\u2019ve sorted it, ask again</button>`;
  } else {
    const early = t.status === 'stopped';
    body = `${zapImg(early ? 'wave' : 'celebrate', early ? 'float' : 'bounce')}
    <div class="bubble">${esc(early ? say('stopped_early', 'Starting counts, and you started.') : say('session_finished', 'You did it!'))}</div>
    <h1 class="center">${esc(t.title)}</h1><p class="center">${statusBadge(t.status)}</p>
    ${t.bolts ? `<div class="big-bolts">+${t.bolts} bolts</div>` : ''}
    <a class="btn primary" href="#/">Back to Zap</a>`;
  }
  view.innerHTML = header() + body;
  if (t.status === 'pending') {
    $('#check').onclick = () => syncMine(true);
    const iv = setInterval(() => syncMine(), 6000); cleanup = () => clearInterval(iv); syncMine();
  }
  if (t.status === 'notyet') {
    $('#again').onclick = () => { S.session = { title: t.title, minutes: 10, startedAt: Date.now(), resumeOf: t.id, line: 'Back at it together. Just the next little bit.', checkedIn: false }; save(); go('#/focus'); };
    $('#reask').onclick = async () => { try { await api(`/api/tasks/${t.remoteId}/reopen`, { method: 'POST', body: {} }); t.status = 'pending'; t.comment = ''; t.decidedBy = ''; save(); renderTask(t); toast('Sent again. Fingers crossed!'); } catch (e) { toast(e.message); } };
  }
}
async function syncMine(manual) {
  if (!S.token || !S.tasks.some((t) => t.remoteId && t.status === 'pending')) { if (manual) toast('Nothing waiting right now.'); return; }
  try {
    const { tasks } = await api('/api/tasks/mine');
    let changed = null;
    for (const r of tasks) {
      const t = S.tasks.find((x) => x.remoteId === r.id); if (!t || t.status === r.status) continue;
      t.status = r.status; t.comment = r.comment || ''; t.decidedBy = r.decidedBy ? r.decidedBy.name : ''; t.decidedAt = r.decidedAt;
      if (r.status === 'approved' && !t.awarded) { t.awarded = true; S.bolts += t.bolts; ding(); confetti(); }
      changed = t;
    }
    save();
    if (changed) {
      if (location.hash === '#/task/' + changed.id) renderTask(changed);
      else toast(changed.status === 'approved' ? `${changed.decidedBy || 'A partner'} approved \u201c${changed.title}\u201d! +${changed.bolts} bolts` : `${changed.decidedBy || 'A partner'} replied about \u201c${changed.title}\u201d`);
    } else if (manual) toast('No word yet. That\u2019s fine, they\u2019ll get to it.');
  } catch (e) { if (manual) toast(e.message); }
}
function renderDraft(t) {
  let photo = null;
  const has = partners().length > 0;
  view.innerHTML = `${header()}
  ${zapImg('celebrate', 'bounce')}
  <div class="bubble">${esc(has ? acc('ask', partnerNames()) : 'You did it! Pair up with a partner and they can make it official.')}</div>
  <h1 class="center">${esc(t.title)}</h1>
  <p class="muted center">${fmtMin(t.minutes)} with Zap \u00b7 ${t.bolts} bolts once it\u2019s approved</p>
  <label class="lab" for="note">A note for your partner (optional)</label>
  <textarea id="note" maxlength="300" placeholder="e.g. Two piles done, tax pile is in the blue folder"></textarea>
  <label class="lab">Photo proof (optional)</label>
  <label class="btn ghost small" for="photo" style="cursor:pointer">\u{1F4F7} Add a photo</label>
  <input id="photo" type="file" accept="image/*" class="hidden">
  <img id="prev" class="photo-prev hidden" alt="Your photo proof">
  ${has ? `<button class="btn primary" id="send">Send to ${esc(partnerNames())} for approval</button>` : '<a class="btn primary" href="#/partners">Find a partner</a>'}
  <button class="btn ghost small" id="solo">Skip the partner check this time</button>
  <p class="muted center">Only this task, note and photo go to your partners.</p>`;
  $('#photo').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { photo = await shrink(f); $('#prev').src = photo; $('#prev').classList.remove('hidden'); } catch { toast('That photo didn\u2019t load. Try another?'); } };
  $('#solo').onclick = () => { t.accountable = false; t.status = 'done'; t.awarded = true; S.bolts += t.bolts; save(); ding(); confetti(); renderTask(t); };
  if ($('#send')) $('#send').onclick = async () => {
    const btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending\u2026';
    t.note = $('#note').value.trim();
    try { const r = await api('/api/tasks', { method: 'POST', body: { title: t.title, minutes: t.minutes, note: t.note, photo } }); t.remoteId = r.id; t.status = 'pending'; t.sentAt = Date.now(); save(); renderTask(t); }
    catch (e) { btn.disabled = false; btn.textContent = 'Try again'; toast(e.message); }
  };
}
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1000 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.72)); };
    img.onerror = rej; img.src = url;
  });
}
async function photoUrl(taskId) { const r = await api(`/api/tasks/${taskId}/photo`, { raw: true }); if (!r.ok) return null; return URL.createObjectURL(await r.blob()); }

// ---------- inbox: approve partners' tasks ----------
async function renderInbox() {
  setTab('inbox');
  view.innerHTML = `${header()}<h1>To approve</h1><p class="muted">Loading\u2026</p>`;
  let data; try { data = await api('/api/inbox'); } catch (e) { view.innerHTML = `${header()}<h1>To approve</h1><p class="muted">${esc(e.message)}</p>`; return; }
  if (!location.hash.startsWith('#/inbox')) return;
  view.innerHTML = `${header()}
  <h1>To approve</h1>
  <p class="muted">Your partners finished these. A quick look and a tap is all it takes.</p>
  ${data.pending.length ? data.pending.map((t) => `<div class="card" data-id="${t.id}">
    <div class="who">${avatar(t.owner.name)}<span><b>${esc(t.owner.name)}</b> <span class="muted">@${esc(t.owner.handle)}</span><br><span class="muted">finished ${when(t.createdAt)} \u00b7 ${fmtMin(t.minutes)} with Zap</span></span></div>
    <h2 style="margin:12px 0 4px">${esc(t.title)}</h2>
    ${t.note ? `<p>\u201c${esc(t.note)}\u201d</p>` : ''}
    ${t.hasPhoto ? `<img class="photo-prev" data-photo="${t.id}" alt="Photo proof from ${esc(t.owner.name)}">` : ''}
    <label class="lab" for="c-${t.id}">Say something kind (optional)</label>
    <div class="presets">${COMMENT_PRESETS.map((c) => `<button class="chip" data-preset="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <input id="c-${t.id}" type="text" maxlength="200" placeholder="e.g. Nice one!" style="margin-top:8px">
    <div class="row"><button class="btn mint" data-decide="approve">\u{1F44D} Approve</button><button class="btn ghost" data-decide="notyet">Not yet</button></div>
  </div>`).join('') : `${zapImg('idle', 'float small')}<div class="bubble">All caught up! Nothing waiting for your thumbs up.</div>`}
  ${data.recent.length ? `<h2>You recently answered</h2><div class="card">${data.recent.map((t) => `<div class="item"><span><span class="t">${esc(t.title)}</span><br><span class="s">${esc(t.owner.name)} \u00b7 ${when(t.decidedAt)}</span></span>${statusBadge(t.status)}</div>`).join('')}</div>` : ''}`;
  view.querySelectorAll('img[data-photo]').forEach(async (img) => { const u = await photoUrl(img.dataset.photo).catch(() => null); if (u) img.src = u; else img.remove(); });
  view.onclick = async (e) => {
    const card = e.target.closest('.card[data-id]'); if (!card) return;
    const pr = e.target.closest('[data-preset]'); if (pr) { card.querySelector('input').value = pr.dataset.preset; return; }
    const d = e.target.closest('[data-decide]'); if (!d) return;
    card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const r = await api(`/api/tasks/${card.dataset.id}/decide`, { method: 'POST', body: { decision: d.dataset.decide, comment: card.querySelector('input').value } });
      ding(); if (r.status === 'approved') confetti();
      toast(r.status === 'approved' ? `Approved! ${r.owner.name} gets their bolts.` : `Sent. Thanks for being honest and kind.`);
      await refreshMe(); setTimeout(renderInbox, 900);
    } catch (err) { toast(err.message); card.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  };
  cleanup = () => { view.onclick = null; };
}

// ---------- partners ----------
async function renderPartners() {
  setTab('partners');
  await refreshMe();
  if (!location.hash.startsWith('#/partners')) return;
  const m = S.me; if (!m) return renderOnboard(true);
  view.innerHTML = `${header()}
  <h1>Partners</h1>
  <p class="muted">Zap people who approve your finished tasks, and you theirs. Up to 5.</p>
  ${m.incoming.length ? `<div class="card"><b>Want to be partners?</b>${m.incoming.map((r) => `<div class="item"><div class="who">${avatar(r.from.name)}<span><span class="t">${esc(r.from.name)}</span><br><span class="s">@${esc(r.from.handle)}</span></span></div><span><button class="chip" data-accept="${r.id}">Yes</button> <button class="chip" data-decline="${r.id}">No thanks</button></span></div>`).join('')}</div>` : ''}
  <div class="card">${m.partners.length ? m.partners.map((p) => `<a class="item" href="#/chat/${p.id}" style="text-decoration:none;color:inherit"><div class="who">${avatar(p.name)}<span><span class="t">${esc(p.name)}</span> <span class="s">@${esc(p.handle)}</span><br><span class="s">${p.last ? (p.last.mine ? 'You: ' : '') + esc(p.last.text).slice(0, 40) : 'Say hi!'}</span></span></div>${p.unread ? `<span class="badge">${p.unread}</span>` : '<span class="muted">Chat \u203a</span>'}</a>`).join('') : `<p class="muted">No partners yet. Share your code, add someone by handle, or let Zap match you.</p>`}</div>
  <h2>Your invite code</h2>
  <div class="code" id="mycode">${esc(m.user.inviteCode)}</div>
  <div class="row"><button class="btn primary small" id="shareCode">Share invite</button><button class="btn ghost small" id="copyCode">Copy</button></div>
  <h2>Got someone\u2019s code?</h2>
  <div class="composer"><input id="code" type="text" maxlength="8" placeholder="e.g. K7Q2MX" autocapitalize="characters" value="${esc(S.pendingJoin || '')}"><button class="btn mint" id="useCode">Pair</button></div>
  <h2>Find by handle</h2>
  <div class="composer"><input id="handle" type="text" maxlength="21" placeholder="@handle" autocapitalize="none"><button class="btn mint" id="ask">Ask</button></div>
  ${m.outgoing.length ? `<p class="muted">Waiting on: ${m.outgoing.map((r) => `@${esc(r.to.handle)} <button class="chip" data-cancel="${r.id}" aria-label="Cancel request">\u2715</button>`).join(' ')}</p>` : ''}
  <h2>Match me with someone</h2>
  <div class="toggle"><span><b>${m.inQueue ? 'Looking for a partner\u2026' : 'Pair me with another Zap person'}</b><small>${m.inQueue ? 'You\u2019ll be paired with the next person who joins the queue.' : 'Anyone 16+ who also wants a partner. You can unpair any time.'}</small></span><label class="switch"><input type="checkbox" id="match" ${m.inQueue ? 'checked' : ''} aria-label="Match me with someone"><span></span></label></div>
  <p class="muted">Partners only see tasks you send for approval, and your chats. You can unpair, block or report from any chat.</p>`;
  const inviteText = `Want to be my Zap focus partner? We approve each other\u2019s finished tasks. Open ${appLink()}#/join/${m.user.inviteCode} or enter code ${m.user.inviteCode} in Zap.`;
  $('#shareCode').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'Join me on Zap', text: inviteText }); return; } catch (e) { if (e.name === 'AbortError') return; } } copyText(inviteText); };
  $('#copyCode').onclick = () => copyText(inviteText);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); renderPartners(); } catch (e) { toast(e.message); } };
  $('#useCode').onclick = () => act(async () => { const r = await api('/api/pair/code', { method: 'POST', body: { code: $('#code').value } }); S.pendingJoin = null; save(); ding(); confetti(); toast(`You and ${r.partner.name} are partners now!`); });
  $('#ask').onclick = () => act(() => api('/api/pair/request', { method: 'POST', body: { handle: $('#handle').value } }), 'Asked! They\u2019ll see it next time they open Zap.');
  $('#match').onchange = (e) => act(async () => { const r = await api('/api/match', { method: 'POST', body: { on: e.target.checked } }); if (r.matched) { ding(); confetti(); toast(`Matched with ${r.matched.name}! Say hi.`); } });
  view.onclick = (e) => {
    const a = e.target.closest('[data-accept]'), d = e.target.closest('[data-decline]'), c = e.target.closest('[data-cancel]');
    if (a) act(() => api(`/api/pair/request/${a.dataset.accept}/accept`, { method: 'POST', body: {} }), 'Partners! Say hi in the chat.');
    if (d) act(() => api(`/api/pair/request/${d.dataset.decline}/decline`, { method: 'POST', body: {} }), 'No worries.');
    if (c) act(() => api(`/api/pair/request/${c.dataset.cancel}/cancel`, { method: 'POST', body: {} }));
  };
  cleanup = () => { view.onclick = null; };
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Copied!'); } catch { prompt('Copy this:', text); } }

// ---------- chat ----------
async function renderChat(pid) {
  setTab('partners');
  if (!partners().find((p) => p.id === pid)) await refreshMe();
  const p = partners().find((x) => x.id === pid);
  if (!p) { toast('You\u2019re not paired with them any more.'); return go('#/partners'); }
  const presets = (S.me && S.me.presets) || {};
  view.innerHTML = `${header()}
  <div class="who">${avatar(p.name)}<span><b>${esc(p.name)}</b> <span class="muted">@${esc(p.handle)}</span></span></div>
  <div class="chat" id="msgs"><p class="muted center">Loading\u2026</p></div>
  <div class="presets" id="presets">${Object.entries(presets).map(([id, t]) => `<button class="chip" data-p="${id}">${esc(t)}</button>`).join('')}</div>
  <div class="composer"><input id="txt" type="text" maxlength="280" placeholder="Short and kind\u2026" enterkeyhint="send"><button class="btn primary" id="send">Send</button></div>
  <p class="muted" style="font-size:13px">No links in chat. Be kind; Zap is a no-shame zone.</p>
  <details style="margin-top:14px"><summary class="muted">Safety options</summary>
    <button class="btn ghost small" id="unpair">Unpair from ${esc(p.name)}</button>
    <button class="btn ghost small danger" id="block">Block ${esc(p.name)}</button>
    <button class="btn ghost small danger" id="report">Report ${esc(p.name)}</button>
  </details>`;
  let last = 0; const box = $('#msgs'); let first = true;
  const draw = (msgs) => {
    if (first) { box.innerHTML = msgs.length ? '' : `<p class="muted center" id="empty">Say hi to ${esc(p.name)}! A preset is a nice way to start.</p>`; first = false; }
    if (msgs.length) { const e = $('#empty'); if (e) e.remove(); }
    for (const x of msgs) { if (box.querySelector(`[data-mid="${x.id}"]`)) continue; const d = document.createElement('div'); d.className = 'msg' + (x.mine ? ' mine' : ''); d.dataset.mid = x.id; d.innerHTML = `${esc(x.text)}<small>${when(x.at)}</small>`; box.appendChild(d); last = Math.max(last, x.at); }
    if (msgs.length) box.lastElementChild.scrollIntoView({ block: 'end' });
  };
  const poll = async () => { try { const r = await api(`/api/chat/${pid}?since=${last}`); draw(r.messages); } catch (e) { if (e.status === 404) { toast('This chat has ended.'); go('#/partners'); } } };
  await poll(); refreshMe();
  const iv = setInterval(poll, 4000); cleanup = () => clearInterval(iv);
  const sendMsg = async (body) => { try { const r = await api(`/api/chat/${pid}`, { method: 'POST', body }); draw([r]); $('#txt').value = ''; } catch (e) { toast(e.message); } };
  $('#presets').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) sendMsg({ preset: b.dataset.p }); };
  $('#send').onclick = () => { const t = $('#txt').value.trim(); if (t) sendMsg({ text: t }); };
  $('#txt').onkeydown = (e) => { if (e.key === 'Enter') $('#send').click(); };
  const safety = async (kind, msg, body = {}) => { try { await api(`/api/partners/${pid}/${kind}`, { method: 'POST', body }); await refreshMe(); toast(msg); go('#/partners'); } catch (e) { toast(e.message); } };
  $('#unpair').onclick = () => { if (confirm(`Unpair from ${p.name}? No hard feelings, and they won\u2019t be told why.`)) safety('unpair', 'Unpaired. Take care!'); };
  $('#block').onclick = () => { if (confirm(`Block ${p.name}? You\u2019ll be unpaired and they can\u2019t pair or match with you again.`)) safety('block', 'Blocked. You\u2019re safe here.'); };
  $('#report').onclick = () => { const reason = prompt(`What happened with ${p.name}? (This also blocks them.)`); if (reason !== null) safety('report', 'Thanks for telling us. They\u2019re blocked.', { reason }); };
}

// ---------- me: done list + settings ----------
function renderMe() {
  setTab('me');
  const approved = S.tasks.filter((t) => t.status === 'approved');
  const others = S.tasks.filter((t) => t.status !== 'approved');
  const row = (t) => `<a class="item" href="#/task/${t.id}" style="text-decoration:none;color:inherit"><span><span class="t">${esc(t.title)}</span><br><span class="s">${when(t.decidedAt || t.finishedAt)} \u00b7 ${fmtMin(t.minutes)}${t.decidedBy ? ' \u00b7 ' + esc(t.decidedBy) : ''}${t.awarded && t.bolts ? ' \u00b7 +' + t.bolts + ' bolts' : ''}</span></span>${statusBadge(t.status)}</a>`;
  view.innerHTML = `${header()}
  <h1>${S.me ? esc(S.me.user.name) : 'Me'}</h1>
  ${S.me ? `<p class="muted">@${esc(S.me.user.handle)}</p>` : `<a class="btn primary small" href="#/partners">Make a Zap profile</a>`}
  <h2>Approved by a partner (${approved.length})</h2>
  <div class="card">${approved.length ? approved.map(row).join('') : '<p class="muted">Nothing approved yet. Your first one is coming.</p>'}</div>
  <h2>Everything else</h2>
  <div class="card">${others.length ? others.map(row).join('') : '<p class="muted">No tasks yet. Pick one small thing on the Focus tab.</p>'}</div>
  <h2>Settings</h2>
  ${S.me ? `<label class="lab" for="myname">Display name</label><input id="myname" type="text" maxlength="30" value="${esc(S.me.user.name)}">` : ''}
  <div class="toggle"><span><b>Partner check on by default</b><small>You can still switch it per task.</small></span><label class="switch"><input type="checkbox" id="accdef" ${S.settings.accountability ? 'checked' : ''} aria-label="Partner check on by default"><span></span></label></div>
  <div class="toggle"><span><b>Sounds</b><small>A little chime when you finish.</small></span><label class="switch"><input type="checkbox" id="snd" ${S.settings.sound ? 'checked' : ''} aria-label="Sounds"><span></span></label></div>
  ${S.token ? `<details style="margin-top:14px"><summary class="muted">Sign-in key (to use Zap on another device)</summary><p class="muted">Keep this private. Anyone with it can use your profile.</p><div class="linkbox">${esc(S.token)}</div></details>
  <button class="btn ghost small" id="newcode">Get a new invite code</button>
  <button class="btn ghost small" id="signout">Sign out on this device</button>` : ''}
  <button class="btn ghost small hidden" id="install">Install Zap on this phone</button>
  <p class="muted">Focus sessions stay on this phone. Tasks you send for approval, and partner chats, go through Zap\u2019s server and are cleared after 60 days.</p>`;
  if ($('#myname')) $('#myname').onchange = async (e) => { try { S.me = await api('/api/me', { method: 'POST', body: { name: e.target.value } }); save(); toast('Saved'); } catch (err) { toast(err.message); } };
  $('#accdef').onchange = (e) => { S.settings.accountability = e.target.checked; save(); };
  $('#snd').onchange = (e) => { S.settings.sound = e.target.checked; save(); };
  if ($('#newcode')) $('#newcode').onclick = async () => { try { S.me = await api('/api/me', { method: 'POST', body: { newInviteCode: true } }); save(); toast(`New code: ${S.me.user.inviteCode}`); } catch (e) { toast(e.message); } };
  if ($('#signout')) $('#signout').onclick = () => { if (confirm('Sign out? Copy your sign-in key first if you want to come back to this profile.')) { S.token = null; S.me = null; save(); badges(); go('#/'); } };
  if (deferredInstall) { const ib = $('#install'); ib.classList.remove('hidden'); ib.onclick = () => { deferredInstall.prompt(); deferredInstall = null; ib.classList.add('hidden'); }; }
}

// ---------- background sync + pwa ----------
async function bg() { if (document.hidden || !S.token) return; await refreshMe(); if (!S.session) syncMine(); }
setInterval(bg, 15000);
document.addEventListener('visibilitychange', bg);
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
badges(); route(); bg();
})();
