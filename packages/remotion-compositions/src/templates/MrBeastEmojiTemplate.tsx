import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Emoji keyword mappings by language
 */
const EMOJI_MAP: Record<string, Record<string, string[]>> = {
  en: {
    // Money & Business
    money: ['💰', '💵', '🤑'],
    dollar: ['💵', '💰'],
    rich: ['🤑', '💎', '💰'],
    business: ['💼', '📈', '🏢'],
    work: ['💼', '⚙️', '🔧'],
    job: ['💼', '👔', '🏢'],
    invest: ['📈', '💹', '💰'],
    profit: ['📈', '💰', '🤑'],
    sell: ['🏷️', '💵', '🛒'],
    buy: ['🛒', '💳', '🛍️'],
    price: ['🏷️', '💰', '💵'],

    // Success & Growth
    success: ['🏆', '⭐', '🎯'],
    win: ['🏆', '🥇', '✨'],
    goal: ['🎯', '🏆', '⭐'],
    grow: ['📈', '🌱', '⬆️'],
    growth: ['📈', '🌱', '🚀'],
    improve: ['📈', '⬆️', '✨'],
    better: ['⬆️', '✨', '💪'],
    best: ['🏆', '⭐', '👑'],

    // Emotions
    love: ['❤️', '💕', '😍'],
    happy: ['😊', '🎉', '✨'],
    sad: ['😢', '💔', '😞'],
    angry: ['😠', '🔥', '💢'],
    fear: ['😨', '😱', '💀'],
    surprise: ['😲', '🤯', '😮'],
    excited: ['🎉', '🤩', '🔥'],

    // Actions
    think: ['🤔', '💭', '🧠'],
    idea: ['💡', '🧠', '✨'],
    learn: ['📚', '🎓', '🧠'],
    teach: ['👨‍🏫', '📖', '🎓'],
    talk: ['🗣️', '💬', '🎤'],
    speak: ['🗣️', '🎤', '💬'],
    listen: ['👂', '🎧', '🔊'],
    watch: ['👀', '📺', '🎬'],
    see: ['👀', '👁️', '🔍'],
    look: ['👀', '🔍', '👁️'],
    eat: ['🍽️', '😋', '🍴'],
    sleep: ['😴', '🛏️', '💤'],
    run: ['🏃', '💨', '👟'],
    walk: ['🚶', '👣', '🦶'],
    fight: ['👊', '🥊', '💥'],

    // Time
    time: ['⏰', '⌚', '🕐'],
    today: ['📅', '☀️', '🌤️'],
    tomorrow: ['📅', '🌅', '⏰'],
    yesterday: ['📅', '⏪', '🕐'],
    now: ['⏰', '🔔', '⚡'],
    fast: ['⚡', '🚀', '💨'],
    slow: ['🐢', '🐌', '⏳'],
    wait: ['⏳', '⌛', '🕐'],

    // People
    people: ['👥', '🧑‍🤝‍🧑', '👪'],
    friend: ['🤝', '👫', '💛'],
    family: ['👨‍👩‍👧‍👦', '👪', '❤️'],
    team: ['👥', '🤝', '💪'],
    man: ['👨', '🧔', '🙋‍♂️'],
    woman: ['👩', '💃', '🙋‍♀️'],
    kid: ['👶', '🧒', '👦'],
    baby: ['👶', '🍼', '🧒'],

    // Technology
    phone: ['📱', '📲', '☎️'],
    computer: ['💻', '🖥️', '⌨️'],
    internet: ['🌐', '📶', '💻'],
    video: ['🎬', '📹', '🎥'],
    social: ['📱', '💬', '👥'],
    app: ['📱', '📲', '💻'],

    // Health & Body
    health: ['💪', '🏥', '❤️'],
    body: ['💪', '🏋️', '🧘'],
    mind: ['🧠', '💭', '🧘'],
    strong: ['💪', '🏋️', '⚡'],
    weak: ['😫', '📉', '💔'],
    sick: ['🤒', '🏥', '💊'],
    doctor: ['👨‍⚕️', '🏥', '💊'],

    // Food & Drink
    food: ['🍕', '🍔', '🍽️'],
    water: ['💧', '🚰', '💦'],
    coffee: ['☕', '🫖', '😊'],
    beer: ['🍺', '🍻', '🥳'],

    // Nature
    world: ['🌍', '🌎', '🌏'],
    earth: ['🌍', '🌱', '🌿'],
    sun: ['☀️', '🌅', '🌞'],
    moon: ['🌙', '🌕', '🌛'],
    star: ['⭐', '✨', '🌟'],
    fire: ['🔥', '💥', '⚡'],

    // Positive words
    yes: ['✅', '👍', '🎉'],
    good: ['👍', '✨', '⭐'],
    great: ['🔥', '⭐', '🎉'],
    amazing: ['🤩', '🔥', '✨'],
    awesome: ['🔥', '💯', '🎉'],
    perfect: ['💯', '✨', '👌'],

    // Negative words
    no: ['❌', '🚫', '👎'],
    bad: ['👎', '❌', '😞'],
    wrong: ['❌', '⚠️', '🚫'],
    problem: ['⚠️', '❗', '🔧'],
    mistake: ['❌', '⚠️', '😬'],

    // Numbers & Quantity
    one: ['1️⃣', '☝️'],
    two: ['2️⃣', '✌️'],
    three: ['3️⃣', '🥉'],
    first: ['🥇', '1️⃣', '☝️'],
    second: ['🥈', '2️⃣'],
    third: ['🥉', '3️⃣'],
    million: ['💰', '🤯', '💎'],
    billion: ['💰', '🤯', '💎'],
    hundred: ['💯', '📊'],
    percent: ['📊', '💯', '📈'],

    // Action words
    start: ['🚀', '▶️', '🏁'],
    stop: ['🛑', '⏹️', '✋'],
    go: ['🚀', '➡️', '💨'],
    come: ['👋', '🙌', '➡️'],
    make: ['🔧', '⚙️', '🛠️'],
    create: ['✨', '🎨', '🛠️'],
    build: ['🏗️', '🔨', '🧱'],
    change: ['🔄', '✨', '🔃'],

    // Questions
    why: ['❓', '🤔', '💭'],
    how: ['❓', '🤔', '📖'],
    what: ['❓', '🔍', '💭'],
    when: ['⏰', '📅', '❓'],
    where: ['📍', '🗺️', '❓'],
    who: ['👤', '❓', '🔍'],

    // Misc
    secret: ['🤫', '🔐', '🕵️'],
    power: ['⚡', '💪', '🔋'],
    energy: ['⚡', '🔋', '💥'],
    magic: ['✨', '🪄', '🎩'],
    crazy: ['🤪', '🔥', '💥'],
    free: ['🆓', '🎁', '✨'],
    new: ['✨', '🆕', '🌟'],
    old: ['📜', '🏛️', '👴'],
    big: ['🐘', '📏', '🔝'],
    small: ['🐜', '🔬', '📍'],
    important: ['⚠️', '❗', '⭐'],
    simple: ['✅', '👌', '💡'],
    hard: ['💪', '🏋️', '😤'],
    easy: ['👌', '✨', '😊'],
    truth: ['✅', '💯', '🎯'],
    lie: ['🤥', '❌', '👎'],
    real: ['💯', '✅', '🎯'],
    fake: ['🤥', '❌', '👎'],
  },
  es: {
    // Dinero y Negocios
    dinero: ['💰', '💵', '🤑'],
    plata: ['💵', '💰', '🤑'],
    rico: ['🤑', '💎', '💰'],
    negocio: ['💼', '📈', '🏢'],
    trabajo: ['💼', '⚙️', '🔧'],
    invertir: ['📈', '💹', '💰'],
    ganancia: ['📈', '💰', '🤑'],
    vender: ['🏷️', '💵', '🛒'],
    comprar: ['🛒', '💳', '🛍️'],
    precio: ['🏷️', '💰', '💵'],

    // Éxito y Crecimiento
    exito: ['🏆', '⭐', '🎯'],
    ganar: ['🏆', '🥇', '✨'],
    meta: ['🎯', '🏆', '⭐'],
    objetivo: ['🎯', '🏆', '⭐'],
    crecer: ['📈', '🌱', '⬆️'],
    crecimiento: ['📈', '🌱', '🚀'],
    mejorar: ['📈', '⬆️', '✨'],
    mejor: ['⬆️', '✨', '💪'],

    // Emociones
    amor: ['❤️', '💕', '😍'],
    feliz: ['😊', '🎉', '✨'],
    triste: ['😢', '💔', '😞'],
    enojado: ['😠', '🔥', '💢'],
    miedo: ['😨', '😱', '💀'],
    sorpresa: ['😲', '🤯', '😮'],
    emocionado: ['🎉', '🤩', '🔥'],

    // Acciones
    pensar: ['🤔', '💭', '🧠'],
    idea: ['💡', '🧠', '✨'],
    aprender: ['📚', '🎓', '🧠'],
    ensenar: ['👨‍🏫', '📖', '🎓'],
    hablar: ['🗣️', '💬', '🎤'],
    escuchar: ['👂', '🎧', '🔊'],
    ver: ['👀', '📺', '🎬'],
    mirar: ['👀', '🔍', '👁️'],
    comer: ['🍽️', '😋', '🍴'],
    dormir: ['😴', '🛏️', '💤'],
    correr: ['🏃', '💨', '👟'],
    caminar: ['🚶', '👣', '🦶'],
    pelear: ['👊', '🥊', '💥'],

    // Tiempo
    tiempo: ['⏰', '⌚', '🕐'],
    hoy: ['📅', '☀️', '🌤️'],
    manana: ['📅', '🌅', '⏰'],
    ayer: ['📅', '⏪', '🕐'],
    ahora: ['⏰', '🔔', '⚡'],
    rapido: ['⚡', '🚀', '💨'],
    lento: ['🐢', '🐌', '⏳'],
    esperar: ['⏳', '⌛', '🕐'],

    // Personas
    gente: ['👥', '🧑‍🤝‍🧑', '👪'],
    personas: ['👥', '🧑‍🤝‍🧑', '👪'],
    amigo: ['🤝', '👫', '💛'],
    familia: ['👨‍👩‍👧‍👦', '👪', '❤️'],
    equipo: ['👥', '🤝', '💪'],
    hombre: ['👨', '🧔', '🙋‍♂️'],
    mujer: ['👩', '💃', '🙋‍♀️'],
    nino: ['👶', '🧒', '👦'],
    bebe: ['👶', '🍼', '🧒'],

    // Tecnología
    telefono: ['📱', '📲', '☎️'],
    celular: ['📱', '📲', '☎️'],
    computadora: ['💻', '🖥️', '⌨️'],
    internet: ['🌐', '📶', '💻'],
    video: ['🎬', '📹', '🎥'],

    // Salud
    salud: ['💪', '🏥', '❤️'],
    cuerpo: ['💪', '🏋️', '🧘'],
    mente: ['🧠', '💭', '🧘'],
    fuerte: ['💪', '🏋️', '⚡'],
    debil: ['😫', '📉', '💔'],
    enfermo: ['🤒', '🏥', '💊'],
    doctor: ['👨‍⚕️', '🏥', '💊'],

    // Comida
    comida: ['🍕', '🍔', '🍽️'],
    agua: ['💧', '🚰', '💦'],
    cafe: ['☕', '🫖', '😊'],
    cerveza: ['🍺', '🍻', '🥳'],

    // Naturaleza
    mundo: ['🌍', '🌎', '🌏'],
    tierra: ['🌍', '🌱', '🌿'],
    sol: ['☀️', '🌅', '🌞'],
    luna: ['🌙', '🌕', '🌛'],
    estrella: ['⭐', '✨', '🌟'],
    fuego: ['🔥', '💥', '⚡'],

    // Positivas
    si: ['✅', '👍', '🎉'],
    bueno: ['👍', '✨', '⭐'],
    genial: ['🔥', '⭐', '🎉'],
    increible: ['🤩', '🔥', '✨'],
    perfecto: ['💯', '✨', '👌'],

    // Negativas
    no: ['❌', '🚫', '👎'],
    malo: ['👎', '❌', '😞'],
    problema: ['⚠️', '❗', '🔧'],
    error: ['❌', '⚠️', '😬'],

    // Números
    uno: ['1️⃣', '☝️'],
    dos: ['2️⃣', '✌️'],
    tres: ['3️⃣', '🥉'],
    primero: ['🥇', '1️⃣', '☝️'],
    segundo: ['🥈', '2️⃣'],
    tercero: ['🥉', '3️⃣'],
    millon: ['💰', '🤯', '💎'],
    cien: ['💯', '📊'],
    porciento: ['📊', '💯', '📈'],

    // Acciones
    empezar: ['🚀', '▶️', '🏁'],
    comenzar: ['🚀', '▶️', '🏁'],
    parar: ['🛑', '⏹️', '✋'],
    ir: ['🚀', '➡️', '💨'],
    venir: ['👋', '🙌', '➡️'],
    hacer: ['🔧', '⚙️', '🛠️'],
    crear: ['✨', '🎨', '🛠️'],
    construir: ['🏗️', '🔨', '🧱'],
    cambiar: ['🔄', '✨', '🔃'],

    // Preguntas
    porque: ['❓', '🤔', '💭'],
    como: ['❓', '🤔', '📖'],
    que: ['❓', '🔍', '💭'],
    cuando: ['⏰', '📅', '❓'],
    donde: ['📍', '🗺️', '❓'],
    quien: ['👤', '❓', '🔍'],

    // Misc
    secreto: ['🤫', '🔐', '🕵️'],
    poder: ['⚡', '💪', '🔋'],
    energia: ['⚡', '🔋', '💥'],
    magia: ['✨', '🪄', '🎩'],
    loco: ['🤪', '🔥', '💥'],
    gratis: ['🆓', '🎁', '✨'],
    nuevo: ['✨', '🆕', '🌟'],
    viejo: ['📜', '🏛️', '👴'],
    grande: ['🐘', '📏', '🔝'],
    pequeno: ['🐜', '🔬', '📍'],
    importante: ['⚠️', '❗', '⭐'],
    simple: ['✅', '👌', '💡'],
    dificil: ['💪', '🏋️', '😤'],
    facil: ['👌', '✨', '😊'],
    verdad: ['✅', '💯', '🎯'],
    mentira: ['🤥', '❌', '👎'],
    real: ['💯', '✅', '🎯'],
    falso: ['🤥', '❌', '👎'],
  },
};

