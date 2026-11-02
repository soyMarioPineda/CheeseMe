// Si el estado "running" no se actualiza en este tiempo, la pestaña se cerró o
// se recargó a mitad del escaneo.
const STALE_MS = 2 * 60 * 1000;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEventListeners();
  chrome.storage.onChanged.addListener(onStorageChanged);

  const { lastScan, lastData, scanState } = await chrome.storage.local.get(['lastScan', 'lastData', 'scanState']);

  updateLastScan(lastScan);
  if (lastData) {
    displayResults(lastData);
    hide('instructions');
  }
  renderScanState(scanState);
}

function setupEventListeners() {
  document.getElementById('scanBtn').addEventListener('click', startFullScan);
  document.getElementById('cancelBtn').addEventListener('click', cancelScan);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);}

function onStorageChanged(changes, area) {
  if (area !== 'local') return;
  if (changes.lastData && changes.lastData.newValue) {
    displayResults(changes.lastData.newValue);
    hide('instructions');
  }
  if (changes.lastScan) updateLastScan(changes.lastScan.newValue);
  if (changes.scanState) renderScanState(changes.scanState.newValue);
}

// -----------------------------------------------------------------------------
// Escaneo
// -----------------------------------------------------------------------------

async function startFullScan() {
  hideError();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https:\/\/www\.instagram\.com\//.test(tab.url)) {
    showError('Debes estar en instagram.com (en el perfil que quieres escanear).');
    return;
  }

  document.getElementById('scanBtn').disabled = true;

  try {
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startScan' });
    if (!response || !response.success) {
      throw new Error(response?.error || 'No se pudo iniciar el escaneo.');
    }
    // A partir de aquí la UI se actualiza con los cambios de scanState.
    renderScanState({ status: 'running', message: 'Iniciando...', updatedAt: Date.now() });
  } catch (error) {
    document.getElementById('scanBtn').disabled = false;
    showError(error.message);
  }
}

async function cancelScan() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'cancelScan' });
  } catch (_) {
    // La pestaña ya no tiene el script: marcamos el escaneo como cancelado.
    await chrome.storage.local.set({ scanState: { status: 'cancelled', updatedAt: Date.now() } });
  }
}

// El content script solo se inyecta al cargar la página. Si la extensión se
// instaló/recargó con Instagram ya abierto, lo inyectamos a mano.
async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (res && res.ok) return;
  } catch (_) { /* no hay receptor */ }

  await chrome.scripting.executeScript({ target: { tabId }, files: ['scraper.js'] });
}

function renderScanState(state) {
  const scanBtn = document.getElementById('scanBtn');
  const isRunning = state && state.status === 'running' && Date.now() - (state.updatedAt || 0) < STALE_MS;

  if (isRunning) {
    scanBtn.disabled = true;
    show('loading');
    hide('instructions');
    document.getElementById('loadingText').textContent = state.message || 'Escaneando...';
    const target = document.getElementById('loadingTarget');
    target.textContent = state.username ? `Perfil: @${state.username}` : '';
    return;
  }

  scanBtn.disabled = false;
  hide('loading');

  if (state && state.status === 'error' && state.error) {
    showError(state.error);
  } else if (state && state.status === 'done' && state.warning) {
    showMessage(`⚠️ ${state.warning}`);
  }
}

// -----------------------------------------------------------------------------
// Resultados
// -----------------------------------------------------------------------------

function categorize(data) {
  const followersSet = new Set(data.followers);
  const followingSet = new Set(data.following);
  return {
    // Sigue pero no le siguen de vuelta
    notFollowBack: data.following.filter((u) => !followersSet.has(u)),
    // Le siguen pero no los sigue
    followYou: data.followers.filter((u) => !followingSet.has(u)),
    // Se siguen mutuamente
    mutual: data.followers.filter((u) => followingSet.has(u))
  };
}

function displayResults(data) {
  const { followers, following, username, expected } = data;
  const { notFollowBack, followYou, mutual } = categorize(data);

  show('stats');
  show('results');

  document.getElementById('profileRow').classList.toggle('hidden', !username);
  document.getElementById('profileName').textContent = username ? `@${username}` : '';

  document.getElementById('followersCount').textContent = followers.length;
  document.getElementById('followingCount').textContent = following.length;
  setExpectedNote('followersNote', followers.length, expected?.followers);
  setExpectedNote('followingNote', following.length, expected?.following);

  updateSection(notFollowBack, 'notFollowBackCount', 'notFollowBackList');
  updateSection(followYou, 'followYouCount', 'followYouList');
  updateSection(mutual, 'mutualCount', 'mutualList');
}

// Instagram a veces no devuelve cuentas desactivadas/restringidas, así que el
// total puede diferir un poco del contador del perfil.
function setExpectedNote(id, got, expected) {
  const el = document.getElementById(id);
  el.textContent = expected != null && expected !== got ? `Instagram muestra ${expected}` : '';
}

function updateSection(users, countId, listId) {
  document.getElementById(countId).textContent = users.length;

  const listEl = document.getElementById(listId);
  listEl.replaceChildren();

  if (users.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'user-item';
    empty.textContent = 'Sin usuarios en esta categoría';
    listEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const username of users) {
    const item = document.createElement('div');
    item.className = 'user-item';
    const link = document.createElement('a');
    link.href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    link.target = '_blank';
    link.textContent = `@${username}`;
    item.appendChild(link);
    fragment.appendChild(item);
  }
  listEl.appendChild(fragment);
}

async function exportToCSV() {
  const { lastData } = await chrome.storage.local.get(['lastData']);

  if (!lastData) {
    showError('No hay datos para exportar. Primero escanea una cuenta.');
    return;
  }

  const { notFollowBack, followYou, mutual } = categorize(lastData);
  const rows = [['Username', 'Categoria']];
  mutual.forEach((u) => rows.push([u, 'Mutuo']));
  followYou.forEach((u) => rows.push([u, 'Le sigue (no lo sigue de vuelta)']));
  notFollowBack.forEach((u) => rows.push([u, 'Lo sigue (no le sigue de vuelta)']));

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM para que Excel detecte UTF-8 (acentos).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date(lastData.timestamp).toISOString().slice(0, 10);
  a.href = url;
  a.download = `cheeseme-${lastData.username || 'instagram'}-${date}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// -----------------------------------------------------------------------------
// Utilidades de UI
// -----------------------------------------------------------------------------

function updateLastScan(timestamp) {
  if (timestamp) {
    document.getElementById('lastScan').textContent = getTimeAgo(new Date(timestamp));
  }
}

function showError(message) {
  showMessage(`❌ ${message}`);
}

function showMessage(text) {
  const el = document.getElementById('error');
  el.textContent = text;
  show('error');
}

function hideError() {
  hide('error');
}

function show(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hide(id) {
  document.getElementById(id).classList.add('hidden');
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units = [
    [31536000, 'año', 'años'],
    [2592000, 'mes', 'meses'],
    [86400, 'día', 'días'],
    [3600, 'hora', 'horas'],
    [60, 'minuto', 'minutos']
  ];
  for (const [secs, singular, plural] of units) {
    const n = Math.floor(seconds / secs);
    if (n >= 1) return `Hace ${n} ${n === 1 ? singular : plural}`;
  }
  return 'Hace un momento';
}
