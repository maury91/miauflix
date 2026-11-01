# The TV pairing service hosted for everyone (see tv-pairing/README.md); not part of a
# Miauflix install. No dependencies: Bun runs the TypeScript sources directly.
FROM oven/bun:1.4.0 AS production
WORKDIR /app
COPY tv-pairing/package.json tv-pairing/tsconfig.json ./
COPY tv-pairing/src ./src
ENV TV_PAIRING_PORT=3003
EXPOSE 3003
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD bun -e "fetch('http://localhost:3003/health').then(r => { if (!r.ok) process.exit(1) })"
CMD ["bun", "run", "src/index.ts"]
