FROM oven/bun:latest

RUN apt-get update && apt-get install -y wget && apt-get clean

WORKDIR /app

COPY tmdb-images.ts ./

EXPOSE 80

CMD ["bun", "run", "tmdb-images.ts"]
