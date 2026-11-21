/**
 * Frame Grab — Keyboard Shortcuts Manager
 * Handles NLE-standard hotkeys and shortcuts.
 */

export class ShortcutsManager {
  constructor(handlers) {
    this.handlers = handlers;
    this.enabled = true;
    this.init();
  }

  init() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Do not trigger shortcuts when typing in inputs or select dropdowns
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      // If any modal dialog is open, only allow Escape to close modals
      const isAnyModalOpen = [
        'modalEnhancer',
        'modalShortcuts',
        'modalSettings',
        'modalBatch',
        'modalInspect',
      ].some((id) => {
        const el = document.getElementById(id);
        return el && el.style.display !== 'none';
      });

      if (isAnyModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.handlers.closeModals?.();
        }
        return;
      }

      // Check shortcuts
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this.handlers.nextMedia?.();
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        this.handlers.prevMedia?.();
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        this.handlers.togglePlay?.();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          this.handlers.stepFrame?.(-10);
        } else {
          this.handlers.stepFrame?.(-1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          this.handlers.stepFrame?.(10);
        } else {
          this.handlers.stepFrame?.(1);
        }
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        this.handlers.stepFrame?.(-5);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        this.handlers.stepFrame?.(5);
      } else if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.handlers.grabAndEnhance?.();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'e' || e.key === 'E') {
        if (e.metaKey || e.ctrlKey) {
          // Copy to clipboard
          e.preventDefault();
          this.handlers.copyFrame?.();
        } else {
          // Grab frame
          e.preventDefault();
          this.handlers.captureFrame?.();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        // Only if text is not selected
        if (!window.getSelection()?.toString()) {
          e.preventDefault();
          this.handlers.copyFrame?.();
        }
      } else if (e.key === '[' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        this.handlers.markIn?.();
      } else if (e.key === ']' || e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        this.handlers.markOut?.();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.handlers.jumpStart?.();
      } else if (e.key === 'End') {
        e.preventDefault();
        this.handlers.jumpEnd?.();
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        this.handlers.toggleZoom?.();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (e.shiftKey) {
          this.handlers.rotateCCW?.();
        } else {
          this.handlers.rotateCW?.();
        }
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        this.handlers.toggleCrop?.();
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.handlers.toggleShortcutsModal?.();
      } else if (e.key === 'Escape') {
        this.handlers.closeModals?.();
      }
    });
  }
}
