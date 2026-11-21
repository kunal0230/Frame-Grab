/**
 * Frame Grab — Crop Controller
 * High-precision interactive visual crop overlay with 8 resize handles,
 * live aspect ratio presets (Free, 1:1, 9:16, 16:9, 4:5, 4:3), and pixel dimension readout.
 */

export class CropController {
  constructor({
    viewportElement,
    overlayElement,
    controlBarElement,
    targetGetter,
    engine,
    onCropChange,
    showToast,
  }) {
    this.viewport = viewportElement;
    this.overlay = overlayElement;
    this.controlBar = controlBarElement;
    this.targetGetter = targetGetter;
    this.engine = engine;
    this.onCropChange = onCropChange;
    this.showToast = showToast || console.log;

    this.isActive = false;
    this.activeRatio = 'free'; // 'free', '1:1', '9:16', '16:9', '4:5', '4:3'
    this.cropBoxRect = { left: 0, top: 0, width: 0, height: 0 };
    this.mediaBounds = { left: 0, top: 0, width: 0, height: 0 };

    this.isDragging = false;
    this.dragMode = null; // 'move' or handle name: 'nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'
    this.dragStart = { x: 0, y: 0 };
    this.boxStart = { left: 0, top: 0, width: 0, height: 0 };

    this.initDOM();
  }

