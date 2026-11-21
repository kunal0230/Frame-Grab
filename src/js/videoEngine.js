/**
 * Frame Grab — Video Engine
 * High-precision frame-by-frame navigation, SMPTE timecodes, and zoom/pan viewport controller.
 */

export class VideoEngine {
  constructor(videoElement, viewportElement) {
    this.video = videoElement;
    this.viewport = viewportElement;

    // State
    this.fps = 30;
    this.detectedFps = null;
    this.duration = 0;
    this.totalFrames = 0;
    this.fileName = '';
    this.inPoint = null; // in seconds
    this.outPoint = null; // in seconds

    // Zoom & Pan state
    this.zoomLevel = 'fit'; // 'fit', 1, 2, 4
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Rotation & Crop state
    this.rotation = 0; // 0, 90, 180, 270
    this.flipH = false;
    this.flipV = false;
    this.crop = null; // null or { x, y, width, height, ratio }
    this.activeMediaType = 'video'; // 'video' | 'photo'

    // Callbacks
    this.listeners = new Map();

    this.initEvents();
    this.initPanZoom();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => cb(data));
    }
  }

  initEvents() {
    this.video.addEventListener('loadedmetadata', () => {
      this.duration = this.video.duration;
      this.totalFrames = Math.max(1, Math.round(this.duration * this.fps));
      this.resetPanZoom();

      // Attempt automatic FPS detection
      this.detectFramerate();

      this.emit('loaded', {
        duration: this.duration,
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        fps: this.fps,
        totalFrames: this.totalFrames,
        fileName: this.fileName,
      });
      this.emit('timeupdate', this.getCurrentState());
    });

    this.video.addEventListener('loadeddata', () => {
      try {
        if (this.video.currentTime === 0) {
          this.video.currentTime = 0.00001;
        }
      } catch (e) {
        // ignore
      }
    });

    this.video.addEventListener('timeupdate', () => {
      this.emit('timeupdate', this.getCurrentState());
    });

    this.video.addEventListener('play', () => {
      this.emit('play');
    });

    this.video.addEventListener('pause', () => {
      this.emit('pause');
    });

    this.video.addEventListener('ended', () => {
      this.emit('pause');
    });

    this.video.addEventListener('progress', () => {
      this.emit('progress', this.getBufferedRanges());
    });
  }

  async loadVideoSource(fileOrUrl, name = 'video.mp4') {
    this.pause();
    this.fileName = name;
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch (e) {
        // ignore
      }
      this.currentObjectUrl = null;
    }
    let url = '';
    if (typeof fileOrUrl === 'string') {
      url = fileOrUrl;
    } else {
      url = URL.createObjectURL(fileOrUrl);
      this.currentObjectUrl = url;
    }
    this.video.src = url;
    this.video.load();
    this.inPoint = null;
    this.outPoint = null;
    this.emit('rangechange', { inPoint: null, outPoint: null });
  }

  setFps(newFps) {
    const numericFps = parseFloat(newFps);
    if (!isNaN(numericFps) && numericFps > 0) {
      this.fps = numericFps;
      this.totalFrames = Math.max(1, Math.round(this.duration * this.fps));
      this.emit('fpschange', { fps: this.fps, totalFrames: this.totalFrames });
      this.emit('timeupdate', this.getCurrentState());
    }
  }

  /**
   * Samples frame timestamps using requestVideoFrameCallback if available to deduce exact framerate.
   */
  detectFramerate() {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
      return;
    }

    const frameDeltas = [];
    let prevTime = null;
    let sampleCount = 0;
    const maxSamples = 25;

    const sampleCallback = (now, metadata) => {
      if (prevTime !== null) {
        const delta = metadata.mediaTime - prevTime;
        if (delta > 0.005 && delta < 0.2) {
          frameDeltas.push(delta);
        }
      }
      prevTime = metadata.mediaTime;
      sampleCount++;

      if (sampleCount < maxSamples && !this.video.paused) {
        this.video.requestVideoFrameCallback(sampleCallback);
      } else if (frameDeltas.length >= 8) {
        // Compute average delta
        const avgDelta = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
        const rawFps = 1 / avgDelta;

        // Match closest common standard framerates
        const standards = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120];
        let closest = standards[0];
        let minDiff = Math.abs(rawFps - standards[0]);

        for (const std of standards) {
          const diff = Math.abs(rawFps - std);
          if (diff < minDiff) {
            minDiff = diff;
            closest = std;
          }
        }

        if (minDiff < 1.5) {
          this.detectedFps = closest;
          this.setFps(closest);
          this.emit('fpsdetected', closest);
        }
      }
    };

    this.video.requestVideoFrameCallback(sampleCallback);
  }

  getCurrentFrame() {
    return Math.min(this.totalFrames, Math.round(this.video.currentTime * this.fps));
  }

  getCurrentState() {
    const currentSeconds = this.video.currentTime;
    const currentFrame = this.getCurrentFrame();
    const smpte = this.formatSMPTE(currentSeconds, this.fps);
    const timeFormatted = this.formatTimeSeconds(currentSeconds);
    const durationFormatted = this.formatTimeSeconds(this.duration);

    return {
      currentTime: currentSeconds,
      currentFrame,
      totalFrames: this.totalFrames,
      duration: this.duration,
      smpte,
      timeFormatted,
      durationFormatted,
      paused: this.video.paused,
      progress: this.duration > 0 ? currentSeconds / this.duration : 0,
    };
  }

  getBufferedRanges() {
    const buffered = this.video.buffered;
    if (!buffered || buffered.length === 0 || this.duration === 0) return 0;
    return buffered.end(buffered.length - 1) / this.duration;
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  play() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    }
  }

  pause() {
    if (!this.video.paused) {
      this.video.pause();
    }
  }

  setPlaybackRate(rate) {
    this.video.playbackRate = parseFloat(rate) || 1.0;
  }

  /**
   * Step forward or backward by an exact number of frames.
   * Uses frame math (delta / fps) with boundary clamping.
   */
  stepFrame(delta) {
    this.pause();
    const frameDuration = 1 / this.fps;
    const currentFrame = this.getCurrentFrame();
    let targetFrame = currentFrame + delta;

    if (targetFrame < 0) targetFrame = 0;
    if (targetFrame > this.totalFrames) targetFrame = this.totalFrames;

    // Small offset (+0.0001) avoids rounding down to previous frame boundary in browser decoders
    const targetTime = Math.min(this.duration, Math.max(0, targetFrame * frameDuration + 0.0001));
    this.video.currentTime = targetTime;
  }

  seekToRatio(ratio) {
    const targetTime = Math.min(this.duration, Math.max(0, ratio * this.duration));
    this.video.currentTime = targetTime;
  }

  seekToTime(seconds) {
    this.video.currentTime = Math.min(this.duration, Math.max(0, seconds));
  }

  jumpToStart() {
    this.pause();
    this.video.currentTime = 0;
  }

  jumpToEnd() {
    this.pause();
    this.video.currentTime = this.duration;
  }

  // Range Markers
  setMarkIn() {
    this.inPoint = this.video.currentTime;
    if (this.outPoint !== null && this.outPoint < this.inPoint) {
      this.outPoint = null;
    }
    this.emit('rangechange', { inPoint: this.inPoint, outPoint: this.outPoint });
  }

  setMarkOut() {
    this.outPoint = this.video.currentTime;
    if (this.inPoint !== null && this.inPoint > this.outPoint) {
      this.inPoint = null;
    }
    this.emit('rangechange', { inPoint: this.inPoint, outPoint: this.outPoint });
  }

  clearRange() {
    this.inPoint = null;
    this.outPoint = null;
    this.emit('rangechange', { inPoint: null, outPoint: null });
  }

  // SMPTE formatting helper: HH:MM:SS:FF
  formatSMPTE(seconds, fps = 30) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const totalFrames = Math.floor(seconds * fps);
    const f = Math.floor(totalFrames % fps);
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  }

  // Format MM:SS.mmm
  formatTimeSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    const pad = (n) => String(n).padStart(2, '0');
    const padMs = (n) => String(n).padStart(3, '0');
    return `${pad(m)}:${pad(s)}.${padMs(ms)}`;
  }

  // ==========================================
  // Zoom & Pan Loupe Logic
  // ==========================================
  initPanZoom() {
    this.viewport.addEventListener('mousedown', (e) => {
      if (this.zoomLevel === 'fit') return;
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.viewport.classList.add('is-panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.viewport.classList.remove('is-panning');
      }
    });

    // Mousewheel zoom (Ctrl/Cmd + Wheel) up to 32x (3200%)
    this.viewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        let currentScale = typeof this.zoomLevel === 'number' ? this.zoomLevel : 1.0;
        const step = currentScale >= 8 ? 1.0 : (currentScale >= 4 ? 0.5 : 0.25);
        const delta = e.deltaY < 0 ? step : -step;
        let newScale = Math.min(32, Math.max(0.5, currentScale + delta));
        if (newScale <= 1.05 && delta < 0) {
          this.setZoom('fit');
        } else {
          this.setZoom(Math.round(newScale * 10) / 10);
        }
      }
    }, { passive: false });
  }

  setZoom(level) {
    this.zoomLevel = level;
    if (level === 'fit') {
      this.resetPanZoom();
      this.viewport.classList.remove('panning');
    } else {
      this.viewport.classList.add('panning');
      this.applyTransform();
    }
    this.emit('zoomchange', this.zoomLevel);
  }

  resetPanZoom() {
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  // ==========================================
  // Rotation & Crop Methods
  // ==========================================
  rotateCW() {
    this.rotation = (this.rotation + 90) % 360;
    this.crop = null;
    this.applyTransform();
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  rotateCCW() {
    this.rotation = (this.rotation - 90 + 360) % 360;
    this.crop = null;
    this.applyTransform();
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  toggleFlipH() {
    this.flipH = !this.flipH;
    this.crop = null;
    this.applyTransform();
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  toggleFlipV() {
    this.flipV = !this.flipV;
    this.crop = null;
    this.applyTransform();
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  resetRotation() {
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;
    this.crop = null;
    this.applyTransform();
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  setCrop(crop) {
    this.crop = crop;
    this.emit('cropchange', this.crop);
    this.emit('transformchange', this.getTransformState());
  }

  clearCrop() {
    this.crop = null;
    this.emit('cropchange', null);
    this.emit('transformchange', this.getTransformState());
  }

  getTransformState() {
    return {
      rotation: this.rotation,
      flipH: this.flipH,
      flipV: this.flipV,
      crop: this.crop,
      effectiveDims: this.getEffectiveDimensions(),
    };
  }

  getSourceDimensions() {
    if (this.activeMediaType === 'photo') {
      const mainPhoto = document.getElementById('mainPhoto');
      return {
        width: mainPhoto?.naturalWidth || 1920,
        height: mainPhoto?.naturalHeight || 1080,
      };
    }
    return {
      width: this.video.videoWidth || 1920,
      height: this.video.videoHeight || 1080,
    };
  }

  getRotatedDimensions() {
    const src = this.getSourceDimensions();
    const isQuarter = this.rotation === 90 || this.rotation === 270;
    return {
      width: isQuarter ? src.height : src.width,
      height: isQuarter ? src.width : src.height,
    };
  }

  getEffectiveDimensions() {
    const rot = this.getRotatedDimensions();
    if (!this.crop || !this.crop.width || !this.crop.height) {
      return rot;
    }
    return {
      width: Math.max(1, Math.round(this.crop.width * rot.width)),
      height: Math.max(1, Math.round(this.crop.height * rot.height)),
    };
  }

  applyTransform() {
    const isQuarterTurn = this.rotation === 90 || this.rotation === 270;
    let baseScale = 1.0;

    if (isQuarterTurn && this.viewport) {
      const vRect = this.viewport.getBoundingClientRect();
      const mainPhoto = document.getElementById('mainPhoto');
      const el = this.activeMediaType === 'photo' && mainPhoto ? mainPhoto : this.video;
      const elW = el.clientWidth || el.videoWidth || el.naturalWidth || 1920;
      const elH = el.clientHeight || el.videoHeight || el.naturalHeight || 1080;

      if (elW > 0 && elH > 0 && vRect.width > 0 && vRect.height > 0) {
        const availW = vRect.width - 24;
        const availH = vRect.height - 24;
        baseScale = Math.min(availW / elH, availH / elW, 1.0);
      }
    }

    const zoomFactor = this.zoomLevel === 'fit' ? 1.0 : (typeof this.zoomLevel === 'number' ? this.zoomLevel : parseFloat(this.zoomLevel) || 1.0);
    const totalScale = baseScale * zoomFactor;

    const parts = [];
    if (this.panX !== 0 || this.panY !== 0) {
      parts.push(`translate(${this.panX}px, ${this.panY}px)`);
    }
    if (totalScale !== 1.0) {
      parts.push(`scale(${totalScale})`);
    }
    if (this.rotation !== 0) {
      parts.push(`rotate(${this.rotation}deg)`);
    }
    if (this.flipH) {
      parts.push('scaleX(-1)');
    }
    if (this.flipV) {
      parts.push('scaleY(-1)');
    }

    const transformStr = parts.length > 0 ? parts.join(' ') : 'none';
    this.video.style.transform = transformStr;
    const mainPhoto = document.getElementById('mainPhoto');
    if (mainPhoto) mainPhoto.style.transform = transformStr;
  }
}
