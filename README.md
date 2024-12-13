# Miauflix

## Summary

Miauflix is a streaming platform aggregator, it allows the user to discover new content from different streaming platforms.

The platform combines the output of two types of services:

- _Discovery service_ : A discovery service is a service that provides a list of content to the user. The content can be movies, tv series or anime. The content can be pre-filtered based on known availability on the _streaming services_. The main purpose of the discovery service is to provide a list of content that the user might be interested in.
- _Streaming service_ : A streaming service is a service that provides the content to the user. Each streaming service is responsible to return if the content is available or not, and if it is a link where the stream is possible.

## Origin of the name

Miauflix is a play on words between Miau ( the sound a cat makes in latin based languages ) and Netflix.

## Quick start

First of all we need things running:
```shell
docker-compose up -d --env-file .env
```

Now that all the services are up we can start configuring them:

### Jackett

To configure Jackett, we are going to navigate to http://localhost:9117,
here, we are going to start by grabbing the API key displayed on the top right.

Click the copy button, and paste it in the `.env` file as the value for `JACKETT_API_KEY`.

Next click on the `Add indexer` button, and search for the indexers that you want to add.

If you are not sure what indexers to use, I recommend checking on Reddit for your use case.

### Trakt

Next we want to obtain an access key for Trakt, Trakt is the service that provides the list of movies and tv series, other than providing
the list of movies and tv series, it also tracks what you are watching and can recommend you new content based on your watch history.

To obtain an access key, navigate to https://trakt.tv/oauth/applications/new and create a new application.

Copy the API key and the API secret, and paste them in the `.env` file as the values for `TRAKT_CLIENT_ID` and `TRAKT_CLIENT_SECRET`.

### TMDB

Next we want to obtain an access key for TMDB, TMDB is the service that provides the images for the movies and tv series.

To obtain an access key, navigate to https://www.themoviedb.org/settings/api and create a new application.

Copy the API key and paste it in the `.env` file as the value for `TMDB_API_ACCESS_TOKEN`.

### Database

The last thing is to initialize the database, run the following command to create the database ( if it does not exists )

```shell
npx sequelize-cli db:create
```

ToDo: Add migrations, wait for sequelize 7 or use TypeORM

## Local development

Start by installing the dependencies:

```shell
yarn install
```

## Running the project

You can start everything by running:

```bash
yarn start
```

or you can start the services individually by running:

```bash
nx run backend:serve
```

and 

```bash
nx run miauflix:serve
```