  initDOM() {
    if (!this.overlay) return;

    this.cropBox = this.overlay.querySelector('#cropBox');
    this.dimsBadge = this.overlay.querySelector('#cropDimsBadge');
    this.scrimTop = this.overlay.querySelector('#cropScrimTop');
    this.scrimBottom = this.overlay.querySelector('#cropScrimBottom');
    this.scrimLeft = this.overlay.querySelector('#cropScrimLeft');
    this.scrimRight = this.overlay.querySelector('#cropScrimRight');

    // Ratio buttons
    if (this.controlBar) {
      const ratioButtons = this.controlBar.querySelectorAll('.btn-ratio');
      ratioButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          ratioButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.setAspectRatio(btn.dataset.ratio || 'free');
        });
      });

      const btnApply = this.controlBar.querySelector('#btnApplyCrop');
      if (btnApply) {
        btnApply.addEventListener('click', () => this.applyCrop());
      }

      const btnClear = this.controlBar.querySelector('#btnClearCrop');
      if (btnClear) {
        btnClear.addEventListener('click', () => this.clearCrop());
      }

      const btnClose = this.controlBar.querySelector('#btnCloseCrop');
      if (btnClose) {
        btnClose.addEventListener('click', () => this.deactivate());
      }
    }

    // Drag move on cropBox body
    this.cropBox.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('crop-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      this.startDrag('move', e.clientX, e.clientY);
    });

    // Resize handles
    const handles = this.cropBox.querySelectorAll('.crop-handle');
    handles.forEach((h) => {
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag(h.dataset.handle, e.clientX, e.clientY);
      });
    });

    // Global mousemove & mouseup for drag
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.handleDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragMode = null;
      }
    });

    // Resize listener to re-align crop box when window resizes
    window.addEventListener('resize', () => {
      if (this.isActive) {
        this.refreshMediaBounds();
        this.repositionBoxFromNormalized();
      }
    });
  }

  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    this.isActive = true;
    this.overlay.style.display = 'block';
    if (this.controlBar) this.controlBar.style.display = 'flex';

    this.refreshMediaBounds();

    if (this.engine.crop) {
      this.repositionBoxFromNormalized(this.engine.crop);
    } else {
      // Default to 85% centered
      const w = this.mediaBounds.width * 0.85;
      const h = this.mediaBounds.height * 0.85;
      const l = this.mediaBounds.left + (this.mediaBounds.width - w) / 2;
      const t = this.mediaBounds.top + (this.mediaBounds.height - h) / 2;
      this.setCropBoxRect({ left: l, top: t, width: w, height: h });
    }

    this.updateUI();
  }

  deactivate() {
    this.isActive = false;
    this.overlay.style.display = 'none';
    if (this.controlBar) this.controlBar.style.display = 'none';
  }

  refreshMediaBounds() {
    const target = this.targetGetter();
    if (!target) return;

    const tRect = target.getBoundingClientRect();
    const vRect = this.viewport.getBoundingClientRect();

    this.mediaBounds = {
      left: Math.max(0, tRect.left - vRect.left),
      top: Math.max(0, tRect.top - vRect.top),
      width: Math.min(vRect.width, tRect.width),
      height: Math.min(vRect.height, tRect.height),
    };
  }

  repositionBoxFromNormalized(crop = this.engine.crop) {
    if (!crop) return;
    const l = this.mediaBounds.left + crop.x * this.mediaBounds.width;
    const t = this.mediaBounds.top + crop.y * this.mediaBounds.height;
    const w = crop.width * this.mediaBounds.width;
    const h = crop.height * this.mediaBounds.height;
    this.setCropBoxRect({ left: l, top: t, width: w, height: h });
  }

  setCropBoxRect(rect) {
    this.cropBoxRect = {
      left: Math.max(this.mediaBounds.left, Math.min(this.mediaBounds.left + this.mediaBounds.width - rect.width, rect.left)),
      top: Math.max(this.mediaBounds.top, Math.min(this.mediaBounds.top + this.mediaBounds.height - rect.height, rect.top)),
      width: Math.max(40, Math.min(this.mediaBounds.width, rect.width)),
      height: Math.max(40, Math.min(this.mediaBounds.height, rect.height)),
    };
    this.updateUI();
  }

  setAspectRatio(ratioStr) {
    this.activeRatio = ratioStr;
    if (ratioStr === 'free') {
      this.updateUI();
      return;
    }

    let targetRatio = 1;
    if (ratioStr === '1:1') targetRatio = 1;
    else if (ratioStr === '9:16') targetRatio = 9 / 16;
    else if (ratioStr === '16:9') targetRatio = 16 / 9;
    else if (ratioStr === '4:5') targetRatio = 4 / 5;
    else if (ratioStr === '4:3') targetRatio = 4 / 3;

    // Adjust crop box around its center to match targetRatio within media bounds
    const curCenter = {
      x: this.cropBoxRect.left + this.cropBoxRect.width / 2,
      y: this.cropBoxRect.top + this.cropBoxRect.height / 2,
    };

    let newW = this.cropBoxRect.width;
    let newH = newW / targetRatio;

    if (newH > this.mediaBounds.height) {
      newH = this.mediaBounds.height * 0.9;
      newW = newH * targetRatio;
    }
    if (newW > this.mediaBounds.width) {
      newW = this.mediaBounds.width * 0.9;
      newH = newW / targetRatio;
    }

    let newL = curCenter.x - newW / 2;
    let newT = curCenter.y - newH / 2;

    this.setCropBoxRect({ left: newL, top: newT, width: newW, height: newH });
  }

  startDrag(mode, clientX, clientY) {
    this.isDragging = true;
    this.dragMode = mode;
    this.dragStart = { x: clientX, y: clientY };
    this.boxStart = { ...this.cropBoxRect };
  }

  handleDrag(clientX, clientY) {
    const dx = clientX - this.dragStart.x;
    const dy = clientY - this.dragStart.y;
    const b = this.boxStart;
    const bounds = this.mediaBounds;

    if (this.dragMode === 'move') {
      const newL = Math.max(bounds.left, Math.min(bounds.left + bounds.width - b.width, b.left + dx));
      const newT = Math.max(bounds.top, Math.min(bounds.top + bounds.height - b.height, b.top + dy));
      this.cropBoxRect.left = newL;
      this.cropBoxRect.top = newT;
      this.updateUI();
      return;
    }

    let newL = b.left;
    let newT = b.top;
    let newW = b.width;
    let newH = b.height;

    // Handle horizontal adjustment
    if (this.dragMode.includes('e')) {
      newW = Math.max(40, Math.min(bounds.left + bounds.width - b.left, b.width + dx));
    } else if (this.dragMode.includes('w')) {
      const maxW = b.left + b.width - bounds.left;
      newW = Math.max(40, Math.min(maxW, b.width - dx));
      newL = b.left + (b.width - newW);
    }

    // Handle vertical adjustment
    if (this.dragMode.includes('s')) {
      newH = Math.max(40, Math.min(bounds.top + bounds.height - b.top, b.height + dy));
    } else if (this.dragMode.includes('n')) {
      const maxH = b.top + b.height - bounds.top;
      newH = Math.max(40, Math.min(maxH, b.height - dy));
      newT = b.top + (b.height - newH);
    }

    // Lock aspect ratio if not 'free'
    if (this.activeRatio !== 'free') {
      let targetRatio = 1;
      if (this.activeRatio === '1:1') targetRatio = 1;
      else if (this.activeRatio === '9:16') targetRatio = 9 / 16;
      else if (this.activeRatio === '16:9') targetRatio = 16 / 9;
      else if (this.activeRatio === '4:5') targetRatio = 4 / 5;
      else if (this.activeRatio === '4:3') targetRatio = 4 / 3;

      if (this.dragMode === 'e' || this.dragMode === 'w') {
        newH = newW / targetRatio;
        if (newT + newH > bounds.top + bounds.height) {
          newH = bounds.top + bounds.height - newT;
          newW = newH * targetRatio;
        }
      } else {
        newW = newH * targetRatio;
        if (newL + newW > bounds.left + bounds.width) {
          newW = bounds.left + bounds.width - newL;
          newH = newW / targetRatio;
        }
      }
    }

    this.cropBoxRect = {
      left: Math.max(bounds.left, Math.min(bounds.left + bounds.width - 40, newL)),
      top: Math.max(bounds.top, Math.min(bounds.top + bounds.height - 40, newT)),
      width: Math.max(40, Math.min(bounds.width, newW)),
      height: Math.max(40, Math.min(bounds.height, newH)),
    };

    this.updateUI();
  }

  getNormalizedCrop() {
    if (this.mediaBounds.width <= 0 || this.mediaBounds.height <= 0) return null;

    const normX = Math.max(0, (this.cropBoxRect.left - this.mediaBounds.left) / this.mediaBounds.width);
    const normY = Math.max(0, (this.cropBoxRect.top - this.mediaBounds.top) / this.mediaBounds.height);
    const normW = Math.min(1 - normX, this.cropBoxRect.width / this.mediaBounds.width);
    const normH = Math.min(1 - normY, this.cropBoxRect.height / this.mediaBounds.height);

    return {
      x: normX,
      y: normY,
      width: normW,
      height: normH,
      ratio: this.activeRatio,
    };
  }

  applyCrop() {
    const crop = this.getNormalizedCrop();
    if (crop) {
      this.engine.setCrop(crop);
      const dims = this.engine.getEffectiveDimensions();
      this.showToast(`Applied Crop: ${dims.width} × ${dims.height} (${this.activeRatio.toUpperCase()})`);
      if (this.onCropChange) this.onCropChange(crop);
    }
    this.deactivate();
  }

  clearCrop() {
    this.engine.clearCrop();
    this.showToast('Crop cleared: Full frame restored');
    if (this.onCropChange) this.onCropChange(null);
    this.deactivate();
  }

  updateUI() {
    if (!this.cropBox) return;

    const r = this.cropBoxRect;
    this.cropBox.style.left = `${r.left}px`;
    this.cropBox.style.top = `${r.top}px`;
    this.cropBox.style.width = `${r.width}px`;
    this.cropBox.style.height = `${r.height}px`;

    // Scrims
    if (this.scrimTop) {
      this.scrimTop.style.height = `${Math.max(0, r.top)}px`;
    }
    if (this.scrimBottom) {
      this.scrimBottom.style.top = `${r.top + r.height}px`;
    }
    if (this.scrimLeft) {
      this.scrimLeft.style.top = `${r.top}px`;
      this.scrimLeft.style.height = `${r.height}px`;
      this.scrimLeft.style.width = `${Math.max(0, r.left)}px`;
    }
    if (this.scrimRight) {
      this.scrimRight.style.top = `${r.top}px`;
      this.scrimRight.style.height = `${r.height}px`;
      this.scrimRight.style.left = `${r.left + r.width}px`;
    }

    // Dimension readout in native pixels
    if (this.dimsBadge) {
      const rotDims = this.engine.getRotatedDimensions();
      const normW = this.mediaBounds.width > 0 ? r.width / this.mediaBounds.width : 1;
      const normH = this.mediaBounds.height > 0 ? r.height / this.mediaBounds.height : 1;
      const pxW = Math.round(normW * rotDims.width);
      const pxH = Math.round(normH * rotDims.height);
      const ratioLabel = this.activeRatio === 'free' ? 'Free' : this.activeRatio;
      this.dimsBadge.textContent = `${pxW} × ${pxH} px (${ratioLabel})`;
    }
  }
}

