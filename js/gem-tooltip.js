// Unified Gem Tooltip — poedb-style rich tooltip for both main page and gem modal
const GemTooltip = (() => {
  const ATTR_LABEL = { str: '힘', dex: '민첩', int: '지능' };
  let el = null;

  function gemIdToEnglish(id) {
    return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function create() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'gem-tt';
    el.innerHTML =
      '<div class="gem-tt-header"><span class="gem-tt-name"></span></div>' +
      '<div class="gem-tt-body"></div>';
    document.body.appendChild(el);
    window.addEventListener('scroll', hide, { passive: true });
    return el;
  }

  function buildBody(gem) {
    const details = (typeof GEM_DETAILS !== 'undefined') ? GEM_DETAILS[gem.id] : null;
    const body = [];

    if (details) {
      // Tags
      if (details.tags && details.tags.length) {
        body.push('<div class="gem-tt-tags">' + escHtml(details.tags.join(', ')) + '</div>');
      }

      // Properties
      if (details.properties && details.properties.length) {
        details.properties.forEach(p => {
          body.push('<div class="gem-tt-prop">' + escHtml(p) + '</div>');
        });
      }

      // Separator + Requirements
      if (details.requirements) {
        body.push('<div class="gem-tt-sep"></div>');
        body.push('<div class="gem-tt-req">' + escHtml(details.requirements) + '</div>');
      }

      // Separator + Description
      if (details.description) {
        body.push('<div class="gem-tt-sep"></div>');
        body.push('<div class="gem-tt-desc">' + escHtml(details.description) + '</div>');
      }

      // Separator + Mods
      if (details.mods && details.mods.length) {
        body.push('<div class="gem-tt-sep"></div>');
        details.mods.forEach(m => {
          body.push('<div class="gem-tt-mod">' + escHtml(m) + '</div>');
        });
      }

      // Reminder text
      if (details.reminder) {
        body.push('<div class="gem-tt-reminder">' + escHtml(details.reminder) + '</div>');
      }

      // Quality
      if (details.qualityHeader) {
        body.push('<div class="gem-tt-quality-hdr">' + escHtml(details.qualityHeader) + '</div>');
      }
      if (details.qualityMod) {
        body.push('<div class="gem-tt-quality">' + escHtml(details.qualityMod) + '</div>');
      }

      // Support text
      if (details.supportText) {
        body.push('<div class="gem-tt-sep"></div>');
        body.push('<div class="gem-tt-support">' + escHtml(details.supportText) + '</div>');
      }

      // English name
      const eng = details.engName || gemIdToEnglish(gem.id);
      body.push('<div class="gem-tt-sep"></div>');
      body.push('<div class="gem-tt-eng">' + escHtml(eng) + '</div>');
    } else {
      // Fallback: basic info when no details available
      body.push('<div class="gem-tt-tags">' + escHtml(gem.type === 'support' ? '보조 젬' : '스킬 젬') + '</div>');
      body.push('<div class="gem-tt-sep"></div>');
      const attrName = ATTR_LABEL[gem.color] || '';
      body.push('<div class="gem-tt-req">요구 속성 <span class="gem-tt-attr ' + gem.color + '">' + escHtml(attrName) + '</span></div>');
      body.push('<div class="gem-tt-sep"></div>');
      body.push('<div class="gem-tt-eng">' + escHtml(gemIdToEnglish(gem.id)) + '</div>');
    }

    return body.join('');
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function show(gem, e) {
    const tt = create();
    tt.querySelector('.gem-tt-name').textContent = gem.name;
    tt.querySelector('.gem-tt-body').innerHTML = buildBody(gem);
    tt.style.display = 'block';
    position(e);
  }

  function hide() {
    if (el) el.style.display = 'none';
  }

  function position(e) {
    if (!el || el.style.display === 'none') return;
    const offset = 12;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 260;
    const h = rect.height || 100;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - offset;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - offset;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function attach(element, gem) {
    element.addEventListener('mouseenter', e => show(gem, e));
    element.addEventListener('mouseleave', hide);
    element.addEventListener('mousemove', position);
  }

  return { show, hide, position, attach };
})();
