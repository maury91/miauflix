import { VideoCodec, VideoQuality } from '@miauflix/types';
import { VideoSource } from '../jackett/jackett.types';

export const getSeasonAndEpisode = (name: string) => {
  const match = name.match(
    /\bS(eason)?\s*(?<season>\d+)(E(pisode)?\s*(?<episode>\d+))?/i
  );

  if (match) {
    const { season, episode } = match.groups;

    return {
      season: season && parseInt(season, 10),
      episode: episode && parseInt(episode, 10),
      index: match.index,
      length: match[0].length,
    };
  }

  return {
    season: undefined,
    episode: undefined,
    index: undefined,
    length: undefined,
  };
};

const codecsRegexs = {
  x264: [
    /[HX][ .]?264(?<tenbit>\s+10.?bit)?/i,
    /mpeg-?4(?<tenbit>\s+10.?bit)?/i,
    /avc(?<tenbit>\s+10.?bit)?/i,
  ],
  x265: [
    /\bhevc\b[\s-]*[HX][ .]?265\b(?<tenbit>\s+10.?bit)?/i,
    /\bhevc\b(?<tenbit>\s+10.?bit)?/i,
    /\b[HX][ .]?265\b(?<tenbit>\s+10.?bit)?/i,
  ],
  AV1: [/\bav1(?<tenbit>\s+10.?bit)?\b/i],
  XVid: [/\bxvid\b/i],
} as const;

export function getVideoCodec(
  title: string,
  description?: string
): {
  codec: VideoCodec;
  index: number | undefined;
  length: number | undefined;
} {
  for (const codec of Object.keys(
    codecsRegexs
  ) as (keyof typeof codecsRegexs)[]) {
    for (const regex of codecsRegexs[codec]) {
      const match = title.match(regex);
      if (match) {
        const is10bit = match.groups?.['tenbit'];
        const fullCodec: VideoCodec =
          is10bit && codec !== 'XVid' ? `${codec} 10bit` : codec;
        return {
          codec: fullCodec,
          index: match.index,
          length: match[0].length,
        };
      }
    }
  }
  if (description) {
    return {
      codec: getVideoCodec(description).codec,
      index: undefined,
      length: undefined,
    };
  }
  return {
    codec: 'unknown',
    index: undefined,
    length: undefined,
  };
}

const sourcesRegexs = {
  WEB: [
    /\bwebrip\b|\bweb-?dl\b|\bwebdl\b|\bitunes\b|\bnetflix\b|\bappletv\b|\bdsnp\b/i,
    /\bWEB\b/,
  ],
  'Blu-ray': [
    /\bbdrip\b|\bbluray\b|\bbdremux\b|\bbdmux\b|\bbrrip\b|\bbdscr\b|\bbdr\b|\bblu.?ray\b|\bbr.?rip\b/i,
    /\bBR\b/,
  ],
  HDTV: [/\bhdtv\b|\bhdrip\b/i],
  DVD: [/\bdvdrip\b|\bdvdr\b|\bdvdscr\b|\bdvd\b/i],
  TS: [/\btsrip\b|\btelesync\b|\bhdts\b/i, /\bTS\b/],
  Cam: [/\bcamrip\b|\b\bcam\b\b|\bhdcam\b/i],
  Fallback: [
    /\b[57].1\b|\bhdr\b|\b6ch\b|\bhdr10\b|\bddp?[257][ .]?[01]?\b/i,
    /\bDV\b/,
  ],
};

const cleanUpRegexs = [
  /\b[57].1\b/i,
  /\bhdr\b/i,
  /\b6ch\b/i,
  /\bhdr10\b/i,
  /\bddp?[257][ .]?[01]?\b/i, // Dolby Digital [Plus] 2.0, 5.1, 7.1
  /\baac2[ .]?[01]?\b/i, // AAC 2.0, 5.1
  /\bDV\b/, // Dolby Vision
  /\brepack\b/i,
  /\bMULTi\b/, // Multiple languages
  /\bFiNAL\b/,
  /\bPROPER\b/,
  /\bmkv\b/i,
  /\b[iI]NTERNAL\b/,
  /\bREMASTERED\b/i,
  /\bUHD(BD)?\b/,
  /\bRERIP\b/,
  /\bIMAX\b/,
  /\bDS4K\b/, // Downscaled from 4K
  /\b3D[ .][HF]SBS\b/, // Half Side-by-Side 3D
  /\b3D[ .]Half[ .]SBS\b/i, // Half Side-by-Side 3D
  /\bPAL\b([ -]iCMAL)?/, // PAL (iCMAL)
  /\bdual[ .]?audio\b/i,
  /\bopen matte\b/i, // Open Matte
  /\brm4k\b/i,
];

