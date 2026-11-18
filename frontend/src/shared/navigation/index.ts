/**
 * The navigation layer (docs/plans/style-guide.md, section 10): one virtual focus owner over a
 * tree of scopes, groups and focusable leaves, resolved without the DOM's focus order.
 */
export {
  type GridCell,
  type GridDirection,
  gridLayout,
  stepGrid,
  type StepGridOptions,
} from './grid';
export {
  type CompositeResult,
  type FocusableResult,
  useActiveIdWithin,
  useComposite,
  useFocusable,
  useFocusWithinChange,
  useHasNavigation,
  useNavigation,
  useNavigationStore,
  useOptionalNavigation,
  useOptionalPointerLock,
} from './hooks';
export { NavigationInspector } from './NavigationInspector';
export {
  FocusGroup,
  type FocusGroupProps,
  FocusScope,
  type FocusScopeProps,
  NavigationProvider,
  type NavigationProviderProps,
} from './NavigationProvider';
export { enter, resolveMove, spatialPick } from './resolve';
export {
  createNavigationStore,
  heldKeyInterval,
  type InputKind,
  type NavigationSnapshot,
  type NavigationStore,
} from './store';
export type {
  Direction,
  Edge,
  EdgePolicy,
  EntryPolicy,
  GroupLayout,
  MoreRequest,
  NavigationNode,
  NavigationTree,
  Rect,
  Resolution,
} from './types';
