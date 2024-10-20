/*
  rules:
    movies:
      if contains the word "movies" does not contain the word "x265", "anime", "3D", "Bollywood"
      order by:
        100: x264
        90: mp4
        85: divx
        80: uhd
        75: hd
        70: dvd
        50: ---
        20: SD
        10: SVCD
    tv:
      if contains the word "tv" does not contain the word "x265", "anime", "3D", "Bollywood"
    anime:
      if contains the word "anime"
 */
export const monoIndexers = {
  anime: ['nyaasi', 'subsplease'],
  movies: [],
  tv: [],
};

export const indexerDefaultCategories = {
  '1337x': {
    movies: [
      /*
      100054	Movies/h.264/x264
      100055	Movies/Mp4
      100002	Movies/Divx/Xvid
      100076	Movies/UHD
      2045	Movies/UHD
      2040	Movies/HD
      100042	Movies/HD
      2070	Movies/DVD
      100001	Movies/DVD
      100004	Movies/Dubs/Dual Audio
      2010	Movies/Foreign
      2000	Movies
      100003	Movies/SVCD/VCD
      2030	Movies/SD
       --- 100070	Movies/HEVC/x265
       */
      100054, 100055, 100002, 100076, 2045, 2040, 100042, 2070, 100001, 100004,
      2010, 2000, 100003, 2030,
    ],
    tv: [
      5040, 100041, 100005, 100006, 5000, 100074, 5080, 100009, 5030, 100075,
      100007,
      /*
      5040	TV/HD
      100041	TV/HD
      100005	TV/DVD
      100006	TV/Divx/Xvid
      5000	TV
      100074	TV/Cartoons
      5080	TV/Documentary
      100009	TV/Documentary
      5030	TV/SD
      100075	TV/SD
      100007	TV/SVCD/VCD
       ---100071	TV/HEVC/x265
       */
    ],
    anime: [
      100078, 100081, 5070, 100028, 100079, 100080,
      /*
        100078	Anime/Dual Audio
        100081	Anime/Raw
        5070	TV/Anime
        100028	Anime/Anime
        100079	Anime/Dubbed
        100080	Anime/Subbed
       */
    ],
  },
  limetorrents: {
    movies: [
      100467, 2000,
      /*
        2000	Movies
        100467	Movies
       */
    ],
    tv: [
      5000, 100467,
      /*
        5000	TV
        100467	Movies
       */
    ],
    anime: [
      5070, 146065,
      /*
        5070	TV/Anime
        146065	Anime
       */
    ],
  },
  nyaasi: {
    movies: [],
    tv: [],
    anime: [
      140679, 127720, 134634, 5070,
      /*
        140679	Anime
        127720	English subtitled animes
        134634	Raw animes
        5070	TV/Anime
       */
    ],
  },
  therarbg: {
    movies: [
      100467, 2000,
      /*
        100467	Movies
        2000	Movies
       */
    ],
    tv: [
      5000, 143862, 5080,
      /*
        5000	TV
        143862	TV
        5080	TV/Documentary
       */
    ],
    anime: [
      5070, 146065,
      /*
        5070	TV/Anime
        146065	Anime
       */
    ],
  },
  subsplease: {
    /*
      2000	Movies
      2020	Movies/Other
      5000	TV
      5070	TV/Anime
     */
  },
};
