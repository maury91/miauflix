/**
 * The Miauflix design system (docs/plans/style-guide.md). Built alongside `shared/ui` and not used
 * by the app yet; screens adopt it during the migration.
 */
export type { ActionStateProps } from './action/actionInternals';
export { ActionGroup, type ActionGroupProps } from './action-group/ActionGroup';
export { Artwork, type ArtworkProps } from './artwork/Artwork';
export { Avatar, type AvatarProps } from './avatar/Avatar';
export { Badge, type BadgeProps } from './badge/Badge';
export { Button, type ButtonProps } from './button/Button';
export { Carousel, type CarouselItemState, type CarouselProps } from './carousel/Carousel';
export {
  type CarouselLayout,
  type CarouselPosition,
  revealItem,
  stepCarousel,
  useCarouselNavigation,
} from './carousel/carouselNavigation';
export { type CollectionGeometry, collectionGeometry } from './carousel/collectionGeometry';
export {
  Chip,
  type ChipProps,
  type ChipSize,
  FilterChip,
  type FilterChipProps,
  RemovableChip,
  type RemovableChipProps,
} from './chip/Chip';
export { Checkbox, type CheckboxProps } from './choice/Checkbox';
export type { ChoiceProps } from './choice/ChoiceFrame';
export { RadioGroup, type RadioGroupProps, type RadioOption } from './choice/RadioGroup';
export { Switch, type SwitchProps } from './choice/Switch';
export { CollectionTile, type CollectionTileProps } from './collection-tile/CollectionTile';
export { Dialog, type DialogProps } from './dialog/Dialog';
export { Divider, type DividerProps } from './divider/Divider';
export { EmptyState, type EmptyStateProps } from './empty-state/EmptyState';
export {
  Field,
  type FieldAnatomyProps,
  type FieldControlProps,
  type FieldProps,
} from './field/Field';
export { fieldActionSize } from './field/fieldParts';
export { NumberField, type NumberFieldPart, type NumberFieldProps } from './field/NumberField';
export {
  PasswordField,
  type PasswordFieldPart,
  type PasswordFieldProps,
} from './field/PasswordField';
export { SearchField, type SearchFieldPart, type SearchFieldProps } from './field/SearchField';
export { TextArea, type TextAreaProps } from './field/TextArea';
export { TextField, type TextFieldProps } from './field/TextField';
export { IconButton, type IconButtonProps } from './icon-button/IconButton';
export {
  IconButtonGroup,
  type IconButtonGroupItem,
  type IconButtonGroupProps,
} from './icon-button-group/IconButtonGroup';
export { type HintKey, KeyHint, type KeyHintProps } from './key-hint/KeyHint';
export { Container, type ContainerProps, SafeArea, type SafeAreaProps } from './layout/Container';
export { Grid, GridItem, type GridItemProps, type GridProps } from './layout/Grid';
export {
  type GridCell,
  type GridDirection,
  gridLayout,
  stepGrid,
  type StepGridOptions,
} from './layout/gridNavigation';
export { Inline, type InlineProps } from './layout/Inline';
export { SplitLayout, type SplitLayoutProps } from './layout/SplitLayout';
export {
  isSplitStacked,
  paneEntry,
  paneOf,
  rememberPaneFocus,
  type SplitPane,
  type SplitPaneMemory,
  type SplitStackBelow,
  stepSplit,
} from './layout/splitNavigation';
export { type LayoutElement, Stack, type StackProps } from './layout/Stack';
export {
  resolveResponsive,
  type Responsive,
  useWindowClass,
  type WindowClass,
} from './layout/windowClass';
export { List, type ListProps } from './list/List';
export { ListItem, type ListItemProps } from './list/ListItem';
export {
  type SettingControlProps,
  SettingRow,
  type SettingRowProps,
  type SettingToggle,
} from './list/SettingRow';
export { Menu, type MenuProps, type MenuTriggerProps } from './menu/Menu';
export type { MenuAction, MenuEntry, MenuSeparator } from './menu/menuItems';
export { Message, type MessageProps, type MessageTone } from './message/Message';
export { NavItem, type NavItemProps, NavRail, type NavRailProps } from './nav-rail/NavRail';
export { OptionList, type OptionListProps } from './option-list/OptionList';
export type { SelectItems, SelectOption, SelectOptionGroup } from './option-list/selectItems';
export { Popover, type PopoverProps, type PopoverTriggerProps } from './popover/Popover';
export {
  ProgressBar,
  type ProgressBarProps,
  ProgressSpinner,
  type ProgressSpinnerProps,
} from './progress/Progress';
export { ProgressButton, type ProgressButtonProps } from './progress-button/ProgressButton';
export { type RevealGeometry, revealOffset } from './scroll-area/revealOffset';
export { ScrollArea, type ScrollAreaProps } from './scroll-area/ScrollArea';
export { Section, type SectionProps } from './section/Section';
export { Select, type SelectProps } from './select/Select';
export {
  Skeleton,
  SkeletonGroup,
  type SkeletonGroupProps,
  type SkeletonProps,
} from './skeleton/Skeleton';
export { Slider, type SliderMark, type SliderProps } from './slider/Slider';
export {
  type SliderRange,
  sliderShare,
  snapSliderValue,
  stepSliderValue,
} from './slider/sliderValue';
export { SurfaceContextProvider, type SurfaceContextValue, useSurfaceContext } from './surface';
export { type TabItem, TabPanel, type TabPanelProps, Tabs, type TabsProps } from './tabs/Tabs';
export * as tokens from './tokens';
export { Tooltip, type TooltipProps } from './tooltip/Tooltip';
