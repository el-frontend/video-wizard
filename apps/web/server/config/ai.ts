import { openai } from '@ai-sdk/openai';
import { requireEnv } from '../lib/utils';

/**
 * AI models configuration
 */
export const AI_MODELS = {
  contentAnalysis: openai('gpt-5-mini'),
} as const;

/**
 * OpenAI API configuration
 */
export function getOpenAIConfig() {
  const apiKey = requireEnv('OPENAI_API_KEY');
  
  return {
    apiKey,
  };
}

/**
 * Validates that the AI configuration is ready
 */
export function validateAIConfig(): void {
  getOpenAIConfig();
}
