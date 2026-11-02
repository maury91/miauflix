import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import styled from 'styled-components';

export type PosterCardProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'title'
> & {
  poster: string;
  /** Accessible name, caption, and the fallback shown when there is no poster. */
  title: string;
  /** Secondary caption line, e.g. `2021 • 2h 35m • ★ 8.0`. */
  meta?: ReactNode;
  focused?: boolean;
  /** CSS width of the card, as an absolute length (px, vw); the poster keeps a 2:3 ratio. */
  width?: string;
};

const Card = styled.button<{ $width: string; $focused: boolean }>`
  box-sizing: border-box;
  display: block;
  flex: 0 0 auto;
  width: ${({ $width }) => $width};
  padding: 0;
  border: 0;
  background: none;
  color: #fff;
  font-family: 'Poppins', sans-serif;
  text-align: left;
  cursor: pointer;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
`;

/**
 * Lays out the card inside the button: older TV browsers (Chromium 69 on Tizen 5.5) cannot make a
 * button a flex container and shrink its content to fit, so this takes the card's width instead.
 */
const Content = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  width: inherit;
`;

const Artwork = styled.span<{ $focused: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1d24;
  outline: 3px solid ${({ $focused }) => ($focused ? '#fff' : 'transparent')};
  outline-offset: 0;
  transition: outline-color 150ms ease-out;

  ${Card}:focus-visible & {
    outline-color: #fff;
  }

  ${Card}:hover & {
    outline-color: ${({ $focused }) => ($focused ? '#fff' : '#ffffff40')};
  }
`;

const Poster = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const Fallback = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1em;
  font-weight: 600;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
`;

const Title = styled.span`
  overflow: hidden;
  font-size: 1em;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.span`
  display: flex;
  align-items: center;
  min-height: 1.3em;
  margin-top: -0.35em;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.9em;
  white-space: nowrap;
`;

/** Portrait 2:3 poster with its title and an optional metadata line underneath. */
export const PosterCard = forwardRef<HTMLButtonElement, PosterCardProps>(
  ({ poster, title, meta, focused = false, width = '200px', type = 'button', ...props }, ref) => (
    <Card ref={ref} type={type} aria-label={title} $width={width} $focused={focused} {...props}>
      <Content>
        <Artwork $focused={focused}>
          {poster ? <Poster src={poster} alt="" loading="lazy" /> : <Fallback>{title}</Fallback>}
        </Artwork>
        <Title aria-hidden="true">{title}</Title>
        {meta && <Meta aria-hidden="true">{meta}</Meta>}
      </Content>
    </Card>
  )
);
PosterCard.displayName = 'PosterCard';
