/**
 * Utility functions for parsing torrent information
 */

const VIDEO_CODECS = [
  'x264',
  'x265',
  'h264',
  'h.264',
  'h 264',
  'avc',
  'h265',
  'h.265',
  'h 265',
  'hevc',
  'xvid',
  'divx',
  'vp9',
  'av1',
  'av-1',
  'mpeg2',
  'mpeg4',
  'vc1',
];

const QUALITY_PATTERNS = [
  '720p',
  '1080p',
  '2160p',
  '4k',
  'uhd',
  'hd',
  'fhd',
  'sd',
  'brrip',
  'bdrip',
  'bluray',
  'blu-ray',
  'remux',
  'webdl',
  'web-dl',
  'web',
  'webrip',
  'hdtv',
  'dvdrip',
  'hdrip',
  'hdr',
  'hdr10',
  'dv',
  'dolby vision',
  'hybrid',
];

const AUDIO_CODECS = [
  'aac',
  'ac3',
  'ac-3',
  'dts',
  'dolby',
  'dolbydigital',
  'dd5.1',
  'ddpa',
  'dts-hd',
  'truehd',
  'atmos',
  'flac',
  'mp3',
  'opus',
  '7.1',
  '5.1',
  '2.0',
];

const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  english: /\b(?:english|eng(?:lish)?|en)\b/i,
  spanish: /\b(?:spanish|spa(?:nish)?|es(?:p)?|castellano|cat(?:alan)?)\b/i,
  french: /\b(?:french|fra(?:ncais)?|fr(?:e)?)\b/i,
  german: /\b(?:german|ger(?:man)?|deu(?:tsch)?|de)\b/i,
  italian: /\b(?:italian|ita(?:lian)?|it)\b/i,
  russian: /\b(?:russian|rus(?:sian)?|ru)\b/i,
  japanese: /\b(?:japanese|jpn|jap(?:anese)?|jp)\b/i,
  korean: /\b(?:korean|kor(?:ean)?|kr)\b/i,
  chinese: /\b(?:chinese|chi(?:nese)?|zh|cn|cmn|mandarin)\b/i,
  portuguese: /\b(?:portuguese|por(?:tugues)?|pt(?:-br)?)\b/i,
  brazilian: /\b(?:brazilian|brazil|portugues[ -]?brasil|pt-br)\b/i,
  arabic: /\b(?:arabic|ara(?:bic)?|ar)\b/i,
  hindi: /\b(?:hindi|hin(?:di)?|hi)\b/i,
  tamil: /\b(?:tamil|tam)\b/i,
  telugu: /\b(?:telugu|tel)\b/i,
  malayalam: /\b(?:malayalam|mal)\b/i,
  czech: /\b(?:czech|cze(?:ch)?|cs)\b/i,
  slovak: /\b(?:slovak|slo(?:vak)?|sk)\b/i,
  polish: /\b(?:polish|pol|pl)\b/i,
  dutch: /\b(?:dutch|nld|nl|nederlands)\b/i,
  hungarian: /\b(?:hungarian|hun|hu|magyar)\b/i,
  turkish: /\b(?:turkish|tur(?:kish)?|tr)\b/i,
  thai: /\b(?:thai(?:land)?|th)\b/i,
  vietnamese: /\b(?:vietnamese|vie|vi)\b/i,
  indonesian: /\b(?:indonesian|ind|id)\b/i,
  hebrew: /\b(?:hebrew|heb|he)\b/i,
  multi: /\b(?:multi(?:ple)?|multi[.-_ ]?(?:lang|language|sub|audio)s?|dual[.-_ ]?audio)\b/i,
  dual: /\b(?:dual[.-_ ]?(?:lang|language|audio)?|2audio)\b/i,
  nordic: /\b(?:nordic|scandinavian)\b/i,
  other: /\b(?:other|multiple|various)\b/i,
};

const SUBTITLE_PATTERNS: Record<string, RegExp> = {
  subtitles: /\b(sub(title)?s?|srt)\b/i,
  specific_langs:
    /\b(sub(?:\.|:|\s+)(en|eng|english|es|spa|spanish|fr|french|de|german|it|italian|ru|russian|jp|jpn|japanese|ko|kor|korean|zh|chi|chinese|pt|por|portuguese|ar|ara|arabic|hi|hin|hindi))\b/i,
  multisubs: /\b(multi-?subs?)\b/i,
  sdh: /\b(sdh)\b/i,
};