export function getVideoSource(title: string): {
  source: VideoSource;
  index: number | undefined;
  length: number | undefined;
} {
  for (const source of Object.keys(
    sourcesRegexs
  ) as (keyof typeof sourcesRegexs)[]) {
    for (const regex of sourcesRegexs[source]) {
      const match = title.match(regex);
      if (match) {
        return {
          source: source === 'Fallback' ? 'Blu-ray' : source,
          index: match.index,
          length: match[0].length,
        };
      }
    }
  }

  return {
    source: 'unknown',
    index: undefined,
    length: undefined,
  };
}

const videoQualityRegex = {
  '2160': /2160p|(\b4k\b)/i,
  '1440': /1440p|(\b2k\b)/i,
  '1080': /1080p/i,
  '720': /720p/i,
  '480': /480p/i,
  '360': /360p/i,
};

export function getVideoQuality(
  title: string,
  description?: string | null
): {
  quality: VideoQuality;
  index: number | undefined;
  length: number | undefined;
} {
  for (const quality of Object.keys(
    videoQualityRegex
  ) as (keyof typeof videoQualityRegex)[]) {
    const match = title.match(videoQualityRegex[quality]);
    if (match) {
      return {
        quality: parseInt(quality, 10) as VideoQuality,
        index: match.index,
        length: match[0].length,
      };
    }
  }
  if (description) {
    const captured = description.match(
      /resolution\s*[=:]\s*(\d{3,4})\D*(\d{3,4})/i
    );
    if (captured) {
      const width = parseInt(captured[1], 10);
      if (width > 3800) {
        return {
          quality: 2160,
          index: undefined,
          length: undefined,
        };
      }
      if (width > 2500) {
        return {
          quality: 1440,
          index: undefined,
          length: undefined,
        };
      }
      if (width > 1900) {
        return {
          quality: 1080,
          index: undefined,
          length: undefined,
        };
      }
      if (width > 1200) {
        return {
          quality: 720,
          index: undefined,
          length: undefined,
        };
      }
      if (width > 850) {
        return {
          quality: 480,
          index: undefined,
          length: undefined,
        };
      }
      return {
        quality: 360,
        index: undefined,
        length: undefined,
      };
    }
  }
  // Just to be safe
  return {
    quality: 480,
    index: undefined,
    length: undefined,
  };
}

type Language =
  | 'English'
  | 'Italian'
  | 'Lithuanian'
  | 'Spanish'
  | 'French'
  | 'German'
  | 'Portuguese'
  | 'Hindi'
  | 'Unknown';

const languageRegex = {
  English: /\benglish\b|\beng\b/i,
  Italian: /\bitalian\b|\bita\b/i,
  Lithuanian: /\blithuanian\b/i,
  Spanish: /\bspanish\b/i,
  French: /\bfrench\b/i,
  German: /\bgerman\b/i,
  Portuguese: /\bportuguese\b/i,
  Hindi: /\bhindi\b/i,
};

export function getLanguage(title: string): {
  language: Language;
  index: number | undefined;
  length: number | undefined;
} {
  for (const language of Object.keys(
    languageRegex
  ) as (keyof typeof languageRegex)[]) {
    const match = title.match(languageRegex[language]);
    if (match) {
      return {
        language: language,
        index: match.index,
        length: match[0].length,
      };
    }
  }
  return {
    language: 'Unknown',
    index: undefined,
    length: undefined,
  };
}

const parseShowTitle = (title: string) => {
  // First test the case when there's a year between brackets
  const withYear = title.match(/^(.*)\s*[[(]+(\d{4})[)\]]+/);
  if (withYear) {
    return {
      title: withYear[1].trim(),
      year: parseInt(withYear[2], 10),
    };
  }

  const match = title.match(/^(.*)\s*[[(]*(\d{4})[)\]]*$/);
  if (match) {
    return {
      title: match[1].trim(),
      year: parseInt(match[2], 10),
    };
  }
  return {
    title,
    year: undefined,
  };
};

const checkForParenthesis = <
  T extends { index: number | undefined; length: number | undefined }
>(
  title: string,
  match: T
): T => {
  if (match.index !== undefined) {
    let leftOffset = 0;
    while (['(', '['].includes(title[match.index - leftOffset - 1])) {
      leftOffset++;
    }
    let rightOffset = 0;
    while (
      [')', ']'].includes(title[match.index + match.length + rightOffset])
    ) {
      rightOffset++;
    }
    return {
      ...match,
      index: match.index - leftOffset,
      length: match.length + leftOffset + rightOffset,
    };
  }
  return match;
};

