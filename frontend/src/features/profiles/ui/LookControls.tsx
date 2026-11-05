import type { PlushieKind } from 'plushies';
import { useEffect, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';

import {
  COLORS,
  EYES,
  FABRICS,
  FINE_TUNES,
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
import { outlinePath } from './outline';
import { NAV_ATTRIBUTE } from './spatialFocus';

import NoneIcon from '~icons/mdi/cancel';

const nav = { [NAV_ATTRIBUTE]: '' };

const focusRing = css`
  outline: none;

  &:focus-visible,
  &:focus {
    box-shadow:
      0 0 0 3px #0a0d0f,
      0 0 0 6px #ffffff;
  }
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
`;

export const SectionTitle = styled.h3`
  margin: 0;
  font-size: clamp(1rem, 1.25vw, 1.5rem);
  font-weight: 600;
  text-transform: none;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const Chip = styled.button<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.45rem 1rem;
  border: 2px solid ${({ $selected }) => ($selected ? '#ffffff' : 'rgba(255, 255, 255, 0.16)')};
  border-radius: 999px;
  background: ${({ $selected }) =>
    $selected ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)'};
  color: #f5f5f5;
  font:
    500 clamp(0.85rem, 1vw, 1.15rem) 'Poppins',
    sans-serif;
  cursor: pointer;
  ${focusRing}
`;

const ShapeChip = styled(Chip)`
  flex-direction: column;
  width: clamp(4.5rem, 6.2vw, 7.5rem);
  padding: 0.6rem 0.4rem;
  border-radius: 16px;
  font-size: clamp(0.75rem, 0.85vw, 1rem);
`;

/** A square (padding keeps the ratio on TVs without `aspect-ratio`). */
const ShapeArea = styled.span`
  position: relative;
  display: block;
  width: 70%;
  padding-bottom: 70%;
`;

/**
 * The shape filled with the chosen fabric: an SVG of the outline masks the fabric's picture, so
 * each tile is one masked layer rather than a live drawing.
 */
const ShapeFill = styled.span`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  /* The tint below blends with the fabric only. */
  isolation: isolate;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
`;

/** Recolours the fabric to the fur colour, keeping its light and shade. */
const FabricTint = styled.span<{ $color: string }>`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: ${({ $color }) => $color};
  mix-blend-mode: color;
`;

/** A soft light from the top left and shade below, so the flat fabric reads as stuffed. */
const Volume = styled.span`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background:
    radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.28), transparent 55%),
    radial-gradient(circle at 60% 100%, rgba(0, 0, 0, 0.3), transparent 60%);
`;

/** The inside of a fabric swatch: a square share of its cell, away from the shaded edges. */
const FABRIC_CROP = { width: 0.45, height: 0.6 } as const;

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

export function ShapePicker({
  value,
  color,
  fabric,
  onChange,
}: {
  value: PlushieKind;
  color: string;
  fabric: PlushieLook['fabric'];
  onChange: (kind: PlushieKind) => void;
}) {
  const outline = useOutline();
  // One mask per shape, made once the outlines load
  const masks = useMemo(
    () => (outline ? new Map(KINDS.map(kind => [kind, outlineMask(outline(kind))])) : null),
    [outline]
  );
  const fabricCell = spriteCell('fabric', fabric);
  const fabricLayout = fabricCell && spriteCrop(fabricCell, FABRIC_CROP.width, FABRIC_CROP.height);
  return (
    <Section aria-label="Shape">
      <SectionTitle>Shape</SectionTitle>
      <Row role="radiogroup" aria-label="Shape">
        {KINDS.map(kind => (
          <ShapeChip
            key={kind}
            type="button"
            role="radio"
            aria-checked={kind === value}
            $selected={kind === value}
            {...nav}
            onClick={() => onChange(kind)}
          >
            {masks && (
              <ShapeArea aria-hidden="true">
                <ShapeFill style={{ WebkitMaskImage: masks.get(kind), maskImage: masks.get(kind) }}>
                  {fabricCell && fabricLayout && (
                    <SheetImage
                      src={fabricCell.sheet.url}
                      srcSet={fabricCell.sheet.srcSet}
                      alt=""
                      draggable={false}
                      decoding="async"
                      style={fabricLayout}
                    />
                  )}
                  <FabricTint $color={color} />
                  <Volume />
                </ShapeFill>
              </ShapeArea>
            )}
            {optionLabel(kind)}
          </ShapeChip>
        ))}
      </Row>
    </Section>
  );
}

const Swatch = styled.button<{ $color: string; $selected: boolean }>`
  width: clamp(2.6rem, 3.3vw, 4rem);
  height: clamp(2.6rem, 3.3vw, 4rem);
  padding: 0;
  border: 3px solid ${({ $selected }) => ($selected ? '#ffffff' : 'transparent')};
  border-radius: 50%;
  background: ${({ $color }) => $color};
  box-shadow: inset 0 0 0 3px #0a0d0f;
  cursor: pointer;
  ${focusRing}
`;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Section aria-label="Color">
      <SectionTitle>Color</SectionTitle>
      <Row role="radiogroup" aria-label="Color">
        {COLORS.map(color => (
          <Swatch
            key={color.value}
            type="button"
            role="radio"
            aria-checked={color.value === value}
            aria-label={color.name}
            $color={color.value}
            $selected={color.value === value}
            {...nav}
            onClick={() => onChange(color.value)}
          />
        ))}
      </Row>
    </Section>
  );
}

