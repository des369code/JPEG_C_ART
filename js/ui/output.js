/** Preview display and download trigger for processed image */

import { formatBytes } from '../utils.js';

/**
 * Set up output display with preview canvas and download button.
 * @param {HTMLCanvasElement} previewCanvas
 * @param {HTMLButtonElement} downloadBtn
 * @param {HTMLElement} sizeEl — element to display file size
 * @returns {{showResult: function, clear: function}}
 */
export function setupOutput(previewCanvas, downloadBtn, sizeEl) {
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

  return {
    /**
     * Display a processed JPEG blob as a preview.
     * @param {Blob} blob
     */
    async showResult(blob) {
      currentBlob = blob;
      sizeEl.textContent = formatBytes(blob.size);

      // Decode blob to draw on preview canvas
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
