(function(){
  // Minimal SPA navigation: intercept internal link clicks, fetch the new page,
  // swap #content innerHTML, update title and history, and run a small fade.
  // This keeps the persistent canvas alive and prevents full reloads.

  if (window.__spa_nav_installed) return; window.__spa_nav_installed = true;

  const cache = new Map();
  const contentSelector = '#content';
  const root = document;
  const main = document.querySelector(contentSelector);
  if (!main) return;

  function isModifiedEvent(e){ return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0; }
  function isSameOrigin(href){ try { const u = new URL(href, location.href); return u.origin === location.origin; } catch(e){ return false; } }
  function isAssetLink(u){ return /\.(png|jpg|jpeg|gif|svg|pdf|zip|mp4|webm|ogg)(\?.*)?$/.test(u.pathname); }

  async function fetchPage(url){
    if (cache.has(url)) return cache.get(url);
    const resp = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'Fetch' } });
    if (!resp.ok) throw new Error('Network error');
    const text = await resp.text();
    cache.set(url, text);
    return text;
  }

  function parseMainFrom(htmlText){
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const newMain = doc.querySelector(contentSelector);
    const newTitle = doc.querySelector('title') ? doc.querySelector('title').textContent : null;
    return { newMain, newTitle, doc };
  }

  function applyContent(newMain, newTitle, url){
    if (!newMain) return false;
    // small fade transition
    main.style.transition = 'opacity 180ms ease';
    main.style.opacity = '0';
    setTimeout(()=>{
      main.innerHTML = newMain.innerHTML;
      // update title
      if (newTitle) document.title = newTitle;
      // push history handled by caller
      main.style.opacity = '1';
      // ensure focus on top for accessibility
      window.scrollTo({ top: 0, behavior: 'instant' });
      // update active nav link (best-effort)
      updateActiveNav(url);
      // run any inline scripts in the new content
      runScripts(newMain);
    }, 180);
    return true;
  }

  function runScripts(container){
    const scripts = Array.from(container.querySelectorAll('script'));
    scripts.forEach(s => {
      const ns = document.createElement('script');
      if (s.src) {
        ns.src = s.src;
        ns.async = false;
      } else {
        ns.textContent = s.textContent;
      }
      document.body.appendChild(ns);
      ns.onload = () => ns.remove();
    });
  }

  function updateActiveNav(url){
    try{
      const u = new URL(url, location.href);
      const links = document.querySelectorAll('nav a, .site-nav a');
      links.forEach(a => a.classList.toggle('active', a.pathname === u.pathname));
    } catch(e){}
  }

  async function navigateTo(href, replace=false){
    try{
      const text = await fetchPage(href);
      const { newMain, newTitle } = parseMainFrom(text);
      const applied = applyContent(newMain, newTitle, href);
      if (applied) {
        if (replace) history.replaceState({ spa: true }, newTitle || '', href);
        else history.pushState({ spa: true }, newTitle || '', href);
      } else {
        // fallback to full navigation
        location.href = href;
      }
    } catch(err){
      console.error('SPA nav failed, falling back to full navigation', err);
      location.href = href;
    }
  }

  document.addEventListener('click', function(e){
    if (isModifiedEvent(e)) return;
    const a = e.composedPath().find(n => n && n.tagName === 'A');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (!isSameOrigin(href)) return;
    try{
      const url = new URL(href, location.href);
      if (isAssetLink(url)) return;
      // allow opt-out via data-no-spa
      if (a.dataset && a.dataset.noSpa !== undefined) return;
      e.preventDefault();
      navigateTo(url.href);
    } catch(err){}
  }, { passive: false });

  window.addEventListener('popstate', function(e){
    // only handle if it's our SPA history entry
    const href = location.href;
    navigateTo(href, true);
  });

})();
