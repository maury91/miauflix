import { ChoiceTileGroup, Slider } from '@shared/design-system';
import { useT } from '@shared/i18n';
import type { PlushieKind } from 'plushies';
import { useEffect, useMemo, useState } from 'react';

import {
  colorLabel,
  COLORS,
  EYES,
  FABRICS,
  FINE_TUNES,
  fineTuneLabel,
  GLASSES,
  HATS,
  KINDS,
  MOUSTACHES,
  MOUTHS,
  NECKS,
  optionLabel,
  PINS,
  type PlushieLook,
} from '../avatar/look';
import { loadPlushies } from '../avatar/runtime';
import {
  type SpriteCell,
  spriteCell,
  spriteCrop,
  spriteDensity,
  spriteLayout,
  spriteUrl,
} from '../avatar/sprites';
import * as styles from './lookControls.css';
import { outlinePath } from './outline';

import NoneIcon from '~icons/mdi/cancel';

/** The inside of a fabric swatch: a square share of its cell, away from the shaded edges. */
const FABRIC_CROP = { width: 0.45, height: 0.6 } as const;

/** The navigation id of one part control: `<prefix>:<part>`. */
const partNavId = (prefix: string | undefined, part: string) =>
  prefix === undefined ? undefined : `${prefix}:${part}`;

/** The outline as a CSS mask image. */
const outlineMask = (points: [number, number][]) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${outlinePath(points)}"/></svg>`
  )}")`;

type Outline = (kind: PlushieKind) => [number, number][];

