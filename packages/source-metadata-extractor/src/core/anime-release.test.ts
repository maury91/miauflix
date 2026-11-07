import { parseAnimeRelease } from './anime-release';

describe('parseAnimeRelease', () => {
  it.each([
    ['[SubsPlease] Jujutsu Kaisen - 07 (1080p) [A1B2C3D4].mkv', { episode: 7 }],
    [
      '[Erai-raws] Jujutsu Kaisen 2nd Season - 07v2 [1080p][Multiple Subtitle]',
      { season: 2, episode: 7 },
    ],
    [
      '[MiniDual] Jujutsu Kaisen S2 (Season 2 - Jujutsu Kaisen) - 02 (Dual Audio) [1080p HEVC x265 10Bit][AAC][English Sub]',
      { season: 2, episode: 2 },
    ],
    ['[SubsPlease] One Piece - 1100 (1080p) [ABCDEF12].mkv', { episode: 1100 }],
    ['Mob Psycho 100 III - 05 [1080p]', { season: 3, episode: 5 }],
    ['[Group] Shingeki no Kyojin Season 3 - 13 [BD 1080p]', { season: 3, episode: 13 }],
    ['[Group] Spy x Family Second Season - 04 [1080p]', { season: 2, episode: 4 }],
    ['Frieren Episode 12 [1080p]', { episode: 12 }],
    ['[ASW] Dandadan - 01 [1080p HEVC x265 10Bit][AAC]', { episode: 1 }],
    ['[IceBlue] Jujutsu Kaisen 07 - [Multi-Dub][HEVC 10Bits] 1080p WEBRip', { episode: 7 }],
    ['[Kaizoku] Jujutsu Kaisen - 31 [8EAC767F] (Season 2)', { season: 2, episode: 31 }],
    [
      '[Hakata Ramen] Shingeki no Kyojin (Attack on Titan) S3-P2 (2019) 01 [1080p][HEVC]',
      { season: 3, episode: 1 },
    ],
    ['[SubsPlease] Kaiju No. 8 - 09 (1080p) [A1B2C3D4].mkv', { episode: 9 }],
    ['[Erai-raws] Shingeki no Kyojin Season 3 Part 2 - 10 [1080p]', { season: 3, episode: 10 }],
  ])('reads the episode of %s', (name, expected) => {
    const parsed = parseAnimeRelease(name);
    expect({ season: parsed.season, episode: parsed.episode }).toEqual({
      season: undefined,
      ...expected,
    });
    expect(parsed.pack).toBe(false);
    expect(parsed.extra).toBe(false);
  });

  it('reads SxxEyy pairs', () => {
    expect(
      parseAnimeRelease('[ToonsHub] Jujutsu Kaisen S02E07 1080p CR WEB-DL AAC2.0 H.264').pairs
    ).toEqual([{ season: 2, episode: 7 }]);
    expect(
      parseAnimeRelease('Jujutsu Kaisen S00E02 1080p WEB H.264 AAC -Tsundere-Raws').pairs
    ).toEqual([{ season: 0, episode: 2 }]);
  });

  it.each([
    ['[Judas] Jujutsu Kaisen (Season 1) [1080p][HEVC x265 10bit][Eng-Subs] (Batch)', { season: 1 }],
    ['[SubsPlease] Frieren (01-28) (1080p) [Batch]', { range: [1, 28] }],
    ['[Group] Bocchi the Rock! 01~12 [BD 1080p]', { range: [1, 12] }],
    [
      '[Erai-raws] Shingeki no Kyojin Season 3 Part 2 - 01 ~ 10 [1080p][BATCH][Multiple Subtitle]',
      { season: 3, range: [1, 10] },
    ],
    ['[BlackRabbit] JUJUTSU KAISEN (2020) - S03 [WEBDL-1080p][Opus 2.0][AV1]', { season: 3 }],
    ['[jaaj] Jujutsu Kaisen S02 (2020) (BD 1080p AV1 AAC)', { season: 2 }],
    ['[Group] Bleach - 13 - 30 [1080p]', { range: [13, 30] }],
    ['[Group] Kaiju No. 8 01-12 [Batch]', { range: [1, 12] }],
    ['[Group] Show Vol.1-3 [BD]', { range: [1, 3] }],
    ['[Group] Show Part 1-2 [BD 1080p]', { range: [1, 2] }],
  ])('reads %s as a pack', (name, expected) => {
    const parsed = parseAnimeRelease(name);
    expect(parsed.pack || parsed.range !== undefined).toBe(true);
    expect(parsed.episode).toBeUndefined();
    expect(parsed).toMatchObject(expected);
  });

  it('does not take a number ending the title for the episode', () => {
    expect(parseAnimeRelease('[Group] Kaiju No. 8 [BD 1080p]').episode).toBeUndefined();
    expect(parseAnimeRelease('[Group] Shingeki no Kyojin Part 2 [BD]').episode).toBeUndefined();
    // Known titles are taken out first, whatever number they end with.
    const titles = ['Mob Psycho 100', '86', 'Kaiju No. 8'];
    for (const name of ['[Group] Mob Psycho 100 [BD]', '[Group] 86 [Batch]', 'Kaiju_No._8 [BD]'])
      expect(parseAnimeRelease(name, titles).episode).toBeUndefined();
    expect(parseAnimeRelease('[Group] 86 [Batch]', titles).pack).toBe(true);
    expect(parseAnimeRelease('[SubsPlease] Mob Psycho 100 - 05 (1080p)', titles).episode).toBe(5);
    expect(parseAnimeRelease('[Group] 86 - 11 [1080p]', titles).episode).toBe(11);
    expect(parseAnimeRelease('Mob Psycho 100 III 05', titles)).toMatchObject({
      season: 3,
      episode: 5,
    });
  });

  it('does not take years for ranges', () => {
    expect(parseAnimeRelease('Some Show (2019-2021) - 05').range).toBeUndefined();
  });

  it('reads a bracketed year', () => {
    expect(parseAnimeRelease('[CameEsp] Jujutsu Kaisen (2023) - 02 [720p]')).toMatchObject({
      year: 2023,
      episode: 2,
    });
  });

  it('reads nested brackets as notes', () => {
    const parsed = parseAnimeRelease(
      '[Anime Time] Jujutsu Kaisen (Episodes 3,4,5 (Fixed),12) [BD] [Dual Audio][1080p]'
    );
    expect(parsed).toMatchObject({ episode: undefined, range: undefined, pack: false });
  });

  it.each([
    '[Group] Jujutsu Kaisen - NCOP1 [1080p].mkv',
    '[Group] Jujutsu Kaisen NCED 2 [BD 1080p].mkv',
    '[Group] Jujutsu Kaisen - PV 03.mkv',
    'Jujutsu Kaisen - Preview 07.mkv',
  ])('marks %s as an extra', name => {
    expect(parseAnimeRelease(name).extra).toBe(true);
  });
});
