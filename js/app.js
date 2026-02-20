(() => {
  const STORAGE_KEY = 'poe-leveling-kr-checks';
  const GEM_STORAGE_KEY = 'poe-leveling-kr-gems';
  const GEM_CLASS_KEY = 'poe-leveling-kr-gem-class';
  const NEW_LEAGUE_KEY = 'poe-leveling-kr-new-league';

  // Inline markup entity classes
  const ENTITY_CLASS = {
    zone: 'zone', boss: 'boss', npc: 'npc',
    wp: 'waypoint', tp: 'tp', quest: 'quest', trial: 'trial'
  };

  function parseStep(text) {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return html.replace(/@(zone|boss|npc|wp|tp|quest|trial)\{([^}]+)\}/g, (_, type, content) => {
      return `<span class="${ENTITY_CLASS[type]}">${content}</span>`;
    });
  }

  // Normalize step: returns { text, isNewLeague }
  function normalizeStep(step) {
    if (typeof step === 'string') return { text: step, isNewLeague: false };
    return { text: step.text, isNewLeague: !!step.newLeague };
  }

  // Quest-to-step mapping for gem badge placement
  // Step indices are 0-based into each act's steps[] array
  const QUEST_STEP_MAP = {
    // Act 1: step 0=hillock, 1=turn in
    "1-눈 앞의 적": { section: "act1", step: 1 },
    // Act 1: step 5=hailrake, 6=turn in quests
    "1-로아 알 깨트리기": { section: "act1", step: 6 },
    "1-자비로운 임무": { section: "act1", step: 6 },
    // Act 1: step 15=brutus, 16=WP to prisoner's gate (turn-in implicit)
    "1-감금된 덩치": { section: "act1", step: 16 },
    // Act 1: step 18=find cavern WP + turn in quest for gem
    "1-사이렌의 마침곡": { section: "act1", step: 18 },
    // Act 2: step 7=fidelitas kill, 8=herald reward
    "2-검은 침략자": { section: "act2", step: 8 },
    // Act 2: step 14=support gem reward
    "2-예리하고 잔인한": { section: "act2", step: 14 },
    // Act 2: step 20=act1 passive point
    "2-문제의 근원": { section: "act2", step: 23 },
    // Act 3: step 4=piety kill, 5=rewards
    "3-떠나보낸 연인": { section: "act3", step: 5 },
    // Act 3: step 21=piety kill act3
    "3-오른팔 잘라내기": { section: "act3", step: 22 },
    // Act 3: step 27=imperial gardens trial
    "3-운명의 흔적": { section: "act3", step: 26 },
    // Act 4: step 4=deshret spirit
    "4-봉인 해제": { section: "act4", step: 4 },
    // Act 4: step 24=malachai kill, 25=TP to town
    "4-영원한 악몽": { section: "act4", step: 25 },
  };

  function getSelectedGems() {
    try {
      return JSON.parse(localStorage.getItem(GEM_STORAGE_KEY)) || {};
    } catch { return {}; }
  }

  function getGemsForStep(sectionId, stepIdx) {
    const selected = getSelectedGems();
    if (Object.keys(selected).length === 0) return [];
    if (typeof GEM_DATA === 'undefined') return [];

    const gemClass = localStorage.getItem(GEM_CLASS_KEY) || 'witch';
    const results = [];
    const seen = new Set();

    // Quest rewards first (pick from reward)
    (GEM_DATA.questRewards || []).forEach(group => {
      const key = `${group.act}-${group.questName}`;
      const mapping = QUEST_STEP_MAP[key];
      if (!mapping || mapping.section !== sectionId || mapping.step !== stepIdx) return;
      group.rewards.forEach(r => {
        if (!selected[r.gemId] || seen.has(r.gemId)) return;
        if (r.classes && r.classes.length > 0 && !r.classes.includes(gemClass)) return;
        const gem = GEM_DATA.gems.find(g => g.id === r.gemId);
        if (gem) {
          seen.add(gem.id);
          results.push({ gem, sourceType: 'quest', questName: group.questName });
        }
      });
    });

    // Vendor rewards second (buy from NPC)
    (GEM_DATA.vendorRewards || []).forEach(group => {
      const key = `${group.act}-${group.questName}`;
      const mapping = QUEST_STEP_MAP[key];
      if (!mapping || mapping.section !== sectionId || mapping.step !== stepIdx) return;
      group.rewards.forEach(r => {
        if (!selected[r.gemId] || seen.has(r.gemId)) return;
        if (r.classes && r.classes.length > 0 && !r.classes.includes(gemClass)) return;
        const gem = GEM_DATA.gems.find(g => g.id === r.gemId);
        if (gem) {
          seen.add(gem.id);
          results.push({ gem, sourceType: 'vendor', questName: group.questName, npc: group.npc });
        }
      });
    });

    return results;
  }

  function renderGemSteps(li, ul, sectionId, stepIdx) {
    const gemInfos = getGemsForStep(sectionId, stepIdx);
    if (gemInfos.length === 0) return;

    let insertAfter = li;
    gemInfos.forEach(info => {
      const { gem, sourceType, questName, npc } = info;
      const gemStepId = `${sectionId}-gem-${gem.id}-${stepIdx}`;
      const isChecked = !!checks[gemStepId];

      const gemLi = document.createElement('li');
      gemLi.className = `step-item gem-step ${gem.color}` + (isChecked ? ' checked' : '');
      gemLi.dataset.parentStep = `${sectionId}-${stepIdx}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = gemStepId;
      checkbox.checked = isChecked;
      checkbox.addEventListener('change', () => {
        checks[gemStepId] = checkbox.checked;
        gemLi.classList.toggle('checked', checkbox.checked);
        saveChecks();
      });

      const lbl = document.createElement('label');
      lbl.htmlFor = gemStepId;

      if (gem.icon) {
        const img = document.createElement('img');
        img.src = `https://cdn.poedb.tw/image/${gem.icon}`;
        img.width = 18;
        img.height = 18;
        img.alt = '';
        img.loading = 'lazy';
        img.className = 'gem-step-icon';
        lbl.appendChild(img);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = `gem-name-text ${gem.color}`;
      nameSpan.textContent = gem.name;

      if (sourceType === 'quest') {
        lbl.appendChild(document.createTextNode(`${questName} 보상으로 `));
        lbl.appendChild(nameSpan);
        lbl.appendChild(document.createTextNode(' 선택'));
      } else {
        lbl.appendChild(document.createTextNode(`${npc}에게서 `));
        lbl.appendChild(nameSpan);
        lbl.appendChild(document.createTextNode(' 구매'));
      }

      gemLi.appendChild(checkbox);
      gemLi.appendChild(lbl);
      insertAfter.after(gemLi);
      insertAfter = gemLi;
    });
  }

  function updateAllGemSteps() {
    // Remove all existing gem steps
    document.querySelectorAll('.gem-step').forEach(el => el.remove());

    // Re-insert gem steps for each regular step
    document.querySelectorAll('.step-item:not(.gem-step)').forEach(li => {
      const cb = li.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const id = cb.id;
      const lastDash = id.lastIndexOf('-');
      const sectionId = id.substring(0, lastDash);
      const stepIdx = parseInt(id.substring(lastDash + 1));
      const ul = li.parentElement;
      renderGemSteps(li, ul, sectionId, stepIdx);
    });
  }

  // State
  let checks = loadChecks();
  let tipsVisible = true;
  let newLeague = loadNewLeague();

  function loadChecks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveChecks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checks));
  }

  function loadNewLeague() {
    const val = localStorage.getItem(NEW_LEAGUE_KEY);
    return val === null ? true : val === 'true';
  }

  function saveNewLeague() {
    localStorage.setItem(NEW_LEAGUE_KEY, String(newLeague));
  }

  function getStepId(actId, stepIdx) {
    return `${actId}-${stepIdx}`;
  }

  // SVG progress ring helper
  function createProgressRing(percent) {
    const size = 20;
    const stroke = 2;
    const r = (size - stroke) / 2;
    const c = Math.PI * 2 * r;
    const offset = c - (percent / 100) * c;
    const color = percent === 100 ? '#1ba29b' : (percent > 0 ? '#8a7a5e' : 'rgba(180,158,121,0.15)');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('class', 'nav-progress-ring');

    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', size / 2);
    bgCircle.setAttribute('cy', size / 2);
    bgCircle.setAttribute('r', r);
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(180,158,121,0.1)');
    bgCircle.setAttribute('stroke-width', stroke);
    svg.appendChild(bgCircle);

    // Progress circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', size / 2);
    circle.setAttribute('cy', size / 2);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', stroke);
    circle.setAttribute('stroke-dasharray', c);
    circle.setAttribute('stroke-dashoffset', offset);
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
    circle.style.transition = 'stroke-dashoffset 0.3s ease, stroke 0.3s ease';
    svg.appendChild(circle);

    return svg;
  }

  // Render
  function render() {
    const main = document.getElementById('content');
    const nav = document.getElementById('toc-overlay');
    main.innerHTML = '';
    nav.innerHTML = '';

    // General section
    renderSection(main, nav, 'general', DATA.general.title, DATA.general.tips, DATA.general.steps);

    // Act sections
    DATA.acts.forEach(act => {
      renderSection(main, nav, `act${act.id}`, act.title, act.tips, act.steps);
    });

    updateAllProgress();
  }

  function renderSection(container, nav, sectionId, title, tips, steps) {
    const section = document.createElement('div');
    section.className = 'act-section';
    section.id = sectionId;

    // Heading
    const h2 = document.createElement('h2');
    h2.className = 'act-heading';
    h2.textContent = title;
    section.appendChild(h2);

    // Tips
    if (tips && tips.length > 0) {
      const tipsDiv = document.createElement('div');
      tipsDiv.className = 'tips-container' + (tipsVisible ? ' open' : '');
      tipsDiv.dataset.section = sectionId;

      const tipsHeader = document.createElement('div');
      tipsHeader.className = 'tips-header';

      const arrow = document.createElement('span');
      arrow.className = 'tips-arrow';
      arrow.textContent = '▶';
      tipsHeader.appendChild(arrow);

      const label = document.createTextNode(' 팁');
      tipsHeader.appendChild(label);

      tipsHeader.addEventListener('click', () => {
        tipsDiv.classList.toggle('open');
      });
      tipsDiv.appendChild(tipsHeader);

      const tipsList = document.createElement('ul');
      tipsList.className = 'tips-list';
      tips.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        tipsList.appendChild(li);
      });
      tipsDiv.appendChild(tipsList);
      section.appendChild(tipsDiv);
    }

    // Progress bar with text — count only visible steps
    if (steps && steps.length > 0) {
      const visibleCount = getVisibleStepCount(steps);

      const wrapper = document.createElement('div');
      wrapper.className = 'progress-wrapper';

      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.id = `progress-${sectionId}`;
      progressBar.appendChild(fill);
      wrapper.appendChild(progressBar);

      const pText = document.createElement('span');
      pText.className = 'progress-text';
      pText.id = `progress-text-${sectionId}`;
      pText.textContent = `0/${visibleCount}`;
      wrapper.appendChild(pText);

      section.appendChild(wrapper);

      // Steps
      const ul = document.createElement('ul');
      ul.className = 'steps-list';

      steps.forEach((step, idx) => {
        const { text, isNewLeague } = normalizeStep(step);

        // Skip new-league-only steps when toggle is off
        if (isNewLeague && !newLeague) return;

        const stepId = getStepId(sectionId, idx);
        const isChecked = !!checks[stepId];

        const li = document.createElement('li');
        li.className = 'step-item' + (isChecked ? ' checked' : '');
        if (isNewLeague) li.classList.add('new-league-step');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = stepId;
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', () => {
          checks[stepId] = checkbox.checked;
          li.classList.toggle('checked', checkbox.checked);
          saveChecks();
          updateProgress(sectionId);
        });

        const lbl = document.createElement('label');
        lbl.htmlFor = stepId;
        lbl.innerHTML = parseStep(text);

        li.appendChild(checkbox);
        li.appendChild(lbl);
        ul.appendChild(li);
        renderGemSteps(li, ul, sectionId, idx);
      });

      section.appendChild(ul);
    }

    container.appendChild(section);

    // Nav link in TOC overlay
    const navLink = document.createElement('a');
    navLink.href = `#${sectionId}`;
    navLink.dataset.section = sectionId;

    const navLabel = document.createElement('span');
    navLabel.className = 'nav-label';
    const displayName = sectionId === 'general' ? '일반' : sectionId.replace('act', '') + '장';
    navLabel.textContent = displayName;
    navLink.appendChild(navLabel);

    // Progress ring placeholder
    const ring = createProgressRing(0);
    navLink.appendChild(ring);

    const pct = document.createElement('span');
    pct.className = 'nav-pct';
    pct.dataset.section = sectionId;
    pct.textContent = '';
    navLink.appendChild(pct);

    navLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
    });
    nav.appendChild(navLink);
  }

  function getVisibleStepCount(steps) {
    return steps.filter(step => {
      const { isNewLeague } = normalizeStep(step);
      return !isNewLeague || newLeague;
    }).length;
  }

  function getProgressData(sectionId) {
    const section = sectionId === 'general' ? DATA.general : DATA.acts.find(a => `act${a.id}` === sectionId);
    if (!section || !section.steps || section.steps.length === 0) return null;

    let total = 0;
    let checked = 0;
    section.steps.forEach((step, idx) => {
      const { isNewLeague } = normalizeStep(step);
      if (isNewLeague && !newLeague) return;
      total++;
      if (checks[getStepId(sectionId, idx)]) checked++;
    });
    if (total === 0) return null;

    return { checked, total, percent: Math.round((checked / total) * 100) };
  }

  function updateProgress(sectionId) {
    const data = getProgressData(sectionId);
    if (!data) return;

    const { checked, total, percent } = data;

    // Update bar fill
    const fill = document.getElementById(`progress-${sectionId}`);
    if (fill) {
      fill.style.width = `${percent}%`;
    }

    // Update text
    const pText = document.getElementById(`progress-text-${sectionId}`);
    if (pText) {
      pText.textContent = `${checked}/${total}`;
    }

    // Update nav ring & pct in TOC overlay
    const navLink = document.querySelector(`#toc-overlay a[data-section="${sectionId}"]`);
    if (navLink) {
      const oldRing = navLink.querySelector('.nav-progress-ring');
      const newRing = createProgressRing(percent);
      if (oldRing) navLink.replaceChild(newRing, oldRing);

      const pctEl = navLink.querySelector('.nav-pct');
      if (pctEl) {
        pctEl.textContent = total > 0 ? `${percent}%` : '';
      }
    }
  }

  function updateAllProgress() {
    updateProgress('general');
    DATA.acts.forEach(act => updateProgress(`act${act.id}`));
  }

  // Tips toggle
  function toggleAllTips() {
    tipsVisible = !tipsVisible;
    document.querySelectorAll('.tips-container').forEach(el => {
      el.classList.toggle('open', tipsVisible);
    });
    const btn = document.getElementById('btn-tips');
    btn.textContent = tipsVisible ? '팁 숨기기' : '팁 표시';
  }

  // Clear all
  function clearAll() {
    if (!confirm('모든 체크를 초기화하시겠습니까?')) return;
    checks = {};
    saveChecks();
    localStorage.removeItem(GEM_STORAGE_KEY);
    localStorage.removeItem(GEM_CLASS_KEY);
    render();
    if (window.gemsApp && window.gemsApp.onExternalReset) {
      window.gemsApp.onExternalReset();
    }
  }

  // New league toggle
  function toggleNewLeague() {
    const checkbox = document.getElementById('btn-new-league-toggle');
    newLeague = checkbox.checked;
    saveNewLeague();
    render();
    setupScrollSpy();
  }

  // Scroll spy
  function setupScrollSpy() {
    const sections = document.querySelectorAll('.act-section');
    const navLinks = document.querySelectorAll('#toc-overlay a');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => link.classList.remove('active'));
          const activeLink = document.querySelector(`#toc-overlay a[href="#${entry.target.id}"]`);
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(section => observer.observe(section));
  }

  // TOC overlay scroll visibility
  function setupTocScroll() {
    const toc = document.getElementById('toc-overlay');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 200) {
        toc.classList.add('visible');
      } else {
        toc.classList.remove('visible');
      }
    }, { passive: true });
  }

  // Init
  function init() {
    // Set initial new league toggle state
    const nlToggle = document.getElementById('btn-new-league-toggle');
    nlToggle.checked = newLeague;

    render();
    setupScrollSpy();
    setupTocScroll();

    document.getElementById('btn-tips').addEventListener('click', toggleAllTips);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    nlToggle.addEventListener('change', toggleNewLeague);

    // React to gem selection changes
    window.addEventListener('gems-changed', updateAllGemSteps);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
