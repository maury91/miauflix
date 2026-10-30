# Samsung TV (Tizen) app

> **Work in progress.** Signing in is implemented, but not yet tried on a real TV, and some
> layouts still use CSS that Chromium 69 lacks.

The frontend can be packaged as a Tizen app (`.wgt`) that runs from the TV's storage and talks
to your Miauflix backend over HTTPS. It targets 2020 TVs (Tizen 5.5, Chromium 69) and newer.

## Build the package

```bash
npm run package:tizen -- https://miauflix.example.com
```

Pass your backend's origin (no path). The script builds the frontend with `VITE_TIZEN=true`
into `dist/frontend-tizen` (one classic script with relative paths, hash routing, polyfills for
Chromium 69), adds `frontend/tizen/config.xml` with the version from the root `package.json`,
and zips it into `dist/miauflix.wgt`. The package is unsigned.

## How the TV app signs in

The app runs from the TV's storage, so the backend is cross-site to it and its `SameSite=Strict`
HttpOnly cookies never reach it. The TV build sends `X-Auth-Transport: token` instead: login,
first-run setup, QR login and refresh return the tokens in the response body, and the app sends
them back as `Authorization: Bearer` (access token, with `X-Session-Id`), `X-Refresh-Token`
(refresh and logout) and `X-Refresh-Tokens` (listing its sessions). Refresh tokens are kept in
the app's own `localStorage`, access tokens only in memory; the realtime socket gets the access
token in its `authenticate` message. Browsers keep using cookies.

The backend accepts the app's origin (`file://` or `null`) without credentials while
`ALLOW_TV_APP` is on (the default). The backend must run a version with this support before the
TV app can sign in.

## Install it on the TV

1. On the TV, open **Apps**, type `1 2 3 4 5` on the remote, turn **Developer mode** on, enter
   the IP of the computer you install from, and restart the TV.
2. Install [Apps2Samsung](https://github.com/Let-Me-Fix-It/Apps2Samsung) on that computer,
   enable **Force Samsung Certificate** (and **Partner Signing** on desktop) in its settings, so
   it signs the package for your TV.
3. Pick the TV (or enter its IP), choose **Custom WGT File**, select `dist/miauflix.wgt`, and
   install. Miauflix appears in the TV's apps.

Rebuild and reinstall the package for every frontend update.