const TV_PATTERNS: Record<string, RegExp> = {
  standard: /\bS(\d{1,2})\s*[.-]?\s*E(\d{1,3})\b/i,
  verbose: /\bSeason\s*(\d{1,2})\s*Episode\s*(\d{1,3})\b/i,
  abbreviated: /\b(\d{1,2})x(\d{2,3})\b/i,
  completeSeason: /\bS(\d{1,2})\b|\bSeason\s*(\d{1,2})\b/i,
};

export interface ParsedTorrentInfo {
  title: string;
  cleanTitle: string;
  isTV: boolean;
  movieName?: string;
  showName?: string;
  season?: number;
  episode?: number;
  isCompleteSeason?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: string;
  quality?: string;
  source?: string;
  hdrFormat?: string;
  resolution?: string;
  year?: number;
  languages: string[];
  hasMultipleLanguages: boolean;
  subtitles: string[];
  size: number;
  releaseGroup?: string;
  additionalInfo: Record<string, unknown>;
}

export interface TorrentFile {
  name: string;
  size: number;
  path?: string;
}

export interface TorrentMetadata {
  files?: TorrentFile[];
  category_str?: string;
  type?: string;
  short_name?: string;
  description?: string;
  size?: number;
}

function extractReleaseGroup(text: string): string | undefined {
  // Common release groups
  const knownGroups = {
    avoneguy: /\bavoneguy\b/i,
    turg: /\bturg\b/i,
    rosy: /\brosy\b/i,
    sgf: /\bsgf\b/i,
    thebiscuitman: /\bthebiscuitman\b/i,
    vyndros: /\bvyndros\b/i,
    portalgoods: /\bportalgoods\b/i,
    mgb: /\bmgb\b/i,
    e: /\bUHD.*Blu.*Ray.*E\b/i,
    fgt: /\bfgt\b/i,
    rarbg: /\brarbg\b/i,
    yts: /\byts\b/i,
    etrg: /\betrg\b/i,
    yify: /\byify\b/i,
    ettv: /\bettv\b/i,
    xvid: /\bxvid-?\w+\b/i,
    sparks: /\bsparks\b/i,
    dimension: /\bdimension\b/i,
    ctrlhd: /\bctrlhd\b/i,
    ntb: /\bntb\b/i,
    evo: /\bevo\b/i,
    qxr: /\bqxr\b/i,
    hon3y: /\bhon3y\b/i,
    d3g: /\bd3g\b/i,
    stuttershit: /\bstuttershit\b/i,
    framestor: /\bframestor\b/i,
    amiable: /\bamiable\b/i,
    dubby: /\bdubby\b/i,
  };

  // First check for known groups
  for (const [group, pattern] of Object.entries(knownGroups)) {
    if (pattern.test(text)) {
      return group;
    }
  }

  // Then try to extract unknown groups using common patterns
  const patterns = [
    // Group at end of filename after hyphen
    /-([A-Za-z0-9_-]{2,15})(?:$|\s|\.)/i,
    // Group in square brackets
    /\[([A-Za-z0-9_-]{2,15})\]/i,
    // Group in parentheses
    /\(([A-Za-z0-9_-]{2,15})\)/i,
    // Group after "by" or "from"
    /(?:by|from)\s+([A-Za-z0-9_-]{2,15})\b/i,
  ];

  const excludeWords = [
    // Technical terms
    'x264',
    'x265',
    'h264',
    'h265',
    'hevc',
    'av1',
    'vp9',
    'xvid',
    'divx',
    // Quality indicators
    '1080p',
    '2160p',
    '720p',
    '480p',
    '4k',
    'uhd',
    'hdr',
    'hdr10',
    'dv',
    // Source types
    'bluray',
    'brrip',
    'bdrip',
    'webrip',
    'web-dl',
    'webdl',
    'hdtv',
    // Audio terms
    'aac',
    'ac3',
    'dts',
    'truehd',
    'atmos',
    'dd5',
    'ddp',
    // Other metadata
    'extended',
    'repack',
    'proper',
    'rerip',
    'complete',
  ];

  const excludePattern = new RegExp(`\\b(${excludeWords.join('|')})\\b`, 'i');

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const group = match[1].trim();
      // Only accept if:
      // 1. Length is between 2-15 chars
      // 2. Not a technical term
      // 3. Contains at least one letter
      if (
        group.length >= 2 &&
        group.length <= 15 &&
        !excludePattern.test(group) &&
        /[a-z]/i.test(group)
      ) {
        return group.toLowerCase();
      }
    }
  }

  return undefined;
}

