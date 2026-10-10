# Miauflix UI

The frontend's UI library lives here. Import from `@shared/ui`; deep imports and the old Spinner export remain compatible. Storybook is the interactive reference: `npm run storybook --workspace frontend` from the repository root.

See [Introduction.mdx](./Introduction.mdx) for selection, accessibility and contribution rules, and [Composition.mdx](./Composition.mdx) for how controls work together. Component stories provide editable examples and public prop tables. No theme provider or MUI dependency is needed.

## Frontend audit and ownership

| Area inspected                                            | Result                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shared Button, ActionRow, LoadingIndicator                | Reused; added supported sizing/appearance/layout APIs and usage documentation                                     |
| Login, account setup and ConfigField inputs               | Consolidated into Input, Select, FieldLabel and Switch; consumers migrated                                        |
| Setup/settings save, test and cancel buttons              | Replaced local Button styling with library props                                                                  |
| Settings service and global result messages               | Consolidated into Alert; validation-only success remains informational                                            |
| Shared Spinner                                            | Moved here with old export retained; added loading semantics and reduced-motion behavior                          |
| Modal                                                     | Added documented stories for its existing two-button focus/TV contract                                            |
| Logo/LogoGlyphs                                           | Retained as app branding: Logo knows app states and fixed page placement; excluded from general primitive exports |
| EpisodeRow, SeasonButton, HomeSidebar                     | Retained in home: selection, media DTOs, progress and remote navigation are domain behavior                       |
| PlayerControls, PlayerView, detail/back controls          | Retained in home: player state and viewport-scaled chrome require a dedicated visual contract                     |
| Optional-service cards, settings disclosure, Trakt layout | Feature composition; remaining extensions listed below                                                            |
| ErrorBoundary                                             | Kept error recovery in shared/components; spacing-only Button extension removed                                   |

## Remaining extensions

The migration consolidates forms and settings actions first. Existing media/player chrome and optional-service cards still contain Button extensions, with explicit ESLint exceptions at their declarations. Dialog close/copy controls, settings chevrons, disclosures and Trakt actions now use library props. Do not copy them into new pages. Promote a repeated visual contract to the library when it can preserve the interaction, focus states and TV scaling together; do not add domain props to Button just to absorb these components.

ESLint rejects new `styled(Button)` / `styled(BaseButton)` and the standard form/feedback primitive names; existing domain exceptions are annotated inline. Do not bypass this rule by aliasing a primitive.

Layout-only wrappers may position components. Primitive visual changes must be implemented here with a documented prop and story. Keep component modules importing sibling modules directly to avoid barrel cycles. Keep backend DTOs, Redux, API hooks and authentication out of new primitives.

## Verification

```sh
npm run check:ts --workspace frontend
npm test --workspace frontend
npm run build --workspace frontend
npm run build-storybook --workspace frontend
# Browser story interactions (requires the installed Playwright Chromium):
npm exec --workspace frontend -- vitest run --project=storybook src/shared/ui
```

Storybook's documentation addon matches the existing Storybook 10.0.8 version. Interactive stories are deterministic and do not call external APIs.

## Media artwork cards

`MediaCard` owns its artwork, hover and focus styles independently of Button. It accepts backdrop/logo URLs, a title fallback, subtitle, percentage progress and interaction states. Its native button preserves activation, refs and roving tab indices. The home adapter selects media progress and episode information; backend DTOs stay out of the shared component. See **UI Elements/MediaCard** in Storybook for the styleguide, states and keyboard activation checks.
