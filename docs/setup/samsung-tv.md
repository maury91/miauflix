# Samsung TV (Tizen) app

> **Compatibility:** the TV build includes Chromium 69 support and device-specific playback
> and artwork adaptations. The implementation records observations from a 2020 TU8072 and
> a 2023 QCQ80; this is not a compatibility guarantee for every Samsung model.

The frontend can be packaged as a Tizen app (`.wgt`) that runs from the TV's storage and talks
to your Miauflix backend over HTTPS. It targets 2020 TVs (Tizen 5.5, Chromium 69) and newer.

## Build the package

The package is built from a checkout of the repository, even if your server runs the prebuilt
Docker images. You need Node.js 22 or newer (`.nvmrc` pins the tested version) and `zip`
(preinstalled on macOS; `sudo apt install zip` on Debian and Ubuntu). From the repository root:

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
bun install
npm run package:tizen
```

The package works with any server: the TV finds yours on first start (see
[How the TV finds your server](#how-the-tv-finds-your-server)). To skip that, pass your backend's
origin (no path), e.g. `npm run package:tizen -- https://miauflix.example.com`, and the TV
starts on it. `--no-pairing` leaves the pairing service out, `--pairing-url <origin>` uses your
own. The script builds the frontend with `VITE_TIZEN=true`
into `dist/frontend-tizen` (one classic script with relative paths, hash routing, polyfills for
Chromium 69), adds `frontend/tizen/config.xml` with the version from the root `package.json`
and the 512x423 launcher icon, and zips it into `dist/miauflix.wgt`.
Chromium 69 ignores newer CSS (flex `gap`, `inset`, `aspect-ratio`, `clamp()`, `:focus-visible`
and more), so in this build a styled-components plugin
(`frontend/src/shared/styles/legacy-chromium.ts`) rewrites those styles as they are generated.
Plain CSS files don't go through it: keep them to what Chromium 69 supports. The package is
unsigned. The launcher icon is generated on every build from `assets/tv-logo.png`, the only
copy of the TV icons, by `scripts/generate-tv-icons.mjs`: replace that image to change it.

### Backdrop sizes

The Home hero shows a smaller backdrop while you move between titles, and loads a sharper one
while you rest on a title, swapping it in once it has loaded. By default (`auto`) the app picks
both for the TV it runs on: the smallest size that covers the hero (about 70% of the screen's
width), up to what the TV's generation paints smoothly. The generation comes from its model
code (`23_…` is a 2023 TV) or, without it, its browser version:

| TV                                   | While moving | Resting    |
| ------------------------------------ | ------------ | ---------- |
| 2023 and newer (measured on a QCQ80) | `w1280`      | `original` |
| Older (measured on a 2020 TU8072)    | `w780`       | `w1280`    |

To set them yourself, package with `MIAUFLIX_TV_HERO_BACKDROP` (while moving) and
`MIAUFLIX_TV_HERO_BACKDROP_RESTING` set to `w300`, `w780`, `w1280`, `original` or `auto`:

```bash
MIAUFLIX_TV_HERO_BACKDROP=w780 MIAUFLIX_TV_HERO_BACKDROP_RESTING=original npm run package:tizen
```

## Playback and controls

On a TV with Samsung AVPlay available, Miauflix uses that native player for supported video
and audio, including compatible HEVC files and native audio-track selection. Unsupported
audio can use server-side conversion and the browser video player instead. The TV requests
a bitrate preference of 8 Mbit/s when choosing sources; it does not continuously switch
quality during playback.

Browse, search, select episodes, and operate player and subtitle controls with the remote.
For audio conversion and subtitle limitations, see [Audio and subtitles](../features/audio-subtitles.md).

## How the TV finds your server

The TV keeps the server it connected to and checks it at every start. When it has none yet, or
that server doesn't answer, it shows a picker (and reconnects by itself when the last server is
back):

