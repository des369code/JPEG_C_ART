/** Main controller — dynamic effects UI + pipeline dispatch */

import { setupUpload } from './ui/upload.js';
import { setupRegion } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyEffects } from './effects/pipeline.js';
import { registry } from './effects/registry.js';

// --- DOM references ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');
const workspace = document.getElementById('workspace');
const inputCanvas = document.getElementById('input-canvas');
const inputContainer = document.getElementById('input-canvas-container');
const imageInfo = document.getElementById('image-info');
const effectsList = document.getElementById('effects-list');
const applyBtn = document.getElementById('apply-btn');
const resetBtn = document.getElementById('reset-btn');
const statusMsg = document.getElementById('status-msg');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');
const zoomOverlay = document.getElementById('zoom-overlay');
const zoomImage = document.getElementById('zoom-image');

// --- State ---
let currentImageData = null;
const effectStrengths = {};
const effectEnabled = {};

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

// --- Build effects UI from registry ---
for (const effect of registry) {
  effectStrengths[effect.id] = effect.defaultStrength;
  effectEnabled[effect.id] = false;

  const row = document.createElement('div');
  row.className = 'effect-row';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = `eff-${effect.id}`;
  cb.checked = false;

  const label = document.createElement('label');
  label.className = 'effect-label';
  label.htmlFor = cb.id;
  label.textContent = effect.name;

  const desc = document.createElement('span');
  desc.className = 'effect-desc';
  desc.textContent = effect.description;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = effect.defaultStrength;
  slider.style.display = 'none';
  slider.title = effect.name + ' strength';
  slider.dataset.effectId = effect.id;

  cb.addEventListener('change', () => {
    effectEnabled[effect.id] = cb.checked;
    slider.style.display = cb.checked ? '' : 'none';
  });

  slider.addEventListener('input', () => {
    effectStrengths[effect.id] = parseInt(slider.value);
  });

  row.appendChild(cb);
  row.appendChild(label);
  row.appendChild(desc);
  row.appendChild(slider);
  effectsList.appendChild(row);
}

// --- Upload ---
setupUpload(dropZone, fileInput,
  (imageData, fileName, fileSize) => {
    currentImageData = imageData;
    errorMsg.classList.add('hidden');
    workspace.classList.remove('hidden');
    dropZone.style.display = 'none';

    const displayW = inputContainer.clientWidth;
    inputCanvas.width = imageData.width;
    inputCanvas.height = imageData.height;
    inputCanvas.getContext('2d').putImageData(imageData, 0, 0);
    regionSelector.updateImage(imageData.width, imageData.height, displayW, imageData.height * (displayW / imageData.width));
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
  const enabledIds = new Set(
    registry.filter(e => effectEnabled[e.id]).map(e => e.id)
  );

  if (enabledIds.size === 0) {
    statusMsg.textContent = 'No effects enabled.';
    return;
  }

  applyBtn.disabled = true;
  statusMsg.textContent = `Processing ${enabledIds.size} effects...`;

  try {
    const blob = await applyEffects(currentImageData, enabledIds, effectStrengths, region);
    await output.showResult(blob);
    statusMsg.textContent = `${enabledIds.size} effects applied.`;
  } catch (err) {
    statusMsg.textContent = 'Processing failed. Try a smaller image.';
    console.error('Pipeline error:', err);
  } finally {
    applyBtn.disabled = false;
  }
});

// --- Reset button ---
resetBtn.addEventListener('click', () => {
  const checkboxes = effectsList.querySelectorAll('input[type="checkbox"]');
  const sliders = effectsList.querySelectorAll('input[type="range"]');
  for (const cb of checkboxes) cb.checked = false;
  for (const s of sliders) {
    s.style.display = 'none';
    const effectId = s.dataset.effectId;
    const def = registry.find(e => e.id === effectId)?.defaultStrength ?? 0;
    s.value = def;
    effectStrengths[effectId] = def;
    effectEnabled[effectId] = false;
  }
  statusMsg.textContent = '';
});