function cleanTitle(title: string): string {
  let cleaned = title.replace(/\.|_/g, ' ');

  cleaned = cleaned.replace(/\[[^\]]*\]|\([^\)]*\)/g, ' ');

  const removePatterns = [
    // TV patterns
    /\bS\d{1,2}\s*[.-]?\s*E\d{1,3}\b/i,
    /\bSeason\s*\d{1,2}\s*Episode\s*\d{1,3}\b/i,
    /\b\d{1,2}x\d{2,3}\b/i,
    /\bS\d{1,2}\b/i,
    /\bSeason\s*\d{1,2}\b/i,
    /\bComplete\s*Season\b/i,

    // Quality/format patterns
    /\b\d{3,4}p\b/i,
    /\b(bluray|webrip|web-?dl|hdtv)\b/i,
    /\b(netflix|amazon|hulu|disney)\b/i,

    // Release info
    /-([A-Za-z0-9]+)$/,
    /\[([A-Za-z0-9.-]+)\]/,
    /\(([A-Za-z0-9.-]+)\)/,

    // Other info
    /\b(multi|dual|extended|unrated)\b/i,
    /\b(proper|repack|real)\b/i,
    /\b(limited|internal)\b/i,
    /\b(3d|imax)\b/i,
    /\b(anniversary|edition)\b/i,
    /\b(19\d{2}|20\d{2})\b/,
  ];

  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  VIDEO_CODECS.concat(AUDIO_CODECS).forEach(codec => {
    cleaned = cleaned.replace(new RegExp(`\\b${codec}\\b`, 'i'), ' ');
  });

  QUALITY_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(new RegExp(`\\b${pattern}\\b`, 'i'), ' ');
  });

  // Keep "The" at beginning
  cleaned = cleaned.replace(/^(.+?),?\s+The\b/i, 'The $1');

  cleaned = cleaned.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  if (cleaned.toLowerCase().endsWith(' the')) {
    cleaned = 'The ' + cleaned.slice(0, -4);
  }

  return cleaned;
}

function extractSourceType(fullText: string): string | undefined {
  const text = fullText.toLowerCase();

  const sourcePatterns = [
    {
      type: 'UHD BluRay',
      patterns: [/\b(?:uhd[\s.-]*blu[\s.-]*ray|complete[\s.-]*uhd|ultrahd[\s.-]*bluray)\b/i],
      priority: 5,
    },
    {
      type: 'BluRay',
      patterns: [/\b(?:blu[\s.-]*ray(?!\s*rip)|bluray(?!\s*rip)|bd50|bd25|bdiso)\b/i],
      priority: 4,
    },
    {
      type: 'Remux',
      patterns: [/\b(?:remux|blu[\s.-]*ray[\s.-]*remux)\b/i],
      priority: 4,
    },
    {
      type: 'BDRip',
      patterns: [/\b(?:bdrip|blu[\s.-]*ray[\s.-]*rip|bluray[\s.-]*rip)\b/i],
      priority: 3,
    },
    {
      type: 'WebDL',
      patterns: [
        /\b(?:web[\s.-]*dl|webdownload|web[\s.-]*download|dlmux)\b/i,
        /\b(?:netflix|amzn|amazon|hulu|disney|max|itunes|appletv)[\s.-]*web[\s.-]*dl\b/i,
      ],
      priority: 2,
    },
    {
      type: 'WEBRip',
      patterns: [
        /\b(?:web[\s.-]*rip|webrip)\b/i,
        /\b(?:netflix|amzn|amazon|hulu|disney|max|itunes|appletv)[\s.-]*rip\b/i,
      ],
      priority: 2,
    },
    {
      type: 'HDTV',
      patterns: [/\b(?:hdtv|pdtv|dsr|dtv|hdtvrip|tvrip|dvbrip)\b/i],
      priority: 1,
    },
    {
      type: 'DVDRip',
      patterns: [/\b(?:dvd[\s.-]*rip|dvdrip)\b/i],
      priority: 1,
    },
    {
      type: 'DVD',
      patterns: [/\b(?:dvd[\s.-]*r|dvd9|dvd5|dvdiso)\b/i],
      priority: 1,
    },
    {
      type: 'VHS',
      patterns: [/\b(?:vhs|vhsrip)\b/i],
      priority: 0,
    },
    {
      type: 'CAM',
      patterns: [/\b(?:cam(?:rip)?|hdcam|ts|telesync|hdts|dvdscr|dvdscreener|screener|scr)\b/i],
      priority: 0,
    },
  ];

  // Find all matching source types
  const matched = sourcePatterns
    .filter(({ patterns }) => patterns.some(p => p.test(text)))
    .sort((a, b) => b.priority - a.priority);

  if (matched.length === 0) {
    // Check for streaming service indicators as fallback
    if (/\b(?:netflix|amzn|amazon|hulu|disney\+|max|itunes|appletv)\b/i.test(text)) {
      return 'WebDL';
    }
    return undefined;
  }

  return matched[0].type;
}

