/**
 * Frame Grab — Media Library Manager (Folder Explorer)
 * Imports, organizes, and switches between all photos and videos in a selected directory.
 */

/**
 * Fallback to parse date & time from camera or screenshot filenames
 * e.g. 2026-11-16-10.24.681.mp4, VID_20261116_102430.mp4, Screenshot 2026-11-16 at 10.24.30.png
 */
function parseDateFromFilename(name) {
  if (!name) return null;
  // Pattern 1: YYYY-MM-DD or YYYY.MM.DD or YYYY_MM_DD followed optionally by HH.MM.SS / HH-MM-SS / HH:MM:SS
  const m1 = name.match(/(\d{4})[-_. ](\d{2})[-_. ](\d{2})(?:[-_. T](\d{2})[-_.:](\d{2})(?:[-_.:](\d{2}))?)?/);
  if (m1) {
    const y = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10) - 1;
    const d = parseInt(m1[3], 10);
    const h = m1[4] ? parseInt(m1[4], 10) : 0;
    const mi = m1[5] ? parseInt(m1[5], 10) : 0;
    const s = m1[6] ? parseInt(m1[6], 10) : 0;
    if (y >= 1990 && y <= 2099 && mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      const parsed = new Date(y, mo, d, h, mi, s);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
  }
  // Pattern 2: YYYYMMDD[_T]HHMMSS (standard mobile camera format)
  const m2 = name.match(/(\d{4})(\d{2})(\d{2})[-_T](\d{2})(\d{2})(\d{2})/);
  if (m2) {
    const y = parseInt(m2[1], 10);
    const mo = parseInt(m2[2], 10) - 1;
    const d = parseInt(m2[3], 10);
    const h = parseInt(m2[4], 10);
    const mi = parseInt(m2[5], 10);
    const s = parseInt(m2[6], 10);
    if (y >= 1990 && y <= 2099 && mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      const parsed = new Date(y, mo, d, h, mi, s);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
  }
  return null;
}

/**
 * Format timestamp into concise, readable date and time
 * e.g. "Nov 16, 10:24 AM" or "Nov 16, 2025, 10:24 AM"
 */
function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();

  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
}

export class MediaLibraryManager {
  constructor({
    drawerElement,
    listContainer,
    titleElement,
    countBadges,
    mediaNavIndex,
    toggleButton,
    onSelectVideo,
    onSelectPhoto,
    showToast,
  }) {
    this.drawer = drawerElement;
    this.listContainer = listContainer;
    this.titleElement = titleElement;
    this.countBadges = countBadges || [];
    this.navIndexElement = mediaNavIndex;
    this.toggleButton = toggleButton;
    this.onSelectVideo = onSelectVideo;
    this.onSelectPhoto = onSelectPhoto;
    this.showToast = showToast || console.log;

    this.items = []; // All parsed media items
    this.filteredItems = [];
    this.folderName = '';
    this.selectedIndex = -1;
    this.currentFilter = 'all'; // 'all' | 'videos' | 'photos'
    this.searchQuery = '';
    this.currentSort = 'date-desc'; // 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'

    this.initDOM();
  }

