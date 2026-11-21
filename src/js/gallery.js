/**
 * Frame Grab — Gallery Manager
 * Handles captured frames state, UI rendering, thumbnail caching, batch ZIP packaging, and fullscreen inspection.
 */

import JSZip from 'jszip';

export class GalleryManager {
  constructor({ listContainer, countBadges, emptyState, zipButton, clearButton, inspectModal, onEnhance, showToast }) {
    this.container = listContainer;
    this.countBadges = countBadges || [];
    this.emptyState = emptyState;
    this.zipButton = zipButton;
    this.clearButton = clearButton;
    this.inspectModal = inspectModal;
    this.onEnhance = onEnhance;
    this.showToast = showToast || console.log;

    this.frames = [];
    this.currentInspectFrame = null;

    this.initInspectModal();
  }

  addFrame(frameData) {
    this.frames.unshift(frameData);
    this.updateUI();
  }

  removeFrame(id) {
    const idx = this.frames.findIndex((f) => f.id === id);
    if (idx !== -1) {
      URL.revokeObjectURL(this.frames[idx].url);
      this.frames.splice(idx, 1);
      this.updateUI();
    }
  }

  clearAll() {
    if (this.frames.length === 0) return;
    if (confirm(`Remove all ${this.frames.length} captured frames from the gallery?`)) {
      this.frames.forEach((f) => URL.revokeObjectURL(f.url));
      this.frames = [];
      this.updateUI();
    }
  }

  updateUI() {
    const count = this.frames.length;

    // Update count badges
    this.countBadges.forEach((badge) => {
      if (badge) badge.textContent = count;
    });

    // Update buttons disabled state
    if (this.zipButton) this.zipButton.disabled = count === 0;
    if (this.clearButton) this.clearButton.disabled = count === 0;

    // Show/hide empty state
    if (count === 0) {
      if (this.emptyState) this.emptyState.style.display = 'flex';
      // Clear cards
      const cards = this.container.querySelectorAll('.gallery-card');
      cards.forEach((c) => c.remove());
      return;
    }

    if (this.emptyState) this.emptyState.style.display = 'none';

    // Render cards
    // Remove existing cards and re-render
    const existingCards = this.container.querySelectorAll('.gallery-card');
    existingCards.forEach((c) => c.remove());

    this.frames.forEach((frame) => {
      const card = this.createCardElement(frame);
      this.container.appendChild(card);
    });
  }

  createCardElement(frame) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.id = frame.id;

