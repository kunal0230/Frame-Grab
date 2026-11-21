/**
 * Frame Grab — Portrait & Person Enhancement Studio Modal
 * Interactive Before/After Split Comparison, Purpose-Driven Mode Selector, and Lossless Export.
 * Simplified & Optimized:
 *  1. AI Portrait & Face (SOTA CodeFormer VQ-GAN) — Best for People (Default)
 *  2. Studio Pro Stack (SwinIR RealSR 2x + Face Prior) — Best for Full-Body & Scenes
 *  3. Natural Skin & Lighting (Fast 20ms Perceptual CV) — Lightweight in-browser
 */

import { PortraitEnhancer } from './portraitEnhancer.js';
import { SwinIREnhancer } from './swinIREnhancer.js';

export class EnhancerModal {
  constructor({ onSaveToGallery, showToast }) {
    this.onSaveToGallery = onSaveToGallery;
    this.showToast = showToast || console.log;
    this.enhancer = new PortraitEnhancer();
    this.swinir = new SwinIREnhancer();

    this.currentFrame = null;
    this.enhancedResult = null;
    this.isProcessing = false;
    this.debounceTimer = null;

    // Backend GPU settings (Apple M5 MPS)
    this.backendBaseUrl = 'http://localhost:8000';
    this.backendOnline = false;
    this.pytorchSettings = {
      model: 'codeformer', // 'codeformer', 'studio_stack', 'swinir'
      fidelity: 0.6,
      scale: 1,
      stackMode: 'fast', // 'fast' (~0.8s) vs 'deep' (~2-3m SwinIR)
    };
    this.modelsStorage = null;

    // Current Simplified Mode: 'face_sota' (Default), 'studio_stack', or 'fast_cv'
    this.currentMode = 'face_sota';
    this.activeEngine = 'pytorch';

    // View state
    this.splitRatio = 0.5; // 0.0 to 1.0
    this.zoomLevel = 'fit'; // 'fit', 1, 2
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Fast CV settings
    this.currentSettings = { ...PortraitEnhancer.PRESETS.studio };

    // SwinIR Settings
    this.swinIRSettings = {
      mode: 'realsr',
      scale: 2,
      denoiseStrength: 0.5,
      sharpness: 0.6,
    };

    this.initDOM();
  }

  initDOM() {
    let modal = document.getElementById('modalEnhancer');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalEnhancer';
      modal.className = 'modal-backdrop modal-enhancer';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }
    this.modal = modal;

