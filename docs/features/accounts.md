# Accounts and your personal collection

[Back to all features](../features.md)

Each person can have their own Miauflix account. Your account keeps your watchlist, ratings, viewing progress, and notifications separate from other people's.

## Multiple accounts and administrator access

Miauflix has regular users and administrators. Regular users can browse and watch. Administrators also manage server configuration, sources, and storage.

The first administrator account can be created in the browser during initial setup. Administrators create additional accounts with **Add profile** on Who's watching (or through the server API).

## Profiles and Who's watching

A profile is an account signed in on the device. After you sign in, and whenever the app starts fresh, **Who's watching?** lists the profiles on the device; choose one to open its Home. Reloading the page, coming back from a movie or resuming the TV app keeps the current profile. The avatar at the bottom of Home's sidebar opens a panel with **Switch profile** (Who's watching; Back returns to Home without switching) and **Edit profile** (your name and Plushie).

**Add profile** is shown while an administrator is signed in on the device. It creates an account with a name, email, password and avatar, signs it in on the device and returns to Who's watching with the new profile selected, without switching to it. **Manage profiles** opens a profile's editor, where its name and Plushie can be changed. Manage profiles and the editor have the same back rail as the other inner pages, and so does Who's watching when opened from Home. **Logout**, in the profile panel of Home's sidebar, signs the watching profile out of the device: the account, its watchlist and progress are kept, and signing in again brings it back.

Avatars are [Plushies](https://github.com/prathje/plushies): pick a shape, colour, fabric, face and accessories, fine-tune them, or let Surprise me choose. Browsers show them live and animated; the TV shows a picture saved with the profile. Every profile starts with a Plushie chosen by Surprise me, including the first administrator and accounts from before profiles; its picture is saved the first time a browser shows it.

## Password and QR-code sign-in

You can sign in with your email address and password. On a TV, you can scan the sign-in QR code with your phone and approve the request from an account that is already signed in. This avoids typing a password with a TV remote.

Miauflix renews signed-in sessions in the background. QR sign-in creates a session on the new device; it is not a profile-switching menu.

## Watchlists and personal ratings

Add movies and shows to your watchlist from their details page, or remove them when you no longer want to save them. You can also mark a title as Like, Dislike, or Love. Selecting your existing rating again clears it.

These ratings belong to your account. They are separate from the public score shown in a title's description.

## Viewing progress and Continue watching

Miauflix saves where you stopped watching. Your Continue watching row brings unfinished movies and shows back to the home screen and can suggest the next episode. Playback resumes near your saved position rather than starting again from the beginning.

See [Watching](watching.md) for playback and episode controls.

## Trakt integration

Trakt is an optional service for keeping track of what you watch. Linking an account lets Miauflix synchronize your Trakt watchlist and playback progress. Synchronization has retries so a temporary connection problem does not immediately discard an update.

You can also browse Trakt's popular and trending titles, personal watchlists, favorites and history, and community lists. Personal Trakt features require a connected Trakt account and configured integration.

## Notifications and Notify me

Miauflix can tell you when a better movie source becomes available, when a new episode is available, or when something you requested becomes watchable. For example, a movie on your watchlist may later gain a better-quality release.

For an unavailable title, Notify me saves an availability request. Notifications stay in your account's inbox, where you can read them, mark them read, and open the related title. These are in-app notifications, not an email or mobile push-notification service.

## Planned improvements

Who's watching does not yet offer signing in an existing account next to the profiles already on the device; use the sign-in screen on a device with no profiles, or approve a QR sign-in.

The [UI task list](../../ToDo.md#ui) also proposes using the same form controls throughout the app, so entering settings and account information feels more consistent.

## Implementation references

- [Account roles](../../backend/src/entities/user.entity.ts)
- [Sign-in, QR approval, account creation, and logout](../../backend/src/routes/auth.routes.ts)
- [Profile name and avatar routes](../../backend/src/routes/profile.routes.ts)
- [Who's watching](../../frontend/src/pages/profiles/WhosWatchingPage.tsx) and [the profile editor](../../frontend/src/pages/profiles/ProfileEditorPage.tsx)
- [Personal ratings and watchlist controls](../../frontend/src/pages/home/components/MediaDetails.tsx)
- [Trakt playback synchronization](../../services/list-service/src/playback-sync.ts)
- [Notification behavior](../../backend/src/services/notifications/notification.service.ts)
