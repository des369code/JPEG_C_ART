/** File drop/click handler, multi-format image validation, decode to ImageData */

import { warnIfLarge, formatBytes } from '../utils.js';

/**
 * Set up file upload via drag-and-drop and file input click.
 * @param {HTMLElement} dropZone — element to receive drag events
 * @param {HTMLInputElement} fileInput — hidden file input
 * @param {function} onImageLoaded — callback(imageData, fileName, fileSize)
 * @param {function} onError — callback(message)
 */
export function setupUpload(dropZone, fileInput, onImageLoaded, onError) {
  // Click to open file picker
  dropZone.addEventListener('click', () => fileInput.click());

  // File selected via input
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(file, onImageLoaded, onError);
  });

  // Drag-and-drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onImageLoaded, onError);
  });
}

/**
 * Validate and decode an image file. Accepts JPEG, PNG, and HEIC.
 * The browser's native Image decoder is the final authority —
 * if the browser can decode it, we accept it.
 */
function handleFile(file, onImageLoaded, onError) {
  if (!file.type.startsWith('image/')) {
    onError('Please select an image file.');
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const buffer = reader.result; // ArrayBuffer

    // Decode via browser image decoder
    const blob = new Blob([buffer], { type: file.type });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Size warning
      const warning = warnIfLarge(img.naturalWidth, img.naturalHeight, buffer.byteLength);
      if (warning && !confirm(warning)) {
        return; // User cancelled
      }

      // Draw to canvas to get raw ImageData
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      onImageLoaded(imageData, file.name, buffer.byteLength);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      onError('This image format is not supported by your browser. Try JPEG or PNG.');
    };

    img.src = url;
  };

  reader.onerror = () => {
    onError('Failed to read file. Try again.');
  };

  reader.readAsArrayBuffer(file);
}
