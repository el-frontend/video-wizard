// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

// Note: When using the Node.JS APIs, the config file doesn't apply. Instead, pass options directly to the APIs

import { Config } from '@remotion/cli/config';

// Set video output format to JPEG for better quality
Config.setVideoImageFormat('jpeg');

// Overwrite output files if they already exist
Config.setOverwriteOutput(true);

// Set the number of shared memory pixels for multi-threaded rendering
// Adjust based on your system's capabilities
Config.setChromiumOpenGlRenderer('angle');