function extractHDRFormat(fullText: string): string | undefined {
  const text = fullText.toLowerCase();
  const formats = [
    {
      type: 'HDR10+',
      pattern: /\b(?:hdr10\+|hdr10plus|hdr\+10)\b/i,
      priority: 3,
    },
    {
      type: 'HDR10',
      pattern: /\bhdr10\b/i,
      priority: 2,
    },
    {
      type: 'Dolby Vision',
      pattern: /\b(?:dolby\s*vision|dv|dovi)\b/i,
      priority: 4,
    },
    {
      type: 'HDR',
      pattern: /\bhdr\b/i,
      priority: 1,
    },
    {
      type: 'HLG',
      pattern: /\bhlg\b/i,
      priority: 1,
    },
  ];

  const matched = formats
    .filter(({ pattern }) => pattern.test(text))
    .sort((a, b) => b.priority - a.priority);

  if (matched.length === 0) {
    return undefined;
  }

  // Handle special cases
  const hasDV = matched.some(f => f.type === 'Dolby Vision');
  const hasHDR10 = matched.some(f => f.type === 'HDR10');
  if (hasDV && hasHDR10) {
    return 'DV HDR10';
  }

  const hasHDR10Plus = matched.some(f => f.type === 'HDR10+');
  if (hasDV && hasHDR10Plus) {
    return 'DV HDR10+';
  }

  return matched[0].type;
}