    this.modal.innerHTML = `
      <div class="enhancer-dialog">
        <!-- Header -->
        <div class="enhancer-header">
          <div class="header-left">
            <div class="enhancer-badge" id="enhancerBadgeTitle">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span id="badgeEngineLabel">AI PORTRAIT & FACE (SOTA)</span>
            </div>
            <h3 class="enhancer-title" id="enhancerFrameTitle">Frame Enhancement Studio</h3>
          </div>
          <div class="header-right">
            <input type="file" id="modalImageInput" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff" style="display: none;" />
            <button class="btn btn-xs btn-glass" id="btnModalImportImage" title="Directly import another image from disk to enhance">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Import Image</span>
            </button>
            <div class="enhancer-stats" id="enhancerStatsBadge">
              <span class="stat-tag" id="statDuration">Ready</span>
              <span class="stat-tag" id="statSkin">Faces: --</span>
              <span class="stat-tag" id="statRes">-- × --</span>
            </div>
            <button class="btn btn-icon btn-ghost" id="btnCloseEnhancer" title="Close Studio (Esc)">✕</button>
          </div>
        </div>

        <!-- Main Body: Stage (Left) + Controls Sidebar (Right) -->
        <div class="enhancer-body">
          <!-- Stage Area with Interactive Split Comparison -->
          <div class="enhancer-stage-wrap">
            <div class="enhancer-stage-viewport" id="enhancerViewport">
              <!-- Drag and drop image overlay -->
              <div class="drag-drop-overlay" id="enhancerDragOverlay" style="display: none;">
                <div class="drag-drop-content">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <span>Drop image here to enhance</span>
                </div>
              </div>

              <div class="split-view-container" id="splitViewContainer">
                <!-- Before / Original Image Layer -->
                <div class="split-layer layer-before">
                  <img id="imgBefore" alt="Original Frame" />
                  <span class="layer-tag tag-before">ORIGINAL</span>
                </div>
                <!-- After / Enhanced Image Layer (Clipped to split ratio) -->
                <div class="split-layer layer-after" id="layerAfter">
                  <img id="imgAfter" alt="Enhanced Portrait" />
                  <span class="layer-tag tag-after" id="layerTagAfter">✨ SOTA FACE RESTORED</span>
                </div>
                <!-- Interactive Split Divider Handle -->
                <div class="split-divider" id="splitDivider">
                  <div class="divider-line"></div>
                  <div class="divider-handle">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Processing Loader Overlay -->
              <div class="enhancer-processing-overlay" id="enhancerLoader" style="display: none;">
                <div class="loader-spinner"></div>
                <span id="loaderText">Applying SOTA Image Pipeline...</span>
              </div>
            </div>

            <!-- Stage Bottom Toolbar (Zoom, Fit, View Modes) -->
            <div class="enhancer-stage-toolbar">
              <div class="btn-group">
                <button class="btn btn-xs btn-glass active" id="btnEnhanceZoomFit">Fit</button>
                <button class="btn btn-xs btn-glass" id="btnEnhanceZoom100">100%</button>
                <button class="btn btn-xs btn-glass" id="btnEnhanceZoom200">200% Loupe</button>
              </div>
              <div class="split-view-presets">
                <button class="btn btn-xs btn-glass" id="btnViewSplit">Split Wipe</button>
                <button class="btn btn-xs btn-glass" id="btnViewOriginal">Original Only</button>
                <button class="btn btn-xs btn-glass" id="btnViewEnhanced">Enhanced Only</button>
              </div>
            </div>
          </div>

          <!-- Controls Sidebar (Optimized & Simplified) -->
          <aside class="enhancer-sidebar">
            <!-- 1. Helpful Guide Card -->
            <div class="sidebar-section">
              <div class="enhancer-guide-card">
                <span class="guide-title">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Apple M5 GPU Active
                </span>
                <span class="guide-desc"><strong>AI Portrait & Face</strong> is selected by default — the gold standard for crystal-clear eyes, skin, and facial features.</span>
              </div>
            </div>

            <!-- 2. Clear, Purpose-Driven Enhancement Mode Cards -->
            <div class="sidebar-section">
              <label class="section-label">ENHANCEMENT MODE</label>
              <div class="enhancer-mode-cards">
                
                <!-- Mode 1: AI Face & Portrait (SOTA CodeFormer) - ACTIVE DEFAULT -->
                <div class="enhancer-mode-card active" data-engine-mode="face_sota">
                  <div class="mode-card-badge-row">
                    <span class="mode-recommended-badge">⭐ BEST FOR PEOPLE</span>
                    <span class="mode-speed-tag">~0.5s Fast</span>
                  </div>
                  <div class="mode-card-header">
                    <span class="mode-icon">👤</span>
                    <span class="mode-title">AI Portrait & Face (SOTA)</span>
                  </div>
                  <p class="mode-desc">CodeFormer VQ-GAN restores sharp eyes, pupils, eyelashes, teeth, and natural skin texture on blurred or low-res people.</p>
                </div>

                <!-- Mode 2: Studio Pro Stack (2x HD + Face Prior) -->
                <div class="enhancer-mode-card" data-engine-mode="studio_stack">
                  <div class="mode-card-badge-row">
                    <span class="mode-tag-subtle">FULL BODY & BACKGROUND</span>
                    <span class="mode-speed-tag">~0.8s Fast / Deep</span>
                  </div>
                  <div class="mode-card-header">
                    <span class="mode-icon">💎</span>
                    <span class="mode-title">Studio Pro Stack (2x HD)</span>
                  </div>
                  <p class="mode-desc">Full-frame 2x super-resolution combined with CodeFormer facial refinement. Best for wide and full-body shots.</p>
                </div>

                <!-- Mode 3: Natural Skin & Lighting (Fast CV) -->
                <div class="enhancer-mode-card" data-engine-mode="fast_cv">
                  <div class="mode-card-badge-row">
                    <span class="mode-tag-subtle">LIGHTWEIGHT</span>
                    <span class="mode-speed-tag">20ms Instant</span>
                  </div>
                  <div class="mode-card-header">
                    <span class="mode-icon">✨</span>
                    <span class="mode-title">Natural Skin & Lighting</span>
                  </div>
                  <p class="mode-desc">Edge-preserving skin softening and shadow lighting balance in your browser without neural network downloads.</p>
                </div>

              </div>
            </div>

            <!-- 3. Dynamic Mode Tuning (Clean & Simple) -->
            <div class="sidebar-section">
              <label class="section-label" id="lblModeTuning">ENHANCEMENT SETTINGS</label>
              
              <!-- Mode 1 Tuning: Simple Clarity Dial -->
              <div id="ctrlGroupFaceSota">
                <div class="tuning-slider-group">
                  <div class="slider-info">
                    <span class="control-name">Facial Detail & Clarity</span>
                    <span class="control-val" id="valFaceClarity">High Definition (Default)</span>
                  </div>
                  <input type="range" class="studio-range" id="sliderFaceClarity" min="1" max="3" value="2" />
                  <div class="slider-ticks-row">
                    <span>Natural</span>
                    <span class="active-tick">High Definition</span>
                    <span>Ultra Sharp</span>
                  </div>
                  <span class="control-desc" style="margin-top: 6px;">Balances between original facial identity and high-frequency codebook sharpness.</span>
                </div>
              </div>

              <!-- Mode 2 Tuning: Stack Engine & Upscale Factor -->
              <div id="ctrlGroupStudioStack" style="display: none;">
                <div class="tuning-slider-group">
                  <div class="slider-info">
                    <span class="control-name">Stack Engine</span>
                    <span class="control-val" id="valStackEngine">⚡ Fast HD (~0.8s)</span>
                  </div>
                  <div class="btn-group full-width mt-1" id="stackEngineBtns">
                    <button class="btn btn-xs btn-glass active" data-stack-engine="fast" title="High-order 2x scaling + CodeFormer SOTA face restoration (~0.8s)">⚡ Fast HD (~0.8s)</button>
                    <button class="btn btn-xs btn-glass" data-stack-engine="deep" title="36-layer Swin Transformer deep patch reconstruction (~2-3 min)">🚀 Deep SwinIR (~2-3m)</button>
                  </div>
                  <span class="control-desc" id="descStackEngine" style="margin-top: 6px;">⚡ Fast HD uses anti-aliased 2x upscaling with CodeFormer face restoration in &lt;1 second.</span>
                </div>

                <div class="tuning-slider-group" style="margin-top: 12px;">
                  <div class="slider-info">
                    <span class="control-name">Resolution Upscale</span>
                    <span class="control-val" id="valStackScale">2x HD</span>
                  </div>
                  <div class="btn-group full-width mt-1">
                    <button class="btn btn-xs btn-glass active" data-stack-scale="2">2x HD (Recommended)</button>
                    <button class="btn btn-xs btn-glass" data-stack-scale="4">4x Ultra</button>
                  </div>
                </div>
              </div>

              <!-- Mode 3 Tuning: Fast CV Presets -->
              <div id="ctrlGroupFastCv" style="display: none;">
                <div class="preset-grid">
                  <button class="preset-pill active" data-preset="studio">🌟 Balanced</button>
                  <button class="preset-pill" data-preset="deblur">🔍 Eye De-Blur</button>
                  <button class="preset-pill" data-preset="radiance">✨ Smooth Skin</button>
                </div>
                <span class="control-desc" style="margin-top: 6px;">Instant perceptual smoothing and CLAHE shadow lift.</span>
              </div>
            </div>

            <!-- 4. Advanced Settings & Disk Storage (Collapsed by default so it never overwhelms) -->
            <div class="sidebar-section accordion-section">
              <button class="accordion-toggle-btn" id="btnToggleAdvanced" type="button">
                <div class="toggle-btn-left">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span>Advanced Settings & Disk Storage</span>
                </div>
                <span class="accordion-arrow" id="advArrow">▾</span>
              </button>
              
              <div class="accordion-content" id="advancedContent" style="display: none;">
                <!-- Backend Status Card -->
                <div class="backend-status-card" id="backendStatusCard">
                  <div class="backend-status-header">
                    <span class="status-indicator" id="backendStatusDot"></span>
                    <span class="status-title" id="backendStatusTitle">Apple Silicon Metal (MPS)</span>
                    <span class="backend-badge" id="backendMemBadge">24GB Unified RAM</span>
                  </div>
                  <div class="backend-status-sub" id="backendStatusSub">Connected to http://localhost:8000</div>
                </div>

                <!-- Unified Model Weights Storage Card -->
                <div class="storage-card mt-2">
                  <div class="storage-path-row">
                    <span class="storage-label">Folder:</span>
                    <code class="storage-path" title="backend/models_storage">backend/models_storage/</code>
                    <span class="storage-badge-total ml-auto" id="storageTotalBadge">423 MB</span>
                  </div>
                  <div class="storage-file-list" id="storageFileList">
                    <div class="storage-file-item">
                      <span>codeformer.pth</span>
                      <span class="file-size">359 MB</span>
                    </div>
                    <div class="storage-file-item">
                      <span>swinir_realsr_x4.pth</span>
                      <span class="file-size">64 MB</span>
                    </div>
                    <div class="storage-file-item">
                      <span>face_detection_yunet.onnx</span>
                      <span class="file-size">0.2 MB</span>
                    </div>
                  </div>
                  <div class="storage-action-row">
                    <button class="btn btn-xs btn-danger" id="btnClearModelsStorage" title="Delete all model files in backend/models_storage to free disk space immediately">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      <span>Clear All Models</span>
                    </button>
                    <button class="btn btn-xs btn-glass" id="btnRefreshStorage">Refresh</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 5. Export Actions -->
            <div class="sidebar-actions">
              <button class="btn btn-primary btn-save-gallery full-width" id="btnSaveEnhancedToGallery">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                  <circle cx="9" cy="9" r="2"/>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </svg>
                <span>Save Enhanced to Gallery</span>
              </button>
              <div class="action-btn-row">
                <button class="btn btn-secondary half-width" id="btnDownloadEnhanced">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>Download PNG</span>
                </button>
                <button class="btn btn-secondary half-width" id="btnCopyEnhanced">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const modal = this.modal;

    // Close button
    modal.querySelector('#btnCloseEnhancer').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Mode Switching
    const modeCards = modal.querySelectorAll('.enhancer-mode-card');
    const ctrlGroupFaceSota = modal.querySelector('#ctrlGroupFaceSota');
    const ctrlGroupStudioStack = modal.querySelector('#ctrlGroupStudioStack');
    const ctrlGroupFastCv = modal.querySelector('#ctrlGroupFastCv');
    const badgeLabel = modal.querySelector('#badgeEngineLabel');
    const layerTagAfter = modal.querySelector('#layerTagAfter');

    const setMode = (modeKey) => {
      this.currentMode = modeKey;
      modeCards.forEach((c) => {
        if (c.dataset.engineMode === modeKey) c.classList.add('active');
        else c.classList.remove('active');
      });

      // Hide all control groups
      ctrlGroupFaceSota.style.display = 'none';
      ctrlGroupStudioStack.style.display = 'none';
      ctrlGroupFastCv.style.display = 'none';

      if (modeKey === 'face_sota') {
        this.activeEngine = 'pytorch';
        this.pytorchSettings.model = 'codeformer';
        this.pytorchSettings.scale = 1;
        ctrlGroupFaceSota.style.display = 'block';
        badgeLabel.textContent = 'AI PORTRAIT & FACE (SOTA)';
        layerTagAfter.textContent = '✨ SOTA FACE RESTORED';
        this.checkBackendHealth();
      } else if (modeKey === 'studio_stack') {
        this.activeEngine = 'pytorch';
        this.pytorchSettings.model = 'studio_stack';
        this.pytorchSettings.scale = 2;
        ctrlGroupStudioStack.style.display = 'block';
        badgeLabel.textContent = 'STUDIO PRO STACK (2x HD)';
        layerTagAfter.textContent = '✨ 2x HD STACK RESTORED';
        this.checkBackendHealth();
      } else if (modeKey === 'fast_cv') {
        this.activeEngine = 'cv';
        ctrlGroupFastCv.style.display = 'block';
        badgeLabel.textContent = 'NATURAL GLOW (INSTANT)';
        layerTagAfter.textContent = '✨ NATURAL GLOW';
      }

      this.triggerEnhancement();
    };

    modeCards.forEach((card) => {
      card.addEventListener('click', () => setMode(card.dataset.engineMode));
    });

    // Face SOTA Clarity Slider (1 = Natural w=0.8, 2 = High Definition w=0.6, 3 = Ultra Sharp w=0.3)
    const sliderFaceClarity = modal.querySelector('#sliderFaceClarity');
    const valFaceClarity = modal.querySelector('#valFaceClarity');
    if (sliderFaceClarity) {
      sliderFaceClarity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val === 1) {
          valFaceClarity.textContent = 'Natural (0.8)';
          this.pytorchSettings.fidelity = 0.8;
        } else if (val === 2) {
          valFaceClarity.textContent = 'High Definition (0.6)';
          this.pytorchSettings.fidelity = 0.6;
        } else {
          valFaceClarity.textContent = 'Ultra Sharp (0.3)';
          this.pytorchSettings.fidelity = 0.3;
        }
        this.scheduleEnhancement();
      });
    }

    // Studio Stack Engine Buttons (Fast HD vs Deep SwinIR)
    const stackEngineBtns = modal.querySelectorAll('#stackEngineBtns button[data-stack-engine]');
    const descStackEngine = modal.querySelector('#descStackEngine');
    const valStackEngine = modal.querySelector('#valStackEngine');
    stackEngineBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        stackEngineBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const engineType = btn.dataset.stackEngine;
        this.pytorchSettings.stackMode = engineType;
        if (engineType === 'fast') {
          if (valStackEngine) valStackEngine.textContent = '⚡ Fast HD (~0.8s)';
          if (descStackEngine) descStackEngine.textContent = '⚡ Fast HD uses anti-aliased 2x upscaling with CodeFormer face restoration in <1 second.';
        } else {
          if (valStackEngine) valStackEngine.textContent = '🚀 Deep SwinIR (~2-3m)';
          if (descStackEngine) descStackEngine.textContent = '🚀 Deep SwinIR: 36-layer Swin Transformer generating 14.7M pixels on Apple M5. Takes ~2-3 min.';
        }
        this.triggerEnhancement();
      });
    });

    // Studio Stack Scale Buttons (2x HD, 4x Ultra)
    const stackScaleBtns = modal.querySelectorAll('#ctrlGroupStudioStack button[data-stack-scale]');
    stackScaleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        stackScaleBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const scaleVal = parseInt(btn.dataset.stackScale, 10);
        this.pytorchSettings.scale = scaleVal;
        modal.querySelector('#valStackScale').textContent = `${scaleVal}x ${scaleVal === 2 ? 'HD' : 'Ultra'}`;
        this.triggerEnhancement();
      });
    });

    // Fast CV presets
    const fastCvPills = modal.querySelectorAll('#ctrlGroupFastCv .preset-pill');
    fastCvPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        fastCvPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const presetKey = pill.dataset.preset;
        const config = PortraitEnhancer.PRESETS[presetKey];
        if (config) {
          this.currentSettings = { ...config };
          this.triggerEnhancement();
        }
      });
    });

    // Toggle Advanced Accordion
    const btnToggleAdvanced = modal.querySelector('#btnToggleAdvanced');
    const advancedContent = modal.querySelector('#advancedContent');
    const advArrow = modal.querySelector('#advArrow');
    if (btnToggleAdvanced && advancedContent) {
      btnToggleAdvanced.addEventListener('click', () => {
        const isHidden = advancedContent.style.display === 'none';
        advancedContent.style.display = isHidden ? 'block' : 'none';
        if (advArrow) advArrow.textContent = isHidden ? '▴' : '▾';
      });
    }

    // Clear Models Storage
    const btnClearStorage = modal.querySelector('#btnClearModelsStorage');
    if (btnClearStorage) {
      btnClearStorage.addEventListener('click', () => this.clearModelsStorage());
    }

    const btnRefreshStorage = modal.querySelector('#btnRefreshStorage');
    if (btnRefreshStorage) {
      btnRefreshStorage.addEventListener('click', () => this.fetchModelStorage());
    }

    // Direct Image Import inside Modal
    const modalImageInput = modal.querySelector('#modalImageInput');
    const btnModalImport = modal.querySelector('#btnModalImportImage');
    if (btnModalImport && modalImageInput) {
      btnModalImport.addEventListener('click', () => modalImageInput.click());
      modalImageInput.addEventListener('change', (e) => {
        if (e.target.files?.length > 0) {
          this.openImageFile(e.target.files[0]);
          modalImageInput.value = '';
        }
      });
    }

    // Drag & Drop Image onto Enhancer Stage Viewport
    const viewport = modal.querySelector('#enhancerViewport');
    const dragOverlay = modal.querySelector('#enhancerDragOverlay');
    if (viewport && dragOverlay) {
      viewport.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragOverlay.style.display = 'flex';
      });

      viewport.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragOverlay.style.display = 'none';
      });

      viewport.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragOverlay.style.display = 'none';
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          this.openImageFile(files[0]);
        }
      });
    }

    // Split Divider Dragging & Direct Stage Click/Drag
    const splitContainer = modal.querySelector('#splitViewContainer');
    const divider = modal.querySelector('#splitDivider');
    let isDraggingDivider = false;

    const updateSplitPosition = (clientX) => {
      const rect = splitContainer.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0.001, Math.min(0.999, (clientX - rect.left) / rect.width));
      this.setSplitRatio(ratio);
    };

    divider.addEventListener('mousedown', (e) => {
      isDraggingDivider = true;
      e.preventDefault();
      e.stopPropagation();
    });

    divider.addEventListener('touchstart', (e) => {
      isDraggingDivider = true;
      if (e.touches && e.touches[0]) updateSplitPosition(e.touches[0].clientX);
    }, { passive: true });

    // When in 'fit' zoom, clicking or dragging anywhere on the stage smoothly updates the split wipe
    splitContainer.addEventListener('mousedown', (e) => {
      if (this.zoomLevel === 'fit') {
        isDraggingDivider = true;
        updateSplitPosition(e.clientX);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingDivider) {
        updateSplitPosition(e.clientX);
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (isDraggingDivider && e.touches && e.touches[0]) {
        updateSplitPosition(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener('mouseup', () => {
      if (isDraggingDivider) {
        isDraggingDivider = false;
      }
    });

    window.addEventListener('touchend', () => {
      if (isDraggingDivider) {
        isDraggingDivider = false;
      }
    });

    // View Modes
    modal.querySelector('#btnViewSplit').addEventListener('click', () => this.setSplitRatio(0.5));
    modal.querySelector('#btnViewOriginal').addEventListener('click', () => this.setSplitRatio(0.999));
    modal.querySelector('#btnViewEnhanced').addEventListener('click', () => this.setSplitRatio(0.001));

    // Zoom Controls
    const btnFit = modal.querySelector('#btnEnhanceZoomFit');
    const btn100 = modal.querySelector('#btnEnhanceZoom100');
    const btn200 = modal.querySelector('#btnEnhanceZoom200');

    const setZoom = (lvl) => {
      this.zoomLevel = lvl;
      [btnFit, btn100, btn200].forEach((b) => b.classList.remove('active'));
      const container = modal.querySelector('#splitViewContainer');

      if (lvl === 'fit') {
        btnFit.classList.add('active');
        container.style.transform = 'scale(1) translate(0px, 0px)';
        this.panX = 0;
        this.panY = 0;
      } else if (lvl === 1) {
        btn100.classList.add('active');
        container.style.transform = 'scale(1.4) translate(0px, 0px)';
      } else if (lvl === 2) {
        btn200.classList.add('active');
        container.style.transform = 'scale(2.2) translate(0px, 0px)';
      }
    };

    btnFit.addEventListener('click', () => setZoom('fit'));
    btn100.addEventListener('click', () => setZoom(1));
    btn200.addEventListener('click', () => setZoom(2));

    // Pan interaction when zoomed in
    viewport.addEventListener('mousedown', (e) => {
      if (this.zoomLevel === 'fit') return;
      if (e.target.closest('#splitDivider')) return;
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      const scale = this.zoomLevel === 1 ? 1.4 : 2.2;
      modal.querySelector('#splitViewContainer').style.transform = `scale(${scale}) translate(${this.panX / scale}px, ${this.panY / scale}px)`;
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        viewport.style.cursor = 'default';
      }
    });

    // Action: Save to Gallery
    modal.querySelector('#btnSaveEnhancedToGallery').addEventListener('click', () => {
      if (this.isProcessing) {
        this.showToast('Please wait for enhancement to complete...');
        return;
      }
      if (!this.enhancedResult || !this.currentFrame) {
        this.showToast('No enhanced frame to save yet.');
        return;
      }

      this.enhancedResult.isSaved = true;
      let tag = 'portrait_cv';
      if (this.activeEngine === 'pytorch') {
        if (this.pytorchSettings.model === 'codeformer') {
          tag = 'ai_portrait';
        } else if (this.pytorchSettings.stackMode === 'deep') {
          tag = 'swinir_deep';
        } else {
          tag = `fast_${this.pytorchSettings.scale}xhd`;
        }
      }

      const enhancedFrame = {
        ...this.currentFrame,
        id: 'enhanced_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        blob: this.enhancedResult.blob,
        url: this.enhancedResult.url,
        width: this.enhancedResult.width,
        height: this.enhancedResult.height,
        sizeBytes: this.enhancedResult.blob.size,
        filename: this.currentFrame.filename.replace(/\.[^/.]+$/, '') + `_${tag}.png`,
        format: `PNG (${tag.toUpperCase()})`,
        isEnhanced: true,
      };

      if (this.onSaveToGallery) {
        this.onSaveToGallery(enhancedFrame);
      }
      this.showToast('✨ Saved enhanced frame to gallery!');
      this.close();
    });

    // Action: Download
    modal.querySelector('#btnDownloadEnhanced').addEventListener('click', () => {
      if (this.isProcessing) {
        this.showToast('Please wait for enhancement to complete...');
        return;
      }
      if (!this.enhancedResult || !this.currentFrame) {
        this.showToast('No enhanced frame to download yet.');
        return;
      }

      let tag = 'portrait_cv';
      if (this.activeEngine === 'pytorch') {
        if (this.pytorchSettings.model === 'codeformer') {
          tag = 'ai_portrait';
        } else if (this.pytorchSettings.stackMode === 'deep') {
          tag = 'swinir_deep';
        } else {
          tag = `fast_${this.pytorchSettings.scale}xhd`;
        }
      }

      const a = document.createElement('a');
      a.href = this.enhancedResult.url;
      a.download = this.currentFrame.filename.replace(/\.[^/.]+$/, '') + `_${tag}.png`;
      a.click();
      this.showToast('Downloaded restored PNG!');
    });

    // Action: Copy
    modal.querySelector('#btnCopyEnhanced').addEventListener('click', async () => {
      if (!this.enhancedResult) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': this.enhancedResult.blob }),
        ]);
        this.showToast('Copied enhanced image to clipboard!');
      } catch (err) {
        this.showToast('Could not copy to clipboard: ' + err.message);
      }
    });

    // Paste Image from Clipboard into Enhancer
    window.addEventListener('paste', (e) => {
      if (this.modal.style.display !== 'none') {
        const items = e.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              const file = items[i].getAsFile();
              if (file) {
                this.openImageFile(file);
                this.showToast('Imported pasted image from clipboard!');
                break;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Directly open an imported Image File in the Enhancer Studio
   */
  async openImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.showToast('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const frameData = {
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      blob: file,
      url: url,
      width: img.naturalWidth,
      height: img.naturalHeight,
      filename: file.name,
      title: file.name,
      frameNumber: 'Photo',
      format: (file.type.replace('image/', '') || 'PNG').toUpperCase(),
      sizeBytes: file.size,
      createdAt: new Date(),
    };

    await this.open(frameData);
  }

  async checkBackendHealth() {
    const card = this.modal.querySelector('#backendStatusCard');
    const dot = this.modal.querySelector('#backendStatusDot');
    const title = this.modal.querySelector('#backendStatusTitle');
    const badge = this.modal.querySelector('#backendMemBadge');
    const sub = this.modal.querySelector('#backendStatusSub');

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost && window.location.protocol === 'https:') {
      this.backendOnline = false;
      if (card) card.classList.add('offline');
      if (dot) dot.classList.add('offline');
      if (title) title.textContent = 'Hosted Web Mode (In-Browser)';
      if (badge) badge.textContent = 'Client';
      if (sub) sub.textContent = 'Running 100% in-browser on Vercel. Run locally for Apple M5 GPU.';
      return false;
    }

    try {
      const resp = await fetch(`${this.backendBaseUrl}/api/health`, { signal: AbortSignal.timeout(2500) });
      if (resp.ok) {
        const data = await resp.json();
        this.backendOnline = true;
        if (card) card.classList.remove('offline');
        if (dot) dot.classList.remove('offline');
        if (title) title.textContent = `${data.device} • ${data.chip}`;
        if (badge) badge.textContent = `${data.unified_memory_gb}GB Unified RAM`;
        if (sub) sub.textContent = `Connected to ${this.backendBaseUrl}`;
        await this.fetchModelStorage();
        return true;
      }
    } catch (e) {
      this.backendOnline = false;
      if (card) card.classList.add('offline');
      if (dot) dot.classList.add('offline');
      if (title) title.textContent = 'PyTorch Backend Offline';
      if (badge) badge.textContent = 'Offline';
      if (sub) sub.textContent = 'Run "python3 -m backend.server" to enable GPU acceleration';
      return false;
    }
  }

  async fetchModelStorage() {
    try {
      const resp = await fetch(`${this.backendBaseUrl}/api/models`);
      if (!resp.ok) return;
      const data = await resp.json();
      this.modelsStorage = data;

      const totalBadge = this.modal.querySelector('#storageTotalBadge');
      if (totalBadge) totalBadge.textContent = `${data.total_storage_mb} MB`;

      const listContainer = this.modal.querySelector('#storageFileList');
      if (listContainer) {
        listContainer.innerHTML = data.models
          .map(
            (m) => `
          <div class="storage-file-item">
            <span>${m.filename}</span>
            <span class="file-size">${m.installed ? `${m.size_mb} MB` : '<span style="color:#ef4444">Not installed</span>'}</span>
          </div>
        `
          )
          .join('');
      }
    } catch (e) {
      console.warn('Could not fetch model storage info:', e);
    }
  }

  async clearModelsStorage() {
    if (!confirm('Are you sure you want to delete all model weights in backend/models_storage/ to immediately free disk space?')) {
      return;
    }
    try {
      const resp = await fetch(`${this.backendBaseUrl}/api/models/clear`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (data.status === 'success') {
        this.showToast(`🗑️ Freed ${data.freed_mb} MB from backend/models_storage/`);
        await this.fetchModelStorage();
      }
    } catch (err) {
      this.showToast('Failed to clear models storage: ' + err.message);
    }
  }

  setSplitRatio(ratio) {
    this.splitRatio = ratio;
    const divider = this.modal.querySelector('#splitDivider');
    const layerAfter = this.modal.querySelector('#layerAfter');
    const pct = ratio * 100;

    divider.style.left = `${pct}%`;
    layerAfter.style.clipPath = `polygon(${pct}% 0%, 100% 0%, 100% 100%, ${pct}% 100%)`;
  }

  scheduleEnhancement() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.triggerEnhancement();
    }, 120);
  }

  async open(frameData) {
    this.currentFrame = frameData;
    const titleLabel = frameData.title || (typeof frameData.frameNumber === 'number' ? `Frame #${frameData.frameNumber}` : (frameData.frameNumber || 'Photo'));
    this.modal.querySelector('#enhancerFrameTitle').textContent = `Enhancement Studio — ${titleLabel}`;

