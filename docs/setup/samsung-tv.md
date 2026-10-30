# Samsung TV (Tizen) app

> **Work in progress.** The app is checked against a Chromium 69 build, but not yet tried on a
> real TV.

The frontend can be packaged as a Tizen app (`.wgt`) that runs from the TV's storage and talks
to your Miauflix backend over HTTPS. It targets 2020 TVs (Tizen 5.5, Chromium 69) and newer.

## Build the package

The package is built from a checkout of the repository, even if your server runs the prebuilt
Docker images. You need Node.js 22 or newer (`.nvmrc` pins the tested version) and `zip`
(preinstalled on macOS; `sudo apt install zip` on Debian and Ubuntu). From the repository root:

```bash
git clone https://github.com/maury91/miauflix.git && cd miauflix
npm install
npm run package:tizen -- https://miauflix.example.com
```

Pass your backend's origin (no path). The script builds the frontend with `VITE_TIZEN=true`
into `dist/frontend-tizen` (one classic script with relative paths, hash routing, polyfills for
Chromium 69), adds `frontend/tizen/config.xml` with the version from the root `package.json`
and the 512x423 launcher icon `frontend/tizen/icon.png`, and zips it into `dist/miauflix.wgt`.
Chromium 69 ignores newer CSS (flex `gap`, `inset`, `aspect-ratio`, `clamp()`, `:focus-visible`
and more), so in this build a styled-components plugin
(`frontend/src/shared/styles/legacy-chromium.ts`) rewrites those styles as they are generated.
Plain CSS files don't go through it: keep them to what Chromium 69 supports. The package is
unsigned. The icon (like the website's favicons) is generated from
`assets/favicon.png` by `npm run generate:icons`.

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
   [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)) on your `PATH`, e.g. in
   `/usr/local/bin`. `apps2samsung-cli scan` lists the TVs it finds; `apps2samsung-cli tv <ip>`
   checks one (Developer Mode, the computer it points to, Tizen version).
3. From the repository root:

   ```bash
   npm run package:tizen -- https://miauflix.example.com
   npm run install:tizen -- 192.168.1.50
   ```

   `install:tizen` (`scripts/install-tizen.sh`, or set `MIAUFLIX_TV_IP`) checks the TV,
   installs `dist/miauflix.wgt` signed with a Samsung certificate, and opens it. The first
   install for a TV opens a Samsung account sign-in in the browser to create that certificate;
   later installs reuse it (as does the Apps2Samsung desktop app on the same computer) for the
   year it is valid; `apps2samsung-cli cert --tv <ip>` shows until when. Extra
   options go to `apps2samsung-cli install`, e.g. `--no-browser` to print the sign-in address
   instead.

The desktop app works too: pick the TV, choose **Install a file…** and select
`dist/miauflix.wgt`.

Rebuild and reinstall the package for every frontend update.