function extractAudioChannels(fullText: string): string | undefined {
  const text = fullText.toLowerCase().replace(/(\d)\s+(\d)/g, '$1.$2');

  const hasAtmos = /\batmos\b/i.test(text);
  const has71 = /\b7[. ]1\b/i.test(text);
  const has51 = /\b5[. ]1\b/i.test(text);
  const has20 = /\b2[. ]0\b/i.test(text);

  // TrueHD
  if (/\btrue\s*hd\b/i.test(text)) {
    if (hasAtmos && has71) return 'TrueHD 7.1 Atmos';
    if (hasAtmos && has51) return 'TrueHD 5.1 Atmos';
    if (hasAtmos) return 'TrueHD Atmos';
    if (has71) return 'TrueHD 7.1';
    if (has51) return 'TrueHD 5.1';
    return 'TrueHD';
  }

  // Dolby Digital Plus (E-AC3)
  if (/\b(?:ddp|dd\+|e-?ac-?3|dolby\s*digital\s*plus)\b/i.test(text)) {
    if (has71 && hasAtmos) return 'DDP7.1 Atmos';
    if (has51 && hasAtmos) return 'DDP5.1 Atmos';
    if (has71) return 'DDP7.1';
    if (has51) return 'DDP5.1';
    if (has20) return 'DDP2.0';
    if (hasAtmos) return 'DDP Atmos';
    return 'DDP';
  }

  // Dolby Digital (AC3)
  if (/\b(?:dd|ac-?3|dolby\s*digital)\b/i.test(text)) {
    if (has71) return 'DD7.1';
    if (has51) return 'DD5.1';
    if (has20) return 'DD2.0';
    return 'DD';
  }

  // DTS variants
  if (/\bdts-?hd(?:\s*ma)?\b/i.test(text)) {
    if (has71) return 'DTS-HD MA 7.1';
    if (has51) return 'DTS-HD MA 5.1';
    return 'DTS-HD MA';
  }

  if (/\bdts-?x\b/i.test(text)) {
    if (has71) return 'DTS:X 7.1';
    if (has51) return 'DTS:X 5.1';
    return 'DTS:X';
  }

  if (/\bdts\b/i.test(text)) {
    if (has71) return 'DTS 7.1';
    if (has51) return 'DTS 5.1';
    return 'DTS';
  }

  // AAC
  if (/\baac\b/i.test(text)) {
    if (has71) return 'AAC 7.1';
    if (has51) return 'AAC 5.1';
    if (has20) return 'AAC 2.0';
    return 'AAC';
  }

  // OPUS
  if (/\bopus\b/i.test(text)) {
    if (has71) return '7.1 Opus';
    if (has51) return '5.1 Opus';
    if (has20) return '2.0 Opus';
    return 'Opus';
  }

  // FLAC
  if (/\bflac\b/i.test(text)) {
    if (has71) return 'FLAC 7.1';
    if (has51) return 'FLAC 5.1';
    if (has20) return 'FLAC 2.0';
    return 'FLAC';
  }

  // Just Atmos or channel configuration
  if (hasAtmos) {
    if (has71) return '7.1 Atmos';
    if (has51) return '5.1 Atmos';
    return 'Atmos';
  }

  if (has71) return '7.1';
  if (has51) return '5.1';
  if (has20) return '2.0';

  return undefined;
}

export function parseTorrentInfo(title: string, metadata: TorrentMetadata = {}): ParsedTorrentInfo {
  const {
    files = [],
    category_str = '',
    type = '',
    short_name,
    description = '',
    size = 0,
  } = metadata;

  const titleToUse = short_name || title;
  const fullText = `${titleToUse} ${description} ${type}`;

  // Extract year first from most reliable sources
  const yearMatch =
    titleToUse.match(/\b(19[9][0-9]|20[0-9][0-9])\b/) ||
    (files[0]?.name && files[0].name.match(/\b(19[9][0-9]|20[0-9][0-9])\b/)) ||
    description.match(/\b(19[9][0-9]|20[0-9][0-9])\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // Check if it's a TV show
  let isTV = /tv|series|episode|season/i.test(category_str);

  let season: number | undefined;
  let episode: number | undefined;
  let isCompleteSeason = false;

  // Check TV patterns in various sources
  const checkTVPatterns = (text: string) => {
    for (const [patternName, pattern] of Object.entries(TV_PATTERNS)) {
      const match = text.match(pattern);
      if (match) {
        isTV = true;
        if (patternName === 'completeSeason') {
          isCompleteSeason = true;
          season = parseInt(match[1] || match[2], 10);
        } else {
          season = parseInt(match[1], 10);
          episode = parseInt(match[2], 10);
        }
        return true;
      }
    }
    return false;
  };

  // Check title first, then files
  if (!checkTVPatterns(titleToUse)) {
    for (const file of files) {
      if (checkTVPatterns(file.name)) break;
    }
  }

  // Clean title and determine show/movie name
  const cleanedTitle = cleanTitle(title);
  const movieName = !isTV ? cleanedTitle : undefined;
  const showName = isTV ? cleanedTitle : undefined;

  // Languages and subtitles
  const languages: string[] = [];
  let hasMultipleLanguages = false;

  if (LANGUAGE_PATTERNS.multi.test(fullText) || LANGUAGE_PATTERNS.dual.test(fullText)) {
    hasMultipleLanguages = true;
    languages.push('multiple');
  } else {
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (lang !== 'multi' && lang !== 'dual' && pattern.test(fullText)) {
        languages.push(lang);
      }
    }
    if (languages.length > 1) {
      hasMultipleLanguages = true;
      languages.length = 0;
      languages.push('multiple');
    }
  }

  if (languages.length === 0) {
    languages.push('english');
  }

  // Subtitles
  const subtitles: string[] = [];
  if (SUBTITLE_PATTERNS.subtitles.test(fullText) || files.some(f => /\.srt$/i.test(f.name))) {
    subtitles.push('subtitles');
    const subLangMatch = fullText.match(SUBTITLE_PATTERNS.specific_langs);
    if (subLangMatch?.[1]) {
      subtitles.push(subLangMatch[1].replace(/^sub(?:\.|:|\s+)/, ''));
    }
  }

  // Extract all other properties
  const videoCodec = extractVideoCodec(fullText);
  const audioCodec = extractAudioCodec(fullText);
  const source = extractSourceType(fullText);
  const hdrFormat = extractHDRFormat(fullText);
  const resolution = extractResolution(fullText);
  const audioChannels = extractAudioChannels(fullText);
  const releaseGroup = extractReleaseGroup(title);

  return {
    title,
    cleanTitle: cleanedTitle,
    isTV,
    movieName,
    showName,
    season,
    episode,
    isCompleteSeason,
    videoCodec,
    audioCodec,
    quality: resolution,
    year,
    languages,
    hasMultipleLanguages,
    subtitles,
    size,
    releaseGroup,
    source,
    hdrFormat,
    resolution,
    audioChannels,
    additionalInfo: {
      raw: { title, description, size, metadata },
    },
  };
}

