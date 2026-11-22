/**
 * Pre-compiled regex patterns for metadata extraction
 * Using constants for better performance instead of function wrappers
 */

import { AudioCodec, Language, Quality, Source, VideoCodec } from '@/types';

export interface PatternConfig<T> {
  regex: RegExp;
  value: T | true | null; // Allow null for removal-only patterns, true for not-enums
  specificity: number;
}

// ===== QUALITY PATTERNS =====

export const QUALITY_PATTERNS: PatternConfig<Quality>[] = [
  { regex: /(\b4320p\b)/gi, value: Quality['8K'], specificity: 98 },
  { regex: /(4320p)/gi, value: Quality['8K'], specificity: 90 },
  { regex: /(\b8k\b)/gi, value: Quality['8K'], specificity: 85 },
  { regex: /(\b2160p\b)/gi, value: Quality['4K'], specificity: 98 },
  { regex: /(2160p)/gi, value: Quality['4K'], specificity: 90 },
  { regex: /(\b4k\b)/gi, value: Quality['4K'], specificity: 85 },
  { regex: /(\buhd\b)/gi, value: Quality['4K'], specificity: 95 },
  { regex: /(\b2k\b)/gi, value: Quality['2K'], specificity: 85 },
  { regex: /(\b1440p\b)/gi, value: Quality['2K'], specificity: 98 },
  { regex: /(1440p)/gi, value: Quality['2K'], specificity: 90 },
  { regex: /(\b1080p\b)/gi, value: Quality.FHD, specificity: 95 },
  { regex: /(1080p)/gi, value: Quality.FHD, specificity: 90 },
  { regex: /(\bfhd\b|\bfull\s*hd\b)/gi, value: Quality.FHD, specificity: 70 },
  { regex: /(\b720p\b)/gi, value: Quality.HD, specificity: 98 },
  { regex: /(720p)/gi, value: Quality.HD, specificity: 90 },
  { regex: /(\bhd\b)/gi, value: Quality.HD, specificity: 50 },
  { regex: /(\b480p\b|\b360p\b)/gi, value: Quality.SD, specificity: 98 },
  { regex: /(480p|360p)/gi, value: Quality.SD, specificity: 90 },
  { regex: /(\b480i\b|\b360i\b)/gi, value: Quality.SD, specificity: 95 },
  { regex: /(\bsd\b)/gi, value: Quality.SD, specificity: 60 },
];

export const FALLBACK_QUALITY_PATTERNS: PatternConfig<Quality>[] = [
  // Fallback patterns for standalone numbers (lower confidence)
  { regex: /\b(4320)\b/gi, value: Quality['8K'], specificity: 40 },
  { regex: /\b(2160)\b/gi, value: Quality['4K'], specificity: 40 },
  { regex: /\b(1440)\b/gi, value: Quality['2K'], specificity: 40 },
  { regex: /\b(1080)\b/gi, value: Quality.FHD, specificity: 40 },
  { regex: /\b(720)\b/gi, value: Quality.HD, specificity: 40 },
  { regex: /\b(480|360)\b/gi, value: Quality.SD, specificity: 40 },
];

// ===== VIDEO CODEC PATTERNS =====

