/**
 * Free Viewing Sources Search
 * Aggregates free and library-based sources for movies and TV shows
 */

const YOUTUBE_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

export interface FreeSource {
  source: string;
  name: string;
  url: string;
  type: 'free' | 'library';
}

interface YouTubeSearchResponse {
  items?: Array<{
    id: {
      videoId?: string;
    };
    snippet: {
      title: string;
    };
  }>;
}

/**
 * Search all free viewing sources for a title
 */
export async function searchFreeSources(
  title: string,
  year: number | null,
  _tmdbId: number | null,
  _mediaType: 'movie' | 'tv'
): Promise<FreeSource[]> {
  const sources: FreeSource[] = [];

  // Search YouTube for free movies/shows
  const ytResults = await searchYouTube(title, year);
  sources.push(...ytResults);

  // Search Internet Archive
  const iaResults = await searchInternetArchive(title, year);
  sources.push(...iaResults);

  // Get library links
  const libResults = getLibraryLinks(title);
  sources.push(...libResults);

  return sources;
}

/**
 * Search YouTube Data API for free full movies/shows
 */
export async function searchYouTube(title: string, year: number | null): Promise<FreeSource[]> {
  if (!YOUTUBE_API_KEY) {
    console.warn('YouTube API key not configured');
    return [];
  }

  try {
    // Search for free full movie/show on YouTube
    const searchQuery = year ? `${title} ${year} full movie` : `${title} full movie`;

    const response = await fetch(
      `${YOUTUBE_BASE_URL}?part=snippet&q=${encodeURIComponent(
        searchQuery
      )}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      console.error('YouTube search failed:', response.statusText);
      return [];
    }

    const data = (await response.json()) as YouTubeSearchResponse;

    return (data.items || []).map((item) => ({
      source: 'youtube',
      name: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      type: 'free' as const,
    }));
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return [];
  }
}

/**
 * Search Internet Archive for movies/shows
 */
export async function searchInternetArchive(
  title: string,
  year: number | null
): Promise<FreeSource[]> {
  try {
    // Build search query for Internet Archive
    const searchQuery = year ? `${title} ${year}` : title;

    // Internet Archive advanced search URL
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      searchQuery
    )}&fl=identifier,title&output=json&rows=10`;

    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.error('Internet Archive search failed:', response.statusText);
      return [];
    }

    const data = (await response.json()) as {
      response?: {
        docs?: Array<{
          identifier: string;
          title: string;
        }>;
      };
    };

    const docs = data.response?.docs || [];

    return docs.map((doc) => ({
      source: 'archive.org',
      name: doc.title || doc.identifier,
      url: `https://archive.org/details/${doc.identifier}`,
      type: 'free' as const,
    }));
  } catch (error) {
    console.error('Error searching Internet Archive:', error);
    return [];
  }
}

/**
 * Generate library links for streaming services
 * Returns search URLs for Kanopy and Hoopla
 */
export function getLibraryLinks(title: string): FreeSource[] {
  const sources: FreeSource[] = [];

  // Kanopy (many public libraries)
  sources.push({
    source: 'kanopy',
    name: `Search on Kanopy (via your library card)`,
    url: `https://www.kanopy.com/en/search?q=${encodeURIComponent(title)}`,
    type: 'library',
  });

  // Hoopla (many public libraries)
  sources.push({
    source: 'hoopla',
    name: `Search on Hoopla (via your library card)`,
    url: `https://www.hoopladigital.com/search?q=${encodeURIComponent(title)}`,
    type: 'library',
  });

  // Library.co - Library search aggregator
  sources.push({
    source: 'library.co',
    name: `Check availability in your library's catalog`,
    url: `https://library.co/search?q=${encodeURIComponent(title)}`,
    type: 'library',
  });

  return sources;
}
