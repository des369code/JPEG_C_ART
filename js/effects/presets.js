/** Preset effect combinations — one-click camera flaw recipes. */

export const presets = [
  {
    id: 'smartphone',
    name: 'Smartphone Snapshot',
    description: 'Slight soft focus, mild grain, and moderate JPEG compression.',
    effects: {
      'soft-focus':      { enabled: true, strength: 20 },
      'iso-grain':       { enabled: true, strength: 25 },
      'jpeg-artifacts':  { enabled: true, strength: 40 },
    },
  },
  {
    id: 'cheap-lens',
    name: 'Old/Cheap Lens',
    description: 'Heavy vignetting, chromatic aberration, and edge softness.',
    effects: {
      'vignetting':            { enabled: true, strength: 55 },
      'chromatic-aberration':  { enabled: true, strength: 50 },
      'edge-softness':         { enabled: true, strength: 45 },
    },
  },
  {
    id: 'night-shot',
    name: 'High ISO Night Shot',
    description: 'Heavy grain, mild motion blur, and sensor defects.',
    effects: {
      'iso-grain':    { enabled: true, strength: 80 },
      'motion-blur':  { enabled: true, strength: 30 },
      'dead-pixels':  { enabled: true, strength: 35 },
    },
  },
  {
    id: 'vintage-film',
    name: 'Vintage Film',
    description: 'Vignette, dust spots, subtle grain, and color fringing.',
    effects: {
      'vignetting':            { enabled: true, strength: 40 },
      'dust-spots':            { enabled: true, strength: 30 },
      'iso-grain':             { enabled: true, strength: 20 },
      'chromatic-aberration':  { enabled: true, strength: 35 },
    },
  },
  {
    id: 'ai-realism',
    name: 'AI Realism (Colour Corrected)',
    description:
      'Targets AI-vs-real color tells: chroma noise, split-toning, signal grain, ' +
      'dynamic range, WB drift, and light JPEG. Use as baseline QA pass; ' +
      'layer a lens/film preset on top if the shoot calls for it.',
    effects: {
      'chroma-noise':        { enabled: true, strength: 30 },
      'iso-grain':           { enabled: true, strength: 20 },
      'white-balance-drift': { enabled: true, strength: 20 },
      'dynamic-range':       { enabled: true, strength: 25 },
      'split-toning':        { enabled: true, strength: 30 },
      'jpeg-artifacts':      { enabled: true, strength: 25 },
    },
  },
];

/**
 * Save current settings as the Custom preset (session-local).
 * @param {Object} config — { enabledIds: Set, strengths: Object, regions: Object }
 */
export function saveCustomPreset(config) {
  const custom = presets.find(p => p.id === 'custom');
  if (!custom) {
    presets.push({ id: 'custom', name: 'Custom', description: 'Your current settings.', effects: {} });
  }
  const target = presets.find(p => p.id === 'custom');
  target.effects = {};
  for (const id of config.enabledIds) {
    target.effects[id] = {
      enabled: true,
      strength: config.strengths[id] ?? 30,
    };
  }
}