export const VIDEO_CODEC_PATTERNS: PatternConfig<VideoCodec>[] = [
  // 10-bit variants first (higher priority)
  {
    regex: /(\b[hx][ .]?265\s*10.?bit\b|\bhevc\s*10.?bit\b)/gi,
    value: VideoCodec.X265_10BIT,
    specificity: 95,
  },
  { regex: /(\b[hx][ .]?264\s*10.?bit\b)/gi, value: VideoCodec.X264_10BIT, specificity: 95 },
  { regex: /(\bav1\s*10.?bit\b)/gi, value: VideoCodec.AV1_10BIT, specificity: 95 },
  // Standalone 10bit followed by x265/x264 (for cases like "10bit x265")
  // More conservative 10bit patterns - avoid consuming other metadata
  {
    regex: /(\b10.?bit\b\s+\b[hx][ .]?265\b)/gi,
    value: VideoCodec.X265_10BIT,
    specificity: 90,
  },
  {
    regex: /(\b10.?bit\b\s+\b[hx][ .]?264\b)/gi,
    value: VideoCodec.X264_10BIT,
    specificity: 90,
  },
  // Regular codecs - add H264/H265 patterns (common in names)
  { regex: /(\b[hx][ .]?265\b|\bhevc\b|\bh265\b)/gi, value: VideoCodec.X265, specificity: 85 },
  { regex: /(\b[hx][ .]?264\b|\bavc\b|\bh264\b)/gi, value: VideoCodec.X264, specificity: 85 },
  { regex: /(\bav1\b)/gi, value: VideoCodec.AV1, specificity: 90 },
  { regex: /(\bxvid\b|\bxvi\b)/gi, value: VideoCodec.XVID, specificity: 95 },
  { regex: /(\bvp9\b)/gi, value: VideoCodec.VP9, specificity: 95 },
  { regex: /(\bvp8\b)/gi, value: VideoCodec.VP8, specificity: 95 },
  // Remove standalone 10bit references
  { regex: /(\b10.?bit\b)/gi, value: null, specificity: 85 },
];

// ===== AUDIO CODEC PATTERNS =====

export const AUDIO_CODEC_PATTERNS: PatternConfig<AudioCodec>[] = [
  { regex: /(\btruehd\b|\btrue\s*hd\b)/gi, value: AudioCodec.TRUEHD, specificity: 95 },
  { regex: /(\batmos\b)/gi, value: AudioCodec.ATMOS, specificity: 95 },
  { regex: /(\bdts[-\s]*hd[-\s]*ma\b)/gi, value: AudioCodec.DTS_HDMA, specificity: 95 },
  { regex: /(\bdts[-\s]*hd\b)/gi, value: AudioCodec.DTS_HD, specificity: 90 },
  { regex: /(\bdts\b(?![-\s]*hd))/gi, value: AudioCodec.DTS, specificity: 85 },
  { regex: /(\beac3\b|\be-ac3\b|\bdd\+\b)/gi, value: AudioCodec.EAC3, specificity: 90 },
  { regex: /(\bac3\b|\bdolby\s*digital\b)/gi, value: AudioCodec.AC3, specificity: 85 },
  { regex: /(\baac[2-9]?\b)/gi, value: AudioCodec.AAC, specificity: 85 },
  { regex: /(\bflac\b)/gi, value: AudioCodec.FLAC, specificity: 95 },
  { regex: /(\bmp3\b)/gi, value: AudioCodec.MP3, specificity: 95 },
  { regex: /(\bpcm\b|\blpcm\b)/gi, value: AudioCodec.PCM, specificity: 90 },
  { regex: /(\bopus\b)/gi, value: AudioCodec.OPUS, specificity: 95 },
  // DDP patterns (should be detected as EAC3 but also remove DDP references)
  { regex: /(\bddp[25]?[\s.]\d+\b)/gi, value: AudioCodec.EAC3, specificity: 90 },
  { regex: /(\bddp[25]?\b)/gi, value: AudioCodec.EAC3, specificity: 85 },
  { regex: /(\bddp\b)/gi, value: AudioCodec.EAC3, specificity: 80 },
  { regex: /(\bdd\b)/gi, value: AudioCodec.AC3, specificity: 75 },
  // Audio channel info and technical terms (removal only)
  { regex: /(\b[2357][\s.][01](?:\s*ch)?\b)/gi, value: null, specificity: 70 },
  { regex: /(\b\d+ch\b)/gi, value: null, specificity: 85 },
  { regex: /(\bma\b)/gi, value: null, specificity: 75 },
];

// ===== SOURCE PATTERNS =====

