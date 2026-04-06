export interface TMDBSearchResult {
  id: number;
  title?: string;       // movies
  name?: string;        // TV shows
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;  // movies
  first_air_date?: string; // TV
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

export interface OMDBRatings {
  imdb: number | null;
  metacritic: number | null;
  rottenTomatoes: string | null;
  imdbId: string;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface WatchProviders {
  free?: WatchProvider[];
  ads?: WatchProvider[];
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
  link?: string;
}

export interface FreeSource {
  source: string;
  name: string;
  url: string;
  type: 'free' | 'library' | 'archive';
  channel?: string;
}

export interface TitleResult {
  tmdbId: number;
  imdbId?: string;
  traktId?: number;
  title: string;
  mediaType: 'movie' | 'tv';
  year: number | null;
  posterUrl: string | null;
  overview: string;
  runtime?: number;
  genres?: string[];
  tmdbRating: number;
  tmdbVoteCount: number;
  omdbRatings?: OMDBRatings;
  watchProviders?: WatchProviders;
  freeSources?: FreeSource[];
  letterboxdSlug?: string;
}

export interface UserTitleStatus {
  watched: boolean;
  hidden: boolean;
  watchlisted: boolean;
  rating: number | null;
  watchedAt?: string;
  ratedAt?: string;
}

export interface TraktItem {
  ids: {
    trakt: number;
    slug: string;
    imdb?: string;
    tmdb?: number;
  };
  title: string;
  year: number;
}

export interface RecentLookup {
  tmdbId: number;
  title: string;
  posterPath?: string;
  mediaType: 'movie' | 'tv';
  lastViewed: number;
}

export type TitleStatus = 'watched' | 'hidden' | 'watchlisted' | 'new';
