import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

/**
 * Remotion Entry Point
 * 
 * This file is the entry point for Remotion CLI and bundler
 * Registers all available compositions
 */
registerRoot(RemotionRoot);
