import { type ButtonHTMLAttributes, forwardRef, useState } from 'react';
import styled from 'styled-components';

export type MediaCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  backdrop: string;
  logo?: string | null;
  /** Accessible name and visible fallback when the logo is unavailable. */
  title: string;
  subtitle?: string | null;
  /** Percentage watched, from 0 to 100. Null omits the track. */
  progress?: number | null;
  focused?: boolean;
  hovered?: boolean;
  width?: number;
  /** Optional contrast gradient over the backdrop. */
  overlay?: boolean;
};

const Card = styled.button<{ $width: number; $focused: boolean; $hovered: boolean }>`
  box-sizing: border-box;
  display: block;
  flex: 0 0 auto;
  width: ${({ $width }) => $width}px;
  max-width: 100%;
  min-width: 0;
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #141a20;
  color: #fff;
  font-family: 'Poppins', sans-serif;
  text-align: left;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  outline: 1px solid transparent;
  transform: scale(1);
  transition:
    transform 150ms ease-out,
    outline-color 150ms ease-out;

  &:hover:not(:disabled) {
    outline-color: #ffffff40;
    transform: scale(1.015);
  }

  ${({ $hovered }) =>
    $hovered &&
    `
    &:not(:disabled) { outline-color: #ffffff40; transform: scale(1.015); }
  `}

  &:focus-visible:not(:disabled) {
    outline: 3px solid #fff;
    transform: scale(1.03);
    z-index: 1;
  }

  ${({ $focused }) =>
    $focused &&
    `
    &:not(:disabled) { outline: 3px solid #fff; transform: scale(1.03); z-index: 1; }
  `}

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none !important;
  }
`;

const Backdrop = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
`;

const Overlay = styled.span`
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 35%, rgba(0, 0, 0, 0.75));
`;

const Logo = styled.img`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: auto;
  height: auto;
  max-width: 80%;
  max-height: 65%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.65));
`;

const Info = styled.span<{ $width: number }>`
  position: absolute;
  inset: auto 12px 12px;
  display: grid;
  gap: ${({ $width }) => $width / 80}px;
  font-size: ${({ $width }) => $width / 18}px;
  line-height: 1.3;
  font-weight: 600;
  text-shadow: 0 2px 4px #000;

  > span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
`;

const ProgressTrack = styled.span<{ $width: number }>`
  position: absolute;
  inset: auto 8px 6px;
  height: ${({ $width }) => $width / 80}px;
  border-radius: 2px;
  overflow: hidden;
  background: #ffffff40;
`;

const ProgressFill = styled.span<{ $percent: number }>`
  display: block;
  width: ${({ $percent }) => $percent}%;
  height: 100%;
  background: #e50920;
`;

/** Independent artwork control; scales the entire composition on hover and focus. */
export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  {
    backdrop,
    logo,
    title,
    subtitle,
    progress,
    focused = false,
    hovered = false,
    width = 320,
    overlay = true,
    ...buttonProps
  },
  ref
) {
  const [failedLogo, setFailedLogo] = useState<string>();
  const hasLogo = Boolean(logo && logo !== failedLogo);
  const percent =
    progress == null ? null : Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <Card
      {...buttonProps}
      ref={ref}
      type="button"
      $width={width}
      $focused={focused}
      $hovered={hovered}
      aria-label={buttonProps['aria-label'] ?? (subtitle ? `${title} · ${subtitle}` : title)}
    >
      {backdrop && <Backdrop src={backdrop} alt="" decoding="async" draggable={false} />}
      {overlay && <Overlay aria-hidden="true" />}
      {hasLogo && (
        <Logo
          key={logo}
          src={logo!}
          alt=""
          draggable={false}
          onError={() => setFailedLogo(logo!)}
        />
      )}
      {(!hasLogo || subtitle) && (
        <Info $width={width}>
          {!hasLogo && <span>{title}</span>}
          {subtitle && <span>{subtitle}</span>}
        </Info>
      )}
      {percent !== null && (
        <ProgressTrack aria-label={`${Math.round(percent)}% watched`} $width={width}>
          <ProgressFill $percent={percent} />
        </ProgressTrack>
      )}
    </Card>
  );
});
