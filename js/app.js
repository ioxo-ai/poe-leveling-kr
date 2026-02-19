(() => {
  const STORAGE_KEY = 'poe-leveling-kr-checks';
  const GEM_STORAGE_KEY = 'poe-leveling-kr-gems';
  const GEM_CLASS_KEY = 'poe-leveling-kr-gem-class';

  // State
  let checks = loadChecks();
  let tipsVisible = true;

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
    const nav = document.getElementById('nav-links');
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

    // Progress bar with text
    if (steps && steps.length > 0) {
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
      pText.textContent = `0/${steps.length}`;
      wrapper.appendChild(pText);

      section.appendChild(wrapper);

      // Steps
      const ul = document.createElement('ul');
      ul.className = 'steps-list';

      steps.forEach((step, idx) => {
        const stepId = getStepId(sectionId, idx);
        const isChecked = !!checks[stepId];

        const li = document.createElement('li');
        li.className = 'step-item' + (isChecked ? ' checked' : '');

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
        lbl.textContent = step;

        li.appendChild(checkbox);
        li.appendChild(lbl);
        ul.appendChild(li);
      });

      section.appendChild(ul);
    }

    container.appendChild(section);

    // Nav link
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
      closeMobileSidebar();
    });
    nav.appendChild(navLink);
  }

  function getProgressData(sectionId) {
    const section = sectionId === 'general' ? DATA.general : DATA.acts.find(a => `act${a.id}` === sectionId);
    if (!section || !section.steps || section.steps.length === 0) return null;

    const total = section.steps.length;
    let checked = 0;
    section.steps.forEach((_, idx) => {
      if (checks[getStepId(sectionId, idx)]) checked++;
    });

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

    // Update nav ring & pct
    const navLink = document.querySelector(`.sidebar nav a[data-section="${sectionId}"]`);
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
    // General has no steps, but call anyway in case data changes
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
    document.querySelectorAll('.step-item').forEach(li => {
      li.classList.remove('checked');
      li.querySelector('input').checked = false;
    });
    updateAllProgress();
    // Notify gems-app if it exists
    if (window.gemsApp && window.gemsApp.onExternalReset) {
      window.gemsApp.onExternalReset();
    }
  }

  // New league
  function newLeague() {
    if (!confirm('새 리그를 시작하시겠습니까? 모든 진행 상태가 초기화됩니다.')) return;
    checks = {};
    saveChecks();
    localStorage.removeItem(GEM_STORAGE_KEY);
    localStorage.removeItem(GEM_CLASS_KEY);
    document.querySelectorAll('.step-item').forEach(li => {
      li.classList.remove('checked');
      li.querySelector('input').checked = false;
    });
    updateAllProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Notify gems-app if it exists
    if (window.gemsApp && window.gemsApp.onExternalReset) {
      window.gemsApp.onExternalReset();
    }
  }

  // Mobile sidebar
  function closeMobileSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.mobile-overlay').classList.remove('show');
  }

  // Scroll spy
  function setupScrollSpy() {
    const sections = document.querySelectorAll('.act-section');
    const navLinks = document.querySelectorAll('.sidebar nav a');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => link.classList.remove('active'));
          const activeLink = document.querySelector(`.sidebar nav a[href="#${entry.target.id}"]`);
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(section => observer.observe(section));
  }

  // Init
  function init() {
    render();
    setupScrollSpy();

    document.getElementById('btn-tips').addEventListener('click', toggleAllTips);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-new-league').addEventListener('click', newLeague);

    // Mobile
    document.getElementById('mobile-toggle').addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
      document.querySelector('.mobile-overlay').classList.toggle('show');
    });
    document.querySelector('.mobile-overlay').addEventListener('click', closeMobileSidebar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
