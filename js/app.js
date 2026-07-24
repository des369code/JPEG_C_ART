/** DesImageEditor — multi-effect camera flaw simulator with per-effect regions. */

import { setupUpload } from './ui/upload.js';
import { setupRegions } from './ui/region.js';
import { setupOutput } from './ui/output.js';
import { applyEffects } from './effects/pipeline.js';
import { registry } from './effects/registry.js';
import { presets, saveCustomPreset } from './effects/presets.js';

// Full-frame effects — no region overlay or inputs
const FULL_FRAME = new Set(['vignetting', 'chromatic-aberration', 'edge-softness', 'lens-flare']);

// --- DOM ---
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
const presetSelect = document.getElementById('preset-select');
const presetApply = document.getElementById('preset-apply');
const outputCanvas = document.getElementById('output-canvas');
const downloadBtn = document.getElementById('download-btn');
const outputSize = document.getElementById('output-size');
const zoomOverlay = document.getElementById('zoom-overlay');
const zoomImage = document.getElementById('zoom-image');
const showAllBtn = document.getElementById('show-all-regions-btn');
const reuploadBtn = document.getElementById('reupload-btn');
const uploadSection = document.getElementById('upload-section');

// --- State ---
let currentImageData = null;
let _imageData = null, _fileName = '', _fileSize = 0;
const effectStrengths = {};
const effectEnabled = {};
const effectRegions = {};
const effectExtraParams = {};

// --- Output ---
const output = setupOutput(outputCanvas, downloadBtn, outputSize, zoomOverlay, zoomImage);

// --- Regions ---
const regionInputs = {
  left: document.getElementById('region-left'),
  top: document.getElementById('region-top'),
  width: document.getElementById('region-width'),
  height: document.getElementById('region-height'),
};
const regions = setupRegions(inputContainer, regionInputs);

showAllBtn.addEventListener('click', () => {
  const showing = regions.toggleShowAll();
  showAllBtn.textContent = showing ? 'Hide all regions' : 'Show all regions';
  for (const key of ['left', 'top', 'width', 'height']) {
    regionInputs[key].disabled = showing;
  }
});

