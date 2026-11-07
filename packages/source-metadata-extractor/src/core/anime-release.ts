/** What an anime release name says about which episodes it holds. */
export interface AnimeRelease {
  /** Season markers: "S2", "Season 2", "2nd Season", "II". */
  season?: number;
  /** `SxxEyy` pairs, as western-style groups name episodes. */
  pairs: { season: number; episode: number }[];
  /** An anime-style episode number: "Title - 07", "Title - 07v2", "E07", "Episode 7". */
  episode?: number;
  /** A batch range: "01-12", "01~24", "Episodes 1-12". */
  range?: [number, number];
  /** Says it is a batch or a complete season without naming episodes. */
  pack: boolean;
  /** Creditless openings and endings, previews and trailers. */
  extra: boolean;
  /** A year in brackets: "Jujutsu Kaisen (2023) - 02" names the season that aired then. */
  year?: number;
}

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};
const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };
const EXTRA =
  /(?:^|[\s[(_.-])(?:nc ?op|nc ?ed|creditless|pv|preview|trailer|teaser|cm)(?:\s*\d+)?(?:$|[\s\])_.-])/i;
const PACK = /\b(?:batch|complete|bd ?box|season ?pack|全集)\b/i;
const TECHNICAL =
  /\b(?:\d{3,4}p|\d{3,4}x\d{3,4}|[xh]\.?26[45]|hevc|avc|av1|aac(?:\s?\d\.\d)?|flac|opus|ddp?\s?\d\.\d|10 ?bits?|8 ?bits?|hi10p?|web(?:-?dl|rip)?|bd(?:rip)?|blu-?ray|dual[ -]audio|multi[ -]subs?)\b/gi;

/** Reads season markers, episode numbers and ranges from an anime release or file name. */
export function parseAnimeRelease(name: string): AnimeRelease {
  const base = name.replace(/\.(?:mkv|mp4|avi|webm|m4v)$/i, '');
  const pairs = [...base.matchAll(/\bS(\d{1,2})[ ._-]?E(\d{1,4})(?!\d)/gi)].map(m => ({
    season: Number(m[1]),
    episode: Number(m[2]),
  }));
  // Group tags, checksums and technical notes in brackets say nothing about the episode,
  // except a bracketed range ("[01-12]") which is read before they go.
  const bracketRange = base.match(/[[(]\s*(\d{1,4})\s*[-~]\s*(\d{1,4})\s*[\])]/);
  let stripped = base;
  // Innermost first, so nested notes ("(Episodes 3,4 (Fixed),12)") go entirely.
  for (let previous = ''; previous !== stripped; ) {
    previous = stripped;
    stripped = stripped.replace(/\[[^[\]]*\]|\([^()]*\)|【[^【】]*】/g, ' ');
  }
  const text = stripped
    .replace(TECHNICAL, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim();
  // Inside brackets only as a fallback: "(Season 1) (Batch)", but not "(Season 2 - Title)" first.
  const season = seasonOf(text) ?? seasonOf(base.replace(/[[\]()【】]/g, ' ')) ?? pairs[0]?.season;
  const rest = text.replace(SEASON_MARKERS, ' ');
  let range: [number, number] | undefined;
  const ranges = [
    // The end of a range is only looked at, so "Part 2 - 01 ~ 10" still finds "01 ~ 10".
    ...[
      ...rest.matchAll(
        /(?<![\p{L}\d.])(?:(?:ep(?:isodes?)?|e)\.? ?)?(\d{1,4})( ?[-~] ?)(?=(\d{1,4})(?:\s|$))/giu
      ),
    ].map(m => ({ from: m[1]!, separator: m[2]!, to: m[3]!, before: rest.slice(0, m.index) })),
    ...(bracketRange
      ? [{ from: bracketRange[1]!, separator: '-', to: bracketRange[2]!, before: '' }]
      : []),
  ];
  for (const { from, separator, to, before } of ranges) {
    // A number ending the title is not the start of a range: "Kaiju No. 8 - 09",
    // "Part 2 - 10". Batches spaced like episodes pad both ends alike ("13 - 30").
    if (/\b(?:part|no|cour|vol)\.?\s*$/i.test(before)) continue;
    if (separator === ' - ' && from.length !== to.length) continue;
    // Years ("2019-2021") are not ranges.
    if (Number(from) < Number(to) && !(Number(from) >= 1900 && Number(to) >= 1900)) {
      range = [Number(from), Number(to)];
      break;
    }
  }
  const episode = range
    ? undefined
    : (num(rest.match(/\s-\s(\d{1,4})(?:v\d)?(?:\s|$)/)) ??
      num(rest.match(/\b(?:ep(?:isode)?|e)\.? ?(\d{1,4})(?:v\d)?\b/i)) ??
      num(rest.match(/#(\d{1,4})\b/)) ??
      (pairs.length ? undefined : num(rest.match(/\s(\d{1,4})(?:v\d)?$/))));
  const year = num(base.match(/[[(]((?:19|20)\d{2})[\])]/));
  return {
    season,
    year,
    pairs,
    episode,
    range,
    pack: PACK.test(base) || (season !== undefined && !episode && !range && !pairs.length),
    extra: EXTRA.test(base),
  };
}

const SEASON_MARKERS =
  /\bS\d{1,2}(?![\dE])\b|\bseason ?\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th) season\b|\b(?:first|second|third|fourth|fifth|sixth) season\b/gi;

function seasonOf(text: string): number | undefined {
  return (
    num(text.match(/\bS(\d{1,2})(?![\dE])\b/i)) ??
    num(text.match(/\bseason ?(\d{1,2})\b/i)) ??
    num(text.match(/\b(\d{1,2})(?:st|nd|rd|th) season\b/i)) ??
    ORDINALS[
      text.match(/\b(first|second|third|fourth|fifth|sixth) season\b/i)?.[1].toLowerCase() ?? ''
    ] ??
    ROMAN[text.match(/\s(II|III|IV|V|VI)(?=\s|$|:)/)?.[1] ?? '']
  );
}

function num(match: RegExpMatchArray | null): number | undefined {
  return match ? Number(match[1]) : undefined;
}
