/** Master registry of all camera flaw effects in pipeline order. */

// Each effect module exports `export const effect = {...}`.
// Registry imports them all and orders them correctly.

// Lens effects (light path order)
import { effect as vignetting } from './vignette.js';
import { effect as edgeSoftness } from './edge-softness.js';
import { effect as chromaticAberration } from './chromatic-aberration.js';
import { effect as lensFlare } from './lens-flare.js';

// Focus effects
import { effect as softFocus } from './soft-focus.js';
import { effect as motionBlur } from './motion-blur.js';

// Sensor effects
import { effect as isoGrain } from './iso-grain.js';
import { effect as chromaNoise } from './chroma-noise.js';
import { effect as deadPixels } from './dead-pixels.js';
import { effect as dustSpots } from './dust-spots.js';

// Color / ISP effects — applied after sensor,
// mirroring where a real camera's image signal processor sits.
import { effect as whiteBalanceDrift } from './white-balance-drift.js';
import { effect as dynamicRange } from './dynamic-range.js';
import { effect as splitToning } from './split-toning.js';

// Compression
import { effect as jpegArtifacts } from './jpeg-artifacts.js';

/** Pipeline-ordered array of all effects. */
export const registry = [
  vignetting,
  edgeSoftness,
  chromaticAberration,
  lensFlare,
  softFocus,
  motionBlur,
  isoGrain,
  chromaNoise,
  deadPixels,
  dustSpots,
  whiteBalanceDrift,
  dynamicRange,
  splitToning,
  jpegArtifacts,
];
