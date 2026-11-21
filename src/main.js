/**
 * Frame Grab — Application Orchestrator
 * Connects video engine, lossless frame extractor, gallery, timeline scrubber, and UI controls.
 */

import './style.css';
import { VideoEngine } from './js/videoEngine.js';
import { FrameExtractor } from './js/frameExtractor.js';
import { GalleryManager } from './js/gallery.js';
import { ShortcutsManager } from './js/shortcuts.js';
import { EnhancerModal } from './js/enhancerModal.js';
import { MediaLibraryManager } from './js/mediaLibrary.js';
import { CropController } from './js/cropController.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const video = document.getElementById('mainVideo');
  const viewport = document.getElementById('videoViewport');
  const dropZone = document.getElementById('dropZone');
  const videoContainer = document.getElementById('videoContainer');
  const offscreenCanvas = document.getElementById('offscreenExtractCanvas');
  const videoFileInput = document.getElementById('videoFileInput');
  const folderFileInput = document.getElementById('folderFileInput');
  const mainPhoto = document.getElementById('mainPhoto');
  const studioConsole = document.getElementById('studioConsole');
  const btnImportFolder = document.getElementById('btnImportFolder');
  const btnDropFolder = document.getElementById('btnDropFolder');
  const btnToggleMediaLibrary = document.getElementById('btnToggleMediaLibrary');
  const mediaCountBadge = document.getElementById('mediaCountBadge');
  const mediaLibraryCountBadge = document.getElementById('mediaLibraryCountBadge');

  // Active Media State ('video' | 'photo')
  let activeMediaType = 'video';
  let currentPhotoFile = null;
  let currentPhotoUrl = null;

  // Metadata Bar
  const videoMetaBar = document.getElementById('videoMetaBar');
  const metaFileNameText = document.getElementById('metaFileNameText');
  const metaResolution = document.getElementById('metaResolution');
  const fpsSelect = document.getElementById('fpsSelect');

  // Transport & Action Buttons
  const btnPlayPause = document.getElementById('btnPlayPause');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const btnStepBack1 = document.getElementById('btnStepBack1');
  const btnStepForward1 = document.getElementById('btnStepForward1');
  const btnStepBack10 = document.getElementById('btnStepBack10');
  const btnStepForward10 = document.getElementById('btnStepForward10');
  const btnJumpStart = document.getElementById('btnJumpStart');
  const btnJumpEnd = document.getElementById('btnJumpEnd');
  const speedSelect = document.getElementById('speedSelect');

  // Timecodes & Counters
  const tcDisplay = document.getElementById('tcDisplay');
  const frameCurrent = document.getElementById('frameCurrent');
  const frameTotal = document.getElementById('frameTotal');
  const timeCurrent = document.getElementById('timeCurrent');
  const timeTotal = document.getElementById('timeTotal');

  // Timeline & Scrubber
  const timelineTrack = document.getElementById('timelineTrack');
  const timelineProgress = document.getElementById('timelineProgress');
  const timelinePlayhead = document.getElementById('timelinePlayhead');
  const timelineBuffer = document.getElementById('timelineBuffer');
  const timelineRange = document.getElementById('timelineRange');
  const timelineHover = document.getElementById('timelineHover');
  const timelineHoverText = document.getElementById('timelineHoverText');

  // In / Out Range
  const btnMarkIn = document.getElementById('btnMarkIn');
  const btnMarkOut = document.getElementById('btnMarkOut');
  const btnClearRange = document.getElementById('btnClearRange');
  const rangeInText = document.getElementById('rangeInText');
  const rangeOutText = document.getElementById('rangeOutText');
  const rangeBadgeIn = document.getElementById('rangeBadgeIn');
  const rangeBadgeOut = document.getElementById('rangeBadgeOut');

  // Hero Extraction
  const btnCaptureFrame = document.getElementById('btnCaptureFrame');
  const btnCopyFrame = document.getElementById('btnCopyFrame');
  const btnBatchExtract = document.getElementById('btnBatchExtract');
  const btnGrabAndEnhance = document.getElementById('btnGrabAndEnhance');

  // Gallery Elements
  const galleryDrawer = document.getElementById('galleryDrawer');
  const btnToggleGallery = document.getElementById('btnToggleGallery');
  const galleryList = document.getElementById('galleryList');
  const galleryCountBadge = document.getElementById('galleryCountBadge');
  const drawerCountBadge = document.getElementById('drawerCountBadge');
  const galleryEmpty = document.getElementById('galleryEmpty');
  const btnDownloadAllZip = document.getElementById('btnDownloadAllZip');
  const btnClearGallery = document.getElementById('btnClearGallery');

  // Zoom Toolbar
  const btnZoomFit = document.getElementById('btnZoomFit');
  const btnZoom100 = document.getElementById('btnZoom100');
  const btnZoom200 = document.getElementById('btnZoom200');
  const btnZoom400 = document.getElementById('btnZoom400');
  const btnZoom800 = document.getElementById('btnZoom800');
  const btnZoom1600 = document.getElementById('btnZoom1600');
  const zoomBadge = document.getElementById('zoomBadge');
  const panHint = document.getElementById('panHint');

  // Modals
  const modalShortcuts = document.getElementById('modalShortcuts');
  const btnShortcuts = document.getElementById('btnShortcuts');
  const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');

  const modalSettings = document.getElementById('modalSettings');
  const btnSettings = document.getElementById('btnSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const settingImageFormat = document.getElementById('settingImageFormat');
  const settingFilenamePattern = document.getElementById('settingFilenamePattern');
  const settingAutoDownload = document.getElementById('settingAutoDownload');

  const modalBatch = document.getElementById('modalBatch');
  const btnCloseBatch = document.getElementById('btnCloseBatch');
  const btnCancelBatch = document.getElementById('btnCancelBatch');
  const btnStartBatch = document.getElementById('btnStartBatch');
  const batchRangeIn = document.getElementById('batchRangeIn');
  const batchRangeOut = document.getElementById('batchRangeOut');
  const batchIntervalSelect = document.getElementById('batchIntervalSelect');
  const batchEstimatedCount = document.getElementById('batchEstimatedCount');
  const batchProgressBox = document.getElementById('batchProgressBox');
  const batchProgressBar = document.getElementById('batchProgressBar');
  const batchProgressText = document.getElementById('batchProgressText');
  const batchProgressPercent = document.getElementById('batchProgressPercent');

  const modalInspect = document.getElementById('modalInspect');

  // UI Toast Helper
  const showToast = (message, type = 'info') => {
    const toast = document.getElementById('stageToast');
    if (toast) {
      let icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      if (type === 'warning') {
        icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      } else if (type === 'error') {
        icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      }
      toast.innerHTML = `${icon} <span>${message}</span>`;
      toast.className = `stage-toast show ${type !== 'info' ? `toast-${type}` : ''}`;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
    }
  };

  // Instantiate Enhancer Studio
  let gallery;
  const enhancerModal = new EnhancerModal({
    onSaveToGallery: (enhancedFrame) => {
      gallery.addFrame(enhancedFrame);
      if (galleryDrawer) {
        galleryDrawer.classList.remove('collapsed');
        if (btnToggleGallery) btnToggleGallery.classList.add('active');
      }
    },
    showToast,
  });

  // Instantiate Modules
  const engine = new VideoEngine(video, viewport);
  const extractor = new FrameExtractor(engine, offscreenCanvas);
  gallery = new GalleryManager({
    listContainer: galleryList,
    countBadges: [galleryCountBadge, drawerCountBadge],
    emptyState: galleryEmpty,
    zipButton: btnDownloadAllZip,
    clearButton: btnClearGallery,
    inspectModal: modalInspect,
    onEnhance: (frame) => {
      enhancerModal.open(frame);
    },
    showToast,
  });

  // Media Loaders (Photos & Videos)
  const loadPhoto = async (file, name) => {
    activeMediaType = 'photo';
    engine.activeMediaType = 'photo';
    currentPhotoFile = file;

    engine.pause();
    engine.resetRotation();
    engine.clearCrop();

    if (currentPhotoUrl) {
      URL.revokeObjectURL(currentPhotoUrl);
    }
    currentPhotoUrl = URL.createObjectURL(file);

    video.style.display = 'none';
    mainPhoto.style.display = 'block';
    mainPhoto.src = currentPhotoUrl;

    dropZone.style.display = 'none';
    videoContainer.style.display = 'flex';
    videoMetaBar.style.display = 'flex';
    if (studioConsole) studioConsole.style.display = 'flex';
    metaFileNameText.textContent = name || file.name;

    await new Promise((resolve) => {
      if (mainPhoto.complete && mainPhoto.naturalWidth > 0) {
        resolve();
      } else {
        mainPhoto.onload = resolve;
        mainPhoto.onerror = () => {
          showToast('Could not display image format in browser.', 'error');
          resolve();
        };
      }
    });

    updateResolutionDisplay();
    fpsSelect.parentElement.style.opacity = '0.35';

    // Adapt action controls for static photo
    const timelineContainer = document.querySelector('.timeline-container');
    if (timelineContainer) timelineContainer.style.display = 'none';
    const transportCenter = document.querySelector('.transport-center');
    if (transportCenter) transportCenter.style.display = 'none';
    const transportSubgroup = document.querySelector('.transport-subgroup');
    if (transportSubgroup) transportSubgroup.style.display = 'none';

    const captureLabel = btnCaptureFrame.querySelector('span:not(.key-pill)');
    if (captureLabel) captureLabel.textContent = 'Save Photo';
    const enhanceLabel = btnGrabAndEnhance.querySelector('span');
    if (enhanceLabel) enhanceLabel.textContent = 'Enhance Photo';
    btnBatchExtract.style.display = 'none';

    tcDisplay.textContent = 'PHOTO';
    frameCurrent.textContent = '1';
    frameTotal.textContent = '1';

    showToast(`Viewing photo: ${file.name}`);
  };

  const loadVideo = (file, name) => {
    activeMediaType = 'video';
    engine.activeMediaType = 'video';
    currentPhotoFile = null;
    engine.resetRotation();
    engine.clearCrop();

    mainPhoto.style.display = 'none';
    video.style.display = 'block';
    fpsSelect.parentElement.style.opacity = '1';

    // Restore controls for video
    const timelineContainer = document.querySelector('.timeline-container');
    if (timelineContainer) timelineContainer.style.display = 'block';
    const transportCenter = document.querySelector('.transport-center');
    if (transportCenter) transportCenter.style.display = 'flex';
    const transportSubgroup = document.querySelector('.transport-subgroup');
    if (transportSubgroup) transportSubgroup.style.display = 'flex';

    const captureLabel = btnCaptureFrame.querySelector('span:not(.key-pill)');
    if (captureLabel) captureLabel.textContent = 'Capture Frame';
    const enhanceLabel = btnGrabAndEnhance.querySelector('span');
    if (enhanceLabel) enhanceLabel.textContent = 'Enhance';
    btnBatchExtract.style.display = 'inline-flex';

    if (!file) return;
    dropZone.style.display = 'none';
    videoContainer.style.display = 'flex';
    videoMetaBar.style.display = 'flex';
    if (studioConsole) studioConsole.style.display = 'flex';
    metaFileNameText.textContent = name || file.name;
    engine.loadVideoSource(file, name || file.name);
    showToast(`Loaded ${name || file.name}`);
  };

  const isImageFile = (file) => {
    return !!file && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|bmp|tiff?|heic|heif)$/i.test(file.name));
  };

  const handleMediaFile = async (file, name) => {
    if (!file) return;
    if (isImageFile(file)) {
      await loadPhoto(file, name || file.name);
    } else {
      loadVideo(file, name || file.name);
    }
  };

  // Instantiate Media Library Manager (Folder Explorer)
  const mediaLibrary = new MediaLibraryManager({
    drawerElement: document.getElementById('mediaDrawer'),
    listContainer: document.getElementById('mediaList'),
    titleElement: document.getElementById('mediaFolderTitle'),
    countBadges: [mediaCountBadge, mediaLibraryCountBadge],
    mediaNavIndex: document.getElementById('mediaNavIndex'),
    toggleButton: btnToggleMediaLibrary,
    onSelectVideo: (file, name) => loadVideo(file, name),
    onSelectPhoto: (file, name) => loadPhoto(file, name),
    showToast,
  });

  // Recursive directory scanner for folder drop
  async function scanEntryRecursive(entry) {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => entry.file((f) => resolve([f])));
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const all = [];
      const readBatch = () => {
        return new Promise((resolve, reject) => {
          dirReader.readEntries((entries) => {
            if (entries.length === 0) resolve(all);
            else {
              all.push(...entries);
              readBatch().then(resolve, reject);
            }
          }, reject);
        });
      };
      try {
        const childEntries = await readBatch();
        const files = [];
        for (const child of childEntries) {
          const subFiles = await scanEntryRecursive(child);
          files.push(...subFiles);
        }
        return files;
      } catch (err) {
        return [];
      }
    }
    return [];
  }

  // Drag & Drop
  ['dragenter', 'dragover'].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  window.addEventListener('drop', async (e) => {
    // If drop occurred inside enhancer modal, that is handled by enhancerModal's drop listener
    if (document.getElementById('modalEnhancer')?.style.display !== 'none') {
      return;
    }

    const items = e.dataTransfer?.items;
    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
      const allFiles = [];
      let rootFolderName = '';
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory && !rootFolderName) {
            rootFolderName = entry.name;
          }
          const files = await scanEntryRecursive(entry);
          allFiles.push(...files);
        }
      }

      if (allFiles.length > 1 || rootFolderName) {
        await mediaLibrary.loadFiles(allFiles, rootFolderName || 'Dropped Folder');
        if (btnToggleMediaLibrary) btnToggleMediaLibrary.style.display = 'inline-flex';
        return;
      }
      if (allFiles.length === 1) {
        await handleMediaFile(allFiles[0], allFiles[0].name);
        return;
      }
    }

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      if (files.length > 1) {
        await mediaLibrary.loadFiles(Array.from(files), 'Dropped Media');
        if (btnToggleMediaLibrary) btnToggleMediaLibrary.style.display = 'inline-flex';
      } else {
        const file = files[0];
        if (isImageFile(file) || file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv|ogg|avi|m4v)$/i)) {
          await handleMediaFile(file, file.name);
        } else {
          showToast('Please drop a valid video or image file.', 'warning');
        }
      }
    }
  });

  // Folder File Picker
  const openFolderPicker = () => folderFileInput?.click();
  if (btnImportFolder) btnImportFolder.addEventListener('click', openFolderPicker);
  if (btnDropFolder) btnDropFolder.addEventListener('click', openFolderPicker);

  if (folderFileInput) {
    folderFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        const folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'Selected Folder';
        await mediaLibrary.loadFiles(files, folderName);
        if (btnToggleMediaLibrary) btnToggleMediaLibrary.style.display = 'inline-flex';
      }
      folderFileInput.value = '';
    });
  }

  if (btnToggleMediaLibrary) {
    btnToggleMediaLibrary.addEventListener('click', () => {
      mediaLibrary.toggleDrawer();
    });
  }

  // Unified Media File Picker (Videos & Photos)
  const openFilePicker = () => videoFileInput.click();
  document.getElementById('btnImportVideo').addEventListener('click', openFilePicker);
  document.getElementById('btnDropBrowse').addEventListener('click', openFilePicker);
  videoFileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 1) {
      await handleMediaFile(files[0]);
    } else if (files.length > 1) {
      await mediaLibrary.loadFiles(files, 'Imported Media');
      if (btnToggleMediaLibrary) btnToggleMediaLibrary.style.display = 'inline-flex';
    }
    videoFileInput.value = '';
  });

  // Direct Image File Picker for AI Enhancer
  const imageFileInput = document.getElementById('imageFileInput');
  const openImagePicker = () => imageFileInput?.click();
  const btnImportImage = document.getElementById('btnImportImage');
  const btnDropEnhanceImage = document.getElementById('btnDropEnhanceImage');
  if (btnImportImage) btnImportImage.addEventListener('click', openImagePicker);
  if (btnDropEnhanceImage) btnDropEnhanceImage.addEventListener('click', openImagePicker);
  if (imageFileInput) {
    imageFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 1) {
        await loadPhoto(files[0], files[0].name);
        await enhancerModal.openImageFile(files[0]);
      } else if (files.length > 1) {
        await mediaLibrary.loadFiles(files, 'Imported Photos');
        if (btnToggleMediaLibrary) btnToggleMediaLibrary.style.display = 'inline-flex';
      }
      imageFileInput.value = '';
    });
  }

  // Global Paste Image listener
  window.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            await loadPhoto(file, 'Pasted Photo ' + new Date().toLocaleTimeString());
            showToast('Pasted image imported to stage!');
            break;
          }
        }
      }
    }
  });

  // Resolution & Transform State Display
  const updateResolutionDisplay = () => {
    const isPhoto = activeMediaType === 'photo';
    const dims = engine.getEffectiveDimensions();
    const isRot = engine.rotation !== 0;
    const isCrop = !!engine.crop;

    let label = `${dims.width} × ${dims.height}`;
    if (isPhoto) label += ' (Photo)';
    if (isRot) label += ` • ${engine.rotation}°`;
    if (engine.flipH) label += ' • Flip H';
    if (engine.flipV) label += ' • Flip V';
    if (isCrop) {
      const ratioStr = engine.crop.ratio ? engine.crop.ratio.toUpperCase() : 'CROP';
      label += ` • [${ratioStr}]`;
    }
    metaResolution.textContent = label;
  };

  // Rotate & Flip Controls
  const btnRotateCW = document.getElementById('btnRotateCW');
  const btnRotateCCW = document.getElementById('btnRotateCCW');
  const btnFlipH = document.getElementById('btnFlipH');
  const btnResetRotate = document.getElementById('btnResetRotate');

  if (btnRotateCW) {
    btnRotateCW.addEventListener('click', () => {
      engine.rotateCW();
      showToast(`Rotated to ${engine.rotation}°`);
    });
  }
  if (btnRotateCCW) {
    btnRotateCCW.addEventListener('click', () => {
      engine.rotateCCW();
      showToast(`Rotated to ${engine.rotation}°`);
    });
  }
  if (btnFlipH) {
    btnFlipH.addEventListener('click', () => {
      engine.toggleFlipH();
      showToast(engine.flipH ? 'Mirrored horizontally' : 'Mirror reset');
    });
  }
  if (btnResetRotate) {
    btnResetRotate.addEventListener('click', () => {
      engine.resetRotation();
      showToast('Reset rotation & mirror');
    });
  }

  // Crop Controller & UI
  const cropOverlay = document.getElementById('cropOverlay');
  const cropControlBar = document.getElementById('cropControlBar');
  const btnToggleCrop = document.getElementById('btnToggleCrop');
  const btnCropLabel = document.getElementById('btnCropLabel');
  const cropActiveDot = document.getElementById('cropActiveDot');

  const cropController = new CropController({
    viewportElement: viewport,
    overlayElement: cropOverlay,
    controlBarElement: cropControlBar,
    targetGetter: () => (activeMediaType === 'photo' ? mainPhoto : video),
    engine,
    onCropChange: () => {
      updateResolutionDisplay();
    },
    showToast,
  });

  if (btnToggleCrop) {
    btnToggleCrop.addEventListener('click', () => {
      cropController.toggle();
    });
  }

  engine.on('cropchange', (crop) => {
    if (!crop && (cropController.isActive || cropController.isFramingMode)) {
      cropController.clearCrop();
    }
  });

  engine.on('transformchange', () => {
    updateResolutionDisplay();
    if (btnResetRotate) {
      btnResetRotate.style.display = (engine.rotation !== 0 || engine.flipH || engine.flipV) ? 'inline-flex' : 'none';
    }
    if (cropActiveDot && btnCropLabel) {
      cropActiveDot.style.display = engine.crop ? 'inline-block' : 'none';
      btnToggleCrop.classList.toggle('active', !!engine.crop);
      btnCropLabel.textContent = engine.crop ? `✂️ [${(engine.crop.ratio || 'Crop').toUpperCase()}]` : '✂️ Crop';
    }
  });

  // Engine Event Listeners
  engine.on('loaded', ({ width, height, fps, totalFrames }) => {
    updateResolutionDisplay();
    frameTotal.textContent = totalFrames;
    if (fpsSelect.querySelector(`option[value="${fps}"]`)) {
      fpsSelect.value = String(fps);
    }
  });

  engine.on('fpsdetected', (detected) => {
    if (fpsSelect.querySelector(`option[value="${detected}"]`)) {
      fpsSelect.value = String(detected);
    }
    showToast(`Detected framerate: ${detected} FPS`);
  });

  engine.on('fpschange', ({ totalFrames }) => {
    frameTotal.textContent = totalFrames;
  });

  engine.on('timeupdate', ({ currentTime, currentFrame, totalFrames, smpte, timeFormatted, durationFormatted, paused, progress }) => {
    tcDisplay.textContent = smpte;
    frameCurrent.textContent = currentFrame;
    frameTotal.textContent = totalFrames;
    timeCurrent.textContent = timeFormatted;
    timeTotal.textContent = durationFormatted;

    // Timeline progress & playhead
    const pct = progress * 100;
    timelineProgress.style.width = `${pct}%`;
    timelinePlayhead.style.left = `${pct}%`;

    // Play/Pause icon
    if (paused) {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    } else {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    }
  });

  engine.on('play', () => {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  });

  engine.on('pause', () => {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  });

  engine.on('progress', (bufferedRatio) => {
    timelineBuffer.style.width = `${bufferedRatio * 100}%`;
  });

  engine.on('rangechange', ({ inPoint, outPoint }) => {
    const hasRange = inPoint !== null || outPoint !== null;
    btnClearRange.style.display = hasRange ? 'inline-flex' : 'none';

    if (inPoint !== null) {
      rangeBadgeIn.classList.add('active');
      rangeInText.textContent = engine.formatSMPTE(inPoint, engine.fps);
      document.getElementById('markerIn').style.display = 'block';
      document.getElementById('markerIn').style.left = `${(inPoint / engine.duration) * 100}%`;
    } else {
      rangeBadgeIn.classList.remove('active');
      rangeInText.textContent = '--:--:--:--';
      document.getElementById('markerIn').style.display = 'none';
    }

    if (outPoint !== null) {
      rangeBadgeOut.classList.add('active');
      rangeOutText.textContent = engine.formatSMPTE(outPoint, engine.fps);
      document.getElementById('markerOut').style.display = 'block';
      document.getElementById('markerOut').style.left = `${(outPoint / engine.duration) * 100}%`;
    } else {
      rangeBadgeOut.classList.remove('active');
      rangeOutText.textContent = '--:--:--:--';
      document.getElementById('markerOut').style.display = 'none';
    }

    // Range highlight overlay on timeline
    if (inPoint !== null && outPoint !== null && engine.duration > 0) {
      const leftPct = (Math.min(inPoint, outPoint) / engine.duration) * 100;
      const widthPct = (Math.abs(outPoint - inPoint) / engine.duration) * 100;
      timelineRange.style.display = 'block';
      timelineRange.style.left = `${leftPct}%`;
      timelineRange.style.width = `${widthPct}%`;
    } else {
      timelineRange.style.display = 'none';
    }
  });

  // Transport Controls
  btnPlayPause.addEventListener('click', () => engine.togglePlay());
  btnStepBack1.addEventListener('click', () => engine.stepFrame(-1));
  btnStepForward1.addEventListener('click', () => engine.stepFrame(1));
  btnStepBack10.addEventListener('click', () => engine.stepFrame(-10));
  btnStepForward10.addEventListener('click', () => engine.stepFrame(10));
  btnJumpStart.addEventListener('click', () => engine.jumpToStart());
  btnJumpEnd.addEventListener('click', () => engine.jumpToEnd());

  speedSelect.addEventListener('change', (e) => {
    engine.setPlaybackRate(e.target.value);
  });

  fpsSelect.addEventListener('change', (e) => {
    if (e.target.value !== 'auto') {
      engine.setFps(e.target.value);
    } else {
      engine.detectFramerate();
    }
  });

  // Range controls
  btnMarkIn.addEventListener('click', () => engine.setMarkIn());
  btnMarkOut.addEventListener('click', () => engine.setMarkOut());
  btnClearRange.addEventListener('click', () => engine.clearRange());

  // Timeline Scrubber Interaction
  let isScrubbing = false;

  const seekFromEvent = (e) => {
    const rect = timelineTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    engine.seekToRatio(ratio);
  };

  timelineTrack.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    engine.pause();
    seekFromEvent(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) {
      seekFromEvent(e);
    }
  });

  window.addEventListener('mouseup', () => {
    if (isScrubbing) {
      isScrubbing = false;
    }
  });

  // Timeline Hover Tooltip
  timelineTrack.addEventListener('mousemove', (e) => {
    if (engine.duration <= 0) return;
    const rect = timelineTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverSeconds = ratio * engine.duration;
    const hoverSmpte = engine.formatSMPTE(hoverSeconds, engine.fps);

    timelineHover.style.display = 'block';
    timelineHover.style.left = `${ratio * 100}%`;
    timelineHoverText.textContent = hoverSmpte;
  });

  timelineTrack.addEventListener('mouseleave', () => {
    timelineHover.style.display = 'none';
  });

  // Hero Actions: Capture & Copy Frame / Photo
  const executeCapture = async () => {
    if (activeMediaType === 'photo') {
      if (!currentPhotoFile) {
        showToast('No photo currently selected.', 'warning');
        return;
      }
      try {
        const frameData = await extractor.captureCurrentFrame({ sourceElement: mainPhoto });
        gallery.addFrame(frameData);
        if (galleryDrawer) {
          galleryDrawer.classList.remove('collapsed');
          if (btnToggleGallery) btnToggleGallery.classList.add('active');
        }
        showToast(`Saved photo (${frameData.width}×${frameData.height}) to gallery & downloaded!`);
      } catch (err) {
        showToast('Could not save photo: ' + err.message, 'error');
      }
      return;
    }

    if (!video.videoWidth) {
      showToast('Please import a video first.', 'warning');
      return;
    }
    try {
      engine.pause();
      const frameData = await extractor.captureCurrentFrame();
      gallery.addFrame(frameData);
      if (galleryDrawer) {
        galleryDrawer.classList.remove('collapsed');
        if (btnToggleGallery) btnToggleGallery.classList.add('active');
      }
      showToast(`Captured frame #${frameData.frameNumber} (${frameData.width}×${frameData.height} lossless ${frameData.format})`);
    } catch (err) {
      showToast('Could not capture frame: ' + err.message, 'error');
    }
  };

  const executeCopy = async () => {
    if (activeMediaType === 'photo') {
      if (!currentPhotoFile) {
        showToast('No photo currently selected.', 'warning');
        return;
      }
      try {
        await extractor.copyCurrentFrameToClipboard({ sourceElement: mainPhoto });
        showToast(`Copied photo to clipboard!`);
      } catch (err) {
        showToast('Could not copy to clipboard: ' + err.message, 'error');
      }
      return;
    }

    if (!video.videoWidth) {
      showToast('Please import a video first.', 'warning');
      return;
    }
    try {
      engine.pause();
      await extractor.copyCurrentFrameToClipboard();
      showToast('Lossless PNG copied to clipboard!');
    } catch (err) {
      showToast('Could not copy to clipboard: ' + err.message, 'error');
    }
  };

  const executeGrabAndEnhance = async () => {
    if (activeMediaType === 'photo') {
      if (!currentPhotoFile) {
        showToast('No photo currently selected.', 'warning');
        return;
      }
      try {
        const frameData = await extractor.captureCurrentFrame({ sourceElement: mainPhoto, skipDownload: true });
        enhancerModal.open(frameData);
      } catch (err) {
        showToast('Could not enhance photo: ' + err.message, 'error');
      }
      return;
    }

    if (!video.videoWidth) {
      showToast('Please import a video first.', 'warning');
      return;
    }
    try {
      engine.pause();
      // Losslessly grab current frame WITHOUT triggering automatic file download
      const frameData = await extractor.captureCurrentFrame({ skipDownload: true });
      enhancerModal.open(frameData);
    } catch (err) {
      showToast('Could not capture and enhance: ' + err.message, 'error');
    }
  };

  btnCaptureFrame.addEventListener('click', executeCapture);
  btnCopyFrame.addEventListener('click', executeCopy);
  if (btnGrabAndEnhance) {
    btnGrabAndEnhance.addEventListener('click', executeGrabAndEnhance);
  }

  // Batch Extraction Modal & Engine
  const updateBatchEstimate = () => {
    const inTime = engine.inPoint !== null ? engine.inPoint : 0;
    const outTime = engine.outPoint !== null ? engine.outPoint : engine.duration;
    const fps = engine.fps;
    const totalDuration = Math.max(0, outTime - inTime);
    const totalFramesInRange = Math.max(1, Math.round(totalDuration * fps));

    const val = batchIntervalSelect.value;
    let count = totalFramesInRange;
    if (val === '2') count = Math.ceil(totalFramesInRange / 2);
    else if (val === '5') count = Math.ceil(totalFramesInRange / 5);
    else if (val === '10') count = Math.ceil(totalFramesInRange / 10);
    else if (val === 'fps') count = Math.max(1, Math.round(totalDuration));
    else if (val === 'half_sec') count = Math.max(1, Math.round(totalDuration * 2));

    batchEstimatedCount.textContent = count;
  };

  btnBatchExtract.addEventListener('click', () => {
    if (!video.videoWidth) {
      showToast('Please import a video first.', 'warning');
      return;
    }
    const inTime = engine.inPoint !== null ? engine.inPoint : 0;
    const outTime = engine.outPoint !== null ? engine.outPoint : engine.duration;

    batchRangeIn.textContent = engine.formatSMPTE(inTime, engine.fps);
    batchRangeOut.textContent = engine.formatSMPTE(outTime, engine.fps);
    batchProgressBox.style.display = 'none';
    btnStartBatch.disabled = false;
    btnCancelBatch.textContent = 'Cancel';
    updateBatchEstimate();
    modalBatch.style.display = 'flex';
  });

  batchIntervalSelect.addEventListener('change', updateBatchEstimate);

  btnCloseBatch.addEventListener('click', () => {
    extractor.cancelBatch();
    modalBatch.style.display = 'none';
  });

  btnCancelBatch.addEventListener('click', () => {
    extractor.cancelBatch();
    modalBatch.style.display = 'none';
  });

  btnStartBatch.addEventListener('click', async () => {
    btnStartBatch.disabled = true;
    batchProgressBox.style.display = 'block';
    btnCancelBatch.textContent = 'Stop Extraction';

    const inTime = engine.inPoint !== null ? engine.inPoint : 0;
    const outTime = engine.outPoint !== null ? engine.outPoint : engine.duration;
    const applyEnhance = document.getElementById('batchSettingEnhance')?.checked || false;

    try {
      await extractor.extractBatch({
        startTime: inTime,
        endTime: outTime,
        intervalType: batchIntervalSelect.value,
        applyEnhance,
        enhancer: enhancerModal.enhancer,
        onProgress: ({ current, total, percent, status, text, statusText }) => {
          if (status === 'compressing') {
            batchProgressBar.style.width = '100%';
            batchProgressPercent.textContent = '100%';
            batchProgressText.textContent = text || 'Creating ZIP archive...';
          } else {
            batchProgressBar.style.width = `${percent}%`;
            batchProgressPercent.textContent = `${percent}%`;
            batchProgressText.textContent = statusText || (applyEnhance ? `Extracting & enhancing frame ${current} of ${total}...` : `Extracting frame ${current} of ${total}...`);
          }
        },
      });

      showToast('Batch extraction complete! Download started.');
      modalBatch.style.display = 'none';
    } catch (err) {
      if (err.message.includes('cancelled')) {
        showToast('Batch extraction stopped.', 'warning');
      } else {
        showToast('Batch extraction error: ' + err.message, 'error');
      }
    } finally {
      btnStartBatch.disabled = false;
    }
  });

  // Zoom Controls
  const allZoomBtns = [btnZoomFit, btnZoom100, btnZoom200, btnZoom400, btnZoom800, btnZoom1600].filter(Boolean);

  const setZoomLevel = (lvl) => {
    engine.setZoom(lvl);
    allZoomBtns.forEach((b) => b.classList.remove('active'));

    if (lvl === 'fit') {
      btnZoomFit?.classList.add('active');
      zoomBadge.style.display = 'none';
      panHint.style.display = 'none';
      viewport.classList.remove('high-zoom');
    } else {
      const num = typeof lvl === 'number' ? lvl : parseFloat(lvl) || 1;
      if (num === 1) btnZoom100?.classList.add('active');
      else if (num === 2) btnZoom200?.classList.add('active');
      else if (num === 4) btnZoom400?.classList.add('active');
      else if (num === 8) btnZoom800?.classList.add('active');
      else if (num === 16) btnZoom1600?.classList.add('active');

      if (num >= 4) {
        viewport.classList.add('high-zoom');
      } else {
        viewport.classList.remove('high-zoom');
      }

      zoomBadge.style.display = 'block';
      zoomBadge.textContent = `${Math.round(num * 100)}% Zoom`;
      panHint.style.display = 'flex';
    }
  };

  btnZoomFit?.addEventListener('click', () => setZoomLevel('fit'));
  btnZoom100?.addEventListener('click', () => setZoomLevel(1));
  btnZoom200?.addEventListener('click', () => setZoomLevel(2));
  btnZoom400?.addEventListener('click', () => setZoomLevel(4));
  btnZoom800?.addEventListener('click', () => setZoomLevel(8));
  btnZoom1600?.addEventListener('click', () => setZoomLevel(16));

  engine.on('zoomchange', (lvl) => {
    if (lvl !== 'fit') {
      const num = typeof lvl === 'number' ? lvl : parseFloat(lvl) || 1;
      zoomBadge.style.display = 'block';
      zoomBadge.textContent = `${Math.round(num * 100)}% Zoom`;
      panHint.style.display = 'flex';
      allZoomBtns.forEach((b) => b.classList.remove('active'));
      if (num === 1) btnZoom100?.classList.add('active');
      else if (num === 2) btnZoom200?.classList.add('active');
      else if (num === 4) btnZoom400?.classList.add('active');
      else if (num === 8) btnZoom800?.classList.add('active');
      else if (num === 16) btnZoom1600?.classList.add('active');

      if (num >= 4) {
        viewport.classList.add('high-zoom');
      } else {
        viewport.classList.remove('high-zoom');
      }
    }
  });

  // Gallery Drawer Toggle & Actions
  btnToggleGallery.addEventListener('click', () => {
    galleryDrawer.classList.toggle('collapsed');
    btnToggleGallery.classList.toggle('active', !galleryDrawer.classList.contains('collapsed'));
  });

  btnDownloadAllZip.addEventListener('click', async () => {
    showToast('Compressing gallery into ZIP...');
    await gallery.downloadAllAsZip();
    showToast('Gallery ZIP downloaded!');
  });

  btnClearGallery.addEventListener('click', () => gallery.clearAll());

  // Settings Modal
  btnSettings.addEventListener('click', () => {
    modalSettings.style.display = 'flex';
  });

  btnCloseSettings.addEventListener('click', () => {
    modalSettings.style.display = 'none';
  });

  btnSaveSettings.addEventListener('click', () => {
    extractor.setSettings({
      format: settingImageFormat.value,
      pattern: settingFilenamePattern.value,
      autoDownload: settingAutoDownload.checked,
    });
    modalSettings.style.display = 'none';
    showToast('Settings saved!');
  });

  // Shortcuts Modal
  btnShortcuts.addEventListener('click', () => {
    modalShortcuts.style.display = 'flex';
  });

  btnCloseShortcuts.addEventListener('click', () => {
    modalShortcuts.style.display = 'none';
  });

  // Initialize Keyboard Shortcuts
  new ShortcutsManager({
    togglePlay: () => engine.togglePlay(),
    stepFrame: (delta) => engine.stepFrame(delta),
    captureFrame: executeCapture,
    grabAndEnhance: executeGrabAndEnhance,
    copyFrame: executeCopy,
    nextMedia: () => mediaLibrary.selectNext(),
    prevMedia: () => mediaLibrary.selectPrev(),
    markIn: () => engine.setMarkIn(),
    markOut: () => engine.setMarkOut(),
    jumpStart: () => engine.jumpToStart(),
    jumpEnd: () => engine.jumpToEnd(),
    toggleZoom: () => {
      if (engine.zoomLevel === 'fit') setZoomLevel(1);
      else setZoomLevel('fit');
    },
    rotateCW: () => {
      engine.rotateCW();
      showToast(`Rotated to ${engine.rotation}°`);
    },
    rotateCCW: () => {
      engine.rotateCCW();
      showToast(`Rotated to ${engine.rotation}°`);
    },
    toggleCrop: () => {
      cropController.toggle();
    },
    toggleShortcutsModal: () => {
      modalShortcuts.style.display = modalShortcuts.style.display === 'flex' ? 'none' : 'flex';
    },
    closeModals: () => {
      cropController.deactivate();
      modalShortcuts.style.display = 'none';
      modalSettings.style.display = 'none';
      modalBatch.style.display = 'none';
      modalInspect.style.display = 'none';
      enhancerModal.close();
    },
  });
});