/** Silhouette outlines from the library, loaded with it. */
function useOutline(): Outline | null {
  const [outline, setOutline] = useState<Outline | null>(null);
  useEffect(() => {
    let current = true;
    loadPlushies()
      .then(({ plushies }) => {
        if (current) setOutline(() => (kind: PlushieKind) => plushies.plushieOutline(kind));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return outline;
}

interface PartProps {
  /** Prefix for the controls' navigation ids. See NavigableProps. */
  navId?: string;
}

export function ShapePicker({
  value,
  color,
  fabric,
  onChange,
  navId,
}: PartProps & {
  value: PlushieKind;
  color: string;
  fabric: PlushieLook['fabric'];
  onChange: (kind: PlushieKind) => void;
}) {
  const t = useT();
  const outline = useOutline();
  // One mask per shape, made once the outlines load
  const masks = useMemo(
    () => (outline ? new Map(KINDS.map(kind => [kind, outlineMask(outline(kind))])) : null),
    [outline]
  );
  const fabricCell = spriteCell('fabric', fabric);
  const fabricLayout = fabricCell && spriteCrop(fabricCell, FABRIC_CROP.width, FABRIC_CROP.height);
  return (
    <ChoiceTileGroup
      label={t('look.shape')}
      labelHidden
      navId={partNavId(navId, 'shape')}
      value={value}
      onChange={onChange}
      options={KINDS.map(kind => ({
        value: kind,
        label: optionLabel(kind),
        visual: (
          <span className={styles.shapeArea}>
            {masks && (
              <span
                className={styles.shapeFill}
                style={{ WebkitMaskImage: masks.get(kind), maskImage: masks.get(kind) }}
              >
                {fabricCell && fabricLayout && (
                  <img
                    className={styles.sheetImage}
                    src={fabricCell.sheet.url}
                    srcSet={fabricCell.sheet.srcSet}
                    alt=""
                    draggable={false}
                    decoding="async"
                    style={fabricLayout}
                  />
                )}
                <span className={styles.fabricTint} style={{ backgroundColor: color }} />
                <span className={styles.volume} />
              </span>
            )}
          </span>
        ),
      }))}
    />
  );
}

export function ColorPicker({
  value,
  onChange,
  navId,
}: PartProps & { value: string; onChange: (color: string) => void }) {
  const t = useT();
  return (
    <ChoiceTileGroup
      label={t('look.color')}
      shape="swatch"
      navId={partNavId(navId, 'color')}
      value={value}
      onChange={onChange}
      options={COLORS.map(color => ({
        value: color.value,
        label: colorLabel(color.name),
        color: color.value,
      }))}
    />
  );
}

/** One option's picture from its sheet, or a "none" sign. */
function OptionPicture({ cell, tint }: { cell: SpriteCell | null; tint?: string }) {
  if (!cell) {
    return (
      <span className={styles.pictureArea}>
        <NoneIcon />
      </span>
    );
  }
  const image = spriteLayout(cell);
  const mask = `url(${spriteUrl(cell.sheet, spriteDensity())}) 0 0 / 100% 100% no-repeat`;
  return (
    <span className={styles.pictureArea}>
      <img
        className={styles.sheetImage}
        src={cell.sheet.url}
        srcSet={cell.sheet.srcSet}
        alt=""
        draggable={false}
        decoding="async"
        style={image}
      />
      {tint && (
        <span
          className={styles.tint}
          style={{ ...image, backgroundColor: tint, WebkitMask: mask, mask }}
        />
      )}
    </span>
  );
}

type PictureCategory = Parameters<typeof spriteCell>[0];

/** A choice among option values, shown as picture tiles. */
export function PicturePicker<T extends string>({
  label,
  category,
  values,
  value,
  tint,
  onChange,
  navId,
}: PartProps & {
  label: string;
  category: PictureCategory;
  values: readonly T[];
  value: T;
  /** Recolour the pictures (fabrics take the fur colour). */
  tint?: string;
  onChange: (value: T) => void;
}) {
  return (
    <ChoiceTileGroup
      label={label}
      navId={partNavId(navId, category)}
      value={value}
      onChange={onChange}
      options={values.map(option => ({
        value: option,
        label: optionLabel(option),
        visual: <OptionPicture cell={spriteCell(category, option)} tint={tint} />,
      }))}
    />
  );
}

export function FabricPicker({
  value,
  color,
  onChange,
  navId,
}: PartProps & {
  value: PlushieLook['fabric'];
  color: string;
  onChange: (fabric: PlushieLook['fabric']) => void;
}) {
  const t = useT();
  return (
    <PicturePicker
      label={t('look.fabric')}
      category="fabric"
      values={FABRICS}
      value={value}
      tint={color}
      onChange={onChange}
      navId={navId}
    />
  );
}

export function FineTuneControls({
  look,
  onChange,
  navId,
}: PartProps & { look: PlushieLook; onChange: (changes: Partial<PlushieLook>) => void }) {
  return (
    <div className={styles.controls}>
      {FINE_TUNES.map(tune => (
        <Slider
          key={tune.key}
          navId={partNavId(navId, tune.key)}
          label={fineTuneLabel(tune.key)}
          min={tune.min}
          max={tune.max}
          step={tune.step}
          value={look[tune.key] ?? tune.defaultValue}
          onChange={value => onChange({ [tune.key]: value })}
        />
      ))}
    </div>
  );
}

type LookProps = PartProps & {
  look: PlushieLook;
  onChange: (changes: Partial<PlushieLook>) => void;
};

export function FaceControls({ look, onChange, navId }: LookProps) {
  const t = useT();
  return (
    <div className={styles.controls}>
      <PicturePicker
        label={t('look.eyes')}
        category="eyes"
        values={EYES}
        value={look.eyes}
        onChange={eyes => onChange({ eyes })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.mouth')}
        category="mouth"
        values={MOUTHS}
        value={look.mouth}
        onChange={mouth => onChange({ mouth })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.cheeks')}
        category="cheeks"
        values={['none', 'blush'] as const}
        value={look.cheeks ? 'blush' : 'none'}
        onChange={cheeks => onChange({ cheeks: cheeks === 'blush' })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.moustache')}
        category="moustache"
        values={MOUSTACHES}
        value={look.moustache}
        onChange={moustache => onChange({ moustache })}
        navId={navId}
      />
    </div>
  );
}

export function AccessoryControls({ look, onChange, navId }: LookProps) {
  const t = useT();
  return (
    <div className={styles.controls}>
      <PicturePicker
        label={t('look.hat')}
        category="hat"
        values={HATS}
        value={look.hat}
        onChange={hat => onChange({ hat })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.glasses')}
        category="glasses"
        values={GLASSES}
        value={look.glasses}
        onChange={glasses => onChange({ glasses })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.pin')}
        category="pin"
        values={PINS}
        value={look.pin}
        onChange={pin => onChange({ pin })}
        navId={navId}
      />
      <PicturePicker
        label={t('look.neckwear')}
        category="neck"
        values={NECKS}
        value={look.neck}
        onChange={neck => onChange({ neck })}
        navId={navId}
      />
    </div>
  );
}
