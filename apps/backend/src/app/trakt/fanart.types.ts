interface MovieFanartBase {
  id: string;
  url: string;
  lang: string;
  likes: string;
}

interface MovieDiscFanart extends MovieFanartBase {
  disc: string;
  disc_type: string;
}

export interface MovieFanartResponse {
  name: string;
  tmdb_id: string;
  imdb_id: string;
  hdmovieclearart: MovieFanartBase[];
  moviedisc: MovieDiscFanart[];
  moviebackground: MovieFanartBase[];
  hdmovielogo: MovieFanartBase[];
  movieposter: MovieFanartBase[];
  moviethumb: MovieFanartBase[];
  moviebanner: MovieFanartBase[];
}
