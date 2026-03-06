// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

// Note: When using the Node.JS APIs, the config file doesn't apply. Instead, pass options directly to the APIs

import { Config } from '@remotion/cli/config';

// Use JPEG for faster frame encoding compared to PNG
Config.setVideoImageFormat('jpeg');

// Overwrite output files if they already exist
Config.setOverwriteOutput(true);

// Use the ANGLE GL backend for better compatibility across platforms
// On Linux CI/containers 'swangle' (software ANGLE) is a reliable fallback
Config.setChromiumOpenGlRenderer('angle');
