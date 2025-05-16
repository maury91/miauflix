import { describe, expect, it } from 'bun:test';

import type { ExtractedData, TorrentMetadata } from './torrent-name-parser.util';
import {
  AudioCodec,
  Language,
  Quality,
  searchForAudioCodec,
  searchForCodec,
  searchForLanguage,
  searchForQuality,
  searchForSource,
  searchForTVData,
  Source,
  VideoCodec,
} from './torrent-name-parser.util';

const torrentsSample: TorrentMetadata[] = [
  {
    name: 'Barbie 2023 UHD Blu Ray 2160 TrueHD 7 1 DV HEVC x265 E',
    descr: null,
    files: [
      {
        name: 'Barbie (2023) 4K.mkv',
        size: 30345758167,
        full_location:
          'Barbie.2023.UHD.Blu-Ray.2160.TrueHD.7.1.DV.HEVC.x265-E/Barbie (2023) 4K.mkv',
      },
    ],
    category: 'Movies',
    type: 'HEVC/x265',
    size: 30386893619,
  },

  {
    name: 'Barbie 2023 2160p DV HDR10 Atmos AV1',
    descr:
      'General<br>Unique ID                                : 201310498541833139602848909168094830398 (0x9772FDE1C364EBC3AA39B0972DE55F3E)<br>Complete name                            : Barbie.2023.2160p.DV.HDR10.Atmos.AV1.[avoneguy].mkv<br>Format                                   : Matroska<br>Format version                           : Version 4<br>File size                                : 5.53 GiB<br>Duration                                 : 1 h 54 min<br>Overall bit rate mode                    : Variable<br>Overall bit rate                         : 6 942 kb/s<br>Frame rate                               : 23.976 FPS',
    files: [
      {
        name: 'Barbie.2023.2160p.DV.HDR10.Atmos.AV1.[avoneguy].mkv',
        size: 5938464908,
        full_location:
          'Barbie.2023.2160p.DV.HDR10.Atmos.AV1.[avoneguy]/Barbie.2023.2160p.DV.HDR10.Atmos.AV1.[avoneguy].mkv',
      },
    ],
    category: 'Movies',
    type: 'UHD',
    size: 5905580032,
  },

  {
    name: 'Barbie 2023 1080p MAX WEB DL DDP5 1 Atmos H 264 TURG',
    descr: null,
    files: [
      {
        name: 'Barbie.2023.1080p.MAX.WEB-DL.DDP5.1.Atmos.H.264-TURG.mkv',
        size: 4017743165,
        full_location:
          'Barbie.2023.1080p.MAX.WEB-DL.DDP5.1.Atmos.H.264-TURG/Barbie.2023.1080p.MAX.WEB-DL.DDP5.1.Atmos.H.264-TURG.mkv',
      },
    ],
    category: 'Movies',
    type: null,
    size: 4015794421,
  },

  {
    name: 'Barbie 2023 bluray hdr 2160p av1 7 1 opus subs 4600mb vmaf98 Rosy',
    descr: null,
    files: [
      {
        name: 'Barbie.2023.bluray.hdr.2160p.av1.7.1.opus.subs.4600mb.vmaf98-Rosy.mkv',
        size: 4583080386,
        full_location:
          'Barbie.2023.bluray.hdr.2160p.av1.7.1.opus.subs.4600mb.vmaf98-Rosy/Barbie.2023.bluray.hdr.2160p.av1.7.1.opus.subs.4600mb.vmaf98-Rosy.mkv',
      },
    ],
    category: 'Movies',
    type: 'UHD',
    size: 4617089843,
  },
  {
    name: 'Barbie 2023 Eng Fre Ger Ita Spa Cat Cze Slo Chi Jpn 2160p BluRay Hybrid Remux DV HDR HEVC Atmos SGF',
    descr: null,
    files: [
      {
        name: 'Barbie.2023.Eng.Fre.Ger.Ita.Spa.Cat.Cze.Slo.Chi.Jpn.2160p.BluRay.Hybrid.Remux.DV.HDR.HEVC.Atmos-SGF.mkv',
        size: 80305734242,
        full_location:
          'Barbie.2023.Eng.Fre.Ger.Ita.Spa.Cat.Cze.Slo.Chi.Jpn.2160p.BluRay.Hybrid.Remux.DV.HDR.HEVC.Atmos-SGF.mkv',
      },
    ],
    category: 'Movies',
    type: null,
    size: 80305151016,
  },
  {
    name: 'Barbie 2023 BluRay 720p x264 Hindi Tamil Telugu Kannada English',
    descr: null,
    files: null,
    category: 'Movies',
    type: 'Dubs/Dual Audio',
    size: 1395864371,
  },
  {
    name: 'Barbie 2023 1080p JIO WEB DL DUAL DD5 1 H 264 TheBiscuitMan',
    descr:
      'General<br>Unique ID                                : 335203062479783866616164306061595020851 (0xFC2DC2F4CF7E6D3A217BE582FCB08E33)<br>Complete name                            : Barbie.2023.1080p.JIO.WEB-DL.DUAL.DD5.1.H.264-TheBiscuitMan.mkv<br>Format                                   : Matroska<br>Format version                           : Version 4<br>File size                                : 5.36 GiB<br>Duration                                 : 1 h 49 min<br>Overall bit rate mode                    : Variable<br>Overall bit rate                         : 7 022 kb/s<br>Frame rate                               : 25.000 FPS',
    files: [
      {
        name: 'Barbie.2023.1080p.JIO.WEB-DL.DUAL.DD5.1.H.264-TheBiscuitMan.mkv',
        size: 5758691516,
        full_location: 'Barbie.2023.1080p.JIO.WEB-DL.DUAL.DD5.1.H.264-TheBiscuitMan.mkv',
      },
    ],
    category: 'Movies',
    type: 'HD',
    short_name: 'Barbie',
    size: 5798205849,
  },
  {
    name: 'Barbie 2023 1080p BluRay x265 HEVC 10bit AAC 7 1 Vyndros',
    descr:
      'General<br>Format                                   : Matroska<br>Format version                           : Version 4 / Version 2<br>File size                                : 5.82 GiB<br>Duration                                 : 1 h 54 min<br>Overall bit rate                         : 7 308 kb/s<br>Movie name                               : Barbie (2023)',
    files: [
      {
        name: 'Barbie [2023] 1080p 10bit BluRay AAC7.1 HEVC-Vyndros.mkv',
        size: 6251810257,
        full_location:
          'Barbie (2023) (1080p BluRay x265 HEVC 10bit AAC 7.1 Vyndros)/Barbie [2023] 1080p 10bit BluRay AAC7.1 HEVC-Vyndros.mkv',
      },
    ],
    category: 'Movies',
    type: null,
    size: 6249177415,
  },
  {
    name: 'Barbie 2023 ENG 1080p HD WEBRip 2 10GiB AAC x264 PortalGoods',
    descr: null,
    files: [
      {
        name: 'Barbie 2023.ts',
        size: 2249827960,
        full_location: 'Barbie 2023/Barbie 2023.ts',
      },
    ],
    category: 'Movies',
    type: null,
    size: 2254857830,
  },
  {
    name: 'Barbie 2023 4K UHD BluRay 2160p DoVi HDR TrueHD 7 1 Atmos H 265 MgB',
    descr: null,
    files: [
      {
        name: 'Barbie 2023 4K UHD BluRay 2160p DoVi HDR TrueHD 7.1 Atmos H.265-MgB.mkv',
        size: 20385017945,
        full_location:
          'Barbie 2023 4K UHD BluRay 2160p DoVi HDR TrueHD 7.1 Atmos H.265-MgB/Barbie 2023 4K UHD BluRay 2160p DoVi HDR TrueHD 7.1 Atmos H.265-MgB.mkv',
      },
    ],
    category: 'Movies',
    type: null,
    size: 20529943674,
  },

  // Game of Thrones samples
  {
    name: 'Game of Thrones S05E06 HDTV x264 ASAP EZTV',
    descr: null,
    files: null,
    category: 'TV',
    type: 'TV',
    size: 351171350,
    // language: 'English',
    // season: 5,
    // episode: 6,
    // source: 'EZ',
    // seeders: 25,
    // leechers: 30,
    // imdb: 'tt0944947',
  },
  {
    name: 'Game of Thrones S05E06 720p HDTV x264 IMMERSE EZTV',
    descr: null,
    files: null,
    category: 'TV',
    type: 'TV',
    size: 1128320026,
    // language: 'English',
    // season: 5,
    // episode: 6,
    // source: 'EZ',
    // seeders: 2,
    // leechers: 1,
    // imdb: 'tt0944947',
  },
  {
    name: 'Game of Thrones S05E06 1080i HDTV MPEG2 DD5 1 CtrlHD EZTV',
    descr: null,
    files: null,
    category: 'TV',
    type: 'TV',
    size: 5747045320,
    // language: 'English',
    // season: 5,
    // episode: 6,
    // source: 'EZ',
    // seeders: 16,
    // leechers: 20,
    // imdb: 'tt0944947',
  },
];

