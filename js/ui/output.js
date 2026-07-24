/** Preview display, zoom overlay, and download trigger for processed image */

import { formatBytes } from '../utils.js';

/**
 * Set up output display with preview canvas, zoom overlay, and download button.
 * @param {HTMLCanvasElement} previewCanvas
 * @param {HTMLButtonElement} downloadBtn
 * @param {HTMLElement} sizeEl — element to display file size
 * @param {HTMLElement} zoomOverlay — full-screen zoom overlay div
 * @param {HTMLImageElement} zoomImage — img inside the zoom overlay
 * @returns {{showResult: function, clear: function}}
 */
export function setupOutput(previewCanvas, downloadBtn, sizeEl, zoomOverlay, zoomImage) {
  let currentBlob = null;

  downloadBtn.addEventListener('click', () => {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artifacted.jpg';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Click output preview → zoom to full resolution
  previewCanvas.addEventListener('click', () => {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    // Set onload BEFORE src to avoid race condition
    zoomImage.onload = () => URL.revokeObjectURL(url);
    zoomImage.onerror = () => URL.revokeObjectURL(url);
    zoomImage.src = url;
    zoomOverlay.classList.remove('hidden');
  });

  // Click anywhere on overlay (background, image, or close button) → dismiss
  function closeZoom() {
    zoomOverlay.classList.add('hidden');
    zoomImage.src = '';
  }

  zoomOverlay.addEventListener('click', closeZoom);

  // Escape key → dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !zoomOverlay.classList.contains('hidden')) {
      closeZoom();
    }
  });

  return {
    /**
     * Display a processed JPEG blob as a preview.
     * @param {Blob} blob
     */
    async showResult(blob) {
      currentBlob = blob;
      sizeEl.textContent = formatBytes(blob.size);

      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        previewCanvas.width = img.naturalWidth;
        previewCanvas.height = img.naturalHeight;
        const ctx = previewCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        downloadBtn.disabled = false;
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        sizeEl.textContent = 'Error rendering preview';
      };
      img.src = url;
    },

    /** Clear output display */
    clear() {
      currentBlob = null;
      const ctx = previewCanvas.getContext('2d');
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      sizeEl.textContent = '';
      downloadBtn.disabled = true;
    },
  };
}
