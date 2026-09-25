#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const providersRoot = path.join(root, 'test-fixtures/providers');
const outputPath = path.resolve(
  root,
  process.argv[2] ?? 'test-fixtures/provider-fictionalization.json'
);
const existingManifestPath = path.join(root, 'test-fixtures/provider-fictionalization.json');

const words = {
  adjectives: [
    'Amber', 'Blue', 'Brass', 'Bright', 'Copper', 'Crimson', 'Distant', 'Emerald',
    'Falling', 'Golden', 'Hidden', 'Ivory', 'Last', 'Midnight', 'Northern', 'Quiet',
    'Scarlet', 'Silver', 'Silent', 'Velvet',
  ],
  nouns: [
    'Archive', 'Beacon', 'Bridge', 'Compass', 'Crown', 'Echo', 'Garden', 'Harbor',
    'Horizon', 'Lantern', 'Meridian', 'Orchard', 'Passage', 'River', 'Signal', 'Sky',
    'Station', 'Valley', 'Voyage', 'Window',
  ],
  places: [
    'Alder Bay', 'Bellhaven', 'Cedar Point', 'Dunmere', 'Eastmere', 'Fox Hollow',
    'Glassford', 'Highwater', 'Juniper Vale', 'Kingswell', 'Larkspur', 'Moonridge',
    'Northbridge', 'Oak Harbor', 'Pinewatch', 'Queensport', 'Rosefield', 'Stonehaven',
    'Westmere', 'Willow Reach',
  ],
  firstNames: [
    'Avery', 'Cameron', 'Casey', 'Devon', 'Elliot', 'Emery', 'Jordan', 'Lane', 'Mara',
    'Morgan', 'Noel', 'Parker', 'Quinn', 'Remy', 'Riley', 'Robin', 'Rowan', 'Sage',
    'Sidney', 'Taylor',
  ],
  lastNames: [
    'Arden', 'Bell', 'Cross', 'Dale', 'Ellis', 'Finch', 'Gray', 'Hart', 'Ives',
    'James', 'Keene', 'Lake', 'March', 'North', 'Page', 'Reed', 'Stone', 'Vale',
    'West', 'Young',
  ],
};

const jsonFiles = directory =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(file);
    return entry.name.endsWith('.json') ? [file] : [];
  }).sort();

const hash = value => {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};
const pick = (values, seed, salt) => values[hash(`${salt}:${seed}`) % values.length];
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const itemsIn = response => Array.isArray(response.data) ? response.data : [];
const keyFor = (type, id) => `${type}:${id}`;

const fakeTitle = (type, id) => {
  const seed = keyFor(type, id);
  return `${pick(words.adjectives, seed, 'adjective')} ${pick(words.nouns, seed, 'noun')}: ${pick(words.places, seed, 'place')}`;
};

const mediaReplacement = (type, id, title = fakeTitle(type, id)) => ({
  title,
  originalTitle: title,
  overview: `${title} follows an unlikely group whose choices reshape their community and the future they thought was settled.`,
  tagline: 'Every choice leaves a signal.',
  homepage: `https://example.test/${type === 'movie' ? 'films' : 'series'}/${slugify(title)}`,
  collectionName: `${title} Collection`,
  companyName: `${pick(words.adjectives, keyFor(type, id), 'company-adjective')} ${pick(words.nouns, keyFor(type, id), 'company-noun')} Pictures`,
});