  initDOM() {
    if (!this.drawer) return;

    // Filter Pills
    const filterPills = this.drawer.querySelectorAll('.filter-pill');
    filterPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        filterPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilter = pill.dataset.filter || 'all';
        this.applyFilterAndRender();
      });
    });

    // Search input
    const searchInput = this.drawer.querySelector('#mediaSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.applyFilterAndRender();
      });
    }

    // Sort selector
    const sortSelect = this.drawer.querySelector('#mediaSortSelect');
    if (sortSelect) {
      this.sortSelect = sortSelect;
      sortSelect.value = this.currentSort;
      sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.applyFilterAndRender();
      });
    }

    // Prev / Next Media Navigation
    const btnPrev = this.drawer.querySelector('#btnPrevMedia');
    const btnNext = this.drawer.querySelector('#btnNextMedia');
    if (btnPrev) btnPrev.addEventListener('click', () => this.selectPrev());
    if (btnNext) btnNext.addEventListener('click', () => this.selectNext());

    // Close button
    const btnClose = this.drawer.querySelector('#btnCloseMediaDrawer');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggleDrawer(false));
    }
  }

  /**
   * Loads a list of File objects into the Media Library
   */
  async loadFiles(fileList, folderName = '') {
    if (!fileList || fileList.length === 0) return;

    const videoRegex = /\.(mp4|webm|mov|mkv|ogg|m4v|avi|ts)$/i;
    const photoRegex = /\.(png|jpe?g|webp|avif|bmp|tiff?|heic)$/i;

    const parsedItems = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isVideo = file.type.startsWith('video/') || file.name.match(videoRegex);
      const isPhoto = file.type.startsWith('image/') || file.name.match(photoRegex);

      if (isVideo || isPhoto) {
        const type = isVideo ? 'video' : 'photo';
        const url = URL.createObjectURL(file);
        const lastModified = file.lastModified || parseDateFromFilename(file.name) || Date.now();
        parsedItems.push({
          id: 'item_' + Date.now() + '_' + i,
          file,
          name: file.name,
          relativePath: file.webkitRelativePath || file.name,
          type,
          sizeBytes: file.size,
          lastModified,
          formattedDate: formatDateTime(lastModified),
          url,
          loadedMetadata: null,
        });
      }
    }

    if (parsedItems.length === 0) {
      this.showToast('No supported videos or photos found in this folder.', 'warning');
      return;
    }

    // Clean up old URLs
    this.items.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });

    this.items = parsedItems;
    this.folderName = folderName || (fileList[0]?.webkitRelativePath ? fileList[0].webkitRelativePath.split('/')[0] : 'Media Folder');
    this.selectedIndex = 0;

    // Update Drawer Header & Count Badges
    if (this.titleElement) {
      this.titleElement.textContent = this.folderName;
      this.titleElement.title = this.folderName;
    }

    this.updateCounts();
    this.applyFilterAndRender();
    this.toggleDrawer(true);
    if (this.toggleButton) {
      this.toggleButton.style.display = 'inline-flex';
      this.toggleButton.classList.add('active');
    }

    // Automatically select and load the first item
    if (this.filteredItems.length > 0) {
      this.selectItem(0);
    }

    const videoCount = this.items.filter((m) => m.type === 'video').length;
    const photoCount = this.items.filter((m) => m.type === 'photo').length;
    this.showToast(`Imported ${this.items.length} files (${videoCount} videos, ${photoCount} photos)`);
  }

  updateCounts() {
    const total = this.items.length;
    const videoCount = this.items.filter((m) => m.type === 'video').length;
    const photoCount = this.items.filter((m) => m.type === 'photo').length;

    this.countBadges.forEach((b) => {
      if (b) b.textContent = total;
    });

    const countAll = this.drawer.querySelector('#countAll');
    const countVideos = this.drawer.querySelector('#countVideos');
    const countPhotos = this.drawer.querySelector('#countPhotos');

    if (countAll) countAll.textContent = total;
    if (countVideos) countVideos.textContent = videoCount;
    if (countPhotos) countPhotos.textContent = photoCount;
  }

  sortItems(items) {
    const list = [...items];
    switch (this.currentSort) {
      case 'date-desc':
        return list.sort((a, b) => b.lastModified - a.lastModified);
      case 'date-asc':
        return list.sort((a, b) => a.lastModified - b.lastModified);
      case 'name-asc':
        return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      case 'name-desc':
        return list.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
      case 'size-desc':
        return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
      case 'size-asc':
        return list.sort((a, b) => a.sizeBytes - b.sizeBytes);
      default:
        return list;
    }
  }

  applyFilterAndRender() {
    const activeItem = this.filteredItems[this.selectedIndex] || null;

    const filtered = this.items.filter((item) => {
      // Filter by type
      if (this.currentFilter === 'videos' && item.type !== 'video') return false;
      if (this.currentFilter === 'photos' && item.type !== 'photo') return false;

      // Filter by search query
      if (this.searchQuery && !item.name.toLowerCase().includes(this.searchQuery)) {
        return false;
      }
      return true;
    });

    this.filteredItems = this.sortItems(filtered);

    // Maintain selection on the active item if it still exists
    if (activeItem) {
      const newIdx = this.filteredItems.findIndex((it) => it.id === activeItem.id);
      this.selectedIndex = newIdx !== -1 ? newIdx : (this.filteredItems.length > 0 ? 0 : -1);
    } else {
      this.selectedIndex = this.filteredItems.length > 0 ? 0 : -1;
    }

    this.renderList();
    this.updateNavIndex();
  }

  renderList() {
    if (!this.listContainer) return;

    if (this.filteredItems.length === 0) {
      this.listContainer.innerHTML = `
        <div class="media-empty">
          <p class="empty-title">No matching media</p>
          <p class="empty-hint">Try clearing your search or filter</p>
        </div>
      `;
      return;
    }

    this.listContainer.innerHTML = '';
    this.filteredItems.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `media-item-card ${idx === this.selectedIndex ? 'active' : ''}`;
      card.dataset.index = idx;

      const sizeMb = (item.sizeBytes / (1024 * 1024)).toFixed(1);
      const isVideo = item.type === 'video';
      const fullDateStr = new Date(item.lastModified).toLocaleString();

      card.innerHTML = `
        <div class="media-item-icon ${item.type}">
          ${
            isVideo
              ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`
              : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
          }
        </div>
        <div class="media-item-info">
          <span class="media-item-name" title="${item.name}">${item.name}</span>
          <div class="media-item-meta">
            <span class="media-tag ${item.type}">${item.type.toUpperCase()}</span>
            <span class="media-size">${sizeMb} MB</span>
            <span class="media-meta-dot">•</span>
            <span class="media-date" title="${fullDateStr}">${item.formattedDate}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectItem(idx);
      });

      this.listContainer.appendChild(card);
    });
  }

  selectItem(index) {
    if (index < 0 || index >= this.filteredItems.length) return;
    this.selectedIndex = index;

    // Highlight card
    const cards = this.listContainer.querySelectorAll('.media-item-card');
    cards.forEach((c, i) => {
      c.classList.toggle('active', i === index);
    });

    const selectedItem = this.filteredItems[index];
    this.updateNavIndex();

    // Trigger loader callback
    if (selectedItem.type === 'video') {
      if (this.onSelectVideo) {
        this.onSelectVideo(selectedItem.file, selectedItem.name);
      }
    } else {
      if (this.onSelectPhoto) {
        this.onSelectPhoto(selectedItem.file, selectedItem.name);
      }
    }
  }

  selectNext() {
    if (this.filteredItems.length === 0) return;
    const nextIdx = (this.selectedIndex + 1) % this.filteredItems.length;
    this.selectItem(nextIdx);
    this.scrollCardIntoView(nextIdx);
  }

  selectPrev() {
    if (this.filteredItems.length === 0) return;
    const prevIdx = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    this.selectItem(prevIdx);
    this.scrollCardIntoView(prevIdx);
  }

  scrollCardIntoView(index) {
    const card = this.listContainer.querySelector(`.media-item-card[data-index="${index}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  updateNavIndex() {
    if (this.navIndexElement) {
      if (this.filteredItems.length === 0) {
        this.navIndexElement.textContent = '0 / 0';
      } else {
        this.navIndexElement.textContent = `${this.selectedIndex + 1} / ${this.filteredItems.length}`;
      }
    }
  }

  toggleDrawer(show) {
    if (!this.drawer) return;
    const isCurrentlyCollapsed = this.drawer.classList.contains('collapsed');
    const targetCollapsed = typeof show === 'boolean' ? !show : !isCurrentlyCollapsed;

    if (targetCollapsed) {
      this.drawer.classList.add('collapsed');
    } else {
      this.drawer.classList.remove('collapsed');
    }

    if (this.toggleButton) {
      this.toggleButton.classList.toggle('active', !targetCollapsed);
    }
  }
}

