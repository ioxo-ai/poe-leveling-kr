(() => {
  const REWARD_STORAGE_KEY = 'poe-leveling-kr-gems-reward';
  const VENDOR_STORAGE_KEY = 'poe-leveling-kr-gems-vendor';
  const LEGACY_STORAGE_KEY = 'poe-leveling-kr-gems'; // migration from single key
  const CLASS_KEY = 'poe-leveling-kr-gem-class';
  const ENGLISH_KEY = 'poe-leveling-kr-english';

  function isEnglishOn() {
    return localStorage.getItem(ENGLISH_KEY) !== 'false';
  }

  // State: separate for quest rewards vs vendor purchases
  let selectedRewardGems = loadRewardGems();
  let selectedVendorGems = loadVendorGems();
  let selectedClass = localStorage.getItem(CLASS_KEY) || 'witch';
  let activeTab = 'quest';
  let searchQuery = '';

  function loadRewardGems() {
    try {
      const raw = localStorage.getItem(REWARD_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      // Migrate from legacy single key into reward only
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  function loadVendorGems() {
    try {
      return JSON.parse(localStorage.getItem(VENDOR_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function getSelectedGemsForTab() {
    return activeTab === 'quest' ? selectedRewardGems : selectedVendorGems;
  }

  function saveGems() {
    localStorage.setItem(REWARD_STORAGE_KEY, JSON.stringify(selectedRewardGems));
    localStorage.setItem(VENDOR_STORAGE_KEY, JSON.stringify(selectedVendorGems));
    console.log('[gems-app] saveGems: reward keys=', Object.keys(selectedRewardGems).length, 'vendor keys=', Object.keys(selectedVendorGems).length);
    window.dispatchEvent(new CustomEvent('gems-changed'));
  }

  function saveClass() {
    localStorage.setItem(CLASS_KEY, selectedClass);
    window.dispatchEvent(new CustomEvent('gems-changed'));
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

  // Get count of selected gems (reward + vendor)
  function getSelectedCount() {
    const rewardCount = Object.keys(selectedRewardGems).filter(k => selectedRewardGems[k]).length;
    const vendorCount = Object.keys(selectedVendorGems).filter(k => selectedVendorGems[k]).length;
    return rewardCount + vendorCount;
  }

  // Rendering
  function renderBody() {
    const body = document.getElementById('gem-modal-body');
    if (!body || !hasGemData()) return;

    body.innerHTML = '';

    const rewards = activeTab === 'quest' ? GEM_DATA.questRewards : GEM_DATA.vendorRewards;
    if (!rewards) return;

    rewards.forEach(group => {
      // questRewards uses per-class format {marauder: [...], ...}, vendorRewards uses [{gemId, classes}]
      const rewardsList = Array.isArray(group.rewards)
        ? group.rewards
        : (group.rewards[selectedClass] || []).map(gemId => ({ gemId, classes: [selectedClass] }));
      const filteredRewards = rewardsList.filter(r => {
        const gem = getGemById(r.gemId);
        if (!gem) return false;
        if (!matchesClass(r.classes)) return false;
        if (!matchesSearch(gem)) return false;
        return true;
      });

      if (filteredRewards.length === 0) return;

      const qKey = questKey(group.act, group.questName);
      const selected = getSelectedGemsForTab();
      const selectedInGroup = filteredRewards.filter(r => selected[r.gemId]).length;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'gem-quest-group';

      // Header
      const header = document.createElement('div');
      header.className = 'gem-quest-header';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'gem-quest-title';
      const npcStr = group.npc ? ` (${group.npc})` : '';
      const engQuest = isEnglishOn() ? getEnglishName('quest', group.questName) : '';
      const engStr = engQuest ? ` ${engQuest.toUpperCase()}` : '';
      titleSpan.textContent = `${group.act}장 — ${group.questName}${engStr}${npcStr}`;
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
          const selected = getSelectedGemsForTab();
          filteredRewards.forEach(r => {
            delete selected[r.gemId];
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
        card.dataset.selected = !!getSelectedGemsForTab()[gem.id];
        card.dataset.gemId = gem.id;

        if (gem.icon) {
          const img = document.createElement('img');
          img.className = 'gem-icon';
          img.src = `img/gems/${gem.icon}`;
          img.alt = gem.name;
          img.width = 24;
          img.height = 24;
          img.loading = 'lazy';
          img.onerror = function() {
            const dot = document.createElement('span');
            dot.className = `gem-dot ${gem.color}`;
            this.replaceWith(dot);
          };
          card.appendChild(img);
        } else {
          const dot = document.createElement('span');
          dot.className = `gem-dot ${gem.color}`;
          card.appendChild(dot);
        }

        const name = document.createElement('span');
        name.className = 'gem-name';
        name.textContent = gem.name;
        if (isEnglishOn()) {
          const eng = document.createElement('span');
          eng.className = 'eng-anno';
          eng.textContent = gemEngName(gem.id);
          name.appendChild(eng);
        }
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

        card.addEventListener('mouseenter', (e) => {
          showTooltip(gem, e);
        });
        card.addEventListener('mouseleave', () => {
          hideTooltip();
        });
        card.addEventListener('mousemove', (e) => {
          positionTooltip(e);
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
    const selected = getSelectedGemsForTab();
    if (activeTab === 'quest') {
      // Quest tab: max 1 per group
      if (selected[gemId]) {
        delete selected[gemId];
      } else {
        groupRewards.forEach(r => {
          delete selected[r.gemId];
        });
        selected[gemId] = true;
      }
    } else {
      // Vendor tab: toggle freely
      if (selected[gemId]) {
        delete selected[gemId];
      } else {
        selected[gemId] = true;
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

  // Tooltip
  const COLOR_LABELS = { str: '힘', dex: '민첩', int: '지능' };

  function showTooltip(gem, e) {
    const tooltip = document.getElementById('gem-tooltip');
    if (!tooltip) return;

    const iconEl = document.getElementById('gem-tooltip-icon');
    const nameEl = document.getElementById('gem-tooltip-name');
    const typeEl = document.getElementById('gem-tooltip-type');
    const attrEl = document.getElementById('gem-tooltip-attr');

    if (gem.icon) {
      iconEl.src = `img/gems/${gem.icon}`;
      iconEl.style.display = '';
    } else {
      iconEl.style.display = 'none';
    }

    nameEl.textContent = isEnglishOn() ? `${gem.name} ${gemEngName(gem.id).toUpperCase()}` : gem.name;
    typeEl.textContent = gem.type === 'support' ? '보조 젬' : '스킬 젬';
    attrEl.textContent = COLOR_LABELS[gem.color] || '';
    attrEl.className = `gem-tooltip-attr ${gem.color}`;

    tooltip.style.display = 'flex';
    positionTooltip(e);
  }

  function hideTooltip() {
    const tooltip = document.getElementById('gem-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  function positionTooltip(e) {
    const tooltip = document.getElementById('gem-tooltip');
    if (!tooltip || tooltip.style.display === 'none') return;

    const offset = 12;
    let x = e.clientX + offset;
    let y = e.clientY + offset;

    const rect = tooltip.getBoundingClientRect();
    const w = rect.width || 200;
    const h = rect.height || 80;

    if (x + w > window.innerWidth - 8) {
      x = e.clientX - w - offset;
    }
    if (y + h > window.innerHeight - 8) {
      y = e.clientY - h - offset;
    }

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
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
    hideTooltip();
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
        opt.textContent = isEnglishOn()
          ? `${cls.name} (${cls.id.charAt(0).toUpperCase() + cls.id.slice(1)})`
          : cls.name;
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
        selectedRewardGems = {};
        selectedVendorGems = {};
        saveGems();
        renderBody();
        updateFooterCount();
      });
    }

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Hide tooltip on scroll
    const modalBody = document.getElementById('gem-modal-body');
    if (modalBody) {
      modalBody.addEventListener('scroll', hideTooltip);
    }
  }

  // Expose for external reset (from app.js new league / clear all)
  window.gemsApp = {
    onExternalReset() {
      selectedRewardGems = {};
      selectedVendorGems = {};
      selectedClass = 'witch';
      const classSelect = document.getElementById('gem-class-select');
      if (classSelect) classSelect.value = selectedClass;
      saveGems();
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
