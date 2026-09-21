# Miauflix Architecture Diagrams

These diagrams describe the current architecture after the Trakt/list-service extraction and the
Miauflix-owned QR authentication redesign. They are intended as boundary maps: the arrows show who
may call whom, while the database shapes show ownership.

## 1. System context and runtime services

```mermaid
flowchart LR
  User[User devices]

  subgraph Edge[Public edge]
    Nginx[Nginx and TLS]
    Frontend[React frontend]
  end

  subgraph Core[Miauflix application]
    Backend[Node and Hono backend]
    BackendDB[(Backend SQLite)]
    Downloads[(Download storage)]
  end

  subgraph Internal[Internal capabilities]
    Catalog[Media Catalog service]
    CatalogDB[(Catalog SQLite)]
    Lists[List Service]
    ListDB[(List Service SQLite)]
    Queue[Bunqueue broker]
  end

  subgraph Providers[External providers]
    TMDB[TMDB]
    Trakt[Trakt]
    Sources[Source providers and trackers]
  end

  User -->|HTTPS| Nginx
  Nginx -->|static assets| Frontend
  Frontend -->|versioned API| Nginx
  Nginx --> Backend

  Backend -->|users, sessions, QR requests, local indexes| BackendDB
  Backend -->|catalog capability| Catalog
  Backend -->|list capability| Lists
  Backend -->|durable jobs| Queue
  Backend -->|source discovery and streaming| Sources
  Backend --> Downloads

  Catalog --> CatalogDB
  Catalog --> TMDB
  Catalog --> Queue
  Lists --> ListDB
  Lists --> Trakt
```

The browser talks only to the public Miauflix edge. The catalog and list capabilities are internal
HTTP services discovered through `/.well-known/miauflix-service` and validated with
`@miauflix/service-contracts`.

## 2. Storage and credential ownership

```mermaid
flowchart TB
  Backend[Backend]
  Catalog[Media Catalog service]
  Lists[List Service]
  Queue[Bunqueue]

  Backend --> BDB[(Backend SQLite)]
  Catalog --> CDB[(Catalog SQLite)]
  Lists --> LDB[(List Service SQLite)]
  Queue --> QDB[(Broker SQLite)]

  BDB --- BData[Users and sessions<br/>hashed QR tokens<br/>local media and list projections<br/>sources and playback progress]
  CDB --- CData[Full movie and TV metadata<br/>seasons and episodes<br/>provider sync state]
  LDB --- LData[Pending Trakt device codes<br/>user-to-account associations<br/>AES-256-GCM access and refresh tokens]
  QDB --- QData[Scheduled and queued work<br/>leases, retries and dead letters]
```

Ownership invariants:

- The backend never stores Trakt credentials and Trakt is not a Miauflix identity provider.
- The List Service is the only reader and writer of Trakt association secrets.
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
  ListClient->>Lists: GET /v1/lists?subjectId
  Lists-->>ListClient: Definitions allowed for subject
  Note over Projection,Lists: This revalidation removes access to cached personal lists after disconnect

  alt no active local generation
    Projection->>Lists: GET /v1/lists/:id?page=1&subjectId
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
    API-->>Screen: 202 pending, or session credentials when approved
  end
```

The approval and claim tokens are independent, short-lived, stored only as hashes, and bound to the
same request ID. The final state transition is single-use and race-safe.

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
  UI->>API: Start association with Miauflix JWT
  API->>Lists: Start device flow with authenticated user ID
  Lists->>Trakt: Request device code
  Trakt-->>Lists: Verification URL, user code, expiry, interval
  Lists->>ListDB: Store encrypted pending authorization
  Lists-->>API: Public device authorization details
  API-->>UI: Verification URL and code
  User->>Trakt: Approve Miauflix on Trakt

  loop While pending
    UI->>API: Poll authorization ID with Miauflix JWT
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
  participant Auth as AuthService
  participant Media as Local media index
  participant Sources as SourceService
  participant Providers as Source providers
  participant Stream as StreamService
  participant Torrent as DownloadService and WebTorrent

  Player->>API: Request stream key with JWT
  API->>Auth: Authorize user and media
  Auth-->>Player: Short-lived media-specific stream URL
  Player->>API: GET /api/stream/:token with optional Range
  API->>Auth: Verify non-JWT streaming key
  API->>Media: Resolve local movie
  API->>Stream: Select quality and codec

  alt no streamable source is ready
    Stream->>Sources: Resolve source metadata inline
    Sources->>Providers: Search or inspect candidates
    Providers-->>Sources: Magnet and availability metadata
  end

  Stream-->>API: Best usable source
  API->>Torrent: streamFile(source, Range)
  Torrent-->>Player: 200 or 206 media bytes
```

Request-time source and metadata resolution does not depend on the queue being available. Bunqueue
adds durable discovery, statistics, and maintenance work around this synchronous fallback.

## 6. Production container topology

```mermaid
flowchart LR
  Internet[LAN or Internet]
  Nginx[Nginx<br/>ports 80 and 443]

  subgraph VPNNS[Shared VPN network namespace]
    VPN[NordVPN container]
    Backend[Backend :3000]
    Catalog[Media Catalog :3001]
    Lists[List Service :3002]
    Queue[Bunqueue :6789]
    Solver[FlareSolverr :8191]
    Tracing[Jaeger and OTLP]
  end

  Internet --> Nginx
  Nginx --> Backend
  Backend --> Catalog
  Backend --> Lists
  Backend --> Queue
  Backend --> Solver
  Backend --> Tracing
  Catalog --> Queue

  Backend --> BackendVolume[(Backend data and downloads)]
  Catalog --> CatalogVolume[(Catalog data)]
  Lists --> ListVolume[(List Service data)]
  Queue --> QueueVolume[(Queue data)]

  VPNNS --> ProviderInternet[TMDB, Trakt, providers and trackers]
```

The production Compose file places the backend, both capability services, the broker, and outbound
helpers in the VPN container's network namespace. Their ports are therefore reached internally on
`localhost`; only the intended edge ports are published.

## 7. Recent ownership migration

```mermaid
flowchart LR
  subgraph Before[Legacy ownership]
    OldAuth[Backend authentication] --> OldTrakt[Trakt login and tokens]
    OldCatalog[Media Catalog service] --> OldLists[Provider list tables and pages]
  end

  subgraph After[Current ownership]
    NewAuth[Miauflix authentication] --> Password[Email and password]
    NewAuth --> QR[Miauflix QR login]
    NewLists[List Service] --> Association[Trakt association and encrypted tokens]
    NewLists --> Membership[List definitions and pages]
    NewCatalog[Media Catalog service] --> Metadata[Metadata and external-ID resolution]
    NewBackend[Backend] --> Projection[Subject-scoped local list projection]
  end

  Before -->|pre-production reset; no compatibility layer| After
```

This was a contract-and-data ownership migration, not a dual-running rollout. Fresh catalog and
List Service databases are the forward path. Restoring a pre-extraction code revision together with
its matching development databases is the rollback path; mixing old databases with the new service
layout is unsupported.
