# Miauflix Architecture Diagrams

These diagrams describe the current runtime and ownership boundaries. The arrows show who calls
whom; the database shapes show ownership. See the [system overview](system-overview.md) for details
and the [feature guide](../features.md) for user-facing explanations.

## 1. System context and runtime services

```mermaid
flowchart LR
  Browser[Browser running React]
  TV[Samsung Tizen app]
  Edge[Optional Caddy HTTPS]

  subgraph Core[Miauflix application]
    Backend[Node and Hono backend<br/>API and static frontend]
    BackendDB[(Backend SQLite)]
    Downloads[(Encrypted download storage)]
  end

  subgraph Internal[Internal services]
    Catalog[Media Catalog service]
    CatalogDB[(Catalog SQLite)]
    Lists[List Service]
    ListDB[(List SQLite)]
    Sources[Sources service]
    SourceDB[(Sources SQLite)]
    Queue[Bunqueue broker]
    Solver[Optional FlareSolverr]
  end

  Browser --> Edge
  TV --> Edge
  Edge --> Backend
  Browser -. direct local connection .-> Backend
  TV -. direct local connection .-> Backend
  Backend --> BackendDB
  Backend -->|versioned contract| Catalog
  Backend -->|versioned contract| Lists
  Backend -->|versioned contract| Sources
  Backend -->|durable jobs| Queue
  Backend --> Downloads
  Backend -->|torrent data and statistics| Peers[Peers and trackers]
  Catalog --> CatalogDB
  Catalog --> TMDB[TMDB]
  Catalog --> Queue
  Lists --> ListDB
  Lists --> Trakt[Trakt]
  Sources --> SourceDB
  Sources --> Indexers[Indexer websites or Torznab]
  Sources --> Solver
  Solver --> Indexers
```

The backend hosts the browser frontend and public `/api` routes. The Tizen app is packaged on the
TV. The browser and TV can connect directly on a trusted network or through the optional HTTPS
proxy. Catalog, list, and source clients each use a versioned contract over a persistent WebSocket
connection; these internal services are not public browser APIs. See
[the contract design](service-contract-v2.md).

Source website requests belong to the sources service. Torrent data and tracker statistics remain
backend responsibilities; these are different outbound paths.

## 2. Storage and credential ownership

```mermaid
flowchart TB
  Backend[Backend]
  Catalog[Media Catalog service]
  Lists[List Service]
  Sources[Sources service]
  Queue[Bunqueue]

  Backend --> BDB[(Backend SQLite)]
  Catalog --> CDB[(Catalog SQLite)]
  Lists --> LDB[(List Service SQLite)]
  Sources --> SDB[(Sources SQLite)]
  Queue --> QDB[(Broker SQLite)]

  BDB --- BData[Users and sessions<br/>hashed QR tokens<br/>local media and list projections<br/>sources, progress, ratings and notifications]
  CDB --- CData[Full movie and TV metadata<br/>seasons and episodes<br/>provider sync state]
  LDB --- LData[Pending Trakt device codes<br/>user-to-account associations<br/>AES-256-GCM access and refresh tokens]
  SDB --- SData[Providers and definition repositories<br/>encrypted settings and cached searches]
  QDB --- QData[Scheduled and queued work<br/>leases, retries and dead letters]
```

Ownership invariants:

- The backend never stores Trakt credentials and Trakt is not a Miauflix identity provider.
- The List Service is the only reader and writer of Trakt association secrets.
- The sources service owns indexer definitions, credentials/settings, and search caches; the backend
  owns persisted candidates, verification, episode associations, and playback.
- The Media Catalog service is the only owner of full provider metadata; the backend keeps only the
  projection needed for lists, source discovery, and playback.
- Public list projections use the `public` subject. Personal projections use the authenticated
  Miauflix user ID and remain available only while the provider still defines that list for the
  subject.

## 3. Provider list ingestion and query

