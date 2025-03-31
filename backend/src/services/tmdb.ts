abstract class APIClient {
  protected async get<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);

    if (response.status >= 300) {
      throw new Error(`Failed to fetch data from ${url}`);
    }

    return response.json() as Promise<T>;
  }
}

type PopularMoviesResponse = {
  results: Array<{
    title: string;
    director?: string;
    imdb_id?: string;
    genre_ids: number[];
    release_date: string;
    runtime: number;
    poster_path: string;
  }>;
};

export class TMDB extends APIClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = "https://api.themoviedb.org/3";
  }

  async getPopularMovies() {
    const response = await this.get<PopularMoviesResponse>(
      `${this.apiUrl}/movie/popular`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log(response);
    if (!response.results) {
      throw new Error("Failed to fetch popular movies from TMDB API");
    }
    return response.results;
  }
}
