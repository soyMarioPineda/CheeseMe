// Scraper simplificado para DEBUG

(function() {
  'use strict';

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scanFollowers') {
      console.log('🔵 === ESCANEANDO FOLLOWERS ===');
      extractFollowers()
        .then(data => {
          console.log('✅ FOLLOWERS completado:', data.length);
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('❌ Error FOLLOWERS:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    if (request.action === 'scanFollowing') {
      console.log('🟢 === ESCANEANDO FOLLOWING ===');
      extractFollowing()
        .then(data => {
          console.log('✅ FOLLOWING completado:', data.length);
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('❌ Error FOLLOWING:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  });

  async function extractFollowers() {
    console.log('Buscando botón "seguidores"...');
    
    // Buscar link que contenga "followers" en href
    const buttons = document.querySelectorAll('a[href*="followers"]');
    console.log(`Encontrados ${buttons.length} botones con "followers"`);
    
    if (buttons.length === 0) {
      throw new Error('No se encontró el botón de seguidores');
    }
    
    const button = buttons[0];
    console.log('Haciendo click en seguidores...');
    button.click();
    await sleep(2000);
    
    const users = await extractUsersFromModal('FOLLOWERS');
    
    closeModal();
    await sleep(500);
    
    return users;
  }

  async function extractFollowing() {
    console.log('Buscando botón "seguidos"...');
    
    // Buscar link que contenga "following" en href
    const buttons = document.querySelectorAll('a[href*="following"]');
    console.log(`Encontrados ${buttons.length} botones con "following"`);
    
    if (buttons.length === 0) {
      throw new Error('No se encontró el botón de seguidos');
    }
    
    const button = buttons[0];
    console.log('Haciendo click en seguidos...');
    button.click();
    await sleep(2000);
    
    const users = await extractUsersFromModal('FOLLOWING');
    
    closeModal();
    await sleep(500);
    
    return users;
  }

  async function extractUsersFromModal(type) {
    console.log(`📋 Extrayendo usuarios del modal de ${type}...`);
    
    const users = new Set();
    let stableCount = 0;
    let previousCount = 0;
    const maxStableIterations = 15; // MUY paciente

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      throw new Error('No se encontró el modal');
    }

    console.log('Modal encontrado');
    console.log(`Altura del scroll: ${scrollContainer.scrollHeight}px`);
    console.log(`Altura visible: ${scrollContainer.clientHeight}px`);

    let scrollAttempts = 0;
    const maxScrollAttempts = 1000; // Sin límite prácticamente

    while (stableCount < maxStableIterations && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      
      // Verificar sugerencias
      const fullModalText = scrollContainer.textContent || '';
      
      if (fullModalText.includes('Sugerencias para ti') || 
          fullModalText.includes('Suggested for you')) {
        console.log('⚠️ DETECTADO "Sugerencias para ti" - FINALIZANDO');
        
        const links = scrollContainer.querySelectorAll('a[href^="/"]');
        links.forEach(link => {
          const linkElement = link;
          const modalElement = scrollContainer;
          const allText = modalElement.querySelectorAll('*');
          let sugerenciasElement = null;
          
          for (let el of allText) {
            if (el.textContent.includes('Sugerencias para ti') || 
                el.textContent.includes('Suggested for you')) {
              const directText = Array.from(el.childNodes)
                .filter(node => node.nodeType === 3)
                .map(node => node.textContent)
                .join('');
              
              if (directText.includes('Sugerencias') || directText.includes('Suggested')) {
                sugerenciasElement = el;
                break;
              }
            }
          }
          
          if (sugerenciasElement) {
            const linkPosition = linkElement.compareDocumentPosition(sugerenciasElement);
            if (linkPosition & Node.DOCUMENT_POSITION_PRECEDING) {
              return;
            }
          }
          
          const href = link.getAttribute('href');
          if (href && 
              href !== '/' && 
              !href.includes('/p/') && 
              !href.includes('/reel/') &&
              !href.includes('/explore/') &&
              !href.includes('/direct/')) {
            const username = href.replace(/\//g, '');
            if (username.length > 0) {
              users.add(username);
            }
          }
        });
        
        console.log(`✅ Detenido por sugerencias con ${users.size} usuarios`);
        break;
      }
      
      // Extraer usuarios
      const links = scrollContainer.querySelectorAll('a[href^="/"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && 
            href !== '/' && 
            !href.includes('/p/') && 
            !href.includes('/reel/') &&
            !href.includes('/explore/') &&
            !href.includes('/direct/')) {
          const username = href.replace(/\//g, '');
          if (username.length > 0) {
            users.add(username);
          }
        }
      });

      const currentCount = users.size;
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const scrollPercentage = ((scrollTop + clientHeight) / scrollHeight * 100).toFixed(1);
      
      if (currentCount === previousCount) {
        stableCount++;
        console.log(`  [${scrollAttempts}] ${currentCount} usuarios | Sin cambios ${stableCount}/${maxStableIterations} | Scroll: ${scrollPercentage}%`);
        
        // DEBUG: ¿Por qué no hay cambios?
        if (stableCount === 3) {
          console.log(`  🔍 DEBUG: Scroll=${scrollTop}, Height=${scrollHeight}, CanScroll=${scrollTop + clientHeight < scrollHeight}`);
        }
        
        if (stableCount >= 10) {
          console.log(`  ⚠️ Muchos intentos sin cambios, verificando si llegamos al final...`);
          const atBottom = (scrollTop + clientHeight) >= (scrollHeight - 50);
          console.log(`  Estamos al fondo? ${atBottom}`);
          
          if (atBottom) {
            console.log(`  ✅ Confirmado: llegamos al final del scroll`);
          }
        }
        
      } else {
        const added = currentCount - previousCount;
        console.log(`  [${scrollAttempts}] ${currentCount} usuarios (+${added}) | Scroll: ${scrollPercentage}%`);
        stableCount = 0;
        previousCount = currentCount;
      }

      // Simular Page Down
      scrollContainer.focus();
      const pageDownEvent = new KeyboardEvent('keydown', {
        key: 'PageDown',
        code: 'PageDown',
        keyCode: 34,
        which: 34,
        bubbles: true,
        cancelable: true
      });
      scrollContainer.dispatchEvent(pageDownEvent);
      await sleep(300);
      
      // Scroll pequeño
      scrollContainer.scrollTop += 300;
      
      // Detectar loading
      const isLoading = checkIfLoading(scrollContainer);
      
      if (isLoading) {
        console.log(`  🔄 Loading detectado, esperando 4s...`);
        await sleep(4000);
      } else {
        await sleep(2000); // 2 segundos por defecto
      }
      
      // Cada 50 intentos, hacer un scroll más grande para "despertar" a Instagram
      if (scrollAttempts % 50 === 0) {
        console.log(`  💥 Intento ${scrollAttempts}: Haciendo scroll grande para refrescar...`);
        scrollContainer.scrollTop += 1000;
        await sleep(3000);
      }
    }

    console.log(`\n=== RESUMEN FINAL ===`);
    console.log(`Total de intentos: ${scrollAttempts}`);
    console.log(`Razón de parada: ${stableCount >= maxStableIterations ? 'Sin cambios' : 'Límite alcanzado'}`);
    console.log(`Usuarios extraídos: ${users.size}`);

    const result = Array.from(users);
    console.log('Primeros 10:', result.slice(0, 10));
    console.log('Últimos 10:', result.slice(-10));
    
    return result;
  }

  function checkIfLoading(container) {
    // Buscar spinners o indicadores de carga comunes de Instagram
    const loadingIndicators = [
      'svg[aria-label="Cargando..."]',
      'svg[aria-label="Loading..."]',
      '[role="progressbar"]',
      '.spinner',
      '[data-visualcompletion="loading"]'
    ];
    
    for (const selector of loadingIndicators) {
      if (container.querySelector(selector)) {
        return true;
      }
    }
    
    // Verificar si el texto incluye "Cargando"
    const text = container.textContent || '';
    if (text.includes('Cargando') || text.includes('Loading')) {
      return true;
    }
    
    return false;
  }

  function findScrollContainer() {
    // Buscar divs dentro del modal que tengan scroll
    const containers = document.querySelectorAll('div[role="dialog"] div');
    
    for (const container of containers) {
      const style = window.getComputedStyle(container);
      if ((style.overflowY === 'scroll' || style.overflowY === 'auto') &&
          container.scrollHeight > container.clientHeight) {
        const links = container.querySelectorAll('a[href^="/"]');
        if (links.length > 5) {
          console.log(`Contenedor scroll encontrado con ${links.length} links`);
          return container;
        }
      }
    }
    
    return null;
  }

  function closeModal() {
    console.log('Cerrando modal...');
    
    // Buscar botón de cerrar
    const closeBtn = document.querySelector('svg[aria-label="Cerrar"]')?.closest('button') ||
                     document.querySelector('svg[aria-label="Close"]')?.closest('button');
    
    if (closeBtn) {
      closeBtn.click();
    } else {
      // Presionar ESC
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  console.log('✅ Scraper DEBUG cargado');
})();