interface TorrentInfo {
  title: string;
  year: number | undefined;
  season: number | undefined;
  episode: number | undefined;
  episodeTitle?: string;
  videoCodec: VideoCodec;
  videoSource: VideoSource;
  videoQuality: VideoQuality;
  languages: Language[];
}

export const parseTorrentInfo = (
  title: string,
  description?: string
): TorrentInfo => {
  let parsedTitle = title;
  const seasonAndEpisode = checkForParenthesis(
    parsedTitle,
    getSeasonAndEpisode(parsedTitle)
  );
  if (seasonAndEpisode.length) {
    parsedTitle =
      parsedTitle.slice(0, seasonAndEpisode.index) +
      (seasonAndEpisode.episode !== undefined
        ? '\tSeasonAndEpisode\t'
        : '\tSeason\t') +
      parsedTitle.slice(seasonAndEpisode.index + seasonAndEpisode.length);
  }
  let videoCodec: VideoCodec = 'unknown';
  const matchedVideoCode = checkForParenthesis(
    parsedTitle,
    getVideoCodec(parsedTitle, description)
  );
  if (matchedVideoCode.length) {
    videoCodec = matchedVideoCode.codec;
    parsedTitle =
      parsedTitle.slice(0, matchedVideoCode.index) +
      '\tVideoCodec\t' +
      parsedTitle.slice(matchedVideoCode.index + matchedVideoCode.length);
  }

  let videoSource: VideoSource = 'unknown';
  const matchedVideoSource = checkForParenthesis(
    parsedTitle,
    getVideoSource(parsedTitle)
  );
  if (matchedVideoSource.length) {
    videoSource = matchedVideoSource.source;
    parsedTitle =
      parsedTitle.slice(0, matchedVideoSource.index) +
      '\tVideoSource\t' +
      parsedTitle.slice(matchedVideoSource.index + matchedVideoSource.length);
  }

  let videoQuality: VideoQuality = 480;
  const matchedVideoQuality = checkForParenthesis(
    parsedTitle,
    getVideoQuality(parsedTitle, description)
  );
  if (matchedVideoQuality.length) {
    videoQuality = matchedVideoQuality.quality;
    parsedTitle =
      parsedTitle.slice(0, matchedVideoQuality.index) +
      '\tVideoQuality\t' +
      parsedTitle.slice(matchedVideoQuality.index + matchedVideoQuality.length);
  }

  const languages: Set<Language> = new Set();
  let matchedLanguage = checkForParenthesis(
    parsedTitle,
    getLanguage(parsedTitle)
  );
  while (matchedLanguage.length) {
    languages.add(matchedLanguage.language);
    parsedTitle =
      parsedTitle.slice(0, matchedLanguage.index) +
      '\tLanguage\t' +
      parsedTitle.slice(matchedLanguage.index + matchedLanguage.length);
    matchedLanguage = checkForParenthesis(
      parsedTitle,
      getLanguage(parsedTitle)
    );
  }

  for (const cleanUpRegex of cleanUpRegexs) {
    parsedTitle = parsedTitle.replace(cleanUpRegex, '');
  }

  const baseData = {
    videoCodec,
    videoSource,
    videoQuality,
    languages: [...languages],
    season: undefined,
    episode: undefined,
  };

  if (seasonAndEpisode.season !== undefined) {
    if (seasonAndEpisode.episode !== undefined) {
      const match = parsedTitle.match(/(.*)\tSeasonAndEpisode\t([^\t]*)/);
      if (match) {
        return {
          ...baseData,
          ...parseShowTitle(match[1].replace(/\./g, ' ').trim()),
          episodeTitle: match[2].replace(/\./g, ' ').trim(),
          season: seasonAndEpisode.season,
          episode: seasonAndEpisode.episode,
        };
      }
    } else {
      const match = parsedTitle.match(/(.*)\tSeason\t/);
      if (match) {
        return {
          ...baseData,
          ...parseShowTitle(match[1].replace(/\./g, ' ').trim()),
          episodeTitle: undefined, // It's a season pack
          season: seasonAndEpisode.season,
          episode: seasonAndEpisode.episode,
        };
      }
    }
  }

  const match = parsedTitle.match(/([^\t]*)/);

  return {
    ...baseData,
    ...parseShowTitle(
      (match ? match[1] : parsedTitle).replace(/\./g, ' ').trim()
    ),
  };
};
