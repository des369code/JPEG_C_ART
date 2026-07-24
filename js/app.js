/** Main controller — wires UI events to processor calls */

import { setupUpload } from './ui/upload.js';
import { setupRegion } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyArtifacts } from './processor.js';

// --- DOM references ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');
const workspace = document.getElementById('workspace');
const inputCanvas = document.getElementById('input-canvas');
const inputContainer = document.getElementById('input-canvas-container');
const imageInfo = document.getElementById('image-info');
const applyBtn = document.getElementById('apply-btn');
const statusMsg = document.getElementById('status-msg');
const strengthSlider = document.getElementById('strength-slider');
const strengthValue = document.getElementById('strength-value');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');
const zoomOverlay = document.getElementById('zoom-overlay');
const zoomImage = document.getElementById('zoom-image');

// --- State ---
let currentImageData = null;
let currentFileName = '';

// --- Output module ---
const output = setupOutput(outputCanvas, downloadBtn, outputSize, zoomOverlay, zoomImage);

// --- Region selector ---
const regionInputs = {
  left: document.getElementById('region-left'),
  top: document.getElementById('region-top'),
  width: document.getElementById('region-width'),
  height: document.getElementById('region-height'),
};

const regionSelector = setupRegion(inputContainer, regionInputs);

// --- Strength slider ---
strengthSlider.addEventListener('input', () => {
  strengthValue.textContent = strengthSlider.value;
});

// --- Upload ---
setupUpload(dropZone, fileInput,
  (imageData, fileName, fileSize) => {
    currentImageData = imageData;
    currentFileName = fileName;

    // Hide error, show workspace
    errorMsg.classList.add('hidden');
    workspace.classList.remove('hidden');
    dropZone.style.display = 'none';

    // Draw on input canvas
    const displayW = inputContainer.clientWidth;
    const scale = displayW / imageData.width;
    const displayH = imageData.height * scale;

    inputCanvas.width = imageData.width;
    inputCanvas.height = imageData.height;
    const ctx = inputCanvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Update region selector
    regionSelector.updateImage(imageData.width, imageData.height, displayW, displayH);

    imageInfo.textContent = `${fileName} — ${imageData.width}×${imageData.height}`;
    output.clear();
    statusMsg.textContent = '';
  },
  (message) => {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
);

// --- Apply button ---
applyBtn.addEventListener('click', async () => {
  if (!currentImageData) return;

  const region = regionSelector.getRegion();
  const strength = parseInt(strengthSlider.value);

  applyBtn.disabled = true;
  statusMsg.textContent = 'Processing...';

  try {
    const blob = await applyArtifacts(currentImageData, region, strength);
    await output.showResult(blob);
    statusMsg.textContent = 'Done!';
  } catch (err) {
    statusMsg.textContent = 'Processing failed. Try a smaller image.';
    console.error('Artifact processing error:', err);
  } finally {
    applyBtn.disabled = false;
  }
});
