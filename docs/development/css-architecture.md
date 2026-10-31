# CSS architecture: styles compiled once, values inline

Status: proposal, piloted on `shared/ui/media-card/MediaCard` (see [Pilot](#pilot-mediacard)).

The frontend styles with styled-components, which generates CSS in the browser as components
render. On the Samsung TV build (Tizen 5.5, Chromium 69, software rasterization) that is the
largest avoidable cost on screen changes. This document sets the rules every component follows
from now on, the library they are written with, and the order the remaining components move in.

## Why

Measured on a 2020 TV over DevTools:

- **Inserting a rule restyles the page.** styled-components creates a class for every new
  combination of prop values and inserts its rule into the middle of its stylesheet (each component
  owns a slot, in definition order). Chromium 69 answers any insertion that is not at the end with
  a style recalculation of the whole document: about 650 ms of style work on the first pass along
  a row, before the hero backdrop moved to inline styles.
- **Restyles repaint gradients written with `var()`/`calc()`.** On each recalculation those values
  resolve again, compare as new, and the layer repaints. The hero shade (1920×594) costs about
  480 ms per repaint and was repainted ten times at startup. With pixel values in the TV build it
  no longer repaints.
- **A gradient written in fixed values does not repaint on a restyle.**

So: no CSS may be created after startup, and nothing a restyle can re-resolve may sit in a paint
property.

## Principles

1. **Strong base components in the style guide.** Visuals live in `frontend/src/shared/ui`, each
   with Storybook stories for every variant and state. Features compose them and position them from
   the parent; they don't restyle them (the existing ESLint rule against `styled(Button)` etc.).
2. **CSS computed once and injected into the page.** Styles compile at build time into one
   stylesheet the page links. The browser parses it before the script runs and never receives
   another rule.
3. **Variable values as inline styles.** Anything that changes per instance or over time (a URL,
   a percentage, a measured offset) is an inline `style` with its final value.
4. **Immutable geometry.** Sizes are constants in `vh`, `rem` or `em`. A component that scales
   sets one inline `font-size` and sizes everything else in `em`, instead of recomputing each
   length.

## Rules

1. **No values computed in style definitions.** A style is a constant: no prop interpolation
   (`${({ $x }) => …}`), no `css` helper chosen by props, no class generated per value. Migrated
   code has no `styled-components` import at all; ESLint enforces it per migrated folder (see
   `eslint.config.mjs`).
2. **Discrete variants are attributes.** A finite set of states maps to one static rule each,
   selected by an attribute. In order of preference:
   - native state: `:disabled`, `:checked`, `:focus-visible`
   - ARIA the element needs anyway: `[aria-invalid="true"]`, `[aria-checked="true"]`,
     `[aria-current="true"]`, `[aria-expanded="true"]`
   - `data-*`: `data-focused`, `data-side="left"`, `data-size="small"`. Boolean ones are present
     or absent (`data-focused={focused || undefined}`), and selectors test presence
     (`&[data-focused]`).

   Each selector in its own rule: Chromium 69 drops a whole selector list over one pseudo-class
   it doesn't know, and it has no `:is()`/`:where()`, and only takes a simple selector inside
   `:not()`.

3. **Continuous values are inline styles with final values.** `style={{ width: \`${percent}%\` }}`,
   `style={{ backgroundImage: \`url(${JSON.stringify(url)})\` }}`. No `var()`and no`calc()`in
them, so a restyle has nothing to re-resolve. Prefer`transform`and`opacity` for values that
   animate or change often: they don't relayout, and on the TV they don't repaint.
4. **Geometry is constant or scales through `font-size`.** Lengths are `vh`/`rem` constants, or
   `em` of a size the component sets once inline. MediaCard sets `font-size: width / 18`, so its
   label, gap and progress track follow without any per-width value. A box other code positions
   in pixels also keeps its pixel size inline: browsers store a fractional `font-size` at reduced
   precision, so `18em` at `font-size: 13.888…px` lays out 249.992 px wide, not 250, and a row
   of cards drifts off its pixel grid. No
   `clamp()`, `min()` or `max()`: they need the viewport, which the TV build can't know, and the
   TV build fails on them (see [The Tizen build](#the-tizen-build)).
5. **Fixed values in paint properties.** No `var()` or `calc()` in `background`, gradients,
   `box-shadow`, `filter`, `mask` or `border-image`. A gradient that depends on layout gets pixel
   values computed in JavaScript once and set inline (the hero shade does this).
6. **Platform differences are build-time constants.** Off-TV styles go in their own class, which
   the component adds behind `builtForTizen`. MediaCard's logo `drop-shadow` works this way. Never
   read the environment inside a style file.
7. **Children get their own classes.** vanilla-extract only lets a style target its own element
   (`&`), so `> span` becomes a class on the span. That keeps every rule a single class and cheap to
   match.
8. **Keyframes and globals are static too.** Use vanilla-extract `keyframes()`/`globalStyle()` or
   `global.css`, never a `@keyframes` produced by a prop.
9. **Every variant has a story.** The visual regression suite (`npm run test:visual`) screenshots
   stories. A state with no story isn't covered.

## Library choice

Three options were weighed: keep styled-components with only static templates, or move to
build-time extraction with vanilla-extract or Linaria.

|                                    | styled-components, static templates + `data-*`                                                                           | vanilla-extract                                                                   | Linaria (wyw-in-js)                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CSS created in the browser         | Yes: each component serializes (stylis, plus the legacy plugin on the TV) and inserts its rule at first mount, mid-sheet | No: one stylesheet from the build                                                 | No: one stylesheet from the build                                                                           |
| Mid-sheet insertions after startup | One per component type first seen (opening details, the player, search, a modal each restyle the page once)              | None                                                                              | None                                                                                                        |
| Runtime size                       | styled-components and stylis stay in the bundle                                                                          | None (class-name strings)                                                         | Small (`cx`, styled wrapper)                                                                                |
| Dynamic values                     | Easy to slip back into templates; only lint stops it                                                                     | Impossible in a `.css.ts`: only inline styles or attributes                       | `styled` props compile to `var()` set inline, which is the pattern rule 5 forbids in paint properties       |
| Variants                           | `data-*` selectors                                                                                                       | `data-*` selectors (or `recipes`, a static class map)                             | `data-*` selectors                                                                                          |
| Authoring                          | Unchanged                                                                                                                | Styles in a typed `*.css.ts` next to the component                                | Nearly unchanged `styled` API                                                                               |
| Build                              | Unchanged                                                                                                                | Official Vite plugin; evaluates only `*.css.ts` files                             | Babel-based evaluation of component modules; fragile with path aliases, `import.meta.env` and store imports |
| SSR                                | `ServerStyleSheet` collects styles per request                                                                           | Static stylesheet, class names identical in the SSR and client bundles (verified) | Static stylesheet                                                                                           |
| TV legacy rewrites                 | stylis plugin at runtime, against the real viewport                                                                      | PostCSS pass at build time (`legacy-chromium-postcss.ts`)                         | PostCSS pass at build time                                                                                  |
| Migration                          | Smallest: rewrite templates in place                                                                                     | Per component: move the template into a `.css.ts`                                 | Per component: change the import, remove interpolations                                                     |

**Recommendation: vanilla-extract.** Static styled-components templates still generate and insert
CSS on the TV, once per component type, so they only reduce the problem. Linaria extracts, but its
prop interpolation compiles to exactly the `var()` pattern that repaints on Chromium 69, and its
whole-module evaluation is the least predictable build step. vanilla-extract makes the rules
structural: a `.css.ts` file can't see props, so a dynamic value has nowhere to go but an inline
style or an attribute.

StyleX and Panda CSS also extract at build time. They weren't piloted: both bring an atomic-class
model and their own compiler, a larger change than this problem needs.

### Dependencies

- `@vanilla-extract/css` (dependency, used only by `*.css.ts` files at build time) and
  `@vanilla-extract/vite-plugin` (dev).
- The plugin's compiler accepts `vite-node` 3, 5 or 6, and npm picks 6, which brings a second Vite
  (8) and rolldown. The root `package.json` overrides it to `vite-node@5.2.0`, which uses the
  workspace's Vite 7. Drop the override when the workspace moves to Vite 8.
- `postcss` (dev, the version Vite uses) for the TV pass's tests.

The plugin sits in `vite.config.ts`, so the dev server, the SSR build (`vite.ssr.config.ts`
extends it), Storybook (`@storybook/react-vite` loads it) and Vitest (`vitest.config.ts` merges
it) all compile `*.css.ts` the same way. Class names are `File_style__hash` in development and
the hash alone in builds.

### During the migration

Both systems run side by side. The extracted stylesheet is a `<link>` in `<head>`, and
styled-components appends its `<style>` after it, so on equal specificity styled-components wins.
That doesn't matter as long as rule 1 of the principles holds: nothing restyles a base component
from outside.

## The Tizen build

The TV loads `index.html` from `file://` with one classic script (`format: 'iife'`). For
extracted CSS the Tizen build sets (in `vite.config.ts`):

- `cssCodeSplit: false`: with an IIFE bundle Vite would otherwise inject the CSS from the
  script. Now it emits one `assets/style-*.css`, linked from `index.html` with a relative `href`
  (the `tizen-html` plugin already drops `crossorigin`), and parsed before the script runs.
- `cssTarget: 'chrome69'`: the CSS minifier otherwise targets what `es2019` implies and folds
  `top`/`right`/`bottom`/`left` back into `inset`, which Chromium 69 can't parse.
- `css.postcss.plugins: [legacyChromiumPostcss()]`: the build-time counterpart of the stylis
  plugin `legacy-chromium.ts`. Both share the declaration rewrites in `legacy-css.ts`:
  - `:focus-visible` becomes `:focus`
  - `inset` and the logical shorthands become physical sides
  - `dvh`/`svh`/`lvh` (and the `w` units) become `vh`/`vw`
  - flex `gap` becomes margins on the children
  - `aspect-ratio` becomes a height
  - masks gain `-webkit-`
  - `overflow-wrap: anywhere` becomes `word-break: break-word`

  Two rewrites work differently, because there is no viewport at build time:
  - `aspect-ratio` becomes a height in the width's own unit (`18em` → `10.125em`, `320px` →
    `180px`, a percentage → `padding-top`).
  - `clamp()`, `min()` and `max()` fail the build with the offending declaration (rule 4).

Verified on the pilot: `npm run package:tizen`'s build step (`VITE_TIZEN=true turbo run
build:tizen`) emits MediaCard's rules with `:focus`, physical sides and `height: 10.125em`, in a
linked stylesheet. The web build keeps them unchanged (`inset`, `aspect-ratio`, `:focus-visible`).

## Pilot: MediaCard

`frontend/src/shared/ui/media-card/` before and after:

| Before (styled-components)                                          | After                                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `width: ${$width}px`: a class per width                             | `width` and `font-size: width / 18` inline on the card (`width: 18em` stays in the rule as the default and the TV height's base) |
| `gap`/`font-size`/`height: ${$width / 80}px` on the label and track | `gap: 0.225em`, `height: 0.225em`, `font-size` inherited                                                                         |
| `${$hovered && …}`, `${$focused && …}`: a class per combination     | `&[data-hovered]`, `&[data-focused]`                                                                                             |
| `width: ${$percent}%`: a class per percentage                       | `style={{ width: '40%' }}` on the fill                                                                                           |
| `filter` interpolated from `builtForTizen`                          | `logoShadow` class, added off-TV only                                                                                            |

The card renders the same (320×180, 17.78 px label, 4 px gap and track, checked in Storybook),
its class names never change with its props (unit test), and the stories are unchanged.

## Audit

108 prop interpolations in 30 files on `tv-support-ui` (2026-10-31). The uncommitted TV
performance work adds the hero shade's 5 to `MediaHero.tsx` and moves its backdrop inline. Each one
is classified:

- **V (variant):** a finite set of values. It becomes a static rule selected by an attribute
  (rule 2).
- **C (continuous):** a per-instance value. It becomes an inline style (rule 3).
- **G (geometry):** a length derived from a size. It becomes `em` of one inline `font-size`, a
  constant, or one inline value on the component root (rule 4).

| File                                           | Lines                                              | Props                                                                                              | V      | C      | G      | Target                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/ui/media-card/MediaCard.tsx`           | 25, 53, 65, 116, 117, 132, 140                     | `$width`, `$hovered`, `$focused`, `$percent`                                                       | 2      | 1      | 4      | **Done (pilot)**                                                                                                                      |
| `shared/ui/poster-card/PosterCard.tsx`         | 24, 45, 54                                         | `$width`, `$focused`                                                                               | 2      |        | 1      | MediaCard's pattern: `em` width, `data-focused`                                                                                       |
| `shared/ui/quality-badge/QualityBadge.tsx`     | 28, 35, 41                                         | `$state`                                                                                           | 3      |        |        | `data-state`                                                                                                                          |
| `shared/ui/rail/rail.styles.ts`                | 44, 76                                             | `$active`, `$selected`                                                                             | 2      |        |        | `data-active`, `aria-current`; fixed gradient                                                                                         |
| `shared/ui/button/Button.tsx`                  | 85, 87, 99, 127, 145, 151, 190                     | `$color`, `$size`, `$appearance`, `$variant`, `$fullWidth`, `$iconOnly`, `$collapseWhenNotFocused` | 7      |        |        | `data-color`, `data-size`, `data-appearance`, `data-variant`, boolean `data-*`                                                        |
| `shared/ui/logo/Logo.tsx`                      | 47–83 (11)                                         | `$home`, `$intro`, `$setup`, `$configuration`, `$visible`, `$aboveIntro`, `$disableMotion`         | 11     |        |        | `data-placement="intro\|home\|setup\|configuration"` plus boolean flags                                                               |
| `shared/ui/alert/Alert.tsx`                    | 12, 18                                             | `$severity`                                                                                        | 2      |        |        | `data-severity`                                                                                                                       |
| `shared/ui/action-row/ActionRow.tsx`           | 12–15                                              | `$direction`, `$density`                                                                           | 4      |        |        | `data-direction`, `data-density`                                                                                                      |
| `shared/ui/switch/Switch.tsx`                  | 21, 28, 43, 47                                     | `$checked`, `$invalid`                                                                             | 4      |        |        | `[aria-checked]`, `[aria-invalid]`; knob by `transform`                                                                               |
| `shared/ui/form-controls/FormControls.tsx`     | 11, 21, 24                                         | `$invalid`                                                                                         | 3      |        |        | `[aria-invalid="true"]`                                                                                                               |
| `app/shell/IntroAnimation.tsx`                 | 76                                                 | `$lowResource`                                                                                     | 1      |        |        | `data-low-resource`                                                                                                                   |
| `pages/home/HomePage.tsx`                      | 56                                                 | `$margin`                                                                                          |        |        | 1      | Inline on the root, or a `vw` constant                                                                                                |
| `pages/home/components/CategoryRow.tsx`        | 52, 53, 65, 68, 80, 81, 83, 94                     | `$contentWidth`, `$peekWidth`, `$gap`, `$side`                                                     | 3      |        | 5      | Row widths inline on the row root (computed once per viewport); `data-side` with one fixed gradient per side                          |
| `pages/home/components/MediaHero.tsx`          | 107, 109 (+5 shade)                                | `$url`, `$visible`, `$shade`                                                                       | 1      | 1      | (5)    | Backdrop and shade pixel values inline (partly done in the uncommitted work), `data-visible`                                          |
| `pages/home/components/NotificationsMenu.tsx`  | 34                                                 | `$railExpanded`                                                                                    | 1      |        |        | `data-rail-expanded`, two fixed widths                                                                                                |
| `pages/home/components/details.styles.ts`      | 24, 26                                             | `$selected`                                                                                        | 2      |        |        | `aria-pressed`/`data-selected`                                                                                                        |
| `pages/home/components/MediaDetails.tsx`       | 83, 84, 84, 228, 232, 265, 267, 279, 285, 331, 333 | `$backdrop`, `$position`, `$size`, `$focused`, `$selected`, `$state`, `$progress`                  | 7      | 4      |        | Backdrop inline; `data-state` for warm-up (static `@keyframes`); progress as a `transform: scaleX()` layer instead of a gradient stop |
| `pages/home/components/EpisodesSection.tsx`    | 56, 69                                             | `$selected`, `$image`                                                                              | 1      | 1      |        | `data-selected`; image inline                                                                                                         |
| `pages/home/components/PlayerControls.tsx`     | 25, 26, 34, 35, 48, 49, 136, 137, 142              | `$paused`, `$visible`, `$percent`                                                                  | 6      | 3      |        | `data-paused`, `data-visible`; track fill and paw by inline `transform`                                                               |
| `pages/home/components/SubtitleTiming.tsx`     | 49, 51, 52                                         | `$distance`, `$active`                                                                             | 2      | 1      |        | Inline `transform`; `data-active`                                                                                                     |
| `pages/home/components/PlayerView.tsx`         | 98                                                 | `$ready`                                                                                           | 1      |        |        | `data-ready`                                                                                                                          |
| `pages/search/components/search.styles.ts`     | 7, 8                                               | `$focused`                                                                                         | 2      |        |        | `data-focused`                                                                                                                        |
| `pages/search/components/SearchBox.tsx`        | 13                                                 | `$focused`                                                                                         | 1      |        |        | `data-focused`                                                                                                                        |
| `pages/search/components/SearchChips.tsx`      | 9                                                  | `$columns`                                                                                         |        | 1      |        | Inline `gridTemplateColumns`                                                                                                          |
| `pages/search/components/OnScreenKeyboard.tsx` | 24                                                 | `$wide`                                                                                            | 1      |        |        | `data-wide`                                                                                                                           |
| `features/auth/ui/login/QRDisplay.tsx`         | 16, 23, 24, 25, 47, 92                             | `$isLoading`, `$size`, `$hasCode`, `width`                                                         | 3      | 1      | 2      | `data-loading`, `data-has-code`; size as inline `font-size` with `em` box; skeleton width inline                                      |
| `pages/qr/QrApprovalPage.tsx`                  | 92, 98                                             | `$tone`                                                                                            | 2      |        |        | `data-tone`                                                                                                                           |
| `pages/setup/SetupPage.tsx`                    | 69, 70                                             | `$strength`                                                                                        | 2      |        |        | `data-strength="0…4"`                                                                                                                 |
| `pages/config/ConfigurationWizardPage.tsx`     | 71, 88, 112, 121, 129                              | `$state`                                                                                           | 5      |        |        | `data-state`                                                                                                                          |
| `pages/config/components/ConfigField.tsx`      | 12                                                 | `$hasError`                                                                                        | 1      |        |        | `data-invalid`                                                                                                                        |
| **Total**                                      |                                                    |                                                                                                    | **82** | **13** | **13** |                                                                                                                                       |

31 more files import styled-components with static templates only. They still insert their CSS
at first mount, so they are in the migration order too.

## Migration order

TV hot paths first (startup, home, details, player), base components before the screens that use
them, web-only screens last. Within a phase, a file at a time. Each step: move the styles to a
`*.css.ts`, apply the rules above, add the folder to the ESLint block in `eslint.config.mjs`, keep
the stories, unit tests and visual snapshots passing, and add a CHANGELOG line.

0. ~~`shared/ui/media-card/MediaCard`~~ (pilot, done)
1. **Base components on the TV path** (`shared/ui`)
   1. `poster-card/PosterCard.tsx`: MediaCard's pattern exactly
   2. `quality-badge/QualityBadge.tsx`
   3. `rail/rail.styles.ts`: always on screen, and expanding it inserts a rule today
   4. `button/Button.tsx`: the base for most controls
   5. `spinner/Spinner.tsx`, `loading-indicator/LoadingIndicator.tsx`, `modal/Modal.tsx` (static)
   6. `logo/Logo.tsx`, `logo/LogoGlyphs.tsx`: its placement changes during the intro, inserting
      rules at startup. After the uncommitted TV work on `Logo.tsx` is committed.
2. **Home and startup.** After the uncommitted TV performance work (`MediaHero`, `CategoryRow`,
   `HomePage`, `IntroAnimation`, `useIntroController`, `image-preloader`) is committed:
   1. `app/shell/IntroAnimation.tsx`, `app/AppShell.tsx`, `app/shell/VersionBadge.tsx`
   2. `pages/home/components/CategoryRow.tsx`
   3. `pages/home/components/MediaHero.tsx`
   4. `pages/home/HomePage.tsx`, `pages/home/components/HomeSidebar.tsx`,
      `pages/home/components/NotificationsMenu.tsx`
3. **Details**
   1. `pages/home/components/details.styles.ts`, `metadata.styles.ts`
   2. `pages/home/components/MediaDetails.tsx`
   3. `pages/home/components/EpisodesSection.tsx`, `SourcePreparationStatus.tsx`
4. **Player:** `PlayerControls.tsx`, `SubtitleTiming.tsx`, `PlayerView.tsx`, `SubtitleMenu.tsx`,
   `AvplayVideo.tsx` (all in `pages/home/components/`)
5. **Search:** `pages/search/components/search.styles.ts`, `SearchBox.tsx`, `SearchChips.tsx`,
   `OnScreenKeyboard.tsx`, `SearchResults.tsx`, `pages/search/SearchPage.tsx`
6. **TV sign-in, server picker and settings**
   1. `features/server-discovery/ui/ServerPicker.tsx`
   2. `features/auth/ui/login/QRDisplay.tsx`, `LoginWithEmail.tsx`, `Sections.tsx`,
      `ErrorMessage.tsx`, and `pages/login/LoginPage.tsx`
   3. `pages/settings/SettingsPage.tsx`, `pages/settings/StoragePage.tsx`
   4. `shared/ui/switch/Switch.tsx`, `form-controls/FormControls.tsx`, `alert/Alert.tsx`,
      `action-row/ActionRow.tsx`
7. **Web-only screens**
   1. `pages/config/ConfigurationWizardPage.tsx`, `ConfigWizardPage.tsx`,
      `components/ConfigField.tsx`, `components/ServiceConfigGroup.tsx`
   2. `pages/setup/SetupPage.tsx`, `pages/qr/QrApprovalPage.tsx`
   3. `pages/home/components/TraktModal/` (`TraktModal.tsx`, `TraktModal.styles.ts`,
      `TraktLanding.tsx`, `TraktAuthorization.tsx`)
   4. `shared/components/ErrorBoundary/ErrorBoundary.tsx`
8. **Remove the runtime**
   1. In `app/bootstrap/client.tsx` and `server.tsx`, remove `StyleSheetManager` and the
      `ServerStyleSheet` collection, and stop the `ssr-inject` plugin injecting a style head.
   2. Remove the styled-components `ThemeProvider` from `__test-utils__/render.tsx`.
   3. Remove `shared/styles/legacy-chromium.ts` and its test (`legacy-css.ts` stays for the
      PostCSS pass).
   4. Uninstall `styled-components` and `stylis`.
   5. Move the stories that still use `styled` for layout to inline styles or `*.css.ts`.
   6. Replace the per-folder ESLint block with a ban on `styled-components` across `frontend/`.
