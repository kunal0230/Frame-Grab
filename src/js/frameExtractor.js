/**
 * Frame Grab — Lossless Frame Extractor
 * High-performance, pixel-exact canvas extraction, clipboard copying, and batch ZIP export.
 */

import JSZip from 'jszip';

export class FrameExtractor {
  constructor(videoEngine, offscreenCanvas) {
    this.engine = videoEngine;
    this.canvas = offscreenCanvas || document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });

    // Settings
    this.imageFormat = 'png'; // 'png', 'webp', 'jpeg'
    this.filenamePattern = '{name}_frame_{frame}_{timecode}';
    this.autoDownload = true;

    // Batch cancellation token
    this.cancelBatchExtraction = false;
  }

  setSettings({ format, pattern, autoDownload }) {
    if (format) this.imageFormat = format;
    if (pattern) this.filenamePattern = pattern;
    if (typeof autoDownload === 'boolean') this.autoDownload = autoDownload;
  }

  /**
   * Renders the current frame (video or photo) onto this.canvas,
   * faithfully applying any active rotation (0/90/180/270), flip, and crop losslessly.
   */
  renderTransformedFrame(source = null) {
    const el = source || (this.engine.activeMediaType === 'photo' ? document.getElementById('mainPhoto') : this.engine.video);
    if (!el) {
      throw new Error('No active video or photo loaded.');
    }

    const isVideo = el instanceof HTMLVideoElement;
    const origW = isVideo ? el.videoWidth : (el.naturalWidth || el.width);
    const origH = isVideo ? el.videoHeight : (el.naturalHeight || el.height);

    if (!origW || !origH) {
      throw new Error('No valid media dimensions.');
    }

    const rotation = ((this.engine.rotation % 360) + 360) % 360;
    const flipH = !!this.engine.flipH;
    const flipV = !!this.engine.flipV;
    const crop = this.engine.crop;

    const isQuarterTurn = rotation === 90 || rotation === 270;
    const rotW = isQuarterTurn ? origH : origW;
    const rotH = isQuarterTurn ? origW : origH;

    // Temporary canvas for lossless rotation and flipping
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rotCtx = rotCanvas.getContext('2d', { alpha: false, desynchronized: true });
    rotCtx.imageSmoothingEnabled = false;

    rotCtx.save();
    rotCtx.translate(rotW / 2, rotH / 2);
    if (rotation !== 0) {
      rotCtx.rotate((rotation * Math.PI) / 180);
    }
    if (flipH || flipV) {
      rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    }
    rotCtx.drawImage(el, -origW / 2, -origH / 2, origW, origH);
    rotCtx.restore();

    // Now handle crop if defined
    if (crop && crop.width > 0 && crop.height > 0) {
      const cropX = Math.max(0, Math.min(rotW - 1, Math.round(crop.x * rotW)));
      const cropY = Math.max(0, Math.min(rotH - 1, Math.round(crop.y * rotH)));
      const cropW = Math.max(1, Math.min(rotW - cropX, Math.round(crop.width * rotW)));
      const cropH = Math.max(1, Math.min(rotH - cropY, Math.round(crop.height * rotH)));

      this.canvas.width = cropW;
      this.canvas.height = cropH;
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return { width: cropW, height: cropH, isRotated: rotation !== 0, isCropped: true, rotW, rotH };
    } else {
      this.canvas.width = rotW;
      this.canvas.height = rotH;
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(rotCanvas, 0, 0, rotW, rotH);
      return { width: rotW, height: rotH, isRotated: rotation !== 0, isCropped: false, rotW, rotH };
    }
  }

  /**
   * Captures the current video frame or photo losslessly at native pixel resolution.
   * @param {Object} options - Optional configuration (e.g. { skipDownload: true, sourceElement })
   */
  async captureCurrentFrame(options = {}) {
    const sourceEl = options.sourceElement || (this.engine.activeMediaType === 'photo' ? document.getElementById('mainPhoto') : this.engine.video);
    const { width, height, isRotated, isCropped } = this.renderTransformedFrame(sourceEl);

    // Determine mime-type & export quality
    let mimeType = 'image/png';
    let quality = 1.0;
    let ext = 'png';

    if (this.imageFormat === 'webp') {
      mimeType = 'image/webp';
      quality = 1.0; // Lossless in WebP
      ext = 'webp';
    } else if (this.imageFormat === 'jpeg') {
      mimeType = 'image/jpeg';
      quality = 0.98;
      ext = 'jpg';
    }

    // Export to lossless Blob
    const blob = await new Promise((resolve) => {
      this.canvas.toBlob((b) => resolve(b), mimeType, quality);
    });

    const isVideo = sourceEl instanceof HTMLVideoElement;
    const currentFrame = isVideo ? this.engine.getCurrentFrame() : 'Photo';
    const timecode = isVideo ? this.engine.formatSMPTE(sourceEl.currentTime, this.engine.fps) : 'PHOTO';
    const sanitizedTimecode = isVideo ? timecode.replace(/:/g, '-') : 'photo';
    const baseName = (this.engine.fileName || 'media').replace(/\.[^/.]+$/, '');

    // Generate filename from pattern
    const filename = this.generateFilename(baseName, currentFrame, sanitizedTimecode, isVideo ? sourceEl.currentTime : 0, ext);

    // Create object URL for fast display
    const url = URL.createObjectURL(blob);

    const frameData = {
      id: 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      blob,
      url,
      width,
      height,
      frameNumber: currentFrame,
      timecode,
      timestamp: isVideo ? sourceEl.currentTime : 0,
      filename,
      sizeBytes: blob.size,
      format: ext.toUpperCase(),
      createdAt: new Date(),
      isRotated,
      isCropped,
    };

    const shouldDownload = options.skipDownload ? false : (typeof options.autoDownload === 'boolean' ? options.autoDownload : this.autoDownload);
    if (shouldDownload) {
      this.downloadBlob(blob, filename);
    }

    return frameData;
  }

  /**
   * Copies the current frame directly to system clipboard as lossless PNG.
   */
  async copyCurrentFrameToClipboard(options = {}) {
    const sourceEl = options.sourceElement || (this.engine.activeMediaType === 'photo' ? document.getElementById('mainPhoto') : this.engine.video);
    this.renderTransformedFrame(sourceEl);

    // System clipboard expects PNG
    const blob = await new Promise((resolve) => {
      this.canvas.toBlob((b) => resolve(b), 'image/png', 1.0);
    });

    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error('Clipboard API is not supported in this browser.');
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);

    return true;
  }

  generateFilename(name, frame, timecode, timestamp, ext) {
    let result = this.filenamePattern
      .replace(/{name}/g, name)
      .replace(/{frame}/g, String(frame).padStart(6, '0'))
      .replace(/{timecode}/g, timecode)
      .replace(/{timestamp}/g, timestamp.toFixed(2));
    return `${result}.${ext}`;
  }

  downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Batch extracts frames in range and packages into a ZIP file.
   */
  async extractBatch({ startTime, endTime, intervalType, applyEnhance = false, enhancer = null, onProgress }) {
    this.cancelBatchExtraction = false;
    const video = this.engine.video;
    const fps = this.engine.fps;
    const frameDuration = 1 / fps;

    // Calculate frame indices
    const startFrame = Math.max(0, Math.floor(startTime * fps));
    const endFrame = Math.min(this.engine.totalFrames, Math.ceil(endTime * fps));

    let frameStep = 1;
    if (intervalType === '2') frameStep = 2;
    else if (intervalType === '5') frameStep = 5;
    else if (intervalType === '10') frameStep = 10;
    else if (intervalType === 'fps') frameStep = Math.max(1, Math.round(fps)); // 1 sec
    else if (intervalType === 'half_sec') frameStep = Math.max(1, Math.round(fps / 2));

    const framesToExtract = [];
    for (let f = startFrame; f <= endFrame; f += frameStep) {
      framesToExtract.push(f);
    }

    const total = framesToExtract.length;
    if (total === 0) {
      throw new Error('No frames in selected range.');
    }

    const zip = new JSZip();
    const baseName = (this.engine.fileName || 'video').replace(/\.[^/.]+$/, '');
    const originalTime = video.currentTime;
    this.engine.pause();

    const width = video.videoWidth;
    const height = video.videoHeight;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < total; i++) {
      if (this.cancelBatchExtraction) {
        // Restore original time
        this.engine.seekToTime(originalTime);
        throw new Error('Extraction cancelled by user.');
      }

      const frameIdx = framesToExtract[i];
      const targetTime = frameIdx * frameDuration + 0.0001;

      // Seek to target frame and wait for seek completion
      await this.seekVideoWait(video, targetTime);

      // Render transformed frame (applies current rotation, flip, and crop losslessly)
      this.renderTransformedFrame(video);

      // Convert to blob
      const blob = await new Promise((resolve) => {
        this.canvas.toBlob((b) => resolve(b), 'image/png', 1.0);
      });

      const tc = this.engine.formatSMPTE(video.currentTime, fps).replace(/:/g, '-');
      let finalBlob = blob;
      let filename = `${baseName}_f${String(frameIdx).padStart(6, '0')}_${tc}.png`;

      // Optional Batch AI Enhancement
      if (applyEnhance) {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            percent: Math.round(((i + 0.5) / total) * 100),
            currentFrame: frameIdx,
            statusText: `Enhancing frame ${i + 1}/${total} with AI...`,
          });
        }
        try {
          // Attempt backend CodeFormer GPU first
          const formData = new FormData();
          formData.append('file', blob, 'frame.png');
          formData.append('model', 'codeformer');
          formData.append('fidelity', '0.6');
          formData.append('scale', '1');

          const resp = await fetch('http://localhost:8000/api/enhance', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(8000),
          });
          if (resp.ok) {
            finalBlob = await resp.blob();
            filename = `${baseName}_f${String(frameIdx).padStart(6, '0')}_${tc}_codeformer.png`;
          } else if (enhancer) {
            const img = new Image();
            await new Promise((r) => { img.onload = r; img.src = URL.createObjectURL(blob); });
            const enhanced = await enhancer.enhance(img);
            finalBlob = enhanced.blob;
            filename = `${baseName}_f${String(frameIdx).padStart(6, '0')}_${tc}_enhanced.png`;
          }
        } catch {
          if (enhancer) {
            try {
              const img = new Image();
              await new Promise((r) => { img.onload = r; img.src = URL.createObjectURL(blob); });
              const enhanced = await enhancer.enhance(img);
              finalBlob = enhanced.blob;
              filename = `${baseName}_f${String(frameIdx).padStart(6, '0')}_${tc}_enhanced.png`;
            } catch (err) {
              console.warn('Enhance fallback failed, saving original frame:', err);
            }
          }
        }
      }

      // Add to ZIP
      zip.file(filename, finalBlob);

      if (onProgress) {
        const percent = Math.round(((i + 1) / total) * 100);
        onProgress({
          current: i + 1,
          total,
          percent,
          currentFrame: frameIdx,
        });
      }
    }

    // Finalize zip
    if (onProgress) {
      onProgress({ status: 'compressing', text: 'Compressing lossless ZIP...' });
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const zipFilename = `${baseName}_frames_${startFrame}-${endFrame}.zip`;
    this.downloadBlob(zipBlob, zipFilename);

    // Restore original time
    this.engine.seekToTime(originalTime);

    return { totalExtracted: total, zipFilename };
  }

  cancelBatch() {
    this.cancelBatchExtraction = true;
  }

  seekVideoWait(video, targetTime) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;
    });
  }
}
