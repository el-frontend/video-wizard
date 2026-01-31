/**
 * System prompt for the "Viral Editor" AI
 * 
 * This specialized prompt guides the AI model to identify
 * segments with high viral potential in video transcriptions.
 */
export const VIRAL_EDITOR_SYSTEM_PROMPT = `You are an expert video editor specializing in creating viral short-form content for YouTube Shorts, TikTok, and Instagram Reels.

Your task is to analyze video transcripts and identify the most engaging segments that would work as standalone short-form videos.

CRITERIA FOR VIRAL CLIPS:
1. **Strong Hook** - Starts with something attention-grabbing (question, bold statement, surprising fact)
2. **Complete Thought** - Contains a full idea or story arc, not cut off mid-sentence
3. **Emotional Impact** - Evokes emotion (curiosity, laughter, surprise, inspiration)
4. **Optimal Length** - Between 45-120 seconds (prefer longer, more complete segments)
5. **Clear Conclusion** - Has a satisfying ending or punchline
6. **Standalone Value** - Can be understood without context from the full video
7. **Shareability** - Content people would want to share or discuss

DURATION GUIDELINES:
- **Preferred**: 60-120 seconds (allows for complete stories and deeper engagement)
- **Acceptable**: 45-90 seconds (good for quick insights)
- **Minimum**: 30 seconds (only if content is extremely compelling)
- Prioritize LONGER clips that tell a complete story over multiple short fragments
- If the video is short (under 3 minutes), consider extracting 1-2 large segments rather than many tiny ones

SCORING GUIDELINES (0-100):
- 90-100: Extremely viral potential, multiple strong elements
- 70-89: High potential, strong hook and conclusion
- 50-69: Good potential, meets most criteria
- 30-49: Moderate potential, needs some work
- 0-29: Low potential, weak or incomplete

Focus on quality over quantity. Prefer fewer, longer, more complete clips over many short fragments.
Provide clear reasoning for each clip selection.`;

/**
 * Language names for prompts
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
};

/**
 * Generates the user prompt for content analysis
 * @param transcript - The video transcript to analyze
 * @param language - The detected language code (e.g., "en", "es")
 */
export function buildAnalysisPrompt(transcript: string, language: string = 'en'): string {
  const languageName = LANGUAGE_NAMES[language] || 'the same language as the transcript';

  return `Analyze the following video transcript and identify the best segments for viral short-form content.

**IMPORTANT: The transcript is in ${languageName}. You MUST write ALL your responses (summary, hook, conclusion, analysis_summary) in ${languageName}.**

The transcript includes timestamps in [MM:SS] format. Use these ACTUAL timestamps for your clip recommendations.

${transcript}

IMPORTANT INSTRUCTIONS:
- **RESPOND IN ${languageName.toUpperCase()}** - All text fields must be in ${languageName}
- Use the ACTUAL timestamps from the transcript (format: [MM:SS])
- Clips should be between 45-120 seconds in length (PREFER LONGER CLIPS)
- Convert timestamps to seconds (e.g., [01:30] = 90 seconds, [02:00] = 120 seconds)
- Ensure start_time and end_time align with transcript segment boundaries
- Look for natural breaks and complete thoughts
- Identify strong hooks and conclusions within the time range
- **PRIORITIZE LONGER, MORE COMPLETE SEGMENTS** over fragmenting into many short clips
- If the video is short (under 3 minutes), extract 1-2 large segments that capture the best content
- Avoid creating many tiny clips - better to have 2-3 longer, complete stories
- Provide viral scores based on the criteria
- Explain why each clip has viral potential

DURATION PREFERENCES:
- 90-120 seconds: EXCELLENT - complete story with full context ✓✓✓
- 60-90 seconds: VERY GOOD - substantial content with good flow ✓✓
- 45-60 seconds: GOOD - adequate for concise message ✓
- 30-45 seconds: ACCEPTABLE - only if extremely compelling
- Under 30 seconds: AVOID - too short for meaningful engagement ✗

Example valid clips:
- start_time: 15.0, end_time: 105.0, Duration: 90 seconds ✓✓ (PREFERRED)
- start_time: 120.0, end_time: 240.0, Duration: 120 seconds ✓✓✓ (EXCELLENT)
- start_time: 45.0, end_time: 105.0, Duration: 60 seconds ✓✓ (VERY GOOD)

Invalid clip examples:
- Duration less than 15 seconds ✗
- Duration more than 120 seconds ✗
- Timestamps not found in transcript ✗
- Too many short fragments instead of fewer long clips ✗

Remember: Write your analysis in ${languageName}!`;
}

