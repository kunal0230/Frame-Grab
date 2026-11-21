/**
 * Frame Grab — Media Library Manager (Folder Explorer)
 * Imports, organizes, and switches between all photos and videos in a selected directory.
 */

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
        parsedItems.push({
          id: 'item_' + Date.now() + '_' + i,
          file,
          name: file.name,
          relativePath: file.webkitRelativePath || file.name,
          type,
          sizeBytes: file.size,
          url,
          loadedMetadata: null,
        });
      }
    }

    if (parsedItems.length === 0) {
      this.showToast('No supported videos or photos found in this folder.', 'warning');
      return;
    }

    // Sort alphabetically by name
    parsedItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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

  applyFilterAndRender() {
    this.filteredItems = this.items.filter((item) => {
      // Filter by type
      if (this.currentFilter === 'videos' && item.type !== 'video') return false;
      if (this.currentFilter === 'photos' && item.type !== 'photo') return false;

      // Filter by search query
      if (this.searchQuery && !item.name.toLowerCase().includes(this.searchQuery)) {
        return false;
      }
      return true;
    });

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

