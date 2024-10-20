# Miauflix

## Summary

Miauflix is a streaming platform aggregator, it allows the user to discover new content from different streaming platforms.

The platform combines the output of two types of services:

- _Discovery service_ : A discovery service is a service that provides a list of content to the user. The content can be movies, tv series or anime. The content can be pre-filtered based on known availability on the _streaming services_. The main purpose of the discovery service is to provide a list of content that the user might be interested in.
- _Streaming service_ : A streaming service is a service that provides the content to the user. Each streaming service is responsible to return if the content is available or not, and if it is a link where the stream is possible.

## Origin of the name

Miauflix is a play on words between Miau ( the sound a cat makes in latin based languages ) and Netflix.

## Installation

To install all the required dependencies run:

```bash
yarn install
```

## Setup

Miauflix comes with a default discovery service named "Trakt + TMDB". And a default streaming service named "P2P".

To setup the discovery service you can copy the `apps/backend/.env.example` file to `apps/backend/.env` and set the following variables:

- *TRAKT_CLIENT_ID* This is the client id for the trakt service. You can get one by registering at https://trakt.tv/oauth/applications/new
- *TRAKT_CLIENT_SECRET* This is the client secret for the trakt service. You will get one together with the client id.
- *TMDB_API_ACCESS_TOKEN* This is the access token for the TMDB service. You can get one by registering at https://developer.themoviedb.org/docs/getting-started
- *JACKETT_API_KEY* This is the api key for the jackett service. You can get one by setting up a jackett instance and getting the api key from the settings page.

## Running the upstream services

Miauflix uses Jackett, Postgres and Redis.

You can start postgres and redis by running:

```bash
docker-compose up -d
```

To start Jackett it is platform specific, for the time being I recommend to follow the official instructions at https://github.com/Jackett/Jackett

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
