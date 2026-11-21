/**
 * Frame Grab — Crop Controller
 * High-precision interactive visual crop overlay with 8 resize handles,
 * live aspect ratio presets (Free, 1:1, 9:16, 16:9, 4:5, 4:3),
 * fixed-anchor resizing mathematics, pixel dimension readout,
 * and live on-stage framing preview.
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
    this.isFramingMode = false;
    this.activeRatio = 'free'; // 'free', '1:1', '9:16', '16:9', '4:5', '4:3'
    this.cropBoxRect = { left: 0, top: 0, width: 0, height: 0 };
    this.mediaBounds = { left: 0, top: 0, width: 0, height: 0 };

    this.isDragging = false;
    this.dragMode = null; // 'move' or 'nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'
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
      if (this.isFramingMode) {
        this.setFramingMode(false);
        return;
      }
      if (e.target.classList.contains('crop-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      this.startDrag('move', e.clientX, e.clientY);
    });

    // Double-click to apply crop
    this.cropBox.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.applyCrop();
    });

    // Resize handles
    const handles = this.cropBox.querySelectorAll('.crop-handle');
    handles.forEach((h) => {
      h.addEventListener('mousedown', (e) => {
        if (this.isFramingMode) return;
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

    // Keyboard shortcuts (Enter to apply, Esc to close/deactivate)
    window.addEventListener('keydown', (e) => {
      if (!this.isActive || this.isFramingMode) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyCrop();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.deactivate();
      }
    });

    // Window resize listener
    window.addEventListener('resize', () => {
      if (this.isActive) {
        this.refreshMediaBounds();
        this.repositionBoxFromNormalized();
      }
    });
  }

  toggle() {
    if (this.isActive && !this.isFramingMode) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    this.isActive = true;
    this.isFramingMode = false;
    this.overlay.style.display = 'block';
    if (this.controlBar) this.controlBar.style.display = 'flex';

    // Remove applied mode styling so handles and control bar are accessible
    this.cropBox.classList.remove('applied-mode');
    [this.scrimTop, this.scrimBottom, this.scrimLeft, this.scrimRight].forEach((s) => {
      if (s) s.classList.remove('applied-mode');
    });

    // Ensure media is in fit view so entire boundary is visible
    if (this.engine.zoomLevel !== 'fit' || this.engine.panX !== 0 || this.engine.panY !== 0) {
      this.engine.setZoom('fit');
    }

    this.refreshMediaBounds();

    if (this.engine.crop) {
      this.activeRatio = this.engine.crop.ratio || 'free';
      if (this.controlBar) {
        this.controlBar.querySelectorAll('.btn-ratio').forEach((b) => {
          b.classList.toggle('active', b.dataset.ratio === this.activeRatio);
        });
      }
      this.repositionBoxFromNormalized(this.engine.crop);
    } else {
      // Default to 85% centered box within media bounds
      const w = this.mediaBounds.width * 0.85;
      const h = this.mediaBounds.height * 0.85;
      const l = this.mediaBounds.left + (this.mediaBounds.width - w) / 2;
      const t = this.mediaBounds.top + (this.mediaBounds.height - h) / 2;
      this.setCropBoxRect({ left: l, top: t, width: w, height: h });
    }

    this.updateUI();
  }

  deactivate() {
    if (this.engine.crop) {
      // If a crop is actively saved, remain in framing mode so user sees the framed crop
      this.setFramingMode(true);
    } else {
      this.isActive = false;
      this.isFramingMode = false;
      this.overlay.style.display = 'none';
      if (this.controlBar) this.controlBar.style.display = 'none';
    }
  }

  setFramingMode(inFraming) {
    this.isFramingMode = inFraming;
    if (inFraming) {
      this.isActive = true;
      this.overlay.style.display = 'block';
      if (this.controlBar) this.controlBar.style.display = 'none';
      this.cropBox.classList.add('applied-mode');
      [this.scrimTop, this.scrimBottom, this.scrimLeft, this.scrimRight].forEach((s) => {
        if (s) s.classList.add('applied-mode');
      });
      this.repositionBoxFromNormalized();
    } else {
      this.activate();
    }
  }

  refreshMediaBounds() {
    const target = this.targetGetter();
    if (!target) return;

    const tRect = target.getBoundingClientRect();
    const vRect = this.viewport.getBoundingClientRect();

    if (tRect.width <= 0 || tRect.height <= 0 || vRect.width <= 0 || vRect.height <= 0) {
      return;
    }

    // Exact pixel coordinates of media relative to viewport container
    this.mediaBounds = {
      left: tRect.left - vRect.left,
      top: tRect.top - vRect.top,
      width: tRect.width,
      height: tRect.height,
    };
  }

  repositionBoxFromNormalized(crop = this.engine.crop) {
    if (!crop) return;
    this.refreshMediaBounds();
    const l = this.mediaBounds.left + crop.x * this.mediaBounds.width;
    const t = this.mediaBounds.top + crop.y * this.mediaBounds.height;
    const w = crop.width * this.mediaBounds.width;
    const h = crop.height * this.mediaBounds.height;
    this.setCropBoxRect({ left: l, top: t, width: w, height: h });
  }

  setCropBoxRect(rect) {
    const minSize = 40;
    const b = this.mediaBounds;
    const w = Math.max(minSize, Math.min(b.width, rect.width));
    const h = Math.max(minSize, Math.min(b.height, rect.height));
    const l = Math.max(b.left, Math.min(b.left + b.width - w, rect.left));
    const t = Math.max(b.top, Math.min(b.top + b.height - h, rect.top));

    this.cropBoxRect = { left: l, top: t, width: w, height: h };
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

    const newL = curCenter.x - newW / 2;
    const newT = curCenter.y - newH / 2;

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
      const maxL = bounds.left + bounds.width - b.width;
      const maxT = bounds.top + bounds.height - b.height;
      const newL = Math.max(bounds.left, Math.min(maxL, b.left + dx));
      const newT = Math.max(bounds.top, Math.min(maxT, b.top + dy));
      this.cropBoxRect.left = newL;
      this.cropBoxRect.top = newT;
      this.updateUI();
      return;
    }

    const minSize = 40;
    const r0 = b.left + b.width;
    const b0 = b.top + b.height;

    let targetRatio = null;
    if (this.activeRatio !== 'free') {
      if (this.activeRatio === '1:1') targetRatio = 1;
      else if (this.activeRatio === '9:16') targetRatio = 9 / 16;
      else if (this.activeRatio === '16:9') targetRatio = 16 / 9;
      else if (this.activeRatio === '4:5') targetRatio = 4 / 5;
      else if (this.activeRatio === '4:3') targetRatio = 4 / 3;
    }

    let left = b.left;
    let top = b.top;
    let width = b.width;
    let height = b.height;

    // Fixed-anchor resizing logic
    switch (this.dragMode) {
      case 'se': {
        // Anchor: Top-Left (b.left, b.top)
        const maxW = bounds.left + bounds.width - b.left;
        const maxH = bounds.top + bounds.height - b.top;
        let w = Math.max(minSize, Math.min(maxW, b.width + dx));
        let h = Math.max(minSize, Math.min(maxH, b.height + dy));

        if (targetRatio) {
          if (Math.abs(dx) > Math.abs(dy)) {
            h = w / targetRatio;
            if (h > maxH) {
              h = maxH;
              w = h * targetRatio;
            }
          } else {
            w = h * targetRatio;
            if (w > maxW) {
              w = maxW;
              h = w / targetRatio;
            }
          }
        }
        left = b.left;
        top = b.top;
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        break;
      }

      case 'sw': {
        // Anchor: Top-Right (r0, b.top)
        const maxW = r0 - bounds.left;
        const maxH = bounds.top + bounds.height - b.top;
        let w = Math.max(minSize, Math.min(maxW, b.width - dx));
        let h = Math.max(minSize, Math.min(maxH, b.height + dy));

        if (targetRatio) {
          if (Math.abs(dx) > Math.abs(dy)) {
            h = w / targetRatio;
            if (h > maxH) {
              h = maxH;
              w = h * targetRatio;
            }
          } else {
            w = h * targetRatio;
            if (w > maxW) {
              w = maxW;
              h = w / targetRatio;
            }
          }
        }
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        left = r0 - width;
        top = b.top;
        break;
      }

      case 'ne': {
        // Anchor: Bottom-Left (b.left, b0)
        const maxW = bounds.left + bounds.width - b.left;
        const maxH = b0 - bounds.top;
        let w = Math.max(minSize, Math.min(maxW, b.width + dx));
        let h = Math.max(minSize, Math.min(maxH, b.height - dy));

        if (targetRatio) {
          if (Math.abs(dx) > Math.abs(dy)) {
            h = w / targetRatio;
            if (h > maxH) {
              h = maxH;
              w = h * targetRatio;
            }
          } else {
            w = h * targetRatio;
            if (w > maxW) {
              w = maxW;
              h = w / targetRatio;
            }
          }
        }
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        left = b.left;
        top = b0 - height;
        break;
      }

      case 'nw': {
        // Anchor: Bottom-Right (r0, b0)
        const maxW = r0 - bounds.left;
        const maxH = b0 - bounds.top;
        let w = Math.max(minSize, Math.min(maxW, b.width - dx));
        let h = Math.max(minSize, Math.min(maxH, b.height - dy));

        if (targetRatio) {
          if (Math.abs(dx) > Math.abs(dy)) {
            h = w / targetRatio;
            if (h > maxH) {
              h = maxH;
              w = h * targetRatio;
            }
          } else {
            w = h * targetRatio;
            if (w > maxW) {
              w = maxW;
              h = w / targetRatio;
            }
          }
        }
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        left = r0 - width;
        top = b0 - height;
        break;
      }

      case 'e': {
        // Anchor: Left (b.left)
        const maxW = bounds.left + bounds.width - b.left;
        let w = Math.max(minSize, Math.min(maxW, b.width + dx));
        let h = b.height;
        let t = b.top;

        if (targetRatio) {
          h = w / targetRatio;
          const centerY = b.top + b.height / 2;
          t = centerY - h / 2;
          if (t < bounds.top) {
            t = bounds.top;
          } else if (t + h > bounds.top + bounds.height) {
            t = bounds.top + bounds.height - h;
          }
          if (h > bounds.height) {
            h = bounds.height;
            w = h * targetRatio;
            t = bounds.top;
          }
        }
        left = b.left;
        top = t;
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        break;
      }

      case 'w': {
        // Anchor: Right (r0)
        const maxW = r0 - bounds.left;
        let w = Math.max(minSize, Math.min(maxW, b.width - dx));
        let h = b.height;
        let t = b.top;

        if (targetRatio) {
          h = w / targetRatio;
          const centerY = b.top + b.height / 2;
          t = centerY - h / 2;
          if (t < bounds.top) {
            t = bounds.top;
          } else if (t + h > bounds.top + bounds.height) {
            t = bounds.top + bounds.height - h;
          }
          if (h > bounds.height) {
            h = bounds.height;
            w = h * targetRatio;
            t = bounds.top;
          }
        }
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        left = r0 - width;
        top = t;
        break;
      }

      case 's': {
        // Anchor: Top (b.top)
        const maxH = bounds.top + bounds.height - b.top;
        let h = Math.max(minSize, Math.min(maxH, b.height + dy));
        let w = b.width;
        let l = b.left;

        if (targetRatio) {
          w = h * targetRatio;
          const centerX = b.left + b.width / 2;
          l = centerX - w / 2;
          if (l < bounds.left) {
            l = bounds.left;
          } else if (l + w > bounds.left + bounds.width) {
            l = bounds.left + bounds.width - w;
          }
          if (w > bounds.width) {
            w = bounds.width;
            h = w / targetRatio;
            l = bounds.left;
          }
        }
        left = l;
        top = b.top;
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        break;
      }

      case 'n': {
        // Anchor: Bottom (b0)
        const maxH = b0 - bounds.top;
        let h = Math.max(minSize, Math.min(maxH, b.height - dy));
        let w = b.width;
        let l = b.left;

        if (targetRatio) {
          w = h * targetRatio;
          const centerX = b.left + b.width / 2;
          l = centerX - w / 2;
          if (l < bounds.left) {
            l = bounds.left;
          } else if (l + w > bounds.left + bounds.width) {
            l = bounds.left + bounds.width - w;
          }
          if (w > bounds.width) {
            w = bounds.width;
            h = w / targetRatio;
            l = bounds.left;
          }
        }
        width = Math.max(minSize, w);
        height = Math.max(minSize, h);
        left = l;
        top = b0 - height;
        break;
      }
    }

    // Final boundary clamp
    this.cropBoxRect = {
      left: Math.max(bounds.left, Math.min(bounds.left + bounds.width - minSize, left)),
      top: Math.max(bounds.top, Math.min(bounds.top + bounds.height - minSize, top)),
      width: Math.max(minSize, Math.min(bounds.width, width)),
      height: Math.max(minSize, Math.min(bounds.height, height)),
    };

    this.updateUI();
  }

  getNormalizedCrop() {
    if (this.mediaBounds.width <= 0 || this.mediaBounds.height <= 0) return null;

    const relX = this.cropBoxRect.left - this.mediaBounds.left;
    const relY = this.cropBoxRect.top - this.mediaBounds.top;

    const normX = Math.max(0.0, Math.min(1.0, relX / this.mediaBounds.width));
    const normY = Math.max(0.0, Math.min(1.0, relY / this.mediaBounds.height));
    const normW = Math.max(0.01, Math.min(1.0 - normX, this.cropBoxRect.width / this.mediaBounds.width));
    const normH = Math.max(0.01, Math.min(1.0 - normY, this.cropBoxRect.height / this.mediaBounds.height));

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
    this.setFramingMode(true);
  }

  clearCrop() {
    this.engine.clearCrop();
    this.showToast('Crop cleared: Full frame restored');
    if (this.onCropChange) this.onCropChange(null);
    this.isActive = false;
    this.isFramingMode = false;
    this.overlay.style.display = 'none';
    if (this.controlBar) this.controlBar.style.display = 'none';
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
    if (this.dimsBadge && !this.isFramingMode) {
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
