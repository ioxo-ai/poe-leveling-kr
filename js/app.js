(() => {
  const STORAGE_KEY = 'poe-leveling-kr-checks';
  const GEM_REWARD_STORAGE_KEY = 'poe-leveling-kr-gems-reward';
  const GEM_VENDOR_STORAGE_KEY = 'poe-leveling-kr-gems-vendor';
  const GEM_CLASS_KEY = 'poe-leveling-kr-gem-class';
  const NEW_LEAGUE_KEY = 'poe-leveling-kr-new-league';
  const ENGLISH_KEY = 'poe-leveling-kr-english';
  const SUB_KEY = 'poe-leveling-kr-sub';

  // Inline markup entity classes
  const ENTITY_CLASS = {
    izone: 'zone izone', zone: 'zone', boss: 'boss', npc: 'npc',
    wp: 'waypoint', tp: 'tp', quest: 'quest', trial: 'trial'
  };

  // Inline tag icons
  const WP_ICON = '<svg class="wp-icon" width="12" height="12" viewBox="0 0 12 12"><path d="M6 1L11 6L6 11L1 6Z" fill="currentColor" opacity="0.85"/><circle cx="6" cy="6" r="1.5" fill="#fff" opacity="0.5"/></svg>';
  const TP_ICON = '<img class="tp-icon" src="https://cdn.poedb.tw/image/Art/2DItems/Currency/CurrencyPortal.webp" width="14" height="14" alt="" loading="lazy">';

  const COST_INFO = {
    wisdom:        { name: '지혜의 두루마리', en: 'Scroll of Wisdom',       icon: 'Art/2DItems/Currency/CurrencyIdentification.webp' },
    transmutation: { name: '변환의 오브',     en: 'Orb of Transmutation',   icon: 'Art/2DItems/Currency/CurrencyUpgradeToMagic.webp' },
    alteration:    { name: '변경의 오브',     en: 'Orb of Alteration',      icon: 'Art/2DItems/Currency/CurrencyRerollMagic.webp' },
    chance:        { name: '기회의 오브',     en: 'Orb of Chance',          icon: 'Art/2DItems/Currency/CurrencyUpgradeRandomly.webp' },
    alchemy:       { name: '연금술의 오브',   en: 'Orb of Alchemy',         icon: 'Art/2DItems/Currency/CurrencyUpgradeToRare.webp' },
  };

  // ─── Main Page Gem Tooltip (poedb style) ───
  const ATTR_LABEL = { str: '힘', dex: '민첩', int: '지능' };
  let mainTooltip = null;

  function gemIdToEnglish(id) {
    return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function getMainTooltip() {
    if (mainTooltip) return mainTooltip;
    const el = document.createElement('div');
    el.className = 'mgt';
    el.innerHTML =
      '<div class="mgt-header"><span class="mgt-name"></span></div>' +
      '<div class="mgt-body">' +
        '<div class="mgt-tags"></div>' +
        '<div class="mgt-sep"></div>' +
        '<div class="mgt-req"></div>' +
        '<div class="mgt-sep"></div>' +
        '<div class="mgt-eng"></div>' +
      '</div>';
    document.body.appendChild(el);
    window.addEventListener('scroll', hideMainTooltip, { passive: true });
    mainTooltip = el;
    return el;
  }

  function showMainTooltip(gem, e) {
    const tt = getMainTooltip();
    tt.querySelector('.mgt-name').textContent = gem.name;
    tt.querySelector('.mgt-tags').textContent = gem.type === 'support' ? '보조 젬' : '스킬 젬';
    const req = tt.querySelector('.mgt-req');
    const attrName = ATTR_LABEL[gem.color] || '';
    req.innerHTML = `요구 속성 <span class="mgt-attr ${gem.color}">${attrName}</span>`;
    tt.querySelector('.mgt-eng').textContent = gemIdToEnglish(gem.id);
    tt.style.display = 'block';
    positionMainTooltip(e);
  }

  function hideMainTooltip() {
    if (mainTooltip) mainTooltip.style.display = 'none';
  }

  function positionMainTooltip(e) {
    if (!mainTooltip || mainTooltip.style.display === 'none') return;
    const offset = 12;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    const rect = mainTooltip.getBoundingClientRect();
    const w = rect.width || 200;
    const h = rect.height || 80;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - offset;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - offset;
    mainTooltip.style.left = x + 'px';
    mainTooltip.style.top = y + 'px';
  }

  function attachGemTooltip(el, gem) {
    el.addEventListener('mouseenter', e => showMainTooltip(gem, e));
    el.addEventListener('mouseleave', hideMainTooltip);
    el.addEventListener('mousemove', positionMainTooltip);
  }

  function parseStep(text) {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return html.replace(/@(izone|zone|boss|npc|wp|tp|quest|trial)\{([^}]+)\}/g, (_, type, content) => {
      const prefix = type === 'wp' ? WP_ICON : type === 'tp' ? TP_ICON : '';
      const eng = showEnglish[type] ? getEnglishName(type, content) : '';
      const engSuffix = eng ? `<span class="eng-anno">${eng}</span>` : '';
      return `<span class="${ENTITY_CLASS[type]}">${prefix}${content}${engSuffix}</span>`;
    });
  }

  // Normalize step: returns { text, isNewLeague, variantText, sub, video }
  function normalizeStep(step) {
    if (typeof step === 'string') return { text: step, isNewLeague: false, variantText: null, sub: null, video: null };
    const sub = step.sub || null;
    const video = step.video || null;
    if (typeof step.newLeague === 'string')
      return { text: step.text, isNewLeague: false, variantText: step.newLeague, sub, video };
    return { text: step.text, isNewLeague: !!step.newLeague, variantText: null, sub, video };
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
    "2-문제의 근원": { section: "act2", step: 22 },
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
      const reward = JSON.parse(localStorage.getItem(GEM_REWARD_STORAGE_KEY)) || {};
      const vendor = JSON.parse(localStorage.getItem(GEM_VENDOR_STORAGE_KEY)) || {};
      return { reward, vendor };
    } catch { return { reward: {}, vendor: {} }; }
  }

  function getGemsForStep(sectionId, stepIdx) {
    const selected = getSelectedGems();
    const hasAny = Object.keys(selected.reward).length > 0 || Object.keys(selected.vendor).length > 0;
    if (!hasAny) return [];
    if (typeof GEM_DATA === 'undefined') return [];

    const gemClass = localStorage.getItem(GEM_CLASS_KEY) || 'witch';
    const results = [];

    // Quest rewards (pick from reward) — dedupe within source
    const seenQuest = new Set();
    (GEM_DATA.questRewards || []).forEach(group => {
      const key = `${group.act}-${group.questName}`;
      const mapping = QUEST_STEP_MAP[key];
      if (!mapping || mapping.section !== sectionId || mapping.step !== stepIdx) return;
      group.rewards.forEach(r => {
        if (!selected.reward[r.gemId] || seenQuest.has(r.gemId)) return;
        if (r.classes && r.classes.length > 0 && !r.classes.includes(gemClass)) return;
        const gem = GEM_DATA.gems.find(g => g.id === r.gemId);
        if (gem) {
          seenQuest.add(gem.id);
          results.push({ gem, sourceType: 'quest', questName: group.questName });
        }
      });
    });

    // Vendor rewards (buy from NPC) — dedupe within each quest group
    (GEM_DATA.vendorRewards || []).forEach(group => {
      const key = `${group.act}-${group.questName}`;
      const mapping = QUEST_STEP_MAP[key];
      if (!mapping || mapping.section !== sectionId || mapping.step !== stepIdx) return;
      group.rewards.forEach(r => {
        if (!selected.vendor[r.gemId]) return;
        if (r.classes && r.classes.length > 0 && !r.classes.includes(gemClass)) return;
        const gem = GEM_DATA.gems.find(g => g.id === r.gemId);
        if (gem) {
          results.push({ gem, sourceType: 'vendor', questName: group.questName, npc: group.npc, cost: group.cost });
        }
      });
    });

    return results;
  }

  function renderGemSteps(li, ul, sectionId, stepIdx) {
    const gemInfos = getGemsForStep(sectionId, stepIdx);
    if (gemInfos.length === 0) return;

    const questGems = gemInfos.filter(i => i.sourceType === 'quest');
    const vendorGems = gemInfos.filter(i => i.sourceType === 'vendor');
    let insertAfter = li;

    // Quest gems: render individually
    questGems.forEach(info => {
      const { gem, questName } = info;
      const gemStepId = `${sectionId}-gem-${gem.id}-quest-${stepIdx}`;
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
        if (checkbox.checked && shiftHeld) checkAllBefore(ul, gemLi);
        clearCheckPreview();
        saveChecks();
        updateProgress(sectionId);
      });
      attachCheckPreview(checkbox, ul, gemLi);

      const lbl = document.createElement('label');
      lbl.htmlFor = gemStepId;

      lbl.appendChild(document.createTextNode(questName));
      if (showEnglish.questName) {
        const engQN = getEnglishName('questName', questName);
        if (engQN) {
          const engSpan = document.createElement('span');
          engSpan.className = 'eng-anno';
          engSpan.textContent = engQN;
          lbl.appendChild(engSpan);
        }
      }
      lbl.appendChild(document.createTextNode(' 보상으로 '));

      if (gem.icon) {
        const img = document.createElement('img');
        img.src = `img/gems/${gem.icon}`;
        img.width = 18;
        img.height = 18;
        img.alt = '';
        img.loading = 'lazy';
        img.className = 'gem-step-icon';
        lbl.appendChild(img);
        attachGemTooltip(img, gem);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = `gem-name-text ${gem.color}`;
      nameSpan.textContent = gem.name;
      if (showEnglish.gem) {
        const eng = document.createElement('span');
        eng.className = 'eng-anno';
        eng.textContent = gemEngName(gem.id);
        nameSpan.appendChild(eng);
      }
      attachGemTooltip(nameSpan, gem);

      lbl.appendChild(nameSpan);
      lbl.appendChild(document.createTextNode(' 선택'));

      gemLi.appendChild(checkbox);
      gemLi.appendChild(lbl);
      insertAfter.after(gemLi);
      insertAfter = gemLi;
    });

    // Vendor gems: group by quest into separate steps
    if (vendorGems.length > 0) {
      const byQuest = new Map();
      vendorGems.forEach(info => {
        const key = info.questName || '상인';
        if (!byQuest.has(key)) byQuest.set(key, []);
        byQuest.get(key).push(info);
      });

      byQuest.forEach((gems, questName) => {
        const questKey = questName.replace(/\s+/g, '_');
        const gemStepId = `${sectionId}-vendor-${questKey}-${stepIdx}`;
        const isChecked = !!checks[gemStepId];
        const npc = gems[0].npc || '상인';

        const gemLi = document.createElement('li');
        gemLi.className = 'step-item gem-step' + (isChecked ? ' checked' : '');
        gemLi.dataset.parentStep = `${sectionId}-${stepIdx}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = gemStepId;
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', () => {
          checks[gemStepId] = checkbox.checked;
          gemLi.classList.toggle('checked', checkbox.checked);
          if (checkbox.checked && shiftHeld) checkAllBefore(ul, gemLi);
          clearCheckPreview();
          saveChecks();
          updateProgress(sectionId);
        });
        attachCheckPreview(checkbox, ul, gemLi);

        const lbl = document.createElement('label');
        lbl.htmlFor = gemStepId;
        lbl.appendChild(document.createTextNode(`${npc}에게서 `));

        gems.forEach((info, idx) => {
          const { gem } = info;
          if (gem.icon) {
            const img = document.createElement('img');
            img.src = `img/gems/${gem.icon}`;
            img.width = 18;
            img.height = 18;
            img.alt = '';
            img.loading = 'lazy';
            img.className = 'gem-step-icon';
            lbl.appendChild(img);
            attachGemTooltip(img, gem);
          }

          const nameSpan = document.createElement('span');
          nameSpan.className = `gem-name-text ${gem.color}`;
          nameSpan.textContent = gem.name;
          if (showEnglish.gem) {
            const eng = document.createElement('span');
            eng.className = 'eng-anno';
            eng.textContent = gemEngName(gem.id);
            nameSpan.appendChild(eng);
          }
          attachGemTooltip(nameSpan, gem);
          lbl.appendChild(nameSpan);

          if (info.cost && COST_INFO[info.cost]) {
            const ci = COST_INFO[info.cost];
            const costSpan = document.createElement('span');
            costSpan.className = 'gem-cost';
            costSpan.title = showEnglish.gem ? `${ci.name} (${ci.en})` : ci.name;
            costSpan.appendChild(document.createTextNode('(1 x '));
            const costIcon = document.createElement('img');
            costIcon.src = `https://cdn.poedb.tw/image/${ci.icon}`;
            costIcon.width = 16;
            costIcon.height = 16;
            costIcon.alt = ci.name;
            costIcon.loading = 'lazy';
            costIcon.className = 'gem-cost-icon';
            costSpan.appendChild(costIcon);
            costSpan.appendChild(document.createTextNode(')'));
            lbl.appendChild(costSpan);
          }

          if (idx < gems.length - 1) {
            lbl.appendChild(document.createTextNode(', '));
          }
        });

        lbl.appendChild(document.createTextNode(' 구매'));

        gemLi.appendChild(checkbox);
        gemLi.appendChild(lbl);
        insertAfter.after(gemLi);
        insertAfter = gemLi;
      });
    }
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

  const DEFAULT_ENG = { zone: true, boss: true, npc: true, quest: true, trial: true, gem: true, questName: true };
  const ENG_ENTITIES = [
    { key: 'zone', label: '지역' },
    { key: 'boss', label: '보스' },
    { key: 'npc', label: 'NPC' },
    { key: 'questName', label: '퀘스트' },
    { key: 'quest', label: '퀘스트 아이템' },
    { key: 'trial', label: '시험' },
    { key: 'gem', label: '젬' },
  ];

  // State
  let checks = loadChecks();
  let tipsVisible = true;
  let newLeague = loadNewLeague();
  let showEnglish = loadEnglish();
  let showSub = loadSub();

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

  function loadEnglish() {
    try {
      const raw = localStorage.getItem(ENGLISH_KEY);
      if (raw === null) return { ...DEFAULT_ENG };
      const val = JSON.parse(raw);
      if (typeof val === 'object' && val !== null) return { ...DEFAULT_ENG, ...val };
      const on = val !== false;
      const obj = {};
      for (const k of Object.keys(DEFAULT_ENG)) obj[k] = on;
      return obj;
    } catch { return { ...DEFAULT_ENG }; }
  }

  function saveEnglish() {
    localStorage.setItem(ENGLISH_KEY, JSON.stringify(showEnglish));
  }

  function loadSub() {
    const val = localStorage.getItem(SUB_KEY);
    return val === null ? true : val === 'true';
  }

  function saveSub() {
    localStorage.setItem(SUB_KEY, String(showSub));
  }

  function getStepId(actId, stepIdx) {
    return `${actId}-${stepIdx}`;
  }

  // Track shift key for shift+click batch check
  let shiftHeld = false;
  document.addEventListener('keydown', e => { if (e.key === 'Shift') shiftHeld = true; });
  document.addEventListener('keyup', e => { if (e.key === 'Shift') { shiftHeld = false; clearCheckPreview(); } });

  // Collect all unchecked items before targetLi across all sections
  function getItemsBefore(ul, targetLi) {
    const result = [];
    const allLists = document.querySelectorAll('.steps-list');
    for (const list of allLists) {
      const items = list.querySelectorAll('.step-item');
      for (const item of items) {
        if (list === ul && item === targetLi) return result;
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) result.push(item);
      }
    }
    return result;
  }

  // Hover preview: show/clear check-preview class
  function showCheckPreview(ul, targetLi) {
    const items = getItemsBefore(ul, targetLi);
    items.forEach(item => item.classList.add('check-preview'));
  }

  function clearCheckPreview() {
    document.querySelectorAll('.check-preview').forEach(el => el.classList.remove('check-preview'));
  }

  function attachCheckPreview(checkbox, ul, li) {
    checkbox.addEventListener('mouseenter', () => {
      if (!checkbox.checked && shiftHeld) showCheckPreview(ul, li);
    });
    checkbox.addEventListener('mouseleave', clearCheckPreview);
  }

  // When a step is checked, also check all previous steps across all sections
  function checkAllBefore(ul, targetLi) {
    const allLists = document.querySelectorAll('.steps-list');
    for (const list of allLists) {
      const items = list.querySelectorAll('.step-item');
      for (const item of items) {
        if (list === ul && item === targetLi) return;
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) {
          cb.checked = true;
          item.classList.add('checked');
          checks[cb.id] = true;
        }
      }
      // Update progress for completed previous sections
      if (list !== ul) {
        const sectionEl = list.closest('.act-section');
        if (sectionEl) updateProgress(sectionEl.id);
      }
    }
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
        const { text, isNewLeague, variantText, sub, video } = normalizeStep(step);

        // Skip new-league-only steps when toggle is off
        if (isNewLeague && !newLeague) return;

        const displayText = (variantText && newLeague) ? variantText : text;
        const stepId = getStepId(sectionId, idx);
        const isChecked = !!checks[stepId];

        const li = document.createElement('li');
        li.className = 'step-item' + (isChecked ? ' checked' : '');
        if (isNewLeague) li.classList.add('new-league-step');
        if (variantText && newLeague) li.classList.add('variant-step');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = stepId;
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', () => {
          checks[stepId] = checkbox.checked;
          li.classList.toggle('checked', checkbox.checked);
          if (checkbox.checked && shiftHeld) checkAllBefore(ul, li);
          clearCheckPreview();
          saveChecks();
          updateProgress(sectionId);
        });
        attachCheckPreview(checkbox, ul, li);

        const lbl = document.createElement('label');
        lbl.htmlFor = stepId;
        lbl.innerHTML = parseStep(displayText);

        const contentWrap = document.createElement('div');
        contentWrap.className = 'step-content';
        contentWrap.appendChild(lbl);

        if (sub || video) {
          const subEl = document.createElement('span');
          subEl.className = 'step-sub';
          if (!showSub) subEl.style.display = 'none';
          if (sub) {
            subEl.innerHTML = sub;
          }
          if (video) {
            if (sub) subEl.appendChild(document.createTextNode(' '));
            const a = document.createElement('a');
            a.href = video;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = '[영상]';
            subEl.appendChild(a);
          }
          contentWrap.appendChild(subEl);
        }

        li.appendChild(checkbox);
        li.appendChild(contentWrap);

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

  // Clear all
  function clearAll() {
    if (!confirm('모든 체크를 초기화하시겠습니까?')) return;
    checks = {};
    saveChecks();
    localStorage.removeItem(GEM_REWARD_STORAGE_KEY);
    localStorage.removeItem(GEM_VENDOR_STORAGE_KEY);
    localStorage.removeItem(GEM_CLASS_KEY);
    render();
    if (window.gemsApp && window.gemsApp.onExternalReset) {
      window.gemsApp.onExternalReset();
    }
  }

  // Unified view settings dropdown
  function setupViewSettings() {
    const wrap = document.getElementById('view-settings-wrap');
    const btn = document.getElementById('btn-view-settings');
    const dropdown = document.getElementById('view-settings-dropdown');
    if (!wrap || !btn || !dropdown) return;

    // ── Column 1: 새 리그, 팁 ──
    const col1 = document.createElement('div');
    col1.className = 'view-col';

    const nlLabel = document.createElement('label');
    const nlCb = document.createElement('input');
    nlCb.type = 'checkbox';
    nlCb.id = 'btn-new-league-toggle';
    nlCb.checked = newLeague;
    nlCb.addEventListener('change', () => {
      newLeague = nlCb.checked;
      saveNewLeague();
      render();
      setupScrollSpy();
    });
    nlLabel.appendChild(nlCb);
    nlLabel.appendChild(document.createTextNode(' 새 리그'));
    col1.appendChild(nlLabel);

    const tipLabel = document.createElement('label');
    const tipCb = document.createElement('input');
    tipCb.type = 'checkbox';
    tipCb.id = 'btn-tips-toggle';
    tipCb.checked = tipsVisible;
    tipCb.addEventListener('change', () => {
      tipsVisible = tipCb.checked;
      document.querySelectorAll('.tips-container').forEach(el => {
        el.classList.toggle('open', tipsVisible);
      });
    });
    tipLabel.appendChild(tipCb);
    tipLabel.appendChild(document.createTextNode(' 팁'));
    col1.appendChild(tipLabel);

    const subLabel = document.createElement('label');
    const subCbToggle = document.createElement('input');
    subCbToggle.type = 'checkbox';
    subCbToggle.id = 'btn-sub-toggle';
    subCbToggle.checked = showSub;
    subCbToggle.addEventListener('change', () => {
      showSub = subCbToggle.checked;
      saveSub();
      document.querySelectorAll('.step-sub').forEach(el => {
        el.style.display = showSub ? '' : 'none';
      });
    });
    subLabel.appendChild(subCbToggle);
    subLabel.appendChild(document.createTextNode(' 자막'));
    col1.appendChild(subLabel);

    dropdown.appendChild(col1);

    // ── Column 2: 영문 표기 master + sub-checkboxes ──
    const col2 = document.createElement('div');
    col2.className = 'view-col';

    const masterLabel = document.createElement('label');
    masterLabel.className = 'view-master';
    const masterCb = document.createElement('input');
    masterCb.type = 'checkbox';
    masterLabel.appendChild(masterCb);
    masterLabel.appendChild(document.createTextNode(' 영문 표기'));
    col2.appendChild(masterLabel);

    const subCbs = [];
    ENG_ENTITIES.forEach(({ key, label }) => {
      const lbl = document.createElement('label');
      lbl.className = 'view-sub';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = showEnglish[key];
      cb.dataset.eng = key;
      cb.addEventListener('change', () => {
        showEnglish[key] = cb.checked;
        saveEnglish();
        updateMaster();
        render();
        setupScrollSpy();
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + label));
      col2.appendChild(lbl);
      subCbs.push(cb);
    });

    dropdown.appendChild(col2);

    // Master tri-state logic
    function updateMaster() {
      const total = subCbs.length;
      const checked = subCbs.filter(c => c.checked).length;
      if (checked === total) {
        masterCb.checked = true;
        masterCb.indeterminate = false;
      } else if (checked === 0) {
        masterCb.checked = false;
        masterCb.indeterminate = false;
      } else {
        masterCb.checked = false;
        masterCb.indeterminate = true;
      }
    }

    masterCb.addEventListener('change', () => {
      const on = masterCb.checked;
      masterCb.indeterminate = false;
      subCbs.forEach(cb => { cb.checked = on; });
      ENG_ENTITIES.forEach(({ key }) => { showEnglish[key] = on; });
      saveEnglish();
      render();
      setupScrollSpy();
    });

    updateMaster();

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
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
    setupViewSettings();

    render();
    setupScrollSpy();
    setupTocScroll();

    document.getElementById('btn-clear').addEventListener('click', clearAll);

    // React to gem selection changes
    window.addEventListener('gems-changed', updateAllGemSteps);
  }

  // Expose for sync.js — check all items before target
  window.__completeItemsBefore = function(targetLi) {
    const ul = targetLi.closest('.steps-list');
    if (!ul) return;
    checkAllBefore(ul, targetLi);
    const sectionEl = ul.closest('.act-section');
    if (sectionEl) updateProgress(sectionEl.id);
    saveChecks();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
