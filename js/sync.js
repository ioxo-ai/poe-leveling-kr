(() => {
  const POLL_INTERVAL = 2000;
  const ENGLISH_KEY = 'poe-leveling-kr-english';

  let fileHandle = null;
  let lastSize = 0;
  let pollTimer = null;
  let currentZone = null;
  let currentAct = null;

  // Extract zone names from [SCENE] Set Source [zone] log lines
  function parseSceneEvents(text) {
    const regex = /\[SCENE\] Set Source \[([^\]]+)\]/g;
    const zones = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const z = match[1];
      if (z === '(null)' || z === '(unknown)') continue;
      zones.push(z);
    }
    return zones;
  }

  // Extract act number from "Generating level N area "PREFIX_ACT_ZONE_FLOOR" log lines
  function parseActFromLog(text) {
    const re = /Generating level \d+ area "\d+_(\d+)_/g;
    let last = null;
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n) last = n;
    }
    return last;
  }

  async function pollFile() {
    if (!fileHandle) return;
    try {
      const file = await fileHandle.getFile();
      if (file.size <= lastSize) return;

      const blob = file.slice(lastSize);
      const newText = await blob.text();
      lastSize = file.size;

      const logAct = parseActFromLog(newText);
      if (logAct) currentAct = 'act' + logAct;

      const zones = parseSceneEvents(newText);
      console.log('[sync] poll: logAct=', logAct, 'zones=', zones, 'currentZone=', currentZone, 'currentAct=', currentAct);
      if (zones.length > 0) {
        const latest = zones[zones.length - 1];
        if (latest !== currentZone) {
          currentZone = latest;
          updateZoneDisplay(currentZone);
          scrollToZone(currentZone);
        }
      }
    } catch (err) {
      console.error('[sync] poll error:', err);
      lastSize = 0;
    }
  }

  const TAIL_BYTES = 128 * 1024; // read last 128KB to find latest zone

  async function startSync() {
    try {
      [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'PoE 로그', accept: { 'text/plain': ['.txt'] } }],
      });

      const file = await fileHandle.getFile();
      lastSize = file.size;

      // Read only the tail to find the last SCENE event
      const start = Math.max(0, file.size - TAIL_BYTES);
      const tail = await file.slice(start).text();
      const logAct = parseActFromLog(tail);
      if (logAct) currentAct = 'act' + logAct;

      const zones = parseSceneEvents(tail);
      console.log('[sync] startSync: logAct=', logAct, 'zones(last5)=', zones.slice(-5), 'currentAct=', currentAct);
      if (zones.length > 0) {
        currentZone = zones[zones.length - 1];
        updateZoneDisplay(currentZone);
        scrollToZone(currentZone);
      }

      pollTimer = setInterval(pollFile, POLL_INTERVAL);
      updateSyncButton(true);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[sync] start error:', err);
      }
    }
  }

  function stopSync() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    fileHandle = null;
    lastSize = 0;
    currentZone = null;
    currentAct = null;
    updateSyncButton(false);
    updateZoneDisplay(null);
    clearHighlight();
    // Reset TOC to default centered position
    const toc = document.getElementById('toc-overlay');
    if (toc) {
      toc.style.top = '50%';
      toc.style.transform = 'translateY(-50%)';
    }
  }

  function updateSyncButton(active) {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.innerHTML = active
      ? '<span class="sync-icon">🟢</span> 중지'
      : '<span class="sync-icon">🔄</span> 동기화';
    btn.classList.toggle('btn-sync-active', active);
  }

  function updateZoneDisplay(zoneName) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (!zoneName) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    let showEng = true;
    try {
      const raw = localStorage.getItem(ENGLISH_KEY);
      if (raw) {
        const val = JSON.parse(raw);
        showEng = (typeof val === 'object' && val !== null) ? val.zone !== false : val !== false;
      }
    } catch {}
    const eng = showEng && EN_NAMES && EN_NAMES.zone ? (EN_NAMES.zone[zoneName] || '') : '';
    const engStr = eng ? ` ${eng}` : '';

    // Debug: show mapped act section
    const actLabel = currentAct ? `[${currentAct}]` : '[?]';

    el.textContent = `${actLabel} ${zoneName}${engStr}`;
    el.style.display = 'inline';
  }

  function clearHighlight() {
    const prev = document.querySelector('.sync-highlight');
    if (prev) prev.classList.remove('sync-highlight');
  }

  function scrollToZone(zoneName) {
    // Find all step-items that mention this zone
    const allZones = document.querySelectorAll('.zone');
    const matches = [];
    for (const el of allZones) {
      if (el.textContent.startsWith(zoneName)) {
        const stepItem = el.closest('.step-item');
        if (stepItem) matches.push(stepItem);
      }
    }
    if (matches.length === 0) return;

    // Only scroll when we have an act from log; search only within that act
    if (!currentAct) {
      console.log('[sync] scrollToZone: no currentAct (logAct), skip scroll for', zoneName);
      return;
    }
    const actMatches = matches.filter(el => {
      const section = el.closest('.act-section');
      return section && section.id === currentAct;
    });
    const target = actMatches.find(el => el.getBoundingClientRect().top >= 0);
    if (!target) {
      console.warn('[sync] scrollToZone: no target for', zoneName, 'in currentAct=', currentAct);
      return;
    }

    // Auto-complete all steps before the target
    console.log('[sync] scrollToZone: target found for', zoneName, 'section=', target.closest('.act-section')?.id, '__completeItemsBefore=', typeof window.__completeItemsBefore);
    if (window.__completeItemsBefore) window.__completeItemsBefore(target);

    clearHighlight();
    target.classList.add('sync-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Sync TOC: highlight the act section and align
    const section = target.closest('.act-section');
    if (section) {
      const navLinks = document.querySelectorAll('#toc-overlay a');
      navLinks.forEach(link => link.classList.remove('active'));
      const activeLink = document.querySelector(`#toc-overlay a[href="#${section.id}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
        alignToc(activeLink);
      }
    }
  }

  // Reposition TOC so activeLink aligns with viewport center (where the step lands)
  function alignToc(linkEl) {
    const toc = document.getElementById('toc-overlay');
    if (!toc) return;
    // Where the step will be after scrollIntoView center
    const targetY = window.innerHeight / 2;
    // Where the link center currently is on screen
    const linkRect = linkEl.getBoundingClientRect();
    const linkCenterY = linkRect.top + linkRect.height / 2;
    // Where the TOC currently is on screen
    const tocRect = toc.getBoundingClientRect();
    // Shift TOC so link center moves from linkCenterY to targetY
    const newTop = tocRect.top + (targetY - linkCenterY);
    // Clamp so TOC stays on screen
    const tocH = tocRect.height;
    const minTop = 52;
    const maxTop = window.innerHeight - tocH - 8;
    toc.style.top = Math.max(minTop, Math.min(maxTop, newTop)) + 'px';
    toc.style.transform = 'none';
  }

  function init() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;

    if (!('showOpenFilePicker' in window)) {
      btn.title = '이 브라우저에서는 지원되지 않습니다';
      btn.disabled = true;
      btn.style.opacity = '0.5';
      return;
    }

    btn.addEventListener('click', () => {
      if (pollTimer) {
        stopSync();
      } else {
        startSync();
      }
    });

    // Click zone name → scroll back to highlighted step
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
      statusEl.style.cursor = 'pointer';
      statusEl.addEventListener('click', () => {
        const highlighted = document.querySelector('.sync-highlight');
        if (highlighted) {
          highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
