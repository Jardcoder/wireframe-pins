/* ============================================
   Wireframe Pins — Pin Comment System
   Click anywhere to drop a pin and leave feedback.
   Shared via PHP backend. BugHerd-style.
   ============================================ */
(function () {
  const API = 'api.php';
  let pins = [];
  let pinMode = false;
  let pinElements = [];
  let pinsVisible = true;
  let lastFetchOk = false;

  // ── Admin mode ──
  // Open any page with ?admin=<key> once to unlock admin controls (delete,
  // resolve, clear, export). The key is remembered in localStorage and sent
  // with destructive requests; viewers (clients) can only add pins and reply.
  function initAdmin() {
    const m = window.location.search.match(/[?&]admin=([^&]+)/);
    if (m) {
      localStorage.setItem('wf-admin-key', decodeURIComponent(m[1]));
      // strip ?admin= from the URL so the key isn't left on screen / re-shared
      const url = window.location.pathname +
        window.location.search.replace(/([?&])admin=[^&]+(&|$)/, '$1').replace(/[?&]$/, '') +
        window.location.hash;
      history.replaceState(null, '', url);
    }
  }
  function adminKey() { return localStorage.getItem('wf-admin-key') || ''; }
  function isAdmin() { return !!adminKey(); }
  function adminHeaders() { return isAdmin() ? { 'X-Admin-Key': adminKey() } : {}; }

  // ── API ──
  async function fetchPins() {
    try {
      const r = await fetch(API + '?page=' + getPage());
      const data = await r.json();
      if (Array.isArray(data)) {
        pins = data;
        lastFetchOk = true;
        // Cache to localStorage as fallback
        localStorage.setItem('wf-pins-' + getPage(), JSON.stringify(data));
      }
    } catch (e) {
      console.warn('API unavailable, using cached pins');
      // Fallback to localStorage if API fails
      try {
        const cached = localStorage.getItem('wf-pins-' + getPage());
        if (cached && !lastFetchOk) pins = JSON.parse(cached);
      } catch(e2) { /* keep existing pins */ }
    }
  }

  async function createPin(data) {
    try {
      const r = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      return await r.json();
    } catch(e) { return null; }
  }

  async function deletePin(id) {
    try { await fetch(API+'?id='+id, {method:'DELETE', headers:adminHeaders()}); } catch(e) {}
  }

  async function replyToPin(id, author, text) {
    try {
      const r = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reply_to:id, author, text}) });
      return await r.json();
    } catch(e) { return null; }
  }

  async function toggleResolve(id) {
    try {
      const r = await fetch(API, { method:'POST', headers:Object.assign({'Content-Type':'application/json'}, adminHeaders()), body:JSON.stringify({resolve:id}) });
      return await r.json();
    } catch(e) { return null; }
  }

  async function clearAll() {
    try { await fetch(API+'?all=1', {method:'DELETE', headers:adminHeaders()}); pins=[]; } catch(e) {}
  }

  async function fetchAllPins() {
    try { const r = await fetch(API); return await r.json(); } catch(e) { return []; }
  }

  // ── Helpers ──
  function getPage() {
    return (window.location.pathname.split('/').pop()||'index.html').replace('.html','');
  }
  function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function fmtTime(t) {
    const d=new Date(t);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }
  function getSavedAuthor() { return localStorage.getItem('wf-pin-author')||''; }
  function saveAuthor(n) { localStorage.setItem('wf-pin-author', n); }

  // ── Element context capture ──
  const ANCHOR_TAGS = ['h1','h2','h3','h4','h5','h6','p','button','a','img','li','label','section','article','header','footer','nav','main'];

  function findAnchor(target) {
    let cur = target;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (ANCHOR_TAGS.indexOf(cur.tagName.toLowerCase()) !== -1) return cur;
      cur = cur.parentElement;
    }
    return target;
  }

  function buildSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
      }
      if (parent && parent.id) {
        parts.unshift(part);
        return '#' + CSS.escape(parent.id) + ' > ' + parts.join(' > ');
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  }

  // ── Screenshot capture (lazy-loaded html2canvas) ──
  const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  let html2canvasPromise = null;

  function loadHtml2canvas() {
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const s = document.createElement('script');
      s.src = HTML2CANVAS_URL;
      s.onload  = () => resolve(window.html2canvas);
      s.onerror = () => { html2canvasPromise = null; reject(new Error('html2canvas failed to load')); };
      document.head.appendChild(s);
    });
    return html2canvasPromise;
  }

  async function captureScreenshot(pageX, pageY) {
    try {
      const h2c = await loadHtml2canvas();
      const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const w = Math.min(400, docW);
      const h = Math.min(400, docH);
      let cx = Math.round(pageX - w/2);
      let cy = Math.round(pageY - h/2);
      cx = Math.max(0, Math.min(cx, docW - w));
      cy = Math.max(0, Math.min(cy, docH - h));
      const canvas = await h2c(document.body, {
        x: cx, y: cy, width: w, height: h,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        ignoreElements: (el) => el.classList && (
          el.classList.contains('wf-toolbar') ||
          el.classList.contains('new-pin-form') ||
          el.classList.contains('pin') ||
          el.classList.contains('pin-pop') ||
          el.classList.contains('wf-gp') ||
          el.classList.contains('wf-overlay') ||
          el.classList.contains('ob-overlay')
        )
      });
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('Screenshot capture failed:', e);
      return null;
    }
  }

  function openLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'wf-lightbox';
    lb.innerHTML = `<img alt="">`;
    lb.querySelector('img').src = src;
    const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
  }

  function captureContext(clientX, clientY) {
    let target;
    try { target = document.elementFromPoint(clientX, clientY); } catch(e) { return null; }
    if (!target) return null;
    if (target.closest && target.closest('.wf-toolbar, .pin, .pin-pop, .new-pin-form, .wf-gp, .wf-overlay, .ob-overlay')) return null;
    const anchor = findAnchor(target);
    let outer = anchor.outerHTML || '';
    if (outer.length > 2000) outer = outer.slice(0, 1997) + '...';
    let text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 200) text = text.slice(0, 200);
    return {
      selector: buildSelector(anchor),
      tag: anchor.tagName.toLowerCase(),
      text_content: text,
      outer_html: outer,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  // ── Element anchor: selector + fractional position inside the element ──
  // Lets pins reflow with a responsive layout instead of breaking on absolute
  // pixel coords when the reviewer's viewport differs from the author's.
  function captureAnchor(clientX, clientY) {
    let target;
    try { target = document.elementFromPoint(clientX, clientY); } catch(e) { return null; }
    if (!target) return null;
    if (target.closest && target.closest('.wf-toolbar, .pin, .pin-pop, .new-pin-form, .wf-gp, .wf-overlay, .ob-overlay')) return null;
    const anchor = findAnchor(target);
    const r = anchor.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      selector: buildSelector(anchor),
      rx: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      ry: Math.max(0, Math.min(1, (clientY - r.top) / r.height))
    };
  }

  // Resolve a pin's absolute page position. Prefers the element anchor (responsive),
  // falls back to legacy x%/y for older pins or when the element is gone.
  function pinPosition(pin) {
    if (pin.anchor && pin.anchor.selector) {
      let el = null;
      try { el = document.querySelector(pin.anchor.selector); } catch(e) {}
      if (el) {
        const r = el.getBoundingClientRect();
        return {
          left: r.left + window.scrollX + pin.anchor.rx * r.width,
          top:  r.top  + window.scrollY + pin.anchor.ry * r.height,
          mode: 'anchor'
        };
      }
    }
    // legacy fallback: x is % of scrollWidth, y is absolute px
    return {
      left: (pin.x / 100) * document.documentElement.scrollWidth,
      top:  pin.y,
      mode: 'legacy'
    };
  }

  // ── Styles ──
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      /* Host-page isolation: the tool UI keeps its own font & text color
         even on sites with serif headings / light-on-dark themes */
      .wf-toolbar,.pin-pop,.new-pin-form,.wf-gp,.ob-modal,.wf-lightbox{
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
      .pin-pop h1,.pin-pop h2,.pin-pop h3,.wf-gp h1,.wf-gp h2,.wf-gp h3,
      .ob-modal h1,.ob-modal h2,.ob-modal h3{font-family:inherit}

      /* Pin marker */
      .pin{position:absolute;z-index:100;cursor:pointer;transition:transform .12s}
      .pin:hover{transform:scale(1.15)}
      .pin-dot{width:28px;height:28px;border-radius:50%;background:#e00;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff;position:relative}
      .pin-dot::after{content:'';position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #e00}
      .pin.resolved .pin-dot{background:#28a745}
      .pin.resolved .pin-dot::after{border-top-color:#28a745}

      /* Pin popover */
      .pin-pop{position:absolute;top:36px;left:-130px;width:300px;background:#fff;border:2px solid #1a1a1a;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.2);z-index:200;display:none;flex-direction:column;overflow:hidden;max-height:420px}
      .pin-pop.open{display:flex}
      .pin-pop.flip-left{left:auto;right:-10px}
      .pin-pop-head{padding:10px 14px;border-bottom:1px solid #e0e0e0;background:#f5f5f5;display:flex;justify-content:space-between;align-items:center;gap:8px}
      .pin-pop-head .pin-title{font-size:12px;font-weight:700;color:#1a1a1a;flex:1}
      .pin-pop-head button{background:none;border:none;cursor:pointer;font-size:14px;color:#999;padding:2px 4px}
      .pin-pop-head button:hover{color:#1a1a1a}
      .pin-pop-body{padding:12px 14px;overflow-y:auto;flex:1}
      .pin-pop-msg{font-size:13px;color:#333;line-height:1.5;margin-bottom:4px}
      .pin-pop-meta{font-size:11px;color:#999;margin-bottom:10px}
      .pin-pop-actions{display:flex;gap:6px;margin-bottom:10px}
      .pin-pop-actions button{font-size:11px;padding:3px 8px;border:1px solid #ccc;border-radius:3px;background:#fff;cursor:pointer;font-family:inherit;color:#555}
      .pin-pop-actions button:hover{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
      .pin-pop-actions .danger:hover{background:#c00;border-color:#c00}

      /* Screenshot thumbnail + lightbox */
      .pin-screenshot{margin:6px 0 8px}
      .pin-screenshot img{width:100px;height:100px;object-fit:cover;border:1px solid #ccc;border-radius:3px;cursor:zoom-in;display:block;background:#f5f5f5}
      .pin-screenshot img:hover{border-color:#1a1a1a}
      .wf-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px}
      .wf-lightbox img{max-width:90vw;max-height:90vh;box-shadow:0 8px 40px rgba(0,0,0,.5);border-radius:4px}

      /* Element context */
      .pin-context{margin:6px 0 8px;font-size:11px;color:#888}
      .pin-context summary{cursor:pointer;color:#777;outline:none;list-style:none;user-select:none}
      .pin-context summary::-webkit-details-marker{display:none}
      .pin-context summary:hover{color:#333}
      .pin-context-body{padding:6px 8px;background:#f9f9f9;border-radius:3px;margin-top:4px;word-break:break-all}
      .pin-context-tag{font-family:ui-monospace,Menlo,Consolas,monospace;color:#a52a2a}
      .pin-context-text{margin-top:4px;color:#555;font-style:italic;font-family:inherit}

      /* Replies */
      .pin-replies{border-top:1px solid #eee;padding-top:8px;margin-top:4px}
      .pin-reply{padding:6px 0 6px 10px;border-left:2px solid #e0e0e0;margin-bottom:6px;font-size:12px;color:#444;line-height:1.4}
      .pin-reply-meta{font-size:10px;color:#999;margin-top:2px}

      /* Reply form */
      .pin-reply-form{border-top:1px solid #eee;padding:10px 14px;background:#fafafa}
      .pin-reply-form textarea{width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;font-family:inherit;resize:vertical;min-height:44px;background:#fff}
      .pin-reply-form button{margin-top:6px;padding:5px 12px;background:#1a1a1a;color:#fff;border:none;border-radius:3px;font-size:11px;font-weight:600;cursor:pointer}
      .pin-reply-form button:hover{background:#333}

      /* Pin mode cursor */
      body.pin-mode{cursor:crosshair !important}
      body.pin-mode *{cursor:crosshair !important}
      body.pin-mode .pin,body.pin-mode .pin *{cursor:pointer !important}
      body.pin-mode .wf-toolbar,body.pin-mode .wf-toolbar *{cursor:pointer !important}

      /* New pin form (appears on click in pin mode) */
      .new-pin-form{position:absolute;z-index:300;width:280px;background:#fff;border:2px solid #e00;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:14px;display:none}
      .new-pin-form.open{display:block}
      .new-pin-form input,.new-pin-form textarea{width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;font-family:inherit;margin-bottom:8px;background:#fff}
      .new-pin-form textarea{min-height:60px;resize:vertical}
      .new-pin-form .npf-btns{display:flex;gap:6px}
      .new-pin-form .npf-btns button{padding:6px 14px;font-size:12px;font-weight:600;border-radius:4px;cursor:pointer;font-family:inherit;border:none}
      .new-pin-form .npf-save{background:#e00;color:#fff}
      .new-pin-form .npf-save:hover{background:#c00}
      .new-pin-form .npf-cancel{background:#eee;color:#333}
      .new-pin-form .npf-cancel:hover{background:#ddd}
      .new-pin-form .npf-screenshot{display:flex;align-items:center;gap:6px;font-size:11px;color:#666;margin:-2px 0 10px;cursor:pointer;user-select:none}
      .new-pin-form .npf-screenshot input{margin:0;width:auto;padding:0}
      .new-pin-form .npf-save:disabled{background:#999;cursor:wait}

      /* Toolbar */
      .wf-toolbar{position:fixed;bottom:20px;right:20px;display:flex;gap:8px;z-index:500;align-items:center}
      .wf-tb-btn{padding:10px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;gap:6px;transition:all .15s}
      .wf-tb-btn:hover{background:#333}
      .wf-tb-btn.active{background:#e00}
      .wf-tb-btn.active:hover{background:#c00}
      .wf-tb-badge{background:#e00;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:700}
      .wf-tb-btn.active .wf-tb-badge{background:#fff;color:#e00}

      /* Global panel */
      .wf-gp{position:fixed;top:0;right:-440px;width:420px;height:100vh;background:#fff;border-left:2px solid #1a1a1a;z-index:600;transition:right .25s;display:flex;flex-direction:column;box-shadow:-4px 0 24px rgba(0,0,0,.12)}
      .wf-gp.open{right:0}
      .wf-gp-head{padding:16px 20px;border-bottom:2px solid #1a1a1a;display:flex;justify-content:space-between;align-items:center;background:#f5f5f5}
      .wf-gp .wf-gp-head h3{color:#1a1a1a;font-size:16px;font-weight:700}
      .wf-gp-head button{background:none;border:none;font-size:22px;cursor:pointer;color:#999}
      .wf-gp-body{flex:1;overflow-y:auto;padding:16px 20px}
      .wf-gp-actions{padding:12px 20px;border-top:1px solid #e0e0e0;background:#fafafa;display:flex;gap:8px;flex-wrap:wrap}
      .wf-gp-actions button{padding:7px 12px;font-size:12px;font-weight:600;font-family:inherit;border-radius:4px;cursor:pointer;border:1px solid #ccc;background:#fff;color:#333}
      .wf-gp-actions button:hover{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
      .wf-gp-actions .danger:hover{background:#c00;border-color:#c00}
      .wf-gp-item{padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;line-height:1.5;cursor:pointer}
      .wf-gp-item:hover{background:#f9f9f9;margin:0 -20px;padding:10px 20px}
      .wf-gp-item-head{display:flex;justify-content:space-between;align-items:center}
      .wf-gp-item-num{background:#e00;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px}
      .wf-gp-item-num.resolved{background:#28a745}
      .wf-gp-item-meta{font-size:11px;color:#999;margin-top:2px}
      .wf-gp-page{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin:16px 0 8px;padding-bottom:6px;border-bottom:2px solid #1a1a1a}
      .wf-gp-page:first-child{margin-top:0}
      .wf-gp-empty{text-align:center;padding:40px;color:#bbb;font-style:italic}
      .wf-gp-stats{font-size:12px;color:#666;margin-bottom:12px;display:flex;gap:12px}
      .wf-gp-stats span{display:flex;align-items:center;gap:4px}
      .wf-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:550;display:none}
      .wf-overlay.open{display:block}

      /* Onboarding popup */
      .ob-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;animation:ob-fadein .3s}
      @keyframes ob-fadein{from{opacity:0}to{opacity:1}}
      @keyframes ob-slideup{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      .ob-modal{background:#fff;border-radius:12px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;animation:ob-slideup .35s ease}
      .ob-header{background:#1a1a1a;color:#fff;padding:24px 28px 20px;text-align:center}
      .ob-modal .ob-header h2{color:#fff;font-size:20px;font-weight:800;margin:0 0 4px;letter-spacing:-.3px}
      .ob-header p{font-size:13px;color:#aaa;margin:0}
      .ob-body{padding:24px 28px}
      .ob-step{display:flex;gap:14px;margin-bottom:20px;align-items:flex-start}
      .ob-step:last-child{margin-bottom:0}
      .ob-step-num{width:36px;height:36px;border-radius:50%;background:#e00;color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .ob-modal .ob-step-content h3{font-size:14px;font-weight:700;color:#1a1a1a;margin:0 0 3px}
      .ob-step-content p{font-size:13px;color:#666;margin:0;line-height:1.5}
      .ob-step-content kbd{background:#f0f0f0;border:1px solid #ccc;border-radius:3px;padding:1px 5px;font-size:11px;font-family:inherit;color:#333}
      .ob-tips{background:#f9f9f9;border-radius:6px;padding:12px 16px;margin-top:16px;font-size:12px;color:#666;line-height:1.6}
      .ob-tips strong{color:#333}
      .ob-footer{padding:16px 28px 20px;display:flex;justify-content:space-between;align-items:center}
      .ob-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#999;cursor:pointer}
      .ob-check input{margin:0;cursor:pointer}
      .ob-start{padding:10px 24px;background:#e00;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s}
      .ob-start:hover{background:#c00}

      @media(max-width:500px){
        .ob-modal{max-width:100%;border-radius:8px}
        .ob-header{padding:20px}
        .ob-body{padding:20px}
        .ob-footer{padding:14px 20px;flex-direction:column;gap:12px}
      }

      /* Filters in All Pins panel */
      .wf-gp-filters{display:flex;gap:6px;padding:10px 20px;border-bottom:1px solid #e0e0e0;background:#fafafa}
      .wf-gp-filters button{flex:1;padding:6px 8px;font-size:11px;font-weight:600;font-family:inherit;border:1px solid #ccc;border-radius:4px;background:#fff;color:#555;cursor:pointer}
      .wf-gp-filters button.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
      .wf-gp-hint{font-size:11px;color:#999;font-style:italic;padding:2px 0}

      /* Admin tag on toolbar */
      .wf-toolbar.wf-admin::before{content:'ADMIN';position:absolute;top:-18px;right:0;font-size:9px;font-weight:700;letter-spacing:1px;color:#e00;background:#fff;padding:1px 6px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.15)}

      /* Mobile: compact full-width toolbar, full-screen panel, fitted forms */
      @media(max-width:600px){
        .wf-toolbar{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));gap:6px}
        .wf-tb-btn{flex:1;justify-content:center;padding:10px 8px;font-size:12px}
        .wf-gp{width:100vw;right:-100vw}
        .pin-pop{width:min(300px,calc(100vw - 32px))}
        .new-pin-form{width:min(280px,calc(100vw - 32px))}
      }
    `;
    document.head.appendChild(s);
  }

  // ── Close all ──
  function closeAllPopups() {
    document.querySelectorAll('.pin-pop.open').forEach(p=>p.classList.remove('open'));
    const npf = document.querySelector('.new-pin-form.open');
    if (npf) { npf.classList.remove('open'); npf.remove(); }
  }

  // ── Render all pins on current page ──
  function renderPins() {
    // Remove old pin elements
    pinElements.forEach(el => el.remove());
    pinElements = [];

    const page = getPage();
    const pagePins = pins.filter(p => p.page === page);

    pagePins.forEach((pin, i) => {
      const el = document.createElement('div');
      el.className = 'pin' + (pin.resolved ? ' resolved' : '');
      const pos = pinPosition(pin);
      el.style.left = pos.left + 'px';
      el.style.top = pos.top + 'px';
      el.dataset.pinId = pin.id;

      // Respect visibility toggle
      if (!pinsVisible) el.style.display = 'none';

      const dot = document.createElement('div');
      dot.className = 'pin-dot';
      dot.textContent = i + 1;
      el.appendChild(dot);

      // Popover
      const pop = document.createElement('div');
      pop.className = 'pin-pop';
      // Flip if too close to right edge
      if (pos.left > document.documentElement.scrollWidth * 0.6) pop.classList.add('flip-left');

      const repliesHtml = (pin.replies||[]).map(r => `
        <div class="pin-reply">
          <strong>${esc(r.author)}</strong>: ${esc(r.text)}
          <div class="pin-reply-meta">${fmtTime(r.created_at)}</div>
        </div>
      `).join('');

      const ctx = pin.context;
      const ctxHtml = ctx ? `
        <details class="pin-context">
          <summary>📍 Context</summary>
          <div class="pin-context-body">
            <span class="pin-context-tag">&lt;${esc(ctx.tag||'')}&gt;</span>
            ${ctx.text_content ? `<div class="pin-context-text">"${esc(ctx.text_content)}"</div>` : ''}
          </div>
        </details>
      ` : '';

      const shotUrl = pin.screenshot ? (API + '?screenshot=' + encodeURIComponent(pin.id)) : '';
      const shotHtml = pin.screenshot ? `<div class="pin-screenshot"><img src="${esc(shotUrl)}" alt="Pin screenshot"></div>` : '';

      pop.innerHTML = `
        <div class="pin-pop-head">
          <span class="pin-title">Pin #${i+1} — ${esc(pin.author)}</span>
          <button class="pin-close" title="Close">×</button>
        </div>
        <div class="pin-pop-body">
          <div class="pin-pop-msg">${esc(pin.text)}</div>
          <div class="pin-pop-meta">${fmtTime(pin.created_at)} ${pin.resolved?'· ✅ Resolved':''}</div>
          ${shotHtml}
          ${ctxHtml}
          ${isAdmin() ? `<div class="pin-pop-actions">
            <button class="pin-act-resolve">${pin.resolved?'Reopen':'✓ Resolve'}</button>
            <button class="pin-act-delete danger">Delete</button>
          </div>` : ''}
          ${(pin.replies||[]).length ? '<div class="pin-replies">'+repliesHtml+'</div>' : ''}
        </div>
        <div class="pin-reply-form">
          <textarea placeholder="Reply… (Ctrl+Enter)"></textarea>
          <button>Reply</button>
        </div>
      `;
      el.appendChild(pop);

      // Events
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = pop.classList.contains('open');
        closeAllPopups();
        if (!isOpen) pop.classList.add('open');
      });

      pop.addEventListener('click', e => e.stopPropagation());

      pop.querySelector('.pin-close').addEventListener('click', (e) => {
        e.stopPropagation();
        pop.classList.remove('open');
      });

      const shotImg = pop.querySelector('.pin-screenshot img');
      if (shotImg) shotImg.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(shotImg.src); });

      const resolveBtn = pop.querySelector('.pin-act-resolve');
      if (resolveBtn) resolveBtn.addEventListener('click', async () => {
        await toggleResolve(pin.id);
        await fetchPins();
        renderPins();
        updateToolbar();
      });

      const deleteBtn = pop.querySelector('.pin-act-delete');
      if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this pin?')) return;
        await deletePin(pin.id);
        await fetchPins();
        renderPins();
        updateToolbar();
      });

      const replyBtn = pop.querySelector('.pin-reply-form button');
      const replyText = pop.querySelector('.pin-reply-form textarea');
      replyBtn.addEventListener('click', async () => {
        const t = replyText.value.trim();
        if (!t) return;
        const author = getSavedAuthor() || 'Anonymous';
        await replyToPin(pin.id, author, t);
        replyText.value = '';
        await fetchPins();
        renderPins();
      });
      replyText.addEventListener('keydown', (e) => {
        if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) replyBtn.click();
      });

      document.body.appendChild(el);
      pinElements.push(el);
    });
  }

  // ── Reposition pins without rebuilding them (cheap; on resize / layout shifts) ──
  function repositionPins() {
    const page = getPage();
    const pagePins = pins.filter(p => p.page === page);
    pinElements.forEach(el => {
      const pin = pagePins.find(p => p.id === el.dataset.pinId);
      if (!pin) return;
      const pos = pinPosition(pin);
      el.style.left = pos.left + 'px';
      el.style.top  = pos.top + 'px';
    });
  }

  function setupReposition() {
    let t;
    const run = () => { clearTimeout(t); t = setTimeout(repositionPins, 120); };
    window.addEventListener('resize', run, { passive: true });
    window.addEventListener('load', () => setTimeout(repositionPins, 200)); // after images/fonts settle
  }

  // ── Pin mode: click to create ──
  function handlePageClick(e) {
    if (!pinMode) return;

    // Don't create pin on toolbar, popups, or existing pins
    if (e.target.closest('.wf-toolbar, .pin, .pin-pop, .new-pin-form, .wf-gp, .wf-overlay')) return;

    e.preventDefault();
    e.stopPropagation();
    closeAllPopups();

    const x = (e.pageX / document.documentElement.scrollWidth) * 100;
    const y = e.pageY;

    // Capture context + element anchor BEFORE the form opens (form occludes the target)
    const context = captureContext(e.clientX, e.clientY);
    const anchor = captureAnchor(e.clientX, e.clientY);

    // Create temp form
    const form = document.createElement('div');
    form.className = 'new-pin-form open';
    form.style.left = Math.max(10, Math.min(e.pageX, window.innerWidth - 300)) + 'px'; // clamp: nunca fuera de viewport en mobile
    form.style.top = y + 'px';

    const author = getSavedAuthor();
    form.innerHTML = `
      <input type="text" placeholder="Your name" value="${esc(author)}" class="npf-author">
      <textarea placeholder="Describe the issue or suggestion…" class="npf-text" autofocus></textarea>
      <label class="npf-screenshot"><input type="checkbox" class="npf-screenshot-cb"> Include screenshot of this area</label>
      <div class="npf-btns">
        <button class="npf-save">Pin It</button>
        <button class="npf-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(form);

    // Focus textarea
    setTimeout(() => form.querySelector('.npf-text').focus(), 50);

    form.addEventListener('click', e => e.stopPropagation());

    form.querySelector('.npf-cancel').addEventListener('click', () => {
      form.remove();
    });

    form.querySelector('.npf-save').addEventListener('click', async () => {
      const text = form.querySelector('.npf-text').value.trim();
      const authorVal = form.querySelector('.npf-author').value.trim() || 'Anonymous';
      const wantShot = form.querySelector('.npf-screenshot-cb').checked;
      if (!text) return;

      saveAuthor(authorVal);

      const saveBtn = form.querySelector('.npf-save');
      saveBtn.disabled = true;
      saveBtn.textContent = wantShot ? 'Capturing…' : 'Saving…';

      let screenshot = null;
      if (wantShot) screenshot = await captureScreenshot(e.pageX, e.pageY);

      const pin = await createPin({
        page: getPage(),
        x: parseFloat(x.toFixed(2)),
        y: Math.round(y),
        author: authorVal,
        text: text,
        context: context,
        anchor: anchor,
        screenshot: screenshot
      });

      form.remove();

      if (pin) {
        pins.push(pin);
        renderPins();
        updateToolbar();
      }
    });

    const ta = form.querySelector('.npf-text');
    ta.addEventListener('keydown', (e) => {
      if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) form.querySelector('.npf-save').click();
    });
  }

  // ── Toolbar ──
  function createToolbar() {
    const bar = document.createElement('div');
    bar.className = 'wf-toolbar';

    // Pin mode toggle
    const pinBtn = document.createElement('button');
    pinBtn.className = 'wf-tb-btn';
    pinBtn.innerHTML = '📌 Add Pin';
    bar.appendChild(pinBtn);

    // Toggle visibility
    const visBtn = document.createElement('button');
    visBtn.className = 'wf-tb-btn';
    visBtn.innerHTML = '👁 Hide Pins';
    bar.appendChild(visBtn);

    // View all
    const allBtn = document.createElement('button');
    allBtn.className = 'wf-tb-btn';
    allBtn.innerHTML = '📋 All Pins <span class="wf-tb-badge">0</span>';
    bar.appendChild(allBtn);

    if (isAdmin()) bar.classList.add('wf-admin'); // shows a small admin tag via CSS

    document.body.appendChild(bar);

    // Toggle pin mode
    pinBtn.addEventListener('click', () => {
      pinMode = !pinMode;
      pinBtn.classList.toggle('active', pinMode);
      pinBtn.innerHTML = pinMode ? '✕ Cancel' : '📌 Add Pin';
      document.body.classList.toggle('pin-mode', pinMode);
      if (!pinMode) {
        const npf = document.querySelector('.new-pin-form');
        if (npf) npf.remove();
      }
      // Show pins if entering pin mode while hidden
      if (pinMode && !pinsVisible) {
        pinsVisible = true;
        visBtn.innerHTML = '👁 Hide Pins';
        pinElements.forEach(el => el.style.display = '');
      }
    });

    // Toggle pin visibility
    visBtn.addEventListener('click', () => {
      pinsVisible = !pinsVisible;
      visBtn.innerHTML = pinsVisible ? '👁 Hide Pins' : '👁 Show Pins';
      visBtn.classList.toggle('active', !pinsVisible);
      pinElements.forEach(el => {
        el.style.display = pinsVisible ? '' : 'none';
      });
      // Exit pin mode if hiding pins
      if (!pinsVisible && pinMode) {
        pinMode = false;
        pinBtn.classList.remove('active');
        pinBtn.innerHTML = '📌 Add Pin';
        document.body.classList.remove('pin-mode');
      }
    });

    // All pins panel
    allBtn.addEventListener('click', async () => {
      const allPins = await fetchAllPins();
      openGlobalPanel(allPins);
    });

    updateToolbar();
  }

  function updateToolbar() {
    const badge = document.querySelector('.wf-tb-badge');
    if (badge) {
      // Badge counts UNRESOLVED pins on this page — the actionable number
      const count = pins.filter(p => !p.resolved).length;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline' : 'none';
    }
  }

  // ── Global Panel ──
  function openGlobalPanel(allPins) {
    // Remove existing
    document.querySelector('.wf-gp')?.remove();
    document.querySelector('.wf-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'wf-overlay open';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.className = 'wf-gp open';

    const prettyPage = (slug) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const open = allPins.filter(p=>!p.resolved).length;
    const resolved = allPins.filter(p=>p.resolved).length;
    let filter = 'all'; // all | open | resolved

    const adminActions = isAdmin() ? `
      <button class="gp-export">Export .txt</button>
      <button class="gp-clear danger">Clear All</button>` : `
      <span class="wf-gp-hint">Add pins and reply to leave feedback.</span>`;

    panel.innerHTML = `
      <div class="wf-gp-head">
        <h3>All Pin Feedback</h3>
        <button class="gp-close">×</button>
      </div>
      <div class="wf-gp-filters">
        <button data-f="all" class="active">All ${allPins.length}</button>
        <button data-f="open">⏳ Open ${open}</button>
        <button data-f="resolved">✅ Resolved ${resolved}</button>
      </div>
      <div class="wf-gp-body"></div>
      <div class="wf-gp-actions">${adminActions}</div>
    `;
    document.body.appendChild(panel);

    const body = panel.querySelector('.wf-gp-body');

    function renderList() {
      const shown = allPins.filter(p => filter === 'all' || (filter === 'open' ? !p.resolved : p.resolved));
      if (shown.length === 0) {
        body.innerHTML = allPins.length === 0
          ? '<div class="wf-gp-empty">No pins yet.<br>Click "📌 Add Pin" then click anywhere on the page.</div>'
          : '<div class="wf-gp-empty">Nothing in this filter.</div>';
        return;
      }
      const grouped = {}; const pageOrder = [];
      shown.forEach(p => {
        const pg = p.page||'unknown';
        if (!grouped[pg]) { grouped[pg] = []; pageOrder.push(pg); }
        grouped[pg].push(p);
      });
      let h = '';
      pageOrder.forEach(pg => {
        h += `<div class="wf-gp-page">📄 ${esc(prettyPage(pg))} (${grouped[pg].length})</div>`;
        grouped[pg].forEach((p, i) => {
          const replies = (p.replies||[]).length;
          h += `
            <div class="wf-gp-item" data-page="${pg}" data-id="${p.id}">
              <div class="wf-gp-item-head">
                <div><span class="wf-gp-item-num ${p.resolved?'resolved':''}">${i+1}</span> <strong>${esc(p.author)}</strong></div>
                <span style="font-size:11px;color:#999">${p.resolved?'✅':'⏳'}${replies?' · '+replies+' replies':''}</span>
              </div>
              <div style="margin-top:4px;color:#444">${esc(p.text)}</div>
              <div class="wf-gp-item-meta">${fmtTime(p.created_at)}</div>
            </div>`;
        });
      });
      body.innerHTML = h;
      bindItems();
    }

    function bindItems() {
      body.querySelectorAll('.wf-gp-item').forEach(item => {
        item.addEventListener('click', () => {
          const pg = item.dataset.page, id = item.dataset.id;
          if (pg !== getPage()) {
            window.location.href = pg + '.html#wf-pin=' + encodeURIComponent(id);
          } else { close(); focusPin(id); }
        });
      });
    }

    const close = () => { panel.remove(); overlay.remove(); };
    panel.querySelector('.gp-close').addEventListener('click', close);
    overlay.addEventListener('click', close);

    panel.querySelectorAll('.wf-gp-filters button').forEach(b => {
      b.addEventListener('click', () => {
        filter = b.dataset.f;
        panel.querySelectorAll('.wf-gp-filters button').forEach(x => x.classList.toggle('active', x === b));
        renderList();
      });
    });

    const exportBtn = panel.querySelector('.gp-export');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      window.open(API + '?export=1&key=' + encodeURIComponent(adminKey()), '_blank');
    });

    const clearBtn = panel.querySelector('.gp-clear');
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      if (!confirm('Delete ALL pins on ALL pages?')) return;
      await clearAll();
      renderPins();
      updateToolbar();
      close();
    });

    renderList();
  }

  // ── Scroll to a pin and open its popover ──
  function focusPin(id) {
    const el = pinElements.find(p => p.dataset.pinId === id);
    if (!el) return;
    if (!pinsVisible) el.style.display = '';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    closeAllPopups();
    el.querySelector('.pin-pop')?.classList.add('open');
  }

  // ── Deep link: page.html#wf-pin=<id> opens that pin on load ──
  function handleDeepLink() {
    const m = window.location.hash.match(/^#wf-pin=(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    // Clear the hash so refreshes don't re-trigger
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setTimeout(() => focusPin(id), 150);
  }

  // ── Page click handler ──
  function setupClickHandler() {
    document.addEventListener('click', (e) => {
      if (pinMode) {
        handlePageClick(e);
      } else {
        // Close popups if clicking outside
        if (!e.target.closest('.pin, .pin-pop, .new-pin-form')) {
          closeAllPopups();
        }
      }
    });
  }

  // ── Auto refresh ──
  function startAutoRefresh() {
    setInterval(async () => {
      // Don't refresh if a popover is open (would close it)
      const hasOpenPopover = document.querySelector('.pin-pop.open, .new-pin-form.open');
      if (hasOpenPopover) return;
      
      const prevCount = pins.length;
      await fetchPins();
      // Only re-render if pin count changed (avoids unnecessary DOM churn)
      if (pins.length !== prevCount) {
        renderPins();
      }
      updateToolbar();
    }, 30000);
  }

  // ── Escape key exits pin mode ──
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (pinMode) {
          pinMode = false;
          document.body.classList.remove('pin-mode');
          const btn = document.querySelector('.wf-tb-btn.active');
          if (btn) { btn.classList.remove('active'); btn.innerHTML = '📌 Add Pin'; }
          const npf = document.querySelector('.new-pin-form');
          if (npf) npf.remove();
        }
        closeAllPopups();
        document.querySelector('.wf-gp')?.remove();
        document.querySelector('.wf-overlay')?.remove();
      }
    });
  }

  // ── Onboarding popup ──
  function showOnboarding() {
    const SEEN_KEY = 'wf-onboarding-seen';
    if (localStorage.getItem(SEEN_KEY)) return;

    const overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-modal">
        <div class="ob-header">
          <h2>Welcome to the Wireframe Review</h2>
          <p>${document.title || 'Website Prototype'}</p>
        </div>
        <div class="ob-body">
          <div class="ob-step">
            <div class="ob-step-num">1</div>
            <div class="ob-step-content">
              <h3>Click "📌 Add Pin"</h3>
              <p>The button is at the bottom-right corner. This activates pin mode — your cursor will change to a crosshair.</p>
            </div>
          </div>
          <div class="ob-step">
            <div class="ob-step-num">2</div>
            <div class="ob-step-content">
              <h3>Click anywhere on the page</h3>
              <p>Click exactly where you want to leave feedback. A form will pop up for your comment.</p>
            </div>
          </div>
          <div class="ob-step">
            <div class="ob-step-num">3</div>
            <div class="ob-step-content">
              <h3>Write your feedback and pin it</h3>
              <p>Add your name and describe what you'd like changed, added, or fixed. Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to submit quickly.</p>
            </div>
          </div>
          <div class="ob-step">
            <div class="ob-step-num">4</div>
            <div class="ob-step-content">
              <h3>Review all pins</h3>
              <p>Click "📋 All Pins" to see every comment across all pages, filter by open/resolved, and reply to keep the conversation in one place.</p>
            </div>
          </div>
          <div class="ob-tips">
            <strong>Tips:</strong> Press <kbd>Esc</kbd> to exit pin mode. Use <strong>"👁 Hide Pins"</strong> to toggle pins on/off while reviewing the design cleanly. Navigate between pages using the top menu. Your name is saved so you only enter it once.
          </div>
        </div>
        <div class="ob-footer">
          <label class="ob-check">
            <input type="checkbox" checked> Don't show this again
          </label>
          <button class="ob-start">Got it — Let's go</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeOnboarding = () => {
      const checkbox = overlay.querySelector('.ob-check input');
      if (checkbox.checked) {
        localStorage.setItem(SEEN_KEY, '1');
      }
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .2s';
      setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector('.ob-start').addEventListener('click', closeOnboarding);

    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOnboarding();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeOnboarding();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── Init ──
  async function init() {
    initAdmin();
    injectCSS();
    await fetchPins();
    renderPins();
    createToolbar();
    setupClickHandler();
    setupKeyboard();
    setupReposition();
    startAutoRefresh();
    showOnboarding();
    handleDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