export const SOURCE_PATTERNS: PatternConfig<Source>[] = [
  {
    regex: /(\bweb[ -]?rip\b|\bweb[ -]?dl\b)/gi,
    value: Source.WEB,
    specificity: 90,
  },
  {
    regex: /(\bweb\b)/gi,
    value: Source.WEB,
    specificity: 60,
  },
  { regex: /(\bitunes\b|\bnetflix\b)/gi, value: Source.WEB, specificity: 85 },
  {
    regex: /(\bbdrip\b|\bbluray\b|\bblu[ -]?ray\b|\bbdremux\b|\bbrrip\b)/gi,
    value: Source.BLURAY,
    specificity: 90,
  },
  { regex: /(\bhdtv\b|\bhdrip\b)/gi, value: Source.HDTV, specificity: 85 },
  { regex: /(\bdvdrip\b|\bdvdr\b|\bdvdscr\b|\bdvd\b)/gi, value: Source.DVD, specificity: 80 },
  { regex: /(\btsrip\b|\btelesync\b|\bhdts\b|\bTS\b)/gi, value: Source.TS, specificity: 95 },
  { regex: /(\bcamrip\b|\bcam\b|\bhdcam\b)/gi, value: Source.CAM, specificity: 95 },
  { regex: /(\bdcp(?:[ -]?rip)?\b)/gi, value: Source.DCP, specificity: 95 },
  // Remove technical source terms
  { regex: /(\bremux\b)/gi, value: null, specificity: 85 },
];

// ===== LANGUAGE PATTERNS =====

/**
 * One of the tags as a word of its own. Letters outside ASCII bound words too, unlike `\b`: the
 * "Cz" of the Polish "Człowiek" names no language. `caseSensitive` for tags that are also
 * ordinary words in other cases ("Attila the Hun").
 */
