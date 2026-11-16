/** Used only to describe the user's current focus to realtime preload APIs. */
export type HomeView = 'browse' | 'details' | 'player';
/**
 * Where Home's keyboard was, remembered across its screens: browse starts on the rail after a
 * profile screen ('sidebar') and on the remembered row otherwise.
 */
export type HomeRegion = 'sidebar' | 'carousel' | 'details' | 'player';