/**
 * Find emojis that match words in the text
 */
function findMatchingEmojis(text: string, language: string = 'en'): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const matchedEmojis: string[] = [];
  const usedCategories = new Set<string>();

  // Get the emoji map for the language, fallback to English
  const langMap = EMOJI_MAP[language] || EMOJI_MAP['en'];

  for (const word of words) {
    // Clean the word (remove punctuation)
    const cleanWord = word.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]/g, '');

    // Check for exact match
    if (langMap[cleanWord] && !usedCategories.has(cleanWord)) {
      matchedEmojis.push(langMap[cleanWord][0]);
      usedCategories.add(cleanWord);
    }

    // Check for partial matches (word starts with or contains key)
    if (matchedEmojis.length < 3) {
      for (const [key, emojis] of Object.entries(langMap)) {
        if (!usedCategories.has(key) && cleanWord.length > 3) {
          if (cleanWord.includes(key) || key.includes(cleanWord)) {
            matchedEmojis.push(emojis[0]);
            usedCategories.add(key);
            break;
          }
        }
      }
    }

    // Limit to 3 emojis max
    if (matchedEmojis.length >= 3) break;
  }

  return matchedEmojis.slice(0, 3);
}

interface MrBeastEmojiTemplateProps extends CaptionTemplateProps {
  language?: string;
}