const tags = (alternatives: string, caseSensitive = false): RegExp =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`,
    caseSensitive ? 'gu' : 'giu'
  );

/**
 * Tags as release names write them, checked against the names of stored releases. Short codes
 * that are also common words or names ("Dan", "nor", "fin", "Lt Dan") are left out.
 */
export const LANGUAGE_PATTERNS: PatternConfig<Language>[] = [
  {
    // Also English subtitles ("EngSub", "Eng-Subs") and dubs ("EngDub").
    regex: tags('eng|english|eng[ -]?(?:sub|dub)s?'),
    value: Language.ENGLISH,
    specificity: 85,
  },
  {
    // French scene tags: dubs (VF, VFF, VFQ, VFI, VF2, TRUEFRENCH) and subtitles (VOSTFR).
    regex: tags('fre|fra|(?:true|sub)?french|vf[fqi2]?|vostfr'),
    value: Language.FRENCH,
    specificity: 90,
  },
  {
    // Also the Spain and Latin-American dubs: "Castellano", "Latino", "LAT" (as in "ESP-LAT-ENG").
    regex: tags('spa|esp|spanish|español|espanol|castellano|latino|lat'),
    value: Language.SPANISH,
    specificity: 90,
  },
  { regex: tags('ger|deu|german|deutsch'), value: Language.GERMAN, specificity: 85 },
  {
    // Also Italian subtitles ("SubITA", "Sub-ITA") and "iTALiAN"/"Italiano".
    regex: tags('ita|italian[oa]?|sub[ -]?ita'),
    value: Language.ITALIAN,
    specificity: 85,
  },
  {
    // Also the Brazilian dubs and subtitles: "PT-BR", "Dublado", "Legendado".
    regex: tags('por|portuguese|português|portugues|pt[ -]?br|dublado|legendado'),
    value: Language.PORTUGUESE,
    specificity: 90,
  },
  { regex: tags('nld|dut|dutch|nl(?:[ ._-]?subs?)?'), value: Language.DUTCH, specificity: 90 },
  { regex: tags('swe(?:[ ._-]?subs?)?|swedish'), value: Language.SWEDISH, specificity: 90 },
  { regex: tags('danish|dk'), value: Language.DANISH, specificity: 90 },
  { regex: tags('norwegian|norsk'), value: Language.NORWEGIAN, specificity: 90 },
  { regex: tags('finnish|suomi'), value: Language.FINNISH, specificity: 90 },
  {
    // Polish dubs, subtitles and voice-overs: "PL", "PLDUB", "PLSUB", "Lektor".
    regex: tags('pl(?:[ ._-]?(?:dub|sub)s?)?|pol|polish|lektor'),
    value: Language.POLISH,
    specificity: 90,
  },
  { regex: tags('cze?|czech'), value: Language.CZECH, specificity: 90 },
  { regex: tags('slo|sk|svk|slovak'), value: Language.SLOVAK, specificity: 90 },
  { regex: tags('HUN', true), value: Language.HUNGARIAN, specificity: 90 },
  { regex: tags('hungarian|magyar'), value: Language.HUNGARIAN, specificity: 90 },
  { regex: tags('romanian|rosubs?'), value: Language.ROMANIAN, specificity: 90 },
  { regex: tags('rus|russian'), value: Language.RUSSIAN, specificity: 90 },
  { regex: tags('ukr|ukrainian'), value: Language.UKRAINIAN, specificity: 90 },
  { regex: tags('TR', true), value: Language.TURKISH, specificity: 90 },
  { regex: tags('turkish'), value: Language.TURKISH, specificity: 90 },
  { regex: tags('gre|greek'), value: Language.GREEK, specificity: 90 },
  { regex: tags('chi|ch[st]|chinese|mandarin'), value: Language.CHINESE, specificity: 85 },
  { regex: tags('jpn?|jap|japanese'), value: Language.JAPANESE, specificity: 90 },
  { regex: tags('kor|korean'), value: Language.KOREAN, specificity: 90 },
  { regex: tags('hin|hindi'), value: Language.HINDI, specificity: 90 },
  {
    // Lithuanian dubs and subtitles ("LT subs", "LT.Dub"). A bare "LT" is too common to count.
    regex: tags('ltu|lt[ ._-]?(?:subs?|dub(?:bed)?)|lithuanian|liet|lietuvi\\p{L}*'),
    value: Language.LITHUANIAN,
    specificity: 90,
  },
  {
    regex: tags('multi|multilingual|multisubs|dual'),
    value: Language.MULTI,
    specificity: 95,
  },
];

// ===== TECHNICAL CLEANUP PATTERNS =====

export const TECHNICAL_CLEANUP_PATTERNS: PatternConfig<null>[] = [
  // HDR and color standards
  { regex: /(\bhdr10\+?\b)/gi, value: null, specificity: 85 },
  { regex: /(\bdovi\b)/gi, value: null, specificity: 85 },
  { regex: /(\bhdr\b)/gi, value: null, specificity: 80 },
  { regex: /(\bsdr\b)/gi, value: null, specificity: 80 },
  // Release group patterns
  { regex: /(-[A-Z0-9]+$)/gi, value: null, specificity: 90 },
  // Misc technical terms
  { regex: /(\bproper\b|\bextended\b|\bremastered\b)/gi, value: null, specificity: 85 },
  { regex: /(\bntsc\b|\bpal\b)/gi, value: null, specificity: 80 },
  { regex: /(\b\d+i\b)/gi, value: null, specificity: 75 }, // 480i, 1080i
  // Platform/service indicators (for removal from title)
  { regex: /(\bamzn\b|\bnf\b|\bhulu\b|\bdisney\+?\b)/gi, value: null, specificity: 70 },
];

// ===== TV DATA PATTERNS =====

export const TV_SEASON_EPISODE_PATTERN = /[sS](\d{1,2})[eE](\d{1,3})/g;
export const TV_X_FORMAT_PATTERN = /(\d{1,2})[xX](\d{2,3})/g;
export const TV_EPISODE_ONLY_PATTERN = /[eE](\d{2,3})/g;

// ===== YEAR PATTERN =====

export const YEAR_PATTERNS: PatternConfig<string>[] = [
  { regex: /\b(19\d{2}|20\d{2})\b/g, value: true, specificity: 100 },
];