// --- Build effect cards ---
for (const effect of registry) {
  effectStrengths[effect.id] = effect.defaultStrength;
  effectEnabled[effect.id] = false;
  effectRegions[effect.id] = { x: 0, y: 0, w: 0, h: 0 };

  const isFullFrame = FULL_FRAME.has(effect.id);

  const card = document.createElement('div');
  card.className = 'effect-card';
  card.dataset.effectId = effect.id;
  card.style.setProperty('--effect-color', getColor(effect.id));
  card.style.setProperty('--i', registry.indexOf(effect));

  // Header row
  const header = document.createElement('div');
  header.className = 'effect-card-header';

  const toggle = document.createElement('span');
  toggle.className = 'effect-toggle';
  toggle.title = 'Toggle effect';

  const dot = document.createElement('span');
  dot.className = 'effect-dot';
  dot.style.cssText = `background:${getColor(effect.id)};width:6px;height:6px;border-radius:50%;flex-shrink:0;`;

  const name = document.createElement('span');
  name.className = 'effect-card-name';
  name.textContent = effect.name;

  const badge = document.createElement('span');
  if (isFullFrame) {
    badge.className = 'effect-badge';
    badge.textContent = 'Full frame';
  }

  header.appendChild(toggle);
  header.appendChild(dot);
  header.appendChild(name);
  if (isFullFrame) header.appendChild(badge);

  // Body (hidden when disabled)
  const body = document.createElement('div');
  body.className = 'effect-card-body';
  body.style.display = 'none';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = effect.defaultStrength;
  slider.className = 'effect-slider';
  slider.dataset.effectId = effect.id;
  slider.addEventListener('input', () => {
    effectStrengths[effect.id] = parseInt(slider.value);
  });

  body.appendChild(slider);

  // Percentage label
  const pctLabel = document.createElement('span');
  pctLabel.className = 'effect-pct';
  pctLabel.textContent = `${effect.defaultStrength}%`;
  body.appendChild(pctLabel);

  slider.addEventListener('input', () => {
    effectStrengths[effect.id] = parseInt(slider.value);
    pctLabel.textContent = `${slider.value}%`;
  });

  // Extra per-effect parameters (e.g. unsharp-mask radius, threshold)
  if (effect.extraParams) {
    effectExtraParams[effect.id] = {};
    for (const [key, cfg] of Object.entries(effect.extraParams)) {
      effectExtraParams[effect.id][key] = cfg.default;

      const extraRow = document.createElement('div');
      extraRow.style.cssText = 'display:flex;align-items:center;gap:0.375rem;';

      const extraLabel = document.createElement('span');
      extraLabel.className = 'effect-region-label';
      extraLabel.textContent = cfg.label;

      const extraVal = document.createElement('span');
      extraVal.className = 'effect-region-values';
      extraVal.textContent = `${cfg.default}${cfg.unit || ''}`;

      extraRow.appendChild(extraLabel);
      extraRow.appendChild(extraVal);
      body.appendChild(extraRow);

      const extraSlider = document.createElement('input');
      extraSlider.type = 'range';
      extraSlider.min = String(cfg.min);
      extraSlider.max = String(cfg.max);
      extraSlider.step = String(cfg.step || 1);
      extraSlider.value = String(cfg.default);
      extraSlider.className = 'effect-slider effect-extra-slider';
      extraSlider.dataset.effectId = effect.id;
      extraSlider.dataset.paramKey = key;

      extraSlider.addEventListener('input', () => {
        const v = parseFloat(extraSlider.value);
        effectExtraParams[effect.id][key] = v;
        extraVal.textContent = `${extraSlider.value}${cfg.unit || ''}`;
      });

      body.appendChild(extraSlider);
    }
  }

  // Toggle — clicking anywhere on the card header toggles the effect.
  // When enabling, the region overlay is activated automatically.
  const toggleEffect = () => {
    effectEnabled[effect.id] = !effectEnabled[effect.id];
    body.style.display = effectEnabled[effect.id] ? '' : 'none';
    card.classList.toggle('effect-card--enabled', effectEnabled[effect.id]);

    if (effectEnabled[effect.id]) {
      regions.setActiveEffect(effect.id);
      updateRegionInputsVisibility(effect.id);
    }

    updateAllOverlays();
  };

  // Single handler on header — covers toggle dot, name, and card background.
  // Skip clicks on interactive children (slider, buttons) so they work normally.
  header.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    toggleEffect();
  });

  card.appendChild(header);
  card.appendChild(body);
  effectsList.appendChild(card);
}

function getColor(id) {
  const colors = {
    'motion-blur': '#ff6b6b', 'soft-focus': '#ffd93d', 'chromatic-aberration': '#6bcb77',
    'iso-grain': '#4d96ff', 'dead-pixels': '#ff922b', 'dust-spots': '#cc5de8', 'jpeg-artifacts': '#20c997',
  };
  return colors[id] || '#888';
}

function updateRegionInputsVisibility(activeId) {
  const isFF = FULL_FRAME.has(activeId);
  for (const key of ['left', 'top', 'width', 'height']) {
    regionInputs[key].parentElement.style.display = isFF ? 'none' : '';
  }
}

function updateAllOverlays() {
  const states = registry.map(e => ({
    id: e.id,
    enabled: effectEnabled[e.id],
    region: effectRegions[e.id],
  }));
  regions.updateOverlays(states);
}

// --- Presets dropdown ---
for (const p of presets) {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = p.name;
  presetSelect.appendChild(opt);
}