function extractVideoCodec(fullText: string): string | undefined {
  const text = fullText.toLowerCase();

  // HEVC/x265 variations
  if (/\bhevc\b/i.test(text)) return 'HEVC';
  if (/\bx265\b|\bh\.?265\b/i.test(text)) return 'H.265';

  // H.264/x264/AVC variations
  if (/\bavc\b/i.test(text)) return 'AVC';
  if (/\bx264\b/i.test(text)) return 'x264';
  if (/\bh\.?264\b/i.test(text)) return 'H.264';

  // AV1 format (both Google and Alliance variants)
  if (/\b(?:av1|av-1|aom-av1)\b/i.test(text)) return 'AV1';

  // VP9 (WebM Project)
  if (/\bvp9\b/i.test(text)) return 'VP9';

  // Legacy formats
  if (/\bxvid\b/i.test(text)) return 'XviD';
  if (/\bdivx\b/i.test(text)) return 'DivX';
  if (/\bvc-?1\b/i.test(text)) return 'VC-1';
  if (/\bmpeg-?2\b/i.test(text)) return 'MPEG-2';
  if (/\bmpeg-?4\b/i.test(text)) return 'MPEG-4';

  return undefined;
}

function extractAudioCodec(fullText: string): string | undefined {
  const text = fullText.toLowerCase();

  if (/\btruehd\b/i.test(text)) return 'TrueHD';
  if (/\bdd\+|ddp\b/i.test(text)) return 'DD+';
  if (/\bdd\b|\bac3\b/i.test(text)) return 'DD';
  if (/\baac\b/i.test(text)) return 'AAC';
  if (/\bopus\b/i.test(text)) return 'Opus';
  if (/\bflac\b/i.test(text)) return 'FLAC';
  if (/\bmp3\b/i.test(text)) return 'MP3';

  return undefined;
}

function extractResolution(fullText: string): string | undefined {
  if (/\b2160p\b|\b4k\b|\buhd\b/i.test(fullText)) return '2160p';
  if (/\b1080p\b|\bfhd\b/i.test(fullText)) return '1080p';
  if (/\b720p\b|\bhd\b/i.test(fullText)) return '720p';
  if (/\b480p\b|\bsd\b/i.test(fullText)) return '480p';
  return undefined;
}

export function isTVShow(torrentInfo: ParsedTorrentInfo | string): boolean {
  if (typeof torrentInfo === 'string') {
    const text = torrentInfo.toLowerCase();
    return Object.values(TV_PATTERNS).some(pattern => pattern.test(text));
  }
  return torrentInfo.isTV;
}

export function isMovie(torrentInfo: ParsedTorrentInfo | string): boolean {
  if (typeof torrentInfo === 'string') {
    return !isTVShow(torrentInfo);
  }
  return !torrentInfo.isTV;
}
