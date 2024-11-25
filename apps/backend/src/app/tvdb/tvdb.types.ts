export type TBDBResponseWrapper<T> = {
  status: 'success';
  data: T;
};

export interface TokenResponse {
  token: string;
}

interface NameAlias {
  language: string;
  name: string;
}

interface TagOption {
  id: number;
  tag: number;
  tagName: string;
  name: string;
  helpText: string;
}

interface ShowArtwork {
  id: number;
  image: string; // "https://artworks.thetvdb.com/...",
  thumbnail: string;
  language: string;
  type: number; // 3,
  score: number; // 100005,
  width: number; // 1920,
  height: number; // 1080,
  includesText: boolean;
  thumbnailWidth: number; // 0,
  thumbnailHeight: number; // 0,
  updatedAt: number; //0,
  status: {
    id: number; // 0,
    name: null;
  };
  tagOptions: null | TagOption[];
}

interface ShowCompany {
  id: number;
  name: string; // "Apple TV+",
  slug: string; // "apple-tv-plus",
  nameTranslations: string[];
  overviewTranslations: string[];
  aliases: NameAlias[];
  country: string;
  primaryCompanyType: number;
  activeDate: string; // "2019-11-01",
  inactiveDate: null;
  companyType: {
    companyTypeId: number;
    companyTypeName: string; // "Network" ( 1 ) | "Production Company" ( 3 )
  };
  parentCompany: {
    id: null;
    name: null;
    relation: {
      id: null;
      typeName: null;
    };
  };
  tagOptions: null | TagOption[];
}

interface ShowGenre {
  id: number;
  name: string;
  slug: string;
}

interface ShowTrailer {
  id: number;
  name: string;
  url: string;
  language: string;
  runtime: number;
}

interface ShowList {
  id: number;
  name: string;
  overview: string;
  url: string;
  isOfficial: boolean;
  nameTranslations: string[];
  overviewTranslations: string[];
  aliases: [];
  score: number;
  image: string;
  imageIsFallback: boolean;
  remoteIds: null;
  tags: null;
}

interface ShowCharacter {
  id: number;
  name: string;
  peopleId: number;
  seriesId: number;
  series: null;
  movie: null;
  movieId: null;
  episodeId: null;
  type: number;
  image: string;
  sort: number;
  isFeatured: boolean;
  url: string;
  nameTranslations: string[] | null;
  overviewTranslations: string[] | null;
  aliases: null;
  peopleType: string;
  personName: string;
  tagOptions: null | TagOption[];
  personImgURL: string | null;
}

interface ShowType {
  id: number;
  name: string; // 'Aired Order';
  type: string; // 'official';
  alternateName: null;
}

interface ShowSeason {
  id: number;
  seriesId: number;
  type: ShowType;
  number: number;
  nameTranslations: string[];
  overviewTranslations: string[];
  image: string; // 'https://artworks.thetvdb.com/...';
  imageType: number;
  companies: {
    studio: null;
    network: null;
    production: null;
    distributor: null;
    special_effects: null;
  };
  lastUpdated: string; // '2024-11-22 02:16:33';
}

interface RemoteId {
  id: string;
  type: number;
  sourceName: string;
}

interface ShowRating {
  id: number;
  name: string;
  country: string;
  description: string;
  contentType: string;
  order: number;
  fullname: null;
}

interface ShowResponse<Episodes = false> {
  id: number; //403245,
  name: string; //"Silo",
  slug: string; // "wool",
  image: string; // "https://artworks.thetvdb.com/banners/v4/series/403245/posters/64432dea72673.jpg",
  nameTranslations: string[]; // ["eng", "spa", ...
  overviewTranslations: string[]; // ["eng", "spa", ...
  aliases: NameAlias[];
  firstAired: string; // "2023-05-05",
  lastAired: string;
  nextAired: string;
  score: number; // 232203,
  status: {
    id: number; // 1,
    name: string; // "Continuing",
    recordType: string; // "series",
    keepUpdated: boolean;
  };
  originalCountry: string; // "usa",
  originalLanguage: string;
  defaultSeasonType: number; // 1,
  isOrderRandomized: boolean;
  lastUpdated: string; // "2024-11-22 16:21:40",
  averageRuntime: number; // 49,
  episodes: Episodes extends true ? ShowEpisode[] : null;
  overview: string;
  year: string; // "2023"
}

export interface ShowExtendedResponse<Short = false, Episodes = false>
  extends ShowResponse<Episodes> {
  artworks: Short extends true ? null : ShowArtwork[];
  companies: ShowCompany[];
  originalNetwork: ShowCompany;
  latestNetwork: ShowCompany;
  genres: ShowGenre[];
  trailers: ShowTrailer[];
  lists: ShowList[];
  remoteIds: RemoteId[];
  characters: Short extends true ? null : ShowCharacter[];
  airsDays: {
    sunday: boolean;
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
  };
  airsTime: string; // '00:00';
  seasons: ShowSeason[];
  tags: TagOption[];
  contentRatings: ShowRating[];
  seasonTypes: ShowType[];
}

interface ShowEpisode {
  id: number;
  seriesId: number;
  name: string;
  aired: string; // "2023-05-05",
  runtime: number; // 2,
  nameTranslations: string[];
  overview: string;
  overviewTranslations: string[];
  image: string;
  imageType: number;
  isMovie: boolean;
  seasons: null;
  number: number;
  absoluteNumber: number; // 0,
  seasonNumber: number; // 0,
  lastUpdated: string; // "2024-08-28 04:12:26",
  finaleType: null | 'season';
  airsBeforeSeason: number; // 1,
  airsBeforeEpisode: number; // 1,
  year: string; // "2023"
}

export interface ShowEpisodesResponse {
  series: ShowResponse;
  episodes: ShowEpisode[];
}
