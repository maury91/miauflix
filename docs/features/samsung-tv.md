# Samsung TV and remote controls

[Back to all features](../features.md)

Miauflix has a Samsung TV build for Tizen, the operating system used by Samsung smart TVs. It connects to your Miauflix server, which runs on a separate computer or server.

## An installable TV app

The project includes tooling to build a Tizen app package and install it on a TV. The app uses the same media catalog and account system as the browser version. Installation requires the TV development and signing setup described in the [Samsung TV setup guide](../setup/samsung-tv.md).

The code includes compatibility adaptations aimed at older TV browsers, including a Chromium 69 build target. This describes the implementation, not a guarantee of compatibility with every Samsung model.

## Navigation from the couch

Browse cards, open details, select seasons and episodes, and operate the player using arrow keys and the remote's confirmation and Back buttons. Supported media keys, such as play, pause, rewind, and fast-forward, are registered with Tizen. Search and subtitle menus also support remote navigation.

## Native Samsung playback

On Tizen, Miauflix can use Samsung's native AVPlay player. This lets compatible videos use the TV's own playback capabilities, including supported H.264/H.265 video and several audio formats, with audio-track switching.

Audio formats outside that supported set, such as DTS or TrueHD, can use server-side audio conversion and the browser video player instead. Source selection also applies a TV bitrate preference to avoid choosing files that demand too much data. These are compatibility choices, not a continuously changing picture-quality mode.

## Find your server

The TV app can discover Miauflix servers through a pairing service and by checking addresses on its local network. You can also enter a server address manually. The app remembers the chosen server and can reconnect when it becomes available again.

Settings includes a Change server option. Changing servers signs you out and returns to the server picker. The pairing service is optional and can be left out of a TV package.

## Sign in using your phone

The login page offers a QR code. Scan it on another device where you can sign in and approve the TV's login request, avoiding typing your password with a remote. Email and password entry is also available on the TV.

## Artwork suited to the TV

The TV build chooses background image sizes based on the TV generation. It can show a lighter image while you move between titles, then load a sharper image once you stop on one. This helps keep browsing responsive without always downloading the largest artwork.

## Planned improvements

The current [ToDo.md](../../ToDo.md) does not list a separate new Samsung TV feature. Planned account selection, interface languages, and shared input styling would also improve the TV experience when implemented.

## Implementation references

- [Tizen remote keys](../../frontend/src/app/startup/tizen.ts)
- [Samsung playback](../../frontend/src/features/player/lib/avplay-media.ts)
- [TV artwork profiles](../../frontend/src/shared/config/tv-profile.ts)
- [Server picker](../../frontend/src/features/server-discovery/ui/ServerPicker.tsx)
- [TV packaging](../../scripts/package-tizen.sh)
- [TV installation](../../scripts/install-tizen.sh)
