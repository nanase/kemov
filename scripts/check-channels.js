/**
 * Fails the build when channels.yml is not something the deploy could seed.
 *
 * CI runs this so that a broken master file is caught on the way into main,
 * rather than halfway through writing itself into D1.
 */

import { channelsPath, loadChannels } from './channels.js';

try {
  const channels = loadChannels();

  console.log(`${channelsPath}: ${channels.length} channels, no problems`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