const PictureTile = styled.button<{ $selected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: clamp(5.5rem, 7.2vw, 8.75rem);
  padding: 0.45rem 0.45rem 0.55rem;
  border: 2px solid ${({ $selected }) => ($selected ? '#ffffff' : 'rgba(255, 255, 255, 0.12)')};
  border-radius: 16px;
  background: ${({ $selected }) =>
    $selected ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)'};
  color: #f5f5f5;
  font:
    500 clamp(0.75rem, 0.85vw, 1rem) 'Poppins',
    sans-serif;
  cursor: pointer;
  ${focusRing}
`;

/** A 4:3 area (padding keeps the ratio on TVs without `aspect-ratio`). */
const PictureArea = styled.span`
  position: relative;
  display: block;
  width: 100%;
  padding-bottom: 75%;
  overflow: hidden;
  border-radius: 10px;
  /* The tint below blends with the picture only. */
  isolation: isolate;

  > svg {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 42%;
    height: 42%;
    transform: translate(-50%, -50%);
    opacity: 0.45;
  }
`;

const SheetImage = styled.img`
  position: absolute;
  max-width: none;
  pointer-events: none;
  user-select: none;
`;

/** Recolours a picture to the fur colour, keeping its light and shade; masked to its shape. */
const Tint = styled.span<{ $color: string; $url: string }>`
  position: absolute;
  background: ${({ $color }) => $color};
  mix-blend-mode: color;
  -webkit-mask: url(${({ $url }) => $url}) 0 0 / 100% 100% no-repeat;
  mask: url(${({ $url }) => $url}) 0 0 / 100% 100% no-repeat;
  pointer-events: none;
`;

/** One option's picture from its sheet, or a "none" sign. */
function OptionPicture({ cell, tint }: { cell: SpriteCell | null; tint?: string }) {
  if (!cell) {
    return (
      <PictureArea aria-hidden="true">
        <NoneIcon />
      </PictureArea>
    );
  }
  const image = spriteLayout(cell);
  return (
    <PictureArea aria-hidden="true">
      <SheetImage
        src={cell.sheet.url}
        srcSet={cell.sheet.srcSet}
        alt=""
        draggable={false}
        decoding="async"
        style={image}
      />
      {tint && <Tint $color={tint} $url={spriteUrl(cell.sheet, spriteDensity())} style={image} />}
    </PictureArea>
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
}: {
  label: string;
  category: PictureCategory;
  values: readonly T[];
  value: T;
  /** Recolour the pictures (fabrics take the fur colour). */
  tint?: string;
  onChange: (value: T) => void;
}) {
  return (
    <Section aria-label={label}>
      <SectionTitle>{label}</SectionTitle>
      <Row role="radiogroup" aria-label={label}>
        {values.map(option => (
          <PictureTile
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            $selected={option === value}
            {...nav}
            onClick={() => onChange(option)}
          >
            <OptionPicture cell={spriteCell(category, option)} tint={tint} />
            {optionLabel(option)}
          </PictureTile>
        ))}
      </Row>
    </Section>
  );
}

export function FabricPicker({
  value,
  color,
  onChange,
}: {
  value: PlushieLook['fabric'];
  color: string;
  onChange: (fabric: PlushieLook['fabric']) => void;
}) {
  return (
    <PicturePicker
      label="Fabric"
      category="fabric"
      values={FABRICS}
      value={value}
      tint={color}
      onChange={onChange}
    />
  );
}

const Slider = styled.label`
  display: grid;
  grid-template-columns: minmax(7rem, 11rem) 1fr;
  align-items: center;
  gap: 1rem;
  font-size: clamp(0.85rem, 1vw, 1.15rem);

  input {
    width: 100%;
    accent-color: #e50914;
    ${focusRing}
    border-radius: 6px;
  }
`;

export function FineTuneControls({
  look,
  onChange,
}: {
  look: PlushieLook;
  onChange: (changes: Partial<PlushieLook>) => void;
}) {
  return (
    <Section aria-label="Fine-tune">
      {FINE_TUNES.map(tune => (
        <Slider key={tune.key}>
          {tune.label}
          <input
            type="range"
            {...nav}
            min={tune.min}
            max={tune.max}
            step={tune.step}
            value={look[tune.key] ?? tune.defaultValue}
            onChange={event => onChange({ [tune.key]: Number(event.target.value) })}
          />
        </Slider>
      ))}
    </Section>
  );
}

export function FaceControls({
  look,
  onChange,
}: {
  look: PlushieLook;
  onChange: (changes: Partial<PlushieLook>) => void;
}) {
  return (
    <>
      <PicturePicker
        label="Eyes"
        category="eyes"
        values={EYES}
        value={look.eyes}
        onChange={eyes => onChange({ eyes })}
      />
      <PicturePicker
        label="Mouth"
        category="mouth"
        values={MOUTHS}
        value={look.mouth}
        onChange={mouth => onChange({ mouth })}
      />
      <PicturePicker
        label="Cheeks"
        category="cheeks"
        values={['none', 'blush'] as const}
        value={look.cheeks ? 'blush' : 'none'}
        onChange={cheeks => onChange({ cheeks: cheeks === 'blush' })}
      />
      <PicturePicker
        label="Moustache"
        category="moustache"
        values={MOUSTACHES}
        value={look.moustache}
        onChange={moustache => onChange({ moustache })}
      />
    </>
  );
}

export function AccessoryControls({
  look,
  onChange,
}: {
  look: PlushieLook;
  onChange: (changes: Partial<PlushieLook>) => void;
}) {
  return (
    <>
      <PicturePicker
        label="Hat"
        category="hat"
        values={HATS}
        value={look.hat}
        onChange={hat => onChange({ hat })}
      />
      <PicturePicker
        label="Glasses"
        category="glasses"
        values={GLASSES}
        value={look.glasses}
        onChange={glasses => onChange({ glasses })}
      />
      <PicturePicker
        label="Pin"
        category="pin"
        values={PINS}
        value={look.pin}
        onChange={pin => onChange({ pin })}
      />
      <PicturePicker
        label="Neckwear"
        category="neck"
        values={NECKS}
        value={look.neck}
        onChange={neck => onChange({ neck })}
      />
    </>
  );
}
