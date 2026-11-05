# Accounts and your personal collection

[Back to all features](../features.md)

Each person can have their own Miauflix account. Your account keeps your watchlist, ratings, viewing progress, and notifications separate from other people's.

## Multiple accounts and administrator access

Miauflix has regular users and administrators. Regular users can browse and watch. Administrators also manage server configuration, sources, and storage.

The first administrator account can be created in the browser during initial setup. Administrators can create additional accounts through the server API, which is the interface used by software to talk to Miauflix. A screen for creating those accounts is still planned.

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

The [current task list](../../ToDo.md#account) includes an administrator screen for creating accounts, a profile editor, generated profile pictures, a profile selector, and a logout control. Plushies and DiceBear are proposed picture-generation options, not built-in features. The server already supports account creation and logout; the missing work is the user-facing experience. A profile selector is not currently available.

The [UI task list](../../ToDo.md#ui) also proposes using the same form controls throughout the app, so entering settings and account information feels more consistent.

## Implementation references

- [Account roles](../../backend/src/entities/user.entity.ts)
- [Sign-in, QR approval, account creation, and logout](../../backend/src/routes/auth.routes.ts)
- [Personal ratings and watchlist controls](../../frontend/src/pages/home/components/MediaDetails.tsx)
- [Trakt playback synchronization](../../services/list-service/src/playback-sync.ts)
- [Notification behavior](../../backend/src/services/notifications/notification.service.ts)