presetApply.addEventListener('click', () => {
  const preset = presets.find(p => p.id === presetSelect.value);
  if (!preset) return;

  // Reset all
  for (const e of registry) {
    effectEnabled[e.id] = false;
    effectStrengths[e.id] = e.defaultStrength;
  }

  // Apply preset
  for (const [id, cfg] of Object.entries(preset.effects)) {
    effectEnabled[id] = cfg.enabled;
    effectStrengths[id] = cfg.strength;
  }

  // Reset extra params to defaults for all effects
  for (const e of registry) {
    if (e.extraParams) {
      if (!effectExtraParams[e.id]) effectExtraParams[e.id] = {};
      for (const [key, p] of Object.entries(e.extraParams)) {
        effectExtraParams[e.id][key] = p.default;
      }
    }
  }

  // Re-render cards
  for (const card of effectsList.querySelectorAll('.effect-card')) {
    const id = card.dataset.effectId;
    const enabled = effectEnabled[id];
    card.querySelector('.effect-card-body').style.display = enabled ? '' : 'none';
    card.classList.toggle('effect-card--enabled', enabled);
    const slider = card.querySelector('.effect-slider:not(.effect-extra-slider)');
    if (slider) slider.value = effectStrengths[id];
    // Reset extra-param sliders to defaults
    for (const es of card.querySelectorAll('.effect-extra-slider')) {
      const key = es.dataset.paramKey;
      const cfg = effectExtraParams[id];
      if (cfg && key in cfg) {
        es.value = cfg[key];
        const row = es.previousElementSibling;
        if (row) {
          const valSpan = row.querySelector('.effect-region-values');
          if (valSpan) {
            const effectDef = registry.find(e => e.id === id);
            const unit = effectDef?.extraParams?.[key]?.unit || '';
            valSpan.textContent = `${cfg[key]}${unit}`;
          }
        }
      }
    }
  }

  updateAllOverlays();
  const firstEnabled = registry.find(e => effectEnabled[e.id]);
  if (firstEnabled) regions.setActiveEffect(firstEnabled.id);
});

// --- Re-upload ---
reuploadBtn.addEventListener('click', () => {
  // Reset all state
  currentImageData = null;
  _imageData = null;
  _fileName = '';
  _fileSize = 0;
  for (const e of registry) {
    effectEnabled[e.id] = false;
    effectStrengths[e.id] = e.defaultStrength;
    if (e.extraParams) {
      if (!effectExtraParams[e.id]) effectExtraParams[e.id] = {};
      for (const [key, p] of Object.entries(e.extraParams)) {
        effectExtraParams[e.id][key] = p.default;
      }
    }
  }
  // Reset UI cards
  for (const card of effectsList.querySelectorAll('.effect-card')) {
    const id = card.dataset.effectId;
    card.querySelector('.effect-card-body').style.display = 'none';
    card.classList.remove('effect-card--enabled');
    const slider = card.querySelector('.effect-slider:not(.effect-extra-slider)');
    if (slider) slider.value = effectStrengths[id];
    for (const es of card.querySelectorAll('.effect-extra-slider')) {
      const key = es.dataset.paramKey;
      const cfg = effectExtraParams[id];
      if (cfg && key in cfg) {
        es.value = cfg[key];
        const row = es.previousElementSibling;
        if (row) {
          const valSpan = row.querySelector('.effect-region-values');
          if (valSpan) {
            const effectDef = registry.find(e => e.id === id);
            const unit = effectDef?.extraParams?.[key]?.unit || '';
            valSpan.textContent = `${cfg[key]}${unit}`;
          }
        }
      }
    }
  }
  // Hide workspace, show upload
  workspace.classList.add('hidden');
  uploadSection.style.display = '';
  dropZone.style.display = '';
  reuploadBtn.classList.add('hidden');
  output.clear();
  statusMsg.textContent = '';
  updateAllOverlays();
  // Clear canvases
  const ictx = inputCanvas.getContext('2d');
  ictx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
  imageInfo.textContent = '';
  // Reset file input so the same file can be re-selected
  fileInput.value = '';
});