const personReplacement = id => ({
  name: `${pick(words.firstNames, id, 'person-first')} ${pick(words.lastNames, id, 'person-last')}`,
});
const companyReplacement = id => ({
  name: `${pick(words.adjectives, id, 'company-adjective')} ${pick(words.nouns, id, 'company-noun')} Studios`,
});
const networkReplacement = id => ({
  name: `${pick(words.adjectives, id, 'network-adjective')} ${pick(words.nouns, id, 'network-noun')} Network`,
});
const userReplacement = id => {
  const name = `${pick(words.firstNames, id, 'user-first')} ${pick(words.lastNames, id, 'user-last')}`;
  return {
    username: `${slugify(name)}-${Number(id).toString(36)}`,
    name,
    location: pick(words.places, id, 'user-place'),
    about: 'Film and television enthusiast building thoughtful watchlists for every mood.',
    gender: hash(`user-gender:${id}`) % 2 === 0 ? 'female' : 'male',
    age: 21 + (hash(`user-age:${id}`) % 40),
  };
};
const listReplacement = id => ({
  name: `${pick(words.adjectives, id, 'list-adjective')} ${pick(words.nouns, id, 'list-noun')} Watchlist`,
  description: 'A hand-picked collection of memorable films and series, organized for an easy viewing journey.',
});
const episodeReplacement = id => ({
  title: `${pick(words.adjectives, id, 'episode-adjective')} ${pick(words.nouns, id, 'episode-noun')}`,
  overview: 'A new discovery changes the plan and forces the group to decide what they are willing to risk next.',
});
const seasonReplacement = seasonNumber => ({
  name: seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`,
  overview: 'The story expands as old choices return and new alliances begin to take shape.',
});

const emptyManifest = {
  version: 2,
  images: 'preserved',
  records: {},
  entities: {
    people: {},
    companies: {},
    networks: {},
    users: {},
    lists: {},
    episodes: {},
    seasons: {},
  },
};
const existing = fs.existsSync(existingManifestPath)
  ? JSON.parse(fs.readFileSync(existingManifestPath, 'utf8'))
  : emptyManifest;
const manifest = structuredClone(emptyManifest);
const referencedEntities = Object.fromEntries(
  Object.keys(manifest.entities).map(bucket => [bucket, new Set()])
);

for (const [id, record] of Object.entries(existing.records ?? {})) {
  if (!record?.replacement) continue;
  if (id.includes(':')) {
    manifest.records[id] = { sourceFile: record.sourceFile, replacement: record.replacement };
    continue;
  }
  const type = record.sourceFile?.includes('/trakt/shows/') ? 'show' : 'movie';
  manifest.records[keyFor(type, id)] = {
    sourceFile: record.sourceFile,
    replacement: record.replacement,
  };
}
for (const bucket of Object.keys(manifest.entities)) {
  for (const [id, entity] of Object.entries(existing.entities?.[bucket] ?? {})) {
    if (!entity?.replacement) continue;
    const replacement = bucket === 'users'
      ? { ...userReplacement(id), ...entity.replacement }
      : entity.replacement;
    manifest.entities[bucket][id] = { replacement };
  }
}

const ensureMedia = (type, id, file, currentTitle, alreadyAnonymized) => {
  if (id == null) return;
  const key = keyFor(type, id);
  if (manifest.records[key]) return;
  const title = alreadyAnonymized && currentTitle ? currentTitle : undefined;
  manifest.records[key] = {
    sourceFile: path.relative(root, file),
    replacement: mediaReplacement(type, id, title),
  };
};
const ensureEntity = (bucket, id, replacement) => {
  if (id == null) return;
  const key = String(id);
  referencedEntities[bucket].add(key);
  if (manifest.entities[bucket][key]) return;
  manifest.entities[bucket][key] = { replacement };
};
const ensureEpisode = episode => {
  if (!episode) return;
  const id = episode.ids?.tmdb ?? episode.ids?.trakt ?? episode.id;
  ensureEntity('episodes', id, episodeReplacement(id));
};

for (const file of jsonFiles(providersRoot)) {
  const response = JSON.parse(fs.readFileSync(file, 'utf8'));
  const alreadyAnonymized = ['faker', 'llm'].includes(response.anonymized);
  const relative = path.relative(providersRoot, file);

  if (relative.startsWith('tmdb/3/movie/') && response.data?.id != null) {
    const movie = response.data;
    ensureMedia('movie', movie.id, file, movie.title, alreadyAnonymized);
  }
  if (relative.startsWith('tmdb/3/tv/') && response.data?.id != null) {
    const show = response.data;
    ensureMedia('show', show.id, file, show.name, alreadyAnonymized);
    for (const person of show.created_by ?? []) {
      ensureEntity('people', person.id, personReplacement(person.id));
    }
    for (const company of show.production_companies ?? []) {
      ensureEntity('companies', company.id, companyReplacement(company.id));
    }
    for (const network of show.networks ?? []) {
      ensureEntity('networks', network.id, networkReplacement(network.id));
    }
    for (const episode of [show.last_episode_to_air, show.next_episode_to_air]) ensureEpisode(episode);
    for (const season of show.seasons ?? []) {
      const key = `${show.id}:${season.season_number}`;
      ensureEntity('seasons', key, seasonReplacement(season.season_number));
    }
  }

  for (const item of itemsIn(response)) {
    if (item.movie) ensureMedia('movie', item.movie.ids?.tmdb, file, item.movie.title, alreadyAnonymized);
    if (item.show) ensureMedia('show', item.show.ids?.tmdb, file, item.show.title, alreadyAnonymized);
    if (!item.movie && !item.show && item.ids?.tmdb && relative.startsWith('trakt/movies/')) {
      ensureMedia('movie', item.ids.tmdb, file, item.title, alreadyAnonymized);
    }
    if (!item.movie && !item.show && item.ids?.tmdb && relative.startsWith('trakt/shows/')) {
      ensureMedia('show', item.ids.tmdb, file, item.title, alreadyAnonymized);
    }
    ensureEpisode(item.episode);
    if (item.list) {
      const listId = item.list.ids?.trakt;
      const userId = item.list.user?.ids?.trakt;
      ensureEntity('lists', listId, listReplacement(listId));
      ensureEntity('users', userId, userReplacement(userId));
    }
  }
}

for (const [bucketName, bucket] of Object.entries(manifest.entities)) {
  for (const key of Object.keys(bucket)) {
    if (!referencedEntities[bucketName].has(key)) delete bucket[key];
  }
  const sorted = Object.fromEntries(
    Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
  );
  for (const key of Object.keys(bucket)) delete bucket[key];
  Object.assign(bucket, sorted);
}
manifest.records = Object.fromEntries(
  Object.entries(manifest.records).sort(([a], [b]) =>
    a.localeCompare(b, 'en', { numeric: true })
  )
);

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Prepared ${Object.keys(manifest.records).length} type-scoped media mappings and ` +
    `${Object.values(manifest.entities).reduce((sum, bucket) => sum + Object.keys(bucket).length, 0)} related entity mappings in ${path.relative(root, outputPath)}.`
);