    const imgBefore = this.modal.querySelector('#imgBefore');
    const imgAfter = this.modal.querySelector('#imgAfter');

    imgBefore.src = frameData.url;
    imgAfter.src = frameData.url;

    // Reset split ratio to 50%
    this.setSplitRatio(0.5);

    // Show modal
    this.modal.style.display = 'flex';

    // Check backend health & fetch storage info
    await this.checkBackendHealth();

    // Run enhancement with default SOTA Face mode
    await this.triggerEnhancement();
  }

  close() {
    this.modal.style.display = 'none';
    this.currentFrame = null;
  }

  async triggerEnhancement() {
    if (!this.currentFrame) return;
    if (this.isProcessing) {
      this.pendingEnhancement = true;
      return;
    }
    this.isProcessing = true;
    this.pendingEnhancement = false;

    const loader = this.modal.querySelector('#enhancerLoader');
    const loaderText = this.modal.querySelector('#loaderText');
    const btnSave = this.modal.querySelector('#btnSaveEnhancedToGallery');
    const btnDownload = this.modal.querySelector('#btnDownloadEnhanced');
    const btnCopy = this.modal.querySelector('#btnCopyEnhanced');

    loader.style.display = 'flex';
    if (btnSave) btnSave.disabled = true;
    if (btnDownload) btnDownload.disabled = true;
    if (btnCopy) btnCopy.disabled = true;

    // Ensure source image is loaded in Image element
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';

    await new Promise((resolve) => {
      tempImg.onload = resolve;
      tempImg.src = this.currentFrame.url;
    });

    let timerInterval = null;
    const reqStartTime = performance.now();

    try {
      let res;
      if (this.activeEngine === 'pytorch') {
        if (!this.backendOnline) {
          const isOnline = await this.checkBackendHealth();
          if (!isOnline) {
            this.showToast('Using in-browser Natural Skin & Lighting...');
            res = await this.enhancer.enhance(tempImg, this.currentSettings);
            this.enhancedResult = res;
            this.modal.querySelector('#imgAfter').src = res.url;
            return;
          }
        }

        const isDeepSwinIR = this.pytorchSettings.model === 'studio_stack' && this.pytorchSettings.stackMode === 'deep';
        if (isDeepSwinIR) {
          loaderText.textContent = 'Processing 36-Layer SwinIR Transformer on Apple M5 GPU... (~2-3 min)';
          timerInterval = setInterval(() => {
            const sec = Math.floor((performance.now() - reqStartTime) / 1000);
            const m = Math.floor(sec / 60);
            const s = String(sec % 60).padStart(2, '0');
            loaderText.textContent = `Running SwinIR Transformer on Apple M5 (${m}:${s} elapsed / ~2-3 min)...`;
          }, 1000);
        } else if (this.pytorchSettings.model === 'studio_stack') {
          loaderText.textContent = `Applying Fast ${this.pytorchSettings.scale}x HD Stack + CodeFormer on Apple M5 MPS...`;
        } else {
          loaderText.textContent = 'Restoring facial features with CodeFormer SOTA on Apple M5 MPS...';
        }

        // Get Blob
        let blob = this.currentFrame.blob;
        if (!blob) {
          const resp = await fetch(this.currentFrame.url);
          blob = await resp.blob();
        }

        const formData = new FormData();
        formData.append('file', blob, 'frame.png');
        formData.append('model', this.pytorchSettings.model);
        formData.append('fidelity', this.pytorchSettings.fidelity);
        formData.append('scale', this.pytorchSettings.scale);
        formData.append('stack_mode', this.pytorchSettings.stackMode || 'fast');

        const startTime = performance.now();
        const apiResp = await fetch(`${this.backendBaseUrl}/api/enhance`, {
          method: 'POST',
          body: formData,
        });

        if (!apiResp.ok) {
          const errData = await apiResp.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error (${apiResp.status})`);
        }

        const durationHeader = apiResp.headers.get('X-Duration-Ms');
        const facesHeader = apiResp.headers.get('X-Faces-Detected') || '0';
        const modelHeader = apiResp.headers.get('X-Model-Used') || this.pytorchSettings.model;
        const deviceHeader = apiResp.headers.get('X-Device') || 'mps';

        const outBlob = await apiResp.blob();
        const outUrl = URL.createObjectURL(outBlob);

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = outUrl;
        });

        const elapsed = durationHeader ? parseInt(durationHeader, 10) : Math.round(performance.now() - startTime);

        res = {
          blob: outBlob,
          url: outUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          stats: {
            durationMs: elapsed,
            facesDetected: facesHeader,
            model: modelHeader,
            device: deviceHeader,
          },
        };

        this.modal.querySelector('#statDuration').textContent = `${elapsed}ms`;
        this.modal.querySelector('#statSkin').textContent = `Faces: ${facesHeader}`;
        this.modal.querySelector('#statRes').textContent = `${img.naturalWidth} × ${img.naturalHeight} • Apple M5`;
      } else {
        loaderText.textContent = 'Applying Natural Skin & Lighting...';
        res = await this.enhancer.enhance(tempImg, this.currentSettings);

        this.modal.querySelector('#statDuration').textContent = `${res.stats.durationMs}ms`;
        this.modal.querySelector('#statSkin').textContent = `Skin: ${res.stats.skinCoveragePercent}%`;
        this.modal.querySelector('#statRes').textContent = `${res.width} × ${res.height}`;
      }

      // Revoke previous intermediate blob URL to prevent memory leaks
      if (this.enhancedResult?.url && this.enhancedResult.url !== this.currentFrame.url && !this.enhancedResult.isSaved) {
        try {
          URL.revokeObjectURL(this.enhancedResult.url);
        } catch (e) {
          // ignore
        }
      }

      this.enhancedResult = res;

      // Update after layer
      const imgAfter = this.modal.querySelector('#imgAfter');
      imgAfter.src = res.url;
    } catch (err) {
      console.error('Enhancement error:', err);
      this.showToast('Enhancement error: ' + err.message);
    } finally {
      if (timerInterval) clearInterval(timerInterval);
      loader.style.display = 'none';
      this.isProcessing = false;
      if (btnSave) btnSave.disabled = false;
      if (btnDownload) btnDownload.disabled = false;
      if (btnCopy) btnCopy.disabled = false;

      // If user toggled settings or modes while enhancement was processing, rerun immediately
      if (this.pendingEnhancement) {
        this.pendingEnhancement = false;
        this.scheduleEnhancement();
      }
    }
  }
}
