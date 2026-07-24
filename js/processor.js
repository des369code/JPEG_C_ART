/** Backward-compat wrapper — delegates to effects pipeline. */

import { applyEffects } from './effects/pipeline.js';

/**
 * Apply JPEG artifacts only. Kept for backward compat; prefer applyEffects() directly.
 */
export async function applyArtifacts(imageData, region, strength) {
  const enabledIds = new Set(['jpeg-artifacts']);
  const strengths = { 'jpeg-artifacts': strength };
  return applyEffects(imageData, enabledIds, strengths, region);
}
