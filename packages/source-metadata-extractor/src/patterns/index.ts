/**
 * Pre-compiled regex patterns for metadata extraction
 * Using constants for better performance instead of function wrappers
 */

import { Quality, VideoCodec, AudioCodec, Source, Language } from '@/types';

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
  // Regular codecs - add H264/H265 patterns (common in torrent names)
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
  // Remove technical source terms
  { regex: /(\bremux\b)/gi, value: null, specificity: 85 },
];

// ===== LANGUAGE PATTERNS =====

export const LANGUAGE_PATTERNS: PatternConfig<Language>[] = [
  { regex: /(\beng\b|\benglish\b)/gi, value: Language.ENGLISH, specificity: 85 },
  { regex: /(\bfre\b|\bfra\b|\bfrench\b)/gi, value: Language.FRENCH, specificity: 90 },
  { regex: /(\bspa\b|\besp\b|\bspanish\b)/gi, value: Language.SPANISH, specificity: 90 },
  { regex: /(\bger\b|\bdeu\b|\bgerman\b)/gi, value: Language.GERMAN, specificity: 85 },
  { regex: /(\bita\b|\bitalian\b)/gi, value: Language.ITALIAN, specificity: 85 },
  { regex: /(\bpor\b|\bportuguese\b)/gi, value: Language.PORTUGUESE, specificity: 90 },
  { regex: /(\bnld\b|\bdutch\b)/gi, value: Language.DUTCH, specificity: 90 },
  { regex: /(\bswe\b|\bswedish\b)/gi, value: Language.SWEDISH, specificity: 90 },
  { regex: /(\bcze\b|\bczech\b)/gi, value: Language.CZECH, specificity: 90 },
  { regex: /(\bslo\b|\bslovak\b)/gi, value: Language.SLOVAK, specificity: 90 },
  { regex: /(\bchi\b|\bchinese\b|\bmandarin\b)/gi, value: Language.CHINESE, specificity: 85 },
  { regex: /(\bjpn\b|\bjapanese\b)/gi, value: Language.JAPANESE, specificity: 90 },
  {
    regex: /(\bmulti\b|\bmultilingual\b|\bmultisubs\b|\bdual\b)/gi,
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