```mermaid
sequenceDiagram
  actor User
  participant API as Backend list API
  participant Projection as Backend ListService
  participant ListClient as List capability client
  participant Lists as List Service
  participant Trakt
  participant Catalog as Media Catalog service
  participant BackendDB as Backend SQLite

  User->>API: Request list page
  API->>Projection: getListPage(slug, subjectId)
  Projection->>ListClient: getDefinitions(subjectId)
  ListClient->>Lists: lists.definitions({ subjectId })
  Lists-->>ListClient: Definitions allowed for subject
  Note over Projection,Lists: This revalidation removes access to cached personal lists after disconnect

  alt no active local generation
    Projection->>Lists: lists.page({ listId, page: 1, subjectId })
    Lists->>Trakt: Fetch provider page
    Trakt-->>Lists: Items and pagination headers
    Lists-->>Projection: External media references and page metadata
    Projection->>Catalog: Resolve TMDB or IMDb references
    Catalog-->>Projection: Canonical media references and details
    Projection->>BackendDB: Stage membership and local media index
    Projection->>BackendDB: Atomically activate completed generation
  end

  Projection->>BackendDB: Read requested membership page
  Projection->>Catalog: Batch current display details
  Catalog-->>Projection: Movie and show details
  Projection-->>API: Paginated resolved media
  API-->>User: List response
```

Unresolvable provider items are skipped. A failed refresh discards its staging generation, leaving
the previous active generation readable. Background refreshes carry the same subject ID and use
page fan-out followed by generation activation.

## 4. Authentication and account association are separate

### Miauflix QR login

```mermaid
sequenceDiagram
  actor Screen as Requesting device
  actor Phone as Approving device
  participant API as Miauflix backend
  participant DB as Backend SQLite

  Screen->>API: POST /api/auth/qr
  API->>DB: Store hashed approval and claim tokens with expiry
  API-->>Screen: requestId, claimToken, approval URL, expiry, interval
  Screen-->>Screen: Render approval URL as QR code
  Phone->>API: Open Miauflix approval URL
  API-->>Phone: Device context and pending state
  Phone->>API: Authenticate with Miauflix email and password
  Phone->>API: Approve or reject request
  API->>DB: Conditional pending-to-approved or pending-to-rejected update

  loop Until terminal state or expiry
    Screen->>API: POST /api/auth/qr/:requestId/claim with claimToken
    API->>DB: Match token and request ID; atomically claim once
    API-->>Screen: 202 pending, or authenticated session when approved
  end
```

The approval and claim tokens are independent, short-lived, stored only as hashes, and bound to the
same request ID. The final state transition is single-use and race-safe. Approval requires an
authenticated Miauflix account; a device already signed in does not need to enter its password again.

Browser login and QR claim deliver access and refresh tokens as session-scoped HttpOnly cookies.
The client identifies its session with `X-Session-Id`; middleware reads the matching access cookie
first and then falls back to `Authorization: Bearer`. A packaged TV app requests
`X-Auth-Transport: token` and receives tokens in the response body; it uses Bearer access tokens and
`X-Refresh-Token` for refresh/logout. See [token transport](../../backend/src/utils/auth-transport.util.ts).

### Trakt account association

```mermaid
sequenceDiagram
  actor User
  participant UI as Authenticated frontend
  participant API as Miauflix backend
  participant Lists as List Service
  participant Trakt
  participant ListDB as List Service SQLite

  User->>UI: Connect Trakt
  UI->>API: Start association with authenticated Miauflix session
  API->>Lists: Start device flow with authenticated user ID
  Lists->>Trakt: Request device code
  Trakt-->>Lists: Verification URL, user code, expiry, interval
  Lists->>ListDB: Store encrypted pending authorization
  Lists-->>API: Public device authorization details
  API-->>UI: Verification URL and code
  User->>Trakt: Approve Miauflix on Trakt

  loop While pending
    UI->>API: Poll authorization ID with authenticated session
    API->>Lists: Poll using user ID and authorization ID
    Lists->>Trakt: Exchange device code
  end

  Trakt-->>Lists: Access token and refresh token
  Lists->>Trakt: Fetch Trakt profile
  Lists->>ListDB: Encrypt tokens and associate account with user ID
  Lists-->>API: Connected account metadata only
  API-->>UI: Association connected
```

Trakt proves access to a Trakt account; it never authenticates a Miauflix user. Disconnecting asks
the List Service to revoke the provider token and remove the association.

## 5. Playback and streaming path