/**
 * MrBeast Emoji Caption Template
 *
 * MrBeast-style captions with contextual emojis:
 * - Bold comic/playful font style
 * - White text with thick black stroke
 * - Key words highlighted in green
 * - Animated emojis below based on content
 * - Multi-language keyword support
 */
export function MrBeastEmojiTemplate({
  currentWord,
  currentSegment,
  isActive,
  language = 'en',
}: MrBeastEmojiTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Split all words in the segment
  const allWords = currentSegment.text.split(' ');

  // Group words into chunks (max 5 words per line)
  const wordsPerChunk = 5;
  const chunks: string[][] = [];
  for (let i = 0; i < allWords.length; i += wordsPerChunk) {
    chunks.push(allWords.slice(i, i + wordsPerChunk));
  }

  // Calculate segment timing
  const segmentStartFrame = currentSegment.start * fps;
  const segmentEndFrame = currentSegment.end * fps;
  const frameInSegment = frame - segmentStartFrame;
  const segmentDuration = segmentEndFrame - segmentStartFrame;

  // Calculate which chunk to show based on time
  const durationPerChunk = segmentDuration / chunks.length;
  const currentChunkIndex = Math.min(
    Math.floor(frameInSegment / durationPerChunk),
    chunks.length - 1
  );
  const currentChunk = chunks[Math.max(0, currentChunkIndex)];
  const chunkText = currentChunk.join(' ');

  // Find matching emojis for this chunk
  const emojis = findMatchingEmojis(chunkText, language);

  // Calculate frame within current chunk
  const chunkStartFrame = currentChunkIndex * durationPerChunk;
  const frameInChunk = frameInSegment - chunkStartFrame;

  // Calculate which word is active
  const wordsInChunk = currentChunk.length;
  const durationPerWord = durationPerChunk / wordsInChunk;
  const currentWordIndex = Math.floor(frameInChunk / durationPerWord);

  // Chunk pop-in animation
  const popDuration = 12;
  const chunkScale = interpolate(
    frameInChunk,
    [0, popDuration * 0.4, popDuration],
    [0.3, 1.1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const chunkOpacity = interpolate(
    frameInChunk,
    [0, popDuration * 0.5],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Emoji bounce animation (staggered after text appears)
  const emojiAnimations = emojis.map((_, index) => {
    const delay = popDuration + (index * 3);

    const emojiScale = interpolate(
      frameInChunk,
      [delay, delay + 4, delay + 8],
      [0, 1.4, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const emojiY = interpolate(
      frameInChunk,
      [delay, delay + 4, delay + 8],
      [30, -8, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const emojiRotate = interpolate(
      frameInChunk,
      [delay, delay + 4, delay + 8],
      [-15, 10, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { scale: emojiScale, y: emojiY, rotate: emojiRotate };
  });

  // Exit animation
  const exitDuration = 4;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const exitScale = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0.8],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(chunkOpacity, exitOpacity);
  const finalScale = Math.min(chunkScale, exitScale);

  // MrBeast green color for highlights
  const mrBeastGreen = '#00FF00';

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 20px 450px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '80%',
          gap: '20px',
          opacity: finalOpacity,
          transform: `scale(${finalScale})`,
        }}
      >
        {/* Words in MrBeast style */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            gap: '16px',
            justifyContent: 'center',
            alignItems: 'center',
            maxWidth: '95%',
          }}
        >
          {currentChunk.map((word, wordIndex) => {
            // Calculate word-specific animation
            const wordStartFrame = wordIndex * durationPerWord;
            const frameInWord = frameInChunk - wordStartFrame;

            const isCurrentWord = wordIndex === currentWordIndex;

            // Individual word pop effect
            const wordPopDuration = 10;
            const wordScale = isCurrentWord
              ? interpolate(
                  frameInWord,
                  [0, wordPopDuration * 0.4, wordPopDuration],
                  [1, 1.15, 1],
                  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                )
              : 1;

            // Determine if word should be green (highlight keywords)
            const isKeyword = wordIndex % 2 === 1 || word.length > 5;
            const textColor = isKeyword ? mrBeastGreen : '#FFFFFF';

            return (
              <div
                key={`${word}-${wordIndex}-${currentChunkIndex}`}
                style={{
                  transform: `scale(${wordScale})`,
                }}
              >
                <p
                  style={{
                    color: textColor,
                    fontSize: '56px',
                    fontWeight: 900,
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: 1.1,
                    fontFamily: 'Impact, Bangers, Comic Sans MS, cursive, sans-serif',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    letterSpacing: '1px',
                    textShadow: `
                      -4px -4px 0 #000,
                      4px -4px 0 #000,
                      -4px 4px 0 #000,
                      4px 4px 0 #000,
                      -4px 0 0 #000,
                      4px 0 0 #000,
                      0 -4px 0 #000,
                      0 4px 0 #000,
                      0 6px 12px rgba(0, 0, 0, 0.6)
                    `,
                    WebkitTextStroke: '3px #000000',
                    paintOrder: 'stroke fill',
                  }}
                >
                  {word}
                </p>
              </div>
            );
          })}
        </div>

        {/* Emojis row */}
        {emojis.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '24px',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {emojis.map((emoji, index) => (
              <div
                key={`${emoji}-${index}-${currentChunkIndex}`}
                style={{
                  fontSize: '64px',
                  transform: `scale(${emojiAnimations[index]?.scale || 0}) translateY(${emojiAnimations[index]?.y || 0}px) rotate(${emojiAnimations[index]?.rotate || 0}deg)`,
                  filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5))',
                }}
              >
                {emoji}
              </div>
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}
