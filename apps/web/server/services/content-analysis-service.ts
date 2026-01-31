import { generateText, Output } from 'ai';
import { AI_MODELS, validateAIConfig } from '../config/ai';
import { logger, safeAsync, validateString } from '../lib/utils';
import {
    buildAnalysisPrompt,
    VIRAL_EDITOR_SYSTEM_PROMPT,
} from '../prompts/viral-editor';
import {
    ContentAnalysis,
    ContentAnalysisSchema,
} from '../types/content-analysis';

/**
 * Service for video content analysis
 *
 * Provides functionality to analyze video transcriptions
 * and identify segments with viral potential using AI.
 */
export class ContentAnalysisService {
  /**
   * Analyzes a video transcription to identify viral clips
   *
   * @param transcript - The video transcription to analyze
   * @param language - The detected language code (e.g., "en", "es")
   * @returns Structured analysis with identified clips and their scores
   * @throws Error if AI configuration is invalid or analysis fails
   */
  async analyzeTranscript(transcript: string, language: string = 'en'): Promise<ContentAnalysis> {
    // Validate configuration before proceeding
    validateAIConfig();

    // Validate input
    this.validateTranscript(transcript);

    logger.info('Starting content analysis', {
      transcriptLength: transcript.length,
      language,
    });

    return safeAsync(async () => {
      const { output } = await generateText({
        model: AI_MODELS.contentAnalysis,
        output: Output.object({
          schema: ContentAnalysisSchema,
        }),
        system: VIRAL_EDITOR_SYSTEM_PROMPT,
        prompt: buildAnalysisPrompt(transcript, language),
      });

      logger.info('Content analysis completed', {
        clipsFound: output.clips.length,
        language,
      });

      return output;
    }, 'Content analysis failed');
  }

  /**
   * Validates that a transcription meets minimum requirements
   * 
   * @param transcript - The transcription to validate
   * @returns true if valid
   * @throws Error with descriptive message if invalid
   */
  validateTranscript(transcript: string): boolean {
    validateString(transcript, 'Transcript', {
      minLength: 100,
    });

    return true;
  }
}

/**
 * Singleton instance of the service
 */
export const contentAnalysisService = new ContentAnalysisService();
