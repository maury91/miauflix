import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const providers = join(root, 'test-fixtures', 'providers');

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await jsonFiles(path)));
    else if (entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}

const files = await jsonFiles(providers);
if (files.length === 0) throw new Error(`No provider fixtures found in ${providers}`);

const relations = new Map();
const remember = (kind, id, value, file) => {
  if (id == null || value == null) return;
  const key = `${kind}:${id}`;
  const serialized = JSON.stringify(value);
  const previous = relations.get(key);
  if (previous && previous.value !== serialized) {
    throw new Error(
      `Inconsistent ${kind} relation ${id} in ${relative(root, previous.file)} and ${relative(root, file)}`
    );
  }
  relations.set(key, { value: serialized, file });
};

const rememberEpisode = (episode, file) => {
  if (!episode) return;
  const id = episode.ids?.tmdb ?? episode.ids?.trakt ?? episode.id;
  remember('episode', id, episode.title ?? episode.name, file);
};

for (const file of files) {
  let response;
  try {
    response = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${relative(root, file)}: ${error.message}`);
  }

  if (!response || typeof response !== 'object' || !response.headers) {
    throw new Error(`Missing response headers in ${relative(root, file)}`);
  }
  if (!Object.hasOwn(response, 'data')) {
    throw new Error(`Missing response data in ${relative(root, file)}`);
  }
  if (typeof response.status !== 'number') {
    throw new Error(`Response status must be numeric in ${relative(root, file)}`);
  }
  if (!['faker', 'llm'].includes(response.anonymized)) {
    throw new Error(
      `Response anonymized must be "faker" or "llm" in ${relative(root, file)}`
    );
  }

  const fixturePath = relative(providers, file);
  if (fixturePath.startsWith('tmdb/3/movie/') && response.data?.id != null) {
    remember('movie', response.data.id, response.data.title, file);
  }
  if (fixturePath.startsWith('tmdb/3/tv/') && response.data?.id != null) {
    const show = response.data;
    remember('show', show.id, show.name, file);
    for (const person of show.created_by ?? []) remember('person', person.id, person.name, file);
    for (const company of show.production_companies ?? []) {
      remember('company', company.id, company.name, file);
    }
    for (const network of show.networks ?? []) remember('network', network.id, network.name, file);
    rememberEpisode(show.last_episode_to_air, file);
    rememberEpisode(show.next_episode_to_air, file);
  }
  if (fixturePath.startsWith('trakt/') && Array.isArray(response.data)) {
    for (const item of response.data) {
      if (item.movie) remember('movie', item.movie.ids?.tmdb, item.movie.title, file);
      if (item.show) remember('show', item.show.ids?.tmdb, item.show.title, file);
      if (!item.movie && !item.show && item.ids?.tmdb && fixturePath.startsWith('trakt/movies/')) {
        remember('movie', item.ids.tmdb, item.title, file);
      }
      if (!item.movie && !item.show && item.ids?.tmdb && fixturePath.startsWith('trakt/shows/')) {
        remember('show', item.ids.tmdb, item.title, file);
      }
      rememberEpisode(item.episode, file);
      if (item.list) {
        remember(
          'list',
          item.list.ids?.trakt,
          { name: item.list.name, description: item.list.description },
          file
        );
        const user = item.list.user;
        if (user) {
          remember(
            'user',
            user.ids?.trakt,
            {
              username: user.username,
              name: user.name,
              location: user.location,
              about: user.about,
              gender: user.gender,
              age: user.age,
            },
            file
          );
        }
      }
    }
  }
}

console.log(`Validated ${files.length} anonymized provider fixtures and ${relations.size} relations.`);