describe('Extract quality', () => {
  it.each<[string, TorrentMetadata, ExtractedData<Quality | undefined>]>([
    [
      'UHD Blu-Ray with explicit UHD marker',
      torrentsSample[0],
      {
        data: Quality.UHD,
        newTitle: 'Barbie 2023 Blu Ray 2160 TrueHD 7 1 DV HEVC x265 E',
        newDescription: null,
      },
    ],
    [
      'UHD with explicit 2160p marker',
      torrentsSample[1],
      {
        data: Quality.UHD,
        newTitle: 'Barbie 2023 DV HDR10 Atmos AV1',
        newDescription: null,
      },
    ],
    [
      'FHD with explicit 1080p marker',
      torrentsSample[2],
      {
        data: Quality.FHD,
        newTitle: 'Barbie 2023 MAX WEB DL DDP5 1 Atmos H 264 TURG',
        newDescription: null,
      },
    ],
    [
      'UHD with 2160p marker in middle of title',
      torrentsSample[3],
      {
        data: Quality.UHD,
        newTitle: 'Barbie 2023 bluray hdr av1 7 1 opus subs 4600mb vmaf98 Rosy',
        newDescription: null,
      },
    ],
    [
      'UHD with 2160p marker after multiple languages',
      torrentsSample[4],
      {
        data: Quality.UHD,
        newTitle:
          'Barbie 2023 Eng Fre Ger Ita Spa Cat Cze Slo Chi Jpn BluRay Hybrid Remux DV HDR HEVC Atmos SGF',
        newDescription: null,
      },
    ],
    [
      'HD with explicit 720p marker',
      torrentsSample[5],
      {
        data: Quality.HD,
        newTitle: 'Barbie 2023 BluRay x264 Hindi Tamil Telugu Kannada English',
        newDescription: null,
      },
    ],
    [
      'FHD WEB-DL with 1080p marker',
      torrentsSample[6],
      {
        data: Quality.FHD,
        newTitle: 'Barbie 2023 JIO WEB DL DUAL DD5 1 H 264 TheBiscuitMan',
        newDescription: null,
      },
    ],
    [
      'FHD BluRay with 1080p marker',
      torrentsSample[7],
      {
        data: Quality.FHD,
        newTitle: 'Barbie 2023 BluRay x265 HEVC 10bit AAC 7 1 Vyndros',
        newDescription: null,
      },
    ],
    [
      'FHD WEBRip with 1080p marker',
      torrentsSample[8],
      {
        data: Quality.FHD,
        newTitle: 'Barbie 2023 ENG HD WEBRip 2 10GiB AAC x264 PortalGoods',
        newDescription: null,
      },
    ],
    [
      'UHD with explicit 4K marker',
      torrentsSample[9],
      {
        data: Quality.UHD,
        newTitle: 'Barbie 2023 UHD BluRay 2160p DoVi HDR TrueHD 7 1 Atmos H 265 MgB',
        newDescription: null,
      },
    ],
    [
      'TV show with no explicit quality marker',
      torrentsSample[10],
      {
        data: undefined,
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'TV show with HD 720p marker',
      torrentsSample[11],
      {
        data: Quality.HD,
        newTitle: 'Game of Thrones S05E06 HDTV x264 IMMERSE EZTV',
        newDescription: null,
      },
    ],
    [
      'TV show with 1080i marker (not recognized as FHD)',
      torrentsSample[12],
      {
        data: undefined,
        newTitle: null,
        newDescription: null,
      },
    ],
  ])(
    'should extract quality from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<Quality | undefined>
    ) => {
      const result = searchForQuality(torrentMetadata);
      expect<Quality | undefined>(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );

  it('should extract quality from resolution in technical description', () => {
    const result = searchForQuality({
      name: 'Movie.2023.x264-GROUP',
      descr: 'General\nResolution: 1920 x 1080\nFormat: Matroska',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Quality | undefined>(result.data).toEqual(Quality.FHD);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('General Resolution Format: Matroska');
  });

  it('should extract quality from resolution with alternative format', () => {
    const result = searchForQuality({
      name: 'Movie.2023.x264-GROUP',
      descr: 'Video: HEVC = 3840x2160',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Quality | undefined>(result.data).toEqual(Quality.UHD);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('Video: HEVC');
  });

  it('should prefer name quality over technical description quality', () => {
    const result = searchForQuality({
      name: 'Movie.2023.1080p.x264-GROUP',
      descr: 'Video: HEVC = 3840x2160',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Quality | undefined>(result.data).toEqual(Quality.FHD);
    expect(result.newTitle).toEqual('Movie.2023.x264-GROUP');
    expect(result.newDescription).toBeNull();
  });
});

describe('Extract source', () => {
  it.each<[string, TorrentMetadata, ExtractedData<Source | undefined>]>([
    [
      'UHD Blu-Ray source',
      torrentsSample[0],
      {
        data: Source.BLURAY,
        newTitle: 'Barbie 2023 UHD 2160 TrueHD 7 1 DV HEVC x265 E',
        newDescription: null,
      },
    ],
    [
      'Source not specified in title',
      torrentsSample[1],
      {
        data: Source.BLURAY,
        newTitle: null,
        newDescription:
          'General<>Unique ID: 201310498541833139602848909168094830398 (0x9772FDE1C364EBC3AA39B0972DE55F3E)<br>Complete name: Barbie.2023.2160p.DV.HDR10.Atmos.AV1.[avoneguy].mkv<br>Format: Matroska<br>Format version: Version 4<br>File size: 5.53 GiB<br>Duration: 1 h 54 min<br>Overall bit rate mode: Variable<br>Overall bit rate: 6 942 kb/s<br>Frame rate: 23.976 FPS',
      },
    ],
    [
      'WEB-DL source',
      torrentsSample[2],
      {
        data: Source.WEB,
        newTitle: 'Barbie 2023 1080p MAX DDP5 1 Atmos H 264 TURG',
        newDescription: null,
      },
    ],
    [
      'Lowercase bluray source',
      torrentsSample[3],
      {
        data: Source.BLURAY,
        newTitle: 'Barbie 2023 hdr 2160p av1 7 1 opus subs 4600mb vmaf98 Rosy',
        newDescription: null,
      },
    ],
    [
      'BluRay source after multiple languages',
      torrentsSample[4],
      {
        data: Source.BLURAY,
        newTitle:
          'Barbie 2023 Eng Fre Ger Ita Spa Cat Cze Slo Chi Jpn 2160p Hybrid Remux DV HDR HEVC Atmos SGF',
        newDescription: null,
      },
    ],
    [
      'BluRay source for HD content',
      torrentsSample[5],
      {
        data: Source.BLURAY,
        newTitle: 'Barbie 2023 720p x264 Hindi Tamil Telugu Kannada English',
        newDescription: null,
      },
    ],
    [
      'WEB-DL source for FHD content',
      torrentsSample[6],
      {
        data: Source.WEB,
        newTitle: 'Barbie 2023 1080p JIO DUAL DD5 1 H 264 TheBiscuitMan',
        newDescription: null,
      },
    ],
    [
      'BluRay source for x265 content',
      torrentsSample[7],
      {
        data: Source.BLURAY,
        newTitle: 'Barbie 2023 1080p x265 HEVC 10bit AAC 7 1 Vyndros',
        newDescription: null,
      },
    ],
    [
      'WEBRip source for FHD content',
      torrentsSample[8],
      {
        data: Source.WEB,
        newTitle: 'Barbie 2023 ENG 1080p HD 2 10GiB AAC x264 PortalGoods',
        newDescription: null,
      },
    ],
    [
      'BluRay source for 4K UHD content',
      torrentsSample[9],
      {
        data: Source.BLURAY,
        newTitle: 'Barbie 2023 4K UHD 2160p DoVi HDR TrueHD 7 1 Atmos H 265 MgB',
        newDescription: null,
      },
    ],
    [
      'HDTV source for TV show',
      torrentsSample[10],
      {
        data: Source.HDTV,
        newTitle: 'Game of Thrones S05E06 x264 ASAP EZTV',
        newDescription: null,
      },
    ],
    [
      'HDTV source for HD TV show',
      torrentsSample[11],
      {
        data: Source.HDTV,
        newTitle: 'Game of Thrones S05E06 720p x264 IMMERSE EZTV',
        newDescription: null,
      },
    ],
    [
      'HDTV source for FHD TV show',
      torrentsSample[12],
      {
        data: Source.HDTV,
        newTitle: 'Game of Thrones S05E06 1080i MPEG2 DD5 1 CtrlHD EZTV',
        newDescription: null,
      },
    ],
  ])(
    'should extract source from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<Source | undefined>
    ) => {
      const result = searchForSource(torrentMetadata);
      expect<Source | undefined>(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );

  it('should recognize HDTV source', () => {
    const result = searchForSource({
      name: 'Movie.2023.HDTV.x264-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Source | undefined>(result.data).toEqual(Source.HDTV);
    expect(result.newTitle).toEqual('Movie.2023.x264-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize DVD source', () => {
    const result = searchForSource({
      name: 'Movie.2023.DVDRip.x264-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Source | undefined>(result.data).toEqual(Source.DVD);
    expect(result.newTitle).toEqual('Movie.2023.x264-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize TS source', () => {
    const result = searchForSource({
      name: 'Movie.2023.TELESYNC.x264-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Source | undefined>(result.data).toEqual(Source.TS);
    expect(result.newTitle).toEqual('Movie.2023.x264-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize CAM source', () => {
    const result = searchForSource({
      name: 'Movie.2023.HDCAM.x264-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Source | undefined>(result.data).toEqual(Source.CAM);
    expect(result.newTitle).toEqual('Movie.2023.x264-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize source from technical description', () => {
    const result = searchForSource({
      name: 'Movie.2023.x264-GROUP',
      descr: 'General\nSource: Blu-ray\nFormat: Matroska',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<Source | undefined>(result.data).toEqual(Source.BLURAY);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('General Source: Format: Matroska');
  });
});

describe('Extract language', () => {
  it.each<[string, TorrentMetadata, ExtractedData<Language[] | undefined>]>([
    [
      'Default English (no explicit language marker)',
      torrentsSample[0],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'Default English (no explicit language marker in 2160p)',
      torrentsSample[1],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'Default English (no explicit language marker in 1080p)',
      torrentsSample[2],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'Default English (no explicit language marker in bluray)',
      torrentsSample[3],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'Multiple languages with explicit markers (Eng, Fre, Ger, etc.)',
      torrentsSample[4],
      {
        data: [
          Language.ENGLISH,
          Language.FRENCH,
          Language.SPANISH,
          Language.GERMAN,
          Language.ITALIAN,
          Language.JAPANESE,
          Language.CHINESE,
          Language.CZECH,
          Language.SLOVAK,
          Language.CATALAN,
        ],
        newTitle: 'Barbie 2023 2160p BluRay Hybrid Remux DV HDR HEVC Atmos SGF',
        newDescription: null,
      },
    ],
    [
      'Multiple languages for Indian content (Hindi, Tamil, Telugu, etc.)',
      torrentsSample[5],
      {
        data: [Language.ENGLISH, Language.HINDI, Language.TAMIL, Language.TELUGU, Language.KANNADA],
        newTitle: 'Barbie 2023 BluRay 720p x264',
        newDescription: null,
      },
    ],
    [
      'DUAL language marker in title',
      torrentsSample[6],
      {
        data: [Language.ENGLISH],
        newTitle: 'Barbie 2023 1080p JIO WEB DL DD5 1 H 264 TheBiscuitMan',
        newDescription:
          'General<br>Unique ID: 335203062479783866616164306061595020851 (0xFC2DC2F4CF7E6D3A217BE582FCB08E33)<br>Complete name: Barbie.2023.1080p.JIO.WEB-DL.DD5.1.H.264-TheBiscuitMan.mkv<br>Format: Matroska<br>Format version: Version 4<br>File size: 5.36 GiB<br>Duration: 1 h 49 min<br>Overall bit rate mode: Variable<br>Overall bit rate: 7 022 kb/s<br>Frame rate: 25.000 FPS',
      },
    ],
    [
      'Default English (no explicit language marker in BluRay)',
      torrentsSample[7],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'English with explicit ENG marker',
      torrentsSample[8],
      {
        data: [Language.ENGLISH],
        newTitle: 'Barbie 2023 1080p HD WEBRip 2 10GiB AAC x264 PortalGoods',
        newDescription: null,
      },
    ],
    [
      'Default English (no explicit language marker in 4K UHD)',
      torrentsSample[9],
      {
        data: [Language.ENGLISH],
        newTitle: null,
        newDescription: null,
      },
    ],
  ])(
    'should extract language from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<Language[] | undefined>
    ) => {
      const result = searchForLanguage(torrentMetadata);
      expect<Language[] | undefined>(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );
});

describe('Extract video codec', () => {
  it.each<[string, TorrentMetadata, ExtractedData<VideoCodec | undefined>]>([
    [
      'x265 codec detection',
      torrentsSample[0],
      {
        data: VideoCodec.X265,
        newTitle: 'Barbie 2023 UHD Blu Ray 2160 TrueHD 7 1 DV E',
        newDescription: null,
      },
    ],
    [
      'AV1 codec detection',
      torrentsSample[1],
      {
        data: VideoCodec.AV1,
        newTitle: 'Barbie 2023 2160p DV HDR10 Atmos',
        newDescription: null,
      },
    ],
    [
      'H.264 codec detection',
      torrentsSample[2],
      {
        data: VideoCodec.X264,
        newTitle: 'Barbie 2023 1080p MAX WEB DL DDP5 1 Atmos TURG',
        newDescription: null,
      },
    ],
    [
      'AV1 codec detection in middle of title',
      torrentsSample[3],
      {
        data: VideoCodec.AV1,
        newTitle: 'Barbie 2023 bluray hdr 2160p 7 1 opus subs 4600mb vmaf98 Rosy',
        newDescription: null,
      },
    ],
    [
      'HEVC codec detection after multiple languages',
      torrentsSample[4],
      {
        data: VideoCodec.X265,
        newTitle:
          'Barbie 2023 Eng Fre Ger Ita Spa Cat Cze Slo Chi Jpn 2160p BluRay Hybrid Remux DV HDR Atmos SGF',
        newDescription: null,
      },
    ],
    [
      'x264 codec detection with BluRay source',
      torrentsSample[5],
      {
        data: VideoCodec.X264,
        newTitle: 'Barbie 2023 BluRay 720p Hindi Tamil Telugu Kannada English',
        newDescription: null,
      },
    ],
    [
      'H.264 codec detection with WEB-DL source',
      torrentsSample[6],
      {
        data: VideoCodec.X264,
        newTitle: 'Barbie 2023 1080p JIO WEB DL DUAL DD5 1 TheBiscuitMan',
        newDescription: null,
      },
    ],
    [
      'HEVC 10-bit codec detection',
      torrentsSample[7],
      {
        data: VideoCodec.X265_10BIT,
        newTitle: 'Barbie 2023 1080p BluRay AAC 7 1 Vyndros',
        newDescription: null,
      },
    ],
    [
      'x264 codec detection with WEBRip source',
      torrentsSample[8],
      {
        data: VideoCodec.X264,
        newTitle: 'Barbie 2023 ENG 1080p HD WEBRip 2 10GiB AAC PortalGoods',
        newDescription: null,
      },
    ],
    [
      'H.265 codec detection in 4K UHD content',
      torrentsSample[9],
      {
        data: VideoCodec.X265,
        newTitle: 'Barbie 2023 4K UHD BluRay 2160p DoVi HDR TrueHD 7 1 Atmos MgB',
        newDescription: null,
      },
    ],
  ])(
    'should extract video codec from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<VideoCodec | undefined>
    ) => {
      const result = searchForCodec(torrentMetadata);
      expect<VideoCodec | undefined>(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );

  it('should recognize XVid codec', () => {
    const result = searchForCodec({
      name: 'Movie.2023.XViD-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.XVID);
    expect(result.newTitle).toEqual('Movie.2023.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize VP9 codec', () => {
    const result = searchForCodec({
      name: 'Movie.2023.VP9.1080p-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.VP9);
    expect(result.newTitle).toEqual('Movie.2023.1080p-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize AV1 10-bit codec', () => {
    const result = searchForCodec({
      name: 'Movie.2023.AV1 10bit.2160p-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.AV1_10BIT);
    expect(result.newTitle).toEqual('Movie.2023.2160p-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize MPEG2 codec', () => {
    const result = searchForCodec({
      name: 'Movie.2023.MPEG-2.DVD-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.MPEG2);
    expect(result.newTitle).toEqual('Movie.2023.DVD-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize DivX as MPEG4 codec', () => {
    const result = searchForCodec({
      name: 'Movie.2023.DivX.DVD-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.MPEG4);
    expect(result.newTitle).toEqual('Movie.2023.DVD-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should extract codec from technical description', () => {
    const result = searchForCodec({
      name: 'Movie.2023-GROUP',
      descr: 'Video: HEVC / H.265 Main Profile\nFormat: Matroska',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.X265);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('Video: Main Profile Format: Matroska');
  });

  it('should recognize codec from description when not in title', () => {
    const result = searchForCodec({
      name: 'Movie.2023.1080p-GROUP',
      descr: 'Codec: AVC / H.264\nBitrate: 9.5 Mbps',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.X264);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('Codec: AVC / Bitrate: 9.5 Mbps');
  });

  it('should return UNKNOWN when no codec is detected', () => {
    const result = searchForCodec({
      name: 'Movie.2023.1080p-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<VideoCodec | undefined>(result.data).toEqual(VideoCodec.UNKNOWN);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toBeNull();
  });
});

describe('Extract audio codec', () => {
  it.each<[string, TorrentMetadata, ExtractedData<AudioCodec[]>]>([
    [
      'TrueHD audio codec detection',
      torrentsSample[0],
      {
        data: [AudioCodec.TRUEHD],
        newTitle: 'Barbie 2023 UHD Blu Ray 2160 7 1 DV HEVC x265 E',
        newDescription: null,
      },
    ],
    [
      'Atmos audio codec detection',
      torrentsSample[1],
      {
        data: [AudioCodec.ATMOS],
        newTitle: 'Barbie 2023 2160p DV HDR10 AV1',
        newDescription:
          'General<br>Unique ID: 201310498541833139602848909168094830398 (0x9772FDE1C364EBC3AA39B0972DE55F3E)<br>Complete name: Barbie.2023.2160p.DV.HDR10.AV1.[avoneguy].mkv<br>Format: Matroska<br>Format version: Version 4<br>File size: 5.53 GiB<br>Duration: 1 h 54 min<br>Overall bit rate mode: Variable<br>Overall bit rate: 6 942 kb/s<br>Frame rate: 23.976 FPS',
      },
    ],
    [
      'Dolby Digital Plus (DD+ or DDP) audio codec detection and channel info removal',
      torrentsSample[2],
      {
        data: [AudioCodec.ATMOS, AudioCodec.EAC3],
        newTitle: 'Barbie 2023 1080p MAX WEB DL 1 H 264 TURG',
        newDescription: null,
      },
    ],
    [
      'Opus audio codec detection',
      torrentsSample[3],
      {
        data: [AudioCodec.OPUS],
        newTitle: 'Barbie 2023 bluray hdr 2160p av1 7 1 subs 4600mb vmaf98 Rosy',
        newDescription: null,
      },
    ],
    [
      'Atmos audio codec detection after multiple languages',
      torrentsSample[4],
      {
        data: [AudioCodec.ATMOS],
        newTitle:
          'Barbie 2023 Eng Fre Ger Ita Spa Cat Cze Slo Chi Jpn 2160p BluRay Hybrid Remux DV HDR HEVC SGF',
        newDescription: null,
      },
    ],
    [
      'No audio codec detection in this sample',
      torrentsSample[5],
      {
        data: [],
        newTitle: null,
        newDescription: null,
      },
    ],
    [
      'Dolby Digital (DD) audio codec detection and channel info removal',
      torrentsSample[6],
      {
        data: [AudioCodec.AC3],
        newTitle: 'Barbie 2023 1080p JIO WEB DL DUAL 1 H 264 TheBiscuitMan',
        newDescription:
          'General<br>Unique ID: 335203062479783866616164306061595020851 (0xFC2DC2F4CF7E6D3A217BE582FCB08E33)<br>Complete name: Barbie.2023.1080p.JIO.WEB-DL.DUAL.H.264-TheBiscuitMan.mkv<br>Format: Matroska<br>Format version: Version 4<br>File size: 5.36 GiB<br>Duration: 1 h 49 min<br>Overall bit rate mode: Variable<br>Overall bit rate: 7 022 kb/s<br>Frame rate: 25.000 FPS',
      },
    ],
    [
      'AAC audio codec detection',
      torrentsSample[7],
      {
        data: [AudioCodec.AAC],
        newTitle: 'Barbie 2023 1080p BluRay x265 HEVC 10bit 7 1 Vyndros',
        newDescription: null,
      },
    ],
    [
      'AAC audio codec detection',
      torrentsSample[8],
      {
        data: [AudioCodec.AAC],
        newTitle: 'Barbie 2023 ENG 1080p HD WEBRip 2 10GiB x264 PortalGoods',
        newDescription: null,
      },
    ],
    [
      'TrueHD and Atmos audio codec detection (should prefer TrueHD as it comes first)',
      torrentsSample[9],
      {
        data: [AudioCodec.TRUEHD, AudioCodec.ATMOS],
        newTitle: 'Barbie 2023 4K UHD BluRay 2160p DoVi HDR 7 1 H 265 MgB',
        newDescription: null,
      },
    ],
  ])(
    'should extract audio codec from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<AudioCodec[]>
    ) => {
      const result = searchForAudioCodec(torrentMetadata);
      expect(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );

  it('should recognize DTS audio codec', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.1080p.DTS.5.1-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.DTS]);
    expect(result.newTitle).toEqual('Movie.2023.1080p.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize DTS-HD audio codec', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.1080p.DTS-HD.-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.DTS_HD]);
    expect(result.newTitle).toEqual('Movie.2023.1080p.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize DTS-HD Master Audio codec', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.1080p.DTS-HD MA.7.1-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.DTS_HDMA]);
    expect(result.newTitle).toEqual('Movie.2023.1080p.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should recognize FLAC audio codec', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.1080p.FLAC.2.0-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.FLAC]);
    expect(result.newTitle).toEqual('Movie.2023.1080p.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should extract audio codec from technical description', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023-GROUP',
      descr: 'Audio: AC3 5.1ch\nFormat: Matroska',
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.AC3]);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toEqual('Audio: Format: Matroska');
  });

  it('should recognize MP3 audio codec', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.MP3.2.0-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([AudioCodec.MP3]);
    expect(result.newTitle).toEqual('Movie.2023.-GROUP');
    expect(result.newDescription).toBeNull();
  });

  it('should return UNKNOWN when no audio codec is detected', () => {
    const result = searchForAudioCodec({
      name: 'Movie.2023.1080p-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual([]);
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toBeNull();
  });
});

describe('Extract TV data', () => {
  it.each<
    [string, TorrentMetadata, ExtractedData<{ season?: number; episode?: number } | undefined>]
  >([
    [
      'Standard TV episode format',
      torrentsSample[10],
      {
        data: { season: 5, episode: 6 },
        newTitle: 'Game of Thrones S05E06 HDTV x264 ASAP EZTV',
        newDescription: null,
      },
    ],
    [
      'TV episode with 720p marker',
      torrentsSample[11],
      {
        data: { season: 5, episode: 6 },
        newTitle: 'Game of Thrones S05E06 720p HDTV x264 IMMERSE EZTV',
        newDescription: null,
      },
    ],
    [
      'TV episode with 1080i marker (not recognized as FHD)',
      torrentsSample[12],
      {
        data: { season: 5, episode: 6 },
        newTitle: 'Game of Thrones S05E06 1080i HDTV MPEG2 DD5 1 CtrlHD EZTV',
        newDescription: null,
      },
    ],
  ])(
    'should extract TV data from %s',
    (
      _testName: string,
      torrentMetadata: TorrentMetadata,
      expected: ExtractedData<{ season?: number; episode?: number } | undefined>
    ) => {
      const result = searchForTVData(torrentMetadata);
      expect<{ season?: number; episode?: number } | undefined>(result.data).toEqual(expected.data);
      expect(result.newTitle).toEqual(expected.newTitle);
      expect(result.newDescription).toEqual(expected.newDescription);
    }
  );

  it('should handle missing season and episode', () => {
    const result = searchForTVData({
      name: 'Random.Movie.2023.1080p.WEBRip.x264-GROUP',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<{ season?: number; episode?: number } | undefined>(result.data).toEqual({});
    expect(result.newTitle).toBeNull();
    expect(result.newDescription).toBeNull();
  });

  it('should prioritize season and episode in the title over other data', () => {
    const result = searchForTVData({
      name: 'Game.of.Thrones.S05E06.2160p.AV1.DV.HDR10.Atmos.mkv',
      descr: null,
      files: null,
      category: 'Movies',
      type: null,
      size: 1000000,
    });
    expect<{ season?: number; episode?: number } | undefined>(result.data).toEqual({
      season: 5,
      episode: 6,
    });
    expect(result.newTitle).toEqual('Game of Thrones S05E06 2160p AV1 DV HDR10 Atmos');
    expect(result.newDescription).toBeNull();
  });

  it('should handle various TV show episode formats', () => {
    // S01E01 format
    const standardFormat = searchForTVData({
      name: 'Breaking.Bad.S01E01.720p.HDTV.x264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(standardFormat.data).toEqual({ season: 1, episode: 1 });
    expect(standardFormat.newTitle).toEqual('Breaking Bad S01E01 720p HDTV x264');

    // s01.e01 format
    const dottedFormat = searchForTVData({
      name: 'The.Wire.s03.e05.1080p.BluRay.x264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(dottedFormat.data).toEqual({ season: 3, episode: 5 });
    expect(dottedFormat.newTitle).toEqual('The Wire s03 e05 1080p BluRay x264');

    // Season 1 Episode 1 format
    const writtenFormat = searchForTVData({
      name: 'Stranger Things Season 2 Episode 9 1080p.mkv',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(writtenFormat.data).toEqual({ season: 2, episode: 9 });
    expect(writtenFormat.newTitle).toEqual('Stranger Things Season 2 Episode 9 1080p');

    // 1x01 format
    const shortFormat = searchForTVData({
      name: 'The.Sopranos.2x05.REMASTERED.1080p.BluRay.x264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(shortFormat.data).toEqual({ season: 2, episode: 5 });
    expect(shortFormat.newTitle).toEqual('The Sopranos 2x05 REMASTERED 1080p BluRay x264');

    // 01.01 format (season.episode)
    const numericFormat = searchForTVData({
      name: 'Lost.04.08.Meet.Kevin.Johnson.720p.BluRay.x264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(numericFormat.data).toEqual({ season: 4, episode: 8 });
    expect(numericFormat.newTitle).toEqual('Lost 04 08 Meet Kevin Johnson 720p BluRay x264');

    // 01_01 format
    const underscoreFormat = searchForTVData({
      name: 'Twin.Peaks.01_07.1080p.BluRay.x264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(underscoreFormat.data).toEqual({ season: 1, episode: 7 });
    expect(underscoreFormat.newTitle).toEqual('Twin Peaks 01_07 1080p BluRay x264');

    // E01 format (episode only, assumes season 1)
    const episodeOnlyFormat = searchForTVData({
      name: 'Chernobyl.E03.1080p.AMZN.WEB-DL.DDP5.1.H.264',
      descr: null,
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(episodeOnlyFormat.data).toEqual({ season: 1, episode: 3 });
    expect(episodeOnlyFormat.newTitle).toEqual('Chernobyl E03 1080p AMZN WEB-DL DDP5 1 H 264');
  });

  it('should extract TV data from description when not in title', () => {
    const result = searchForTVData({
      name: 'Sherlock Holmes BBC Complete',
      descr: 'This is season 3 episode 2 of the BBC Sherlock Holmes series',
      files: null,
      category: 'TV',
      type: null,
      size: 1000000,
    });
    expect(result.data).toEqual({ season: 3, episode: 2 });
    expect(result.newTitle).toBeNull(); // When pattern is in description only, title is not modified
    expect(result.newDescription).toEqual(
      'This is season 3 episode 2 of the BBC Sherlock Holmes series'
    );
  });
});
