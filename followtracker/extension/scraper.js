// CheeseMe - content script
//
// Escanea seguidores y seguidos manipulando la pantalla como lo haría una
// persona: abre la lista de "seguidores", la baja poco a poco esperando a que
// Instagram cargue más cuentas, la cierra y repite con "seguidos".
//
// El progreso y el resultado se guardan en chrome.storage.local, así que el
// popup puede cerrarse sin interrumpir el escaneo.

(function () {
  'use strict';

  // Evita registrar dos veces si el popup inyecta el script manualmente.
  if (window.__cheeseMeScraperLoaded) return;
  window.__cheeseMeScraperLoaded = true;

  // Tiempos (ms). Todo lleva algo de azar para parecerse a una persona.
  const SCROLL_DELAY = [900, 1700];      // pausa entre cada bajada
  const LOAD_TIMEOUT = 20000;            // espera máxima a que abra la lista
  // Cuánto esperar sin que aparezcan cuentas nuevas antes de dar la lista por
  // terminada, según lo seguros que estemos de haber llegado al final:
  const PATIENCE_END_CONFIRMED = 8000;   // Instagram ya muestra "Sugerencias para ti"
  const PATIENCE_NEARLY_DONE = 25000;    // faltan muy pocas cuentas (desactivadas, etc.)
  const PATIENCE_INCOMPLETE = 240000;    // faltan muchas: Instagram va lento, hay que esperar
  const WIGGLE_EVERY = 6000;             // si no carga, sube y baja para "despertar" la lista

  const RESERVED_PATHS = new Set([
    '', 'accounts', 'direct', 'explore', 'reels', 'reel', 'p', 'tv', 'stories',
    'about', 'legal', 'developer', 'challenge', 'emails', 'session', 'web',
    'api', 'graphql', 'privacy', 'oauth', 'nametag', 'lite', 'topics', 'ar',
    'directory', 'press', 'blog', 'help', 'notifications', 'your_activity'
  ]);

  const SUGGESTIONS_RE = /^(sugerencias para ti|suggested for you|sugerencias)$/i;

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

      const username = getUsernameFromUrl();
      if (!username) {
        throw new Error('Abre el perfil de Instagram que quieres escanear (instagram.com/usuario) y vuelve a intentarlo.');
      }

      // Si quedó abierta alguna lista, la cerramos primero.
      await closeDialog();

      const followersLink = await waitForListLink(username, 'followers');
      const followingLink = await waitForListLink(username, 'following');
      if (!followersLink || !followingLink) {
        throw new Error(`No se encontraron los botones de seguidores/seguidos de @${username}. ` +
          'Si es una cuenta privada que no sigues, Instagram no muestra sus listas.');
      }

      const expected = {
        followers: readCount(followersLink),
        following: readCount(followingLink)
      };
      console.log('[CheeseMe] Perfil:', username, expected);

      const base = { status: 'running', username, expected };

      const followers = await scanList(username, 'followers', expected.followers, async (count, note) => {
        const message = `📥 Seguidores: ${formatProgress(count, expected.followers)}${note ? ' · ' + note : ''}`;
        overlay(message);
        await setState({ ...base, phase: 'followers', fetched: count, total: expected.followers, message });
      });

      await humanPause(1500, 3000);

      const following = await scanList(username, 'following', expected.following, async (count, note) => {
        const message = `📤 Seguidos: ${formatProgress(count, expected.following)}${note ? ' · ' + note : ''}`;
        overlay(message);
        await setState({ ...base, phase: 'following', fetched: count, total: expected.following, message });
      });

      const data = { username, followers, following, expected, timestamp: Date.now() };
      await chrome.storage.local.set({ lastScan: data.timestamp, lastData: data });

      // Si faltan muchas cuentas, Instagram dejó de cargar antes del final.
      const incomplete = [];
      if (isFarFrom(followers.length, expected.followers)) incomplete.push('seguidores');
      if (isFarFrom(following.length, expected.following)) incomplete.push('seguidos');
      const warning = incomplete.length
        ? `Instagram dejó de cargar ${incomplete.join(' y ')} antes del final. Espera unos minutos y vuelve a escanear para completar la lista.`
        : null;

      overlay('✅ Escaneo completado', 4000);
      await setState({ status: 'done', username, message: 'Escaneo completado', warning });
      console.log(`[CheeseMe] Listo: ${followers.length} seguidores, ${following.length} seguidos`);
    } catch (error) {
      await closeDialog().catch(() => {});
      if (error instanceof CancelledError) {
        overlay('✖ Escaneo cancelado', 3000);
        await setState({ status: 'cancelled', message: 'Escaneo cancelado' });
      } else {
        console.error('[CheeseMe] Error:', error);
        overlay('❌ ' + (error.message || error), 6000);
        await setState({ status: 'error', error: error.message || String(error) });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Perfil
  // ---------------------------------------------------------------------------

  function getUsernameFromUrl() {
    const first = location.pathname.split('/').filter(Boolean)[0] || '';
    if (RESERVED_PATHS.has(first.toLowerCase())) return null;
    if (!/^[A-Za-z0-9._]{1,30}$/.test(first)) return null;
    return first;
  }

  // Enlace exacto /usuario/followers/ o /usuario/following/ del perfil
  // (no el de "Seguido por X y Y", que apunta a /followers/mutualOnly).
  function findListLink(username, type) {
    const wanted = `/${username}/${type}/`.toLowerCase();
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.closest('[role="dialog"]')) continue;
      const href = (a.getAttribute('href') || '').toLowerCase().split('?')[0];
      if (href === wanted || href === wanted.slice(0, -1)) return a;
    }
    return null;
  }

  async function waitForListLink(username, type) {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const link = findListLink(username, type);
      if (link) return link;
      await sleep(400);
    }
    return null;
  }

  // Número exacto de seguidores/seguidos. Instagram pone el número exacto en
  // el atributo title cuando lo abrevia ("12,5 mil" -> title="12.534").
  function readCount(link) {
    const titled = link.querySelector('[title]');
    const candidates = [titled && titled.getAttribute('title'), link.textContent];
    for (const raw of candidates) {
      if (!raw) continue;
      const text = raw.trim();
      if (/\d\s*(k|m|mil|mill|millones?)\b/i.test(text)) continue; // abreviado
      const match = text.match(/\d[\d.,\s]*/);
      if (match) {
        const n = parseInt(match[0].replace(/[^\d]/g, ''), 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Escaneo de una lista
  // ---------------------------------------------------------------------------

  async function scanList(username, type, expected, onProgress) {
    checkCancelled();
    await onProgress(0, 'abriendo lista...');

    const link = findListLink(username, type);
    if (!link) throw new Error(`No se encontró el botón de ${type === 'followers' ? 'seguidores' : 'seguidos'}.`);
    link.scrollIntoView({ block: 'center' });
    await humanPause(400, 900);
    link.click();

    const dialog = await waitForDialogWithUsers(username);
    const users = new Set();

    let lastSize = 0;
    let lastGrowth = Date.now();
    let lastWiggle = Date.now();

    while (true) {
      checkCancelled();

      collectUsers(dialog, username, users);
      const container = findScrollContainer(dialog);
      const loading = isLoading(dialog);
      const suggestions = !!findSuggestionsHeading(dialog);
      const atBottom = !container ||
        container.scrollTop + container.clientHeight >= container.scrollHeight - 10;

      if (users.size > lastSize) {
        lastSize = users.size;
        lastGrowth = Date.now();
      }
      const idle = Date.now() - lastGrowth;

      // ¿Ya está completa?
      if (expected && users.size >= expected) break;

      // Paciencia según lo que vemos en pantalla.
      let patience;
      if (suggestions && !loading) patience = PATIENCE_END_CONFIRMED;
      else if (expected && !isFarFrom(users.size, expected) && !loading) patience = PATIENCE_NEARLY_DONE;
      else if (!expected && !loading) patience = PATIENCE_NEARLY_DONE;
      else patience = PATIENCE_INCOMPLETE;

      if (atBottom && idle >= patience) break;

      let note = '';
      if (loading) note = 'cargando...';
      else if (idle > 5000) note = `esperando a Instagram (${Math.round(idle / 1000)}s)`;
      await onProgress(users.size, note);

      if (container) {
        if (atBottom && idle > WIGGLE_EVERY && Date.now() - lastWiggle > WIGGLE_EVERY) {
          // Nada nuevo: subimos un poco y volvemos a bajar, como haría una
          // persona, para que Instagram vuelva a pedir el siguiente bloque.
          lastWiggle = Date.now();
          container.scrollTop = Math.max(0, container.scrollTop - randomBetween(300, 700));
          await humanPause(500, 900);
          container.scrollTop = container.scrollHeight;
        } else {
          // Bajar más o menos una "pantalla" de la lista.
          const step = Math.max(200, container.clientHeight * (0.7 + Math.random() * 0.3));
          container.scrollTop = Math.min(container.scrollHeight, container.scrollTop + step);
        }
      }

      await humanPause(...SCROLL_DELAY);
    }

    collectUsers(dialog, username, users);
    await onProgress(users.size, 'cerrando lista...');
    await humanPause(500, 1000);
    await closeDialog();

    return Array.from(users);
  }

  function getDialog() {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    // El último abierto es el de arriba.
    for (let i = dialogs.length - 1; i >= 0; i--) {
      if (dialogs[i].querySelector('a[href]')) return dialogs[i];
    }
    return dialogs[dialogs.length - 1] || null;
  }

  async function waitForDialogWithUsers(username) {
    const end = Date.now() + LOAD_TIMEOUT;
    while (Date.now() < end) {
      checkCancelled();
      const dialog = getDialog();
      if (dialog) {
        const found = new Set();
        collectUsers(dialog, username, found);
        // Lista vacía: Instagram muestra el diálogo sin cuentas ni spinner.
        if (found.size > 0 || (!isLoading(dialog) && Date.now() > end - LOAD_TIMEOUT + 6000)) {
          return dialog;
        }
      }
      await sleep(300);
    }
    throw new Error('La lista de Instagram no se abrió. Recarga la página e intenta de nuevo.');
  }

  function collectUsers(dialog, ownerUsername, users) {
    const suggestions = findSuggestionsHeading(dialog);
    const owner = ownerUsername.toLowerCase();

    for (const a of dialog.querySelectorAll('a[href]')) {
      // Todo lo que está debajo de "Sugerencias para ti" no es de la lista.
      if (suggestions && (suggestions.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;

      const href = (a.getAttribute('href') || '').split('?')[0];
      const match = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
      if (!match) continue;
      const name = match[1];
      if (RESERVED_PATHS.has(name.toLowerCase()) || name.toLowerCase() === owner) continue;
      users.add(name);
    }
  }

  function findSuggestionsHeading(dialog) {
    for (const el of dialog.querySelectorAll('h1, h2, h3, h4, span, div')) {
      if (el.children.length > 0) continue;
      if (SUGGESTIONS_RE.test((el.textContent || '').trim())) return el;
    }
    return null;
  }

  // El contenedor con scroll del diálogo: el elemento desplazable que contiene
  // más enlaces de usuario.
  function findScrollContainer(dialog) {
    let best = null;
    let bestLinks = 0;
    for (const el of dialog.querySelectorAll('div')) {
      if (el.scrollHeight <= el.clientHeight + 5) continue;
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
      const links = el.querySelectorAll('a[href]').length;
      if (links > bestLinks) { best = el; bestLinks = links; }
    }
    return best;
  }

  function isLoading(dialog) {
    return !!dialog.querySelector(
      '[role="progressbar"], svg[aria-label="Cargando..."], svg[aria-label="Loading..."], [data-visualcompletion="loading-state"]'
    );
  }

  async function closeDialog() {
    if (!document.querySelector('div[role="dialog"]')) return;

    const closeIcon = document.querySelector(
      'div[role="dialog"] svg[aria-label="Cerrar"], div[role="dialog"] svg[aria-label="Close"]'
    );
    const closeBtn = closeIcon && closeIcon.closest('button, [role="button"]');
    if (closeBtn) {
      closeBtn.click();
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    }

    const end = Date.now() + 5000;
    while (Date.now() < end && document.querySelector('div[role="dialog"]')) await sleep(200);

    // Último recurso: la lista abre /usuario/followers/, volver atrás la cierra.
    if (document.querySelector('div[role="dialog"]') && /\/(followers|following)\/?$/.test(location.pathname)) {
      history.back();
      await sleep(1500);
    }
  }

  // ---------------------------------------------------------------------------
  // Aviso flotante en la página, para ver qué está haciendo
  // ---------------------------------------------------------------------------

  let overlayEl = null;
  let overlayTimer = null;

  function overlay(text, hideAfterMs) {
    if (!overlayEl || !document.body.contains(overlayEl)) {
      overlayEl = document.createElement('div');
      Object.assign(overlayEl.style, {
        position: 'fixed', top: '12px', right: '12px', zIndex: '2147483647',
        background: '#2d3436', color: '#fff', padding: '10px 14px',
        font: 'bold 13px Arial, sans-serif', borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,.35)', pointerEvents: 'none', maxWidth: '360px'
      });
      document.body.appendChild(overlayEl);
    }
    overlayEl.textContent = '🧀 CheeseMe · ' + text;
    clearTimeout(overlayTimer);
    if (hideAfterMs) {
      overlayTimer = setTimeout(() => { overlayEl && overlayEl.remove(); overlayEl = null; }, hideAfterMs);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  async function setState(state) {
    await chrome.storage.local.set({ scanState: { ...state, updatedAt: Date.now() } });
  }

  function checkCancelled() {
    if (cancelRequested) throw new CancelledError('cancelled');
  }

  // Faltan "muchas" cuentas: más de 3 o más del 1 %.
  function isFarFrom(count, expected) {
    if (!expected) return false;
    return expected - count > Math.max(3, Math.ceil(expected * 0.01));
  }

  function formatProgress(count, total) {
    return total ? `${count} / ${total}` : String(count);
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  function humanPause(min, max) {
    return sleep(randomBetween(min, max));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  console.log('[CheeseMe] Scraper cargado');
})();