    const sizeFormatted = (frame.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';

    const badgeHtml = frame.isEnhanced
      ? `<div class="card-overlay-badge card-enhanced-badge">✨ ENHANCED</div>`
      : `<div class="card-overlay-badge">#${frame.frameNumber}</div>`;

    card.innerHTML = `
      <div class="card-preview-wrap">
        <img class="card-thumb" src="${frame.url}" alt="Frame ${frame.frameNumber}" loading="lazy" />
        ${badgeHtml}
        <div class="card-hover-actions">
          <button class="card-btn-action btn-enhance" title="✨ SOTA Portrait Enhancement Studio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          </button>
          <button class="card-btn-action btn-inspect" title="Inspect Fullscreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button class="card-btn-action btn-copy" title="Copy to Clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="card-btn-action btn-download" title="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="card-btn-action btn-delete text-danger" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="card-meta">
        <span class="card-timecode">${frame.timecode}</span>
        <span class="card-resolution">${frame.width}×${frame.height} • ${sizeFormatted}</span>
      </div>
    `;

    // Bind card actions
    const previewWrap = card.querySelector('.card-preview-wrap');
    previewWrap.addEventListener('click', (e) => {
      if (!e.target.closest('.card-btn-action')) {
        this.openInspect(frame);
      }
    });

    const btnEnhance = card.querySelector('.btn-enhance');
    if (btnEnhance) {
      btnEnhance.addEventListener('click', () => {
        if (this.onEnhance) this.onEnhance(frame);
      });
    }

    card.querySelector('.btn-inspect').addEventListener('click', () => this.openInspect(frame));

    card.querySelector('.btn-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': frame.blob,
          }),
        ]);
        this.showToast('Copied frame to clipboard!');
      } catch (err) {
        this.showToast('Could not copy image: ' + err.message);
      }
    });

    card.querySelector('.btn-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = frame.url;
      a.download = frame.filename;
      a.click();
    });

    card.querySelector('.btn-delete').addEventListener('click', () => {
      this.removeFrame(frame.id);
    });

    return card;
  }

  async downloadAllAsZip(onProgress) {
    if (this.frames.length === 0) return;

    const zip = new JSZip();
    this.frames.forEach((f) => {
      zip.file(f.filename, f.blob);
    });

    if (onProgress) onProgress('Creating ZIP archive...');

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `frame_grab_gallery_${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // Inspect Modal
  initInspectModal() {
    if (!this.inspectModal) return;

    const btnClose = this.inspectModal.querySelector('#btnCloseInspect');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeInspect());
    }

    const btnEnhance = this.inspectModal.querySelector('#btnInspectEnhance');
    if (btnEnhance) {
      btnEnhance.addEventListener('click', () => {
        if (this.currentInspectFrame && this.onEnhance) {
          const f = this.currentInspectFrame;
          this.closeInspect();
          this.onEnhance(f);
        }
      });
    }

    const btnDownload = this.inspectModal.querySelector('#btnInspectDownload');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        if (this.currentInspectFrame) {
          const a = document.createElement('a');
          a.href = this.currentInspectFrame.url;
          a.download = this.currentInspectFrame.filename;
          a.click();
        }
      });
    }

    const btnCopy = this.inspectModal.querySelector('#btnInspectCopy');
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        if (this.currentInspectFrame) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': this.currentInspectFrame.blob }),
            ]);
            this.showToast('Copied frame to clipboard!');
          } catch (e) {
            this.showToast('Could not copy: ' + e.message);
          }
        }
      });
    }

    const btnPrev = this.inspectModal.querySelector('#btnInspectPrev');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => this.navigateInspect(1));
    }

    const btnNext = this.inspectModal.querySelector('#btnInspectNext');
    if (btnNext) {
      btnNext.addEventListener('click', () => this.navigateInspect(-1));
    }

    // Keyboard navigation in Inspect modal
    window.addEventListener('keydown', (e) => {
      if (this.inspectModal && this.inspectModal.style.display !== 'none' && this.currentInspectFrame) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.navigateInspect(1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.navigateInspect(-1);
        }
      }
    });

    // Close on clicking backdrop outside card
    this.inspectModal.addEventListener('click', (e) => {
      if (e.target === this.inspectModal) {
        this.closeInspect();
      }
    });
  }

  navigateInspect(delta) {
    if (!this.currentInspectFrame || this.frames.length <= 1) return;
    const curIdx = this.frames.findIndex((f) => f.id === this.currentInspectFrame.id);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + delta + this.frames.length) % this.frames.length;
    this.openInspect(this.frames[nextIdx]);
  }

  openInspect(frame) {
    this.currentInspectFrame = frame;
    const img = this.inspectModal.querySelector('#inspectImage');
    const title = this.inspectModal.querySelector('#inspectTitle');
    const meta = this.inspectModal.querySelector('#inspectMeta');

    img.src = frame.url;
    title.textContent = `Frame #${frame.frameNumber} (${frame.timecode})`;
    meta.textContent = `${frame.width} × ${frame.height} • ${frame.format} • ${(frame.sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

    this.inspectModal.style.display = 'flex';
  }

  closeInspect() {
    this.inspectModal.style.display = 'none';
    this.currentInspectFrame = null;
  }

  showToast(msg) {
    const toast = document.getElementById('stageToast');
    if (toast) {
      toast.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${msg}`;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
  }
}
