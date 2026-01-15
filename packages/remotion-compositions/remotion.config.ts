// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

import { Config } from '@remotion/cli/config';

// Set video output format to JPEG for better quality
Config.setVideoImageFormat('jpeg');

// Overwrite output files if they already exist
Config.setOverwriteOutput(true);

// Set the OpenGL renderer for better compatibility
Config.setChromiumOpenGlRenderer('angle');
