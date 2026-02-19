(() => {
  const STORAGE_KEY = 'poe-leveling-kr-gems';
  const CLASS_KEY = 'poe-leveling-kr-gem-class';

  // State
  let selectedGems = loadGems();
  let selectedClass = localStorage.getItem(CLASS_KEY) || 'witch';
  let activeTab = 'quest';
  let searchQuery = '';

  function loadGems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveGems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedGems));
  }

  function saveClass() {
    localStorage.setItem(CLASS_KEY, selectedClass);
  }

  // Check if GEM_DATA is available
  function hasGemData() {
    return typeof GEM_DATA !== 'undefined' && GEM_DATA && GEM_DATA.gems;
  }

  function getGemById(gemId) {
    if (!hasGemData()) return null;
    return GEM_DATA.gems.find(g => g.id === gemId) || null;
  }

  function matchesClass(rewardClasses) {
    if (!rewardClasses || rewardClasses.length === 0) return true;
    return rewardClasses.includes(selectedClass);
  }

  function matchesSearch(gem) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return gem.name.toLowerCase().includes(q) || gem.id.toLowerCase().includes(q);
  }

  // Quest key for single-select enforcement
  function questKey(act, questName) {
    return `${act}-${questName}`;
  }

  // Get count of selected gems
  function getSelectedCount() {
    return Object.keys(selectedGems).filter(k => selectedGems[k]).length;
  }

  // Rendering
  function renderBody() {
    const body = document.getElementById('gem-modal-body');
    if (!body || !hasGemData()) return;

    body.innerHTML = '';

    const rewards = activeTab === 'quest' ? GEM_DATA.questRewards : GEM_DATA.vendorRewards;
    if (!rewards) return;

    rewards.forEach(group => {
      const filteredRewards = group.rewards.filter(r => {
        const gem = getGemById(r.gemId);
        if (!gem) return false;
        if (!matchesClass(r.classes)) return false;
        if (!matchesSearch(gem)) return false;
        return true;
      });

      if (filteredRewards.length === 0) return;

      const qKey = questKey(group.act, group.questName);
      const selectedInGroup = filteredRewards.filter(r => selectedGems[r.gemId]).length;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'gem-quest-group';

      // Header
      const header = document.createElement('div');
      header.className = 'gem-quest-header';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'gem-quest-title';
      const npcStr = group.npc ? ` (${group.npc})` : '';
      titleSpan.textContent = `${group.act}장 — ${group.questName}${npcStr}`;
      header.appendChild(titleSpan);

      const rightSide = document.createElement('span');
      rightSide.style.display = 'flex';
      rightSide.style.alignItems = 'center';
      rightSide.style.gap = '8px';

      const countSpan = document.createElement('span');
      countSpan.className = 'gem-quest-count';
      if (activeTab === 'quest') {
        countSpan.textContent = `${selectedInGroup}/1`;
      } else {
        countSpan.textContent = `${selectedInGroup}개 선택`;
      }
      rightSide.appendChild(countSpan);

      if (selectedInGroup > 0) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'gem-quest-reset';
        resetBtn.textContent = '초기화';
        resetBtn.addEventListener('click', () => {
          filteredRewards.forEach(r => {
            delete selectedGems[r.gemId];
          });
          saveGems();
          renderBody();
          updateFooterCount();
        });
        rightSide.appendChild(resetBtn);
      }

      header.appendChild(rightSide);
      groupDiv.appendChild(header);

      // Grid
      const grid = document.createElement('div');
      grid.className = 'gem-grid';

      filteredRewards.forEach(reward => {
        const gem = getGemById(reward.gemId);
        if (!gem) return;

        const card = document.createElement('div');
        card.className = 'gem-card';
        card.dataset.selected = !!selectedGems[gem.id];
        card.dataset.gemId = gem.id;

        const dot = document.createElement('span');
        dot.className = `gem-dot ${gem.color}`;
        card.appendChild(dot);

        const name = document.createElement('span');
        name.className = 'gem-name';
        name.textContent = gem.name;
        card.appendChild(name);

        if (gem.type === 'support') {
          const badge = document.createElement('span');
          badge.className = 'gem-type-badge';
          badge.textContent = '보조';
          card.appendChild(badge);
        }

        card.addEventListener('click', () => {
          onGemClick(gem.id, qKey, filteredRewards);
        });

        grid.appendChild(card);
      });

      groupDiv.appendChild(grid);
      body.appendChild(groupDiv);
    });

    if (body.children.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text-dim);padding:40px 0;font-size:14px;';
      empty.textContent = searchQuery ? '검색 결과가 없습니다.' : '해당하는 젬이 없습니다.';
      body.appendChild(empty);
    }
  }

  function onGemClick(gemId, qKey, groupRewards) {
    if (activeTab === 'quest') {
      // Quest tab: max 1 per group
      if (selectedGems[gemId]) {
        // Deselect
        delete selectedGems[gemId];
      } else {
        // Deselect others in same group, select this one
        groupRewards.forEach(r => {
          delete selectedGems[r.gemId];
        });
        selectedGems[gemId] = true;
      }
    } else {
      // Vendor tab: toggle freely
      if (selectedGems[gemId]) {
        delete selectedGems[gemId];
      } else {
        selectedGems[gemId] = true;
      }
    }

    saveGems();
    renderBody();
    updateFooterCount();
  }

  function updateFooterCount() {
    const el = document.getElementById('gem-selected-count');
    if (el) {
      el.textContent = `선택: ${getSelectedCount()}개`;
    }
  }

  // Modal control
  function openModal() {
    const overlay = document.getElementById('gem-modal-overlay');
    if (overlay) {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      renderBody();
      updateFooterCount();
    }
  }

  function closeModal() {
    const overlay = document.getElementById('gem-modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Init
  function init() {
    if (!hasGemData()) return;

    // Populate class dropdown
    const classSelect = document.getElementById('gem-class-select');
    if (classSelect) {
      GEM_DATA.classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name;
        classSelect.appendChild(opt);
      });
      classSelect.value = selectedClass;

      classSelect.addEventListener('change', () => {
        selectedClass = classSelect.value;
        saveClass();
        renderBody();
      });
    }

    // Tab switching
    document.querySelectorAll('.gem-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.gem-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        renderBody();
      });
    });

    // Search
    const searchInput = document.getElementById('gem-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim();
        renderBody();
      });
    }

    // Open/close
    const gemBtn = document.getElementById('btn-gems');
    if (gemBtn) {
      gemBtn.addEventListener('click', openModal);
    }

    const closeBtn = document.getElementById('gem-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    const overlay = document.getElementById('gem-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    // Reset all gems
    const resetAll = document.getElementById('gem-reset-all');
    if (resetAll) {
      resetAll.addEventListener('click', () => {
        selectedGems = {};
        saveGems();
        renderBody();
        updateFooterCount();
      });
    }

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // Expose for external reset (from app.js new league / clear all)
  window.gemsApp = {
    onExternalReset() {
      selectedGems = {};
      selectedClass = 'witch';
      const classSelect = document.getElementById('gem-class-select');
      if (classSelect) classSelect.value = selectedClass;
      renderBody();
      updateFooterCount();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
