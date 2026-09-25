#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const providersRoot = path.join(root, 'test-fixtures/providers');
const manifestPath = path.resolve(
  root,
  process.argv[2] ?? 'test-fixtures/provider-fictionalization.json'
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const jsonFiles = directory =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(file);
    return entry.name.endsWith('.json') ? [file] : [];
  }).sort();
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const keyFor = (type, id) => `${type}:${id}`;

const replacementFor = (type, id) => {
  const replacement =
    manifest.records[keyFor(type, id)]?.replacement ?? manifest.records[String(id)]?.replacement;
  if (!replacement) throw new Error(`Missing fictionalization mapping for ${type} TMDB id ${id}`);
  return replacement;
};
const entityReplacementFor = (bucket, id) => {
  const replacement = manifest.entities?.[bucket]?.[String(id)]?.replacement;
  if (!replacement) throw new Error(`Missing fictionalization mapping for ${bucket} id ${id}`);
  return replacement;
};

const applyLocalizedFields = (data, replacement, type) => {
  if (type === 'movie') {
    data.title = replacement.title;
    data.original_title = replacement.originalTitle;
  } else {
    data.name = replacement.title;
    data.original_name = replacement.originalTitle;
  }
  data.overview = replacement.overview;
  data.tagline = replacement.tagline;
  data.homepage = replacement.homepage;
  if (data.belongs_to_collection) data.belongs_to_collection.name = replacement.collectionName;
  for (const company of data.production_companies ?? []) {
    const mapped = type === 'show'
      ? manifest.entities?.companies?.[String(company.id)]?.replacement
      : null;
    company.name = mapped?.name ?? replacement.companyName;
  }
  if (data.translations) {
    data.translations.translations = (data.translations.translations ?? []).map(translation => ({
      ...translation,
      data: {
        ...translation.data,
        homepage: replacement.homepage,
        ...(type === 'movie' ? { title: replacement.title } : { name: replacement.title }),
        overview: replacement.overview,
        tagline: replacement.tagline,
      },
    }));
  }
};

const applyEpisode = episode => {
  if (!episode) return;
  const id = episode.ids?.tmdb ?? episode.ids?.trakt ?? episode.id;
  const replacement = entityReplacementFor('episodes', id);
  if (Object.hasOwn(episode, 'name')) episode.name = replacement.title;
  if (Object.hasOwn(episode, 'title')) episode.title = replacement.title;
  if (Object.hasOwn(episode, 'overview')) episode.overview = replacement.overview;
};

const applyTmdbMovie = movie => {
  applyLocalizedFields(movie, replacementFor('movie', movie.id), 'movie');
};

const applyTmdbShow = show => {
  applyLocalizedFields(show, replacementFor('show', show.id), 'show');
  for (const person of show.created_by ?? []) {
    const replacement = entityReplacementFor('people', person.id);
    person.name = replacement.name;
    person.original_name = replacement.name;
  }
  for (const network of show.networks ?? []) {
    network.name = entityReplacementFor('networks', network.id).name;
  }
  applyEpisode(show.last_episode_to_air);
  applyEpisode(show.next_episode_to_air);
  for (const season of show.seasons ?? []) {
    const replacement = entityReplacementFor('seasons', `${show.id}:${season.season_number}`);
    season.name = replacement.name;
    season.overview = replacement.overview;
  }
};

const applyTraktMedia = (media, type) => {
  const tmdbId = media.ids?.tmdb;
  if (!tmdbId) return;
  const replacement = replacementFor(type, tmdbId);
  media.title = replacement.title;
  if (media.ids.slug) {
    media.ids.slug = type === 'movie'
      ? `${slugify(replacement.title)}-${media.year ?? '2000'}`
      : slugify(replacement.title);
  }
  if (media.ids.plex?.slug) media.ids.plex.slug = slugify(replacement.title);
};

const applyTraktList = list => {
  const replacement = entityReplacementFor('lists', list.ids?.trakt);
  list.name = replacement.name;
  list.description = replacement.description;
  const user = list.user;
  if (!user) return;
  const userReplacement = entityReplacementFor('users', user.ids?.trakt);
  user.username = userReplacement.username;
  if (user.name != null) user.name = userReplacement.name;
  if (user.location != null) user.location = userReplacement.location;
  if (user.about != null) user.about = userReplacement.about;
  if (user.gender != null) user.gender = userReplacement.gender;
  if (user.age != null) user.age = userReplacement.age;
};

const applyTraktItem = item => {
  if (item.movie) applyTraktMedia(item.movie, 'movie');
  if (item.show) applyTraktMedia(item.show, 'show');
  if (item.episode) applyEpisode(item.episode);
  if (item.list) applyTraktList(item.list);
  if (item.notes != null) item.notes = 'A short curator note for this selection.';
};

let changed = 0;
let newlyAnonymized = 0;
for (const file of jsonFiles(providersRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  const response = JSON.parse(original);
  const relative = path.relative(providersRoot, file);
  let handled = false;

  if (relative.startsWith('tmdb/3/movie/') && response.data?.id != null) {
    applyTmdbMovie(response.data);
    handled = true;
  } else if (relative.startsWith('tmdb/3/tv/') && response.data?.id != null) {
    applyTmdbShow(response.data);
    handled = true;
  } else if (relative.startsWith('trakt/') && Array.isArray(response.data)) {
    for (const item of response.data) {
      if (item.movie || item.show || item.episode || item.list) {
        applyTraktItem(item);
      } else if (item.ids?.tmdb && relative.startsWith('trakt/movies/')) {
        applyTraktMedia(item, 'movie');
      } else if (item.ids?.tmdb && relative.startsWith('trakt/shows/')) {
        applyTraktMedia(item, 'show');
      } else {
        throw new Error(`Unsupported Trakt fixture shape in ${relative}`);
      }
    }
    handled = true;
  } else if (
    relative === 'tmdb/3/configuration.json' ||
    relative === 'tmdb/3/genre/movie/list-language-en.json' ||
    relative === 'tmdb/3/genre/tv/list-language-en.json'
  ) {
    // Public protocol metadata and genre taxonomy contain no user or media identity.
    handled = true;
  }

  if (response.anonymized === false) {
    if (!handled) throw new Error(`No fictionalization strategy for raw fixture ${relative}`);
    response.anonymized = 'llm';
    newlyAnonymized += 1;
  }
  const serialized = `${JSON.stringify(response, null, 2)}\n`;
  if (serialized !== original) {
    fs.writeFileSync(file, serialized);
    changed += 1;
  }
}

console.log(
  `Applied ${Object.keys(manifest.records).length} type-scoped media mappings and ` +
    `${Object.values(manifest.entities ?? {}).reduce((sum, bucket) => sum + Object.keys(bucket).length, 0)} related entity mappings; ` +
    `anonymized ${newlyAnonymized} raw fixtures and updated ${changed} files.`
);