// --- Upload ---
setupUpload(dropZone, fileInput,
  (imageData, fileName, fileSize) => {
    currentImageData = imageData;
    errorMsg.classList.add('hidden');
    workspace.classList.remove('hidden');
    uploadSection.style.display = 'none';
    dropZone.style.display = 'none';
    reuploadBtn.classList.remove('hidden');

    const displayW = inputContainer.clientWidth;
    inputCanvas.width = imageData.width;
    inputCanvas.height = imageData.height;
    inputCanvas.getContext('2d').putImageData(imageData, 0, 0);
    regions.updateImage(imageData.width, imageData.height, displayW, imageData.height * (displayW / imageData.width));

    // Init all regions to full image
    for (const e of registry) {
      effectRegions[e.id] = { x: 0, y: 0, w: imageData.width, h: imageData.height };
    }

    // Keep overlay aligned when the window or layout resizes.
    // Store image dims so the resize handler can recompute display coords.
    _imageData = imageData;
    _fileName = fileName;
    _fileSize = fileSize;

    imageInfo.textContent = `${fileName} — ${imageData.width}×${imageData.height}`;
    output.clear();
    statusMsg.textContent = '';
  },
  (message) => {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
);

// --- Region change handler ---
regions.onRegionChanged((activeId, allRegions) => {
  for (const [id, r] of Object.entries(allRegions)) {
    effectRegions[id] = r;
  }
});

// --- Apply ---
applyBtn.addEventListener('click', async () => {
  if (!currentImageData) return;

  const enabledIds = new Set(registry.filter(e => effectEnabled[e.id]).map(e => e.id));
  if (enabledIds.size === 0) { statusMsg.textContent = 'No effects enabled.'; return; }

  applyBtn.disabled = true;
  statusMsg.textContent = `Processing ${enabledIds.size} effects...`;

  try {
    const blob = await applyEffects(currentImageData, enabledIds, effectStrengths, effectRegions, effectExtraParams);
    await output.showResult(blob);
    statusMsg.textContent = `${enabledIds.size} effects applied.`;
    saveCustomPreset({ enabledIds, strengths: effectStrengths, regions: effectRegions, extraParams: effectExtraParams });
  } catch (err) {
    statusMsg.textContent = 'Processing failed.';
    console.error(err);
  } finally {
    applyBtn.disabled = false;
  }
});

// --- Reset ---
resetBtn.addEventListener('click', () => {
  for (const e of registry) {
    effectEnabled[e.id] = false;
    effectStrengths[e.id] = e.defaultStrength;
    // Reset extra params to defaults
    if (e.extraParams) {
      if (!effectExtraParams[e.id]) effectExtraParams[e.id] = {};
      for (const [key, p] of Object.entries(e.extraParams)) {
        effectExtraParams[e.id][key] = p.default;
      }
    }
  }
  for (const card of effectsList.querySelectorAll('.effect-card')) {
    const id = card.dataset.effectId;
    card.querySelector('.effect-card-body').style.display = 'none';
    card.classList.remove('effect-card--enabled');
    const slider = card.querySelector('.effect-slider:not(.effect-extra-slider)');
    if (slider) slider.value = effectStrengths[id];
    // Reset extra-param sliders and labels
    for (const es of card.querySelectorAll('.effect-extra-slider')) {
      const key = es.dataset.paramKey;
      const cfg = effectExtraParams[id];
      if (cfg && key in cfg) {
        es.value = cfg[key];
        // Update the value label next to the slider
        const row = es.previousElementSibling;
        if (row) {
          const valSpan = row.querySelector('.effect-region-values');
          if (valSpan) {
            const effectDef = registry.find(e => e.id === id);
            const unit = effectDef?.extraParams?.[key]?.unit || '';
            valSpan.textContent = `${cfg[key]}${unit}`;
          }
        }
      }
    }
  }
  updateAllOverlays();
  statusMsg.textContent = '';
});

// --- Keep overlay aligned on window / layout resize ---
window.addEventListener('resize', () => {
  if (!_imageData) return;
  const dw = inputContainer.clientWidth;
  if (dw > 0) {
    regions.updateImage(_imageData.width, _imageData.height, dw, _imageData.height * (dw / _imageData.width));
  }
});
