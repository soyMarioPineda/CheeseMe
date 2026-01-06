document.addEventListener('DOMContentLoaded', init);

function init() {
  loadLastScan();
  setupEventListeners();
}

function setupEventListeners() {
  document.getElementById('scanBtn').addEventListener('click', startFullScan);
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('donateLink').addEventListener('click', showDonation);
}

async function loadLastScan() {
  const data = await chrome.storage.local.get(['lastScan', 'lastData']);
  
  if (data.lastScan) {
    const date = new Date(data.lastScan);
    const timeAgo = getTimeAgo(date);
    document.getElementById('lastScan').textContent = timeAgo;
  }

  if (data.lastData) {
    displayResults(data.lastData);
    document.getElementById('instructions').classList.add('hidden');
  }
}

async function startFullScan() {
  const scanBtn = document.getElementById('scanBtn');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const results = document.getElementById('results');
  const instructions = document.getElementById('instructions');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('instagram.com')) {
    alert('⚠️ Debes estar en Instagram para escanear.\n\nAbre instagram.com en tu perfil e intenta de nuevo.');
    return;
  }

  scanBtn.disabled = true;
  loading.classList.remove('hidden');
  results.classList.add('hidden');
  instructions.classList.add('hidden');

  try {
    // Escanear SEGUIDORES
    loadingText.textContent = '📥 Escaneando seguidores...';
    const followersResponse = await chrome.tabs.sendMessage(tab.id, { action: 'scanFollowers' });
    
    if (!followersResponse.success) {
      throw new Error(followersResponse.error);
    }

    const followers = followersResponse.data;
    console.log('✅ Seguidores:', followers.length);

    // Escanear SEGUIDOS
    loadingText.textContent = '📤 Escaneando seguidos...';
    await sleep(1000); // Pausa entre escaneos
    
    const followingResponse = await chrome.tabs.sendMessage(tab.id, { action: 'scanFollowing' });
    
    if (!followingResponse.success) {
      throw new Error(followingResponse.error);
    }

    const following = followingResponse.data;
    console.log('✅ Siguiendo:', following.length);

    // Calcular categorías
    loadingText.textContent = '🔄 Analizando datos...';
    await sleep(500);

    const data = {
      followers,
      following,
      timestamp: Date.now()
    };

    // Guardar
    await chrome.storage.local.set({
      lastScan: data.timestamp,
      lastData: data
    });

    // Mostrar resultados
    loading.classList.add('hidden');
    displayResults(data);
    
    alert('✅ Escaneo completado exitosamente!');

  } catch (error) {
    loading.classList.add('hidden');
    alert('❌ Error: ' + error.message + '\n\nAsegúrate de estar en tu perfil de Instagram.');
    console.error('Scan error:', error);
  } finally {
    scanBtn.disabled = false;
  }
}

function displayResults(data) {
  const { followers, following } = data;

  // Convertir a Sets
  const followersSet = new Set(followers);
  const followingSet = new Set(following);

  // Calcular categorías
  // YO sigo pero NO me siguen
  const notFollowBack = following.filter(user => !followersSet.has(user));
  
  // ELLOS me siguen pero YO NO los sigo
  const followYou = followers.filter(user => !followingSet.has(user));
  
  // MUTUOS - nos seguimos
  const mutual = followers.filter(user => followingSet.has(user));

  // Mostrar stats
  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('results').classList.remove('hidden');
  
  document.getElementById('followersCount').textContent = followers.length;
  document.getElementById('followingCount').textContent = following.length;

  // Debug
  console.log('=== CATEGORÍAS ===');
  console.log('Seguidores:', followers.length);
  console.log('Siguiendo:', following.length);
  console.log('Sigues pero no te siguen:', notFollowBack.length);
  console.log('Te siguen pero no los sigues:', followYou.length);
  console.log('Mutuos:', mutual.length);
  console.log('');
  console.log('✅ Verificación 1:', followYou.length, '+', mutual.length, '=', followers.length);
  console.log('✅ Verificación 2:', notFollowBack.length, '+', mutual.length, '=', following.length);

  // Actualizar UI
  updateSection(notFollowBack, 'notFollowBackCount', 'notFollowBackList');
  updateSection(followYou, 'followYouCount', 'followYouList');
  updateSection(mutual, 'mutualCount', 'mutualList');
}

function updateSection(users, countId, listId) {
  document.getElementById(countId).textContent = users.length;
  
  const listEl = document.getElementById(listId);
  listEl.innerHTML = '';

  if (users.length === 0) {
    listEl.innerHTML = '<div class="user-item">Sin usuarios en esta categoría</div>';
    return;
  }

  users.forEach(username => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `<a href="https://instagram.com/${username}" target="_blank">@${username}</a>`;
    listEl.appendChild(item);
  });
}

async function exportToCSV() {
  const data = await chrome.storage.local.get(['lastData']);
  
  if (!data.lastData) {
    alert('No hay datos para exportar. Primero escanea tu cuenta.');
    return;
  }

  const { followers, following } = data.lastData;
  const followersSet = new Set(followers);
  const followingSet = new Set(following);

  let csv = 'Username,Categoria\n';

  // Mutuos
  followers.forEach(user => {
    if (followingSet.has(user)) {
      csv += `${user},Mutuo\n`;
    }
  });

  // Te siguen pero no los sigues
  followers.forEach(user => {
    if (!followingSet.has(user)) {
      csv += `${user},Te sigue (no lo sigues)\n`;
    }
  });

  // Sigues pero no te siguen
  following.forEach(user => {
    if (!followersSet.has(user)) {
      csv += `${user},Sigues (no te sigue)\n`;
    }
  });

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instagram-followers-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function showDonation() {
  const btcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
  alert(`💰 Donaciones Bitcoin:\n\n${btcAddress}\n\n¡Gracias por tu apoyo! ❤️`);
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' años';
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' meses';
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' días';
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' horas';
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutos';
  
  return 'Hace un momento';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}