- **On your network.** Two searches, whose servers are listed as they answer:
  - Your server announces the addresses it can be reached at to the pairing service at
    `pair.miauflix.cat` (`tv-pairing/`) every two minutes, and the TV asks it for the servers
    announced from its own public IP, so from behind the same router. In Docker the server
    can't see its network address: it announces the private address you opened it at in a
    browser (so open it once from another device, e.g. `http://192.168.1.10:3000`), or set
    `TV_PAIRING_ADDRESSES`. The service keeps nothing in storage and forgets a server 5 minutes
    after its last announcement, but it sees your public IP and your server's local addresses.
    To keep away from it, set `TV_PAIRING_ENABLED=false` on the server and package the app with
    `--no-pairing`: the TV then never contacts it.
  - The TV checks every address of its local network (the /24 it is on) on port 3000.

  The server must be reachable from the network: with Docker, see
  [open it to your local network](docker-setup.md#open-it-to-your-local-network).

- **Or type its address**, like `192.168.1.10` (port 3000 and `http://` are added) or
  `https://miauflix.example.com`.

**Settings → Change server** on the TV signs out and opens the picker again. Over plain
`http://`, the TV sends its tokens unencrypted on your network.

## How the TV app signs in

The app runs from the TV's storage, so the backend is cross-site to it and its `SameSite=Strict`
HttpOnly cookies never reach it. The TV build sends `X-Auth-Transport: token` instead: login,
first-run setup, QR login and refresh return the tokens in the response body, and the app sends
them back as `Authorization: Bearer` (access token, with `X-Session-Id`), `X-Refresh-Token`
(refresh and logout) and `X-Refresh-Tokens` (listing its sessions). Refresh tokens are kept in
the app's own `localStorage`, access tokens only in memory; the realtime socket gets the access
token in its `authenticate` message. Browsers keep using cookies.

The backend accepts the app's origin `file://` without credentials while `ALLOW_TV_APP` is on (the
default); web pages cannot send that origin. If the app can't reach the backend (it loads but
every request fails), the TV may report local files as the opaque origin `null`: set
`ALLOW_TV_APP_NULL_ORIGIN=true`. Any web page can send `null` too, so that lets a page you visit
read Miauflix's unauthenticated responses and, while first-run setup is open, create the admin
account. Finish setup before turning it on. The backend must run a version with this support
before the TV app can sign in.

## Install it on the TV

1. On the TV, open **Apps**, type `1 2 3 4 5` on the remote, turn **Developer mode** on, enter
   the IP of the computer you install from, and restart the TV.
2. On that computer, put `apps2samsung-cli` (the command-line version of
   [Apps2Samsung](https://github.com/Let-Me-Fix-It/Apps2Samsung)) on your `PATH`, e.g. in
   `/usr/local/bin`. `apps2samsung-cli scan` lists the TVs it finds; `apps2samsung-cli tv <ip>`
   checks one (Developer Mode, the computer it points to, Tizen version).
3. From the repository root:

   ```bash
   npm run package:tizen
   npm run install:tizen -- 192.168.1.50
   ```

   `install:tizen` (`scripts/install-tizen.sh`, or set `MIAUFLIX_TV_IP`) checks the TV,
   installs `dist/miauflix.wgt` signed with a Samsung certificate, and opens it. The first
   install for a TV opens a Samsung account sign-in in the browser to create that certificate;
   later installs reuse it (as does the Apps2Samsung desktop app on the same computer) for the
   year it is valid; `apps2samsung-cli cert --tv <ip>` shows until when. Extra
   options go to `apps2samsung-cli install`, e.g. `--no-browser` to print the sign-in address
   instead.

The desktop app works too: enable **Force Samsung Certificate** (and **Partner Signing** on
desktop) in its settings, pick the TV, choose **Custom WGT File** and select
`dist/miauflix.wgt`.

Rebuild and reinstall the package for every frontend update.
