(() => {
  const STORAGE_KEY = 'poe-leveling-kr-checks';

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
      tipsHeader.textContent = '팁';
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

    // Progress bar
    if (steps && steps.length > 0) {
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.id = `progress-${sectionId}`;
      progressBar.appendChild(fill);
      section.appendChild(progressBar);

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

        const label = document.createElement('label');
        label.htmlFor = stepId;
        label.textContent = step;

        li.appendChild(checkbox);
        li.appendChild(label);
        ul.appendChild(li);
      });

      section.appendChild(ul);
    }

    container.appendChild(section);

    // Nav link
    const navLink = document.createElement('a');
    navLink.href = `#${sectionId}`;
    const displayName = sectionId === 'general' ? '일반' : sectionId.replace('act', '') + '장';
    navLink.textContent = displayName;
    navLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
      closeMobileSidebar();
    });
    nav.appendChild(navLink);
  }

  function updateProgress(sectionId) {
    const section = sectionId === 'general' ? DATA.general : DATA.acts.find(a => `act${a.id}` === sectionId);
    if (!section || !section.steps || section.steps.length === 0) return;

    const total = section.steps.length;
    let checked = 0;
    section.steps.forEach((_, idx) => {
      if (checks[getStepId(sectionId, idx)]) checked++;
    });

    const fill = document.getElementById(`progress-${sectionId}`);
    if (fill) {
      fill.style.width = `${(checked / total) * 100}%`;
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
    document.querySelectorAll('.step-item').forEach(li => {
      li.classList.remove('checked');
      li.querySelector('input').checked = false;
    });
    updateAllProgress();
  }

  // New league
  function newLeague() {
    if (!confirm('새 리그를 시작하시겠습니까? 모든 진행 상태가 초기화됩니다.')) return;
    checks = {};
    saveChecks();
    document.querySelectorAll('.step-item').forEach(li => {
      li.classList.remove('checked');
      li.querySelector('input').checked = false;
    });
    updateAllProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