```mermaid
sequenceDiagram
  actor Player
  participant API as Backend API
  participant Session as PlaybackSessionService
  participant Preparation as Shared preparation pipeline
  participant Sources as Backend SourceService
  participant Search as Sources service
  participant Indexers
  participant Probe as FFprobe and delivery inspection
  participant Torrent as DownloadService and encrypted storage

  opt Browse warm-up
    Player->>API: Update preload intent for focused title
    API->>Preparation: Update preload intent and warm focused target
  end

  Player->>API: POST /api/playback/sessions with authenticated session
  API->>Session: Resolve movie or episode with device preferences
  opt Additional source discovery needed
    Session->>Sources: Find candidates
    Sources->>Search: Versioned source search contract
    Search->>Indexers: Search supported indexers or Torznab
    Indexers-->>Search: Candidate releases
    Search-->>Sources: Incremental normalized candidates
  end
  Session->>Torrent: Resolve and verify the selected video file
  Session->>Probe: Read completed inspection for selected file
  alt Probe result available
    Probe-->>Session: Per-device delivery decision
  else Inspection pending
    Session->>Probe: Start shared background inspection
    Note over Session,Probe: Direct stream URL with deliveryPending
  end
  Session-->>API: Source-bound expiring grant and delivery information
  API-->>Player: streamUrl, preparation and selected source
  opt Background inspection completes
    Session-->>Player: Session-scoped delivery update over realtime channel
  end

  alt Direct playback
    Player->>API: GET /api/stream/:token with optional Range
    API->>Session: Validate grant and source binding
    API->>Torrent: Read selected file and prioritize required pieces
    Torrent-->>Player: 200 or 206 video bytes
  else Remux or conversion
    Player->>API: GET /api/stream/:token/audio with start and track
    API->>Session: Validate grant
    API->>Probe: Start FFmpeg for authorized target
    Probe->>Torrent: Read decrypted ranges over private loopback input
    Probe-->>Player: Fragmented MP4 with copied or converted tracks
  end
```

A playback grant binds a user, playable identity, and source; target resolution selects the associated
file. The preparation pipeline and player can try another source when one fails. The stream route
also accepts movie keys issued by `POST /api/movies/:mediaId/:quality`.

Compatible audio/video can remain unchanged. Selected unsupported audio is converted to stereo
AAC. HEVC delivery depends on device support; optional H.264 conversion is disabled by default and
capped at 1080p/30 fps. Text subtitles have a separate authorized WebVTT path. See
[streaming services](../../backend/docs/streaming-services.md) for routes and limits.

Request-time source and metadata resolution calls its owning services directly. Bunqueue supplies
durable discovery, statistics, acquisition, and maintenance work; broker failures can affect
preparation and follow-up operations that enqueue jobs.

## 6. Container topology and optional deployment layers

```mermaid
flowchart LR
  Device[Browser or TV]
  Caddy[Optional Caddy<br/>HTTPS on 80 and 443]
  Backend[Application container<br/>backend and frontend :3000]

  subgraph Services[Services container]
    Catalog[Media Catalog :3001]
    Lists[List Service :3002]
    Sources[Sources service :3003]
    Queue[Bunqueue :6789]
  end

  Solver[Optional FlareSolverr :8191]
  Tracing[Optional Jaeger tracing]
  Updater[Scheduled image updater]
  Recovery[Unhealthy-app recovery]

  Device --> Caddy
  Caddy --> Backend
  Device -. direct local connection .-> Backend
  Backend --> Catalog
  Backend --> Lists
  Backend --> Sources
  Backend --> Queue
  Backend --> Tracing
  Catalog --> Queue
  Sources --> Solver

  Backend --> BackendVolume[(Application data and downloads)]
  Services --> ServiceVolume[(Persistent service data)]
  Updater -. updates labelled containers .-> Backend
  Updater -. updates labelled containers .-> Services
  Recovery -. restarts unhealthy app .-> Backend
```

The [base Compose file](../../docker-compose.yml) publishes port 3000 on localhost by default. It
runs one application container, one combined services container, and update/recovery helpers.

The [HTTPS overlay](../../docker-compose.https.yml) adds Caddy for a configured domain. The
[VPN overlay](../../docker-compose.vpn.yml) adds Gluetun/NordVPN and moves the application,
services, and enabled outbound helpers into its shared network namespace. Only in that VPN setup
do internal service URLs switch to `127.0.0.1`; the base deployment uses service hostnames.
FlareSolverr and Jaeger are optional overlays. Developers can also run the catalog, list, and source
services as individual processes or containers.
