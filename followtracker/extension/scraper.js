// CheeseMe - content script
//
// Obtiene la lista completa de seguidores y seguidos del perfil abierto en la
// pestaña usando la misma API interna que usa la web de Instagram (con la
// sesión del usuario), en lugar de hacer scroll sobre el modal.
//
// El escaneo corre aquí (en la pestaña), no en el popup: el progreso y el
// resultado se guardan en chrome.storage.local, así que cerrar el popup no
// interrumpe nada.

(function () {
  'use strict';

  // Evita registrar dos veces si el popup inyecta el script manualmente.
  if (window.__cheeseMeScraperLoaded) return;
  window.__cheeseMeScraperLoaded = true;

  const IG_APP_ID = '936619743392459'; // App ID público de instagram.com (web)
  const PAGE_SIZE = 50;
  const MIN_DELAY_MS = 900;
  const MAX_DELAY_MS = 1800;
  const RATE_LIMIT_WAIT_MS = 60000;
  const MAX_RETRIES = 4;

  // Primeros segmentos de URL que no son perfiles.
  const RESERVED_PATHS = new Set([
    '', 'accounts', 'direct', 'explore', 'reels', 'reel', 'p', 'tv', 'stories',
    'about', 'legal', 'developer', 'challenge', 'emails', 'session', 'web',
    'api', 'graphql', 'privacy', 'oauth', 'nametag', 'lite', 'topics', 'ar',
    'directory', 'press', 'blog', 'help', 'notifications', 'your_activity'
  ]);

  let running = false;
  let cancelRequested = false;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ ok: true });
      return;
    }

    if (request.action === 'startScan') {
      if (running) {
        sendResponse({ success: false, error: 'Ya hay un escaneo en curso.' });
        return;
      }
      running = true;
      cancelRequested = false;
      runScan().finally(() => { running = false; });
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'cancelScan') {
      cancelRequested = true;
      sendResponse({ success: true });
    }
  });

  class CancelledError extends Error {}

  async function runScan() {
    try {
      await setState({ status: 'running', phase: 'init', message: 'Identificando perfil...' });

      const profile = await resolveProfile();
      console.log('[CheeseMe] Perfil:', profile);

      const base = {
        status: 'running',
        username: profile.username,
        expected: { followers: profile.followersCount, following: profile.followingCount }
      };

      const followers = await fetchList(profile, 'followers', async (count) => {
        await setState({
          ...base, phase: 'followers', fetched: count, total: profile.followersCount,
          message: `📥 Seguidores: ${formatProgress(count, profile.followersCount)}`
        });
      });

      const following = await fetchList(profile, 'following', async (count) => {
        await setState({
          ...base, phase: 'following', fetched: count, total: profile.followingCount,
          message: `📤 Seguidos: ${formatProgress(count, profile.followingCount)}`
        });
      });

      const data = {
        username: profile.username,
        userId: profile.id,
        followers,
        following,
        expected: base.expected,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({ lastScan: data.timestamp, lastData: data });
      await setState({ status: 'done', username: profile.username, message: 'Escaneo completado' });
      console.log(`[CheeseMe] Listo: ${followers.length} seguidores, ${following.length} seguidos`);
    } catch (error) {
      if (error instanceof CancelledError) {
        await setState({ status: 'cancelled', message: 'Escaneo cancelado' });
      } else {
        console.error('[CheeseMe] Error:', error);
        await setState({ status: 'error', error: error.message || String(error) });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Perfil objetivo
  // ---------------------------------------------------------------------------

  function getUsernameFromUrl() {
    const first = location.pathname.split('/').filter(Boolean)[0] || '';
    if (RESERVED_PATHS.has(first.toLowerCase())) return null;
    if (!/^[A-Za-z0-9._]{1,30}$/.test(first)) return null;
    return first;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function resolveProfile() {
    const viewerId = getCookie('ds_user_id');
    let username = getUsernameFromUrl();

    // Si no estamos en un perfil, usamos la cuenta con la sesión iniciada.
    if (!username) {
      if (!viewerId) {
        throw new Error('No hay sesión iniciada en Instagram. Inicia sesión y abre un perfil.');
      }
      const info = await apiGet(`/api/v1/users/${viewerId}/info/`);
      username = info?.user?.username;
      if (!username) throw new Error('No se pudo identificar tu cuenta. Abre un perfil e intenta de nuevo.');
    }

    const json = await apiGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    const user = json?.data?.user;
    if (!user) throw new Error(`No se encontró el perfil @${username}.`);

    const isSelf = viewerId && String(user.id) === String(viewerId);
    if (user.is_private && !user.followed_by_viewer && !isSelf) {
      throw new Error(`@${username} es una cuenta privada y no la sigues, así que Instagram no muestra sus listas.`);
    }

    return {
      id: String(user.id),
      username: user.username,
      followersCount: user.edge_followed_by?.count ?? null,
      followingCount: user.edge_follow?.count ?? null
    };
  }

  // ---------------------------------------------------------------------------
  // Listas paginadas
  // ---------------------------------------------------------------------------

  async function fetchList(profile, type, onProgress) {
    const users = new Set();
    const seenCursors = new Set();
    let maxId = null;

    await onProgress(0);

    while (true) {
      checkCancelled();

      const params = new URLSearchParams({ count: String(PAGE_SIZE) });
      if (maxId) params.set('max_id', maxId);
      if (type === 'followers') params.set('search_surface', 'follow_list_page');

      const json = await apiGet(`/api/v1/friendships/${profile.id}/${type}/?${params}`);

      for (const u of json.users || []) {
        if (u && u.username) users.add(u.username);
      }

      await onProgress(users.size);

      const next = json.next_max_id;
      if (!next || seenCursors.has(String(next))) break;
      seenCursors.add(String(next));
      maxId = String(next);

      await sleep(randomBetween(MIN_DELAY_MS, MAX_DELAY_MS));
    }

    return Array.from(users);
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  async function apiGet(path) {
    const headers = {
      'Accept': 'application/json',
      'X-IG-App-ID': IG_APP_ID,
      'X-Requested-With': 'XMLHttpRequest'
    };
    const csrf = getCookie('csrftoken');
    if (csrf) headers['X-CSRFToken'] = csrf;
    try {
      const claim = sessionStorage.getItem('www-claim-v2');
      if (claim) headers['X-IG-WWW-Claim'] = claim;
    } catch (_) { /* sin acceso a sessionStorage */ }

    for (let attempt = 1; ; attempt++) {
      checkCancelled();

      let res;
      try {
        res = await fetch(path, { credentials: 'include', headers });
      } catch (networkError) {
        if (attempt >= MAX_RETRIES) throw new Error('Error de red al contactar a Instagram.');
        await sleep(3000 * attempt);
        continue;
      }

      let json = null;
      try { json = await res.json(); } catch (_) { /* respuesta no-JSON */ }

      const rateLimited = res.status === 429 ||
        (json && json.status === 'fail' && /wait a few minutes|espera unos minutos/i.test(json.message || ''));

      if (rateLimited) {
        if (attempt >= MAX_RETRIES) {
          throw new Error('Instagram está limitando las peticiones. Espera unos minutos e intenta de nuevo.');
        }
        await waitWithHeartbeat(RATE_LIMIT_WAIT_MS * attempt,
          (s) => `⏳ Instagram pidió esperar. Reintentando en ${s}s...`);
        continue;
      }

      if (res.status === 401 || res.status === 403 || (json && json.require_login)) {
        throw new Error('Instagram rechazó la petición. Verifica que tengas la sesión iniciada.');
      }

      if (json && json.message === 'checkpoint_required') {
        throw new Error('Instagram pide verificar tu cuenta. Ábrela en instagram.com y vuelve a intentarlo.');
      }

      if (!res.ok || !json) {
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await sleep(3000 * attempt);
          continue;
        }
        if (res.status === 404) throw new Error('Perfil no encontrado.');
        throw new Error(`Respuesta inesperada de Instagram (HTTP ${res.status}).`);
      }

      if (json.status === 'fail') {
        throw new Error(json.message || 'Instagram devolvió un error.');
      }

      return json;
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  async function setState(state) {
    await chrome.storage.local.set({ scanState: { ...state, updatedAt: Date.now() } });
  }

  // Espera larga que sigue actualizando el estado para que el popup no la
  // considere "colgada".
  async function waitWithHeartbeat(ms, messageFn) {
    const current = (await chrome.storage.local.get('scanState')).scanState || {};
    const end = Date.now() + ms;
    while (Date.now() < end) {
      checkCancelled();
      const secs = Math.ceil((end - Date.now()) / 1000);
      await setState({ ...current, message: messageFn(secs) });
      await sleep(Math.min(5000, end - Date.now()));
    }
  }

  function checkCancelled() {
    if (cancelRequested) throw new CancelledError('cancelled');
  }

  function formatProgress(count, total) {
    return total ? `${count} / ${total}` : String(count);
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  console.log('[CheeseMe] Scraper cargado');
})();
