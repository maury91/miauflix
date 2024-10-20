import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useAppSelector } from '../../store/store';

const BackgroundContainer = styled.div<{ direction: 'top' | 'left' | 'none' }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  &:after {
    content: '';
    position: fixed;
    opacity: ${({ direction }) => (direction === 'none' ? 0 : 1)};
    transition: opacity 1.5s;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${(props) =>
      props.direction === 'top'
        ? `linear-gradient( 180deg, rgb(0 0 0) 0%, rgba(0, 0, 0, 1) calc(20px + 5vh), rgba(0, 0, 0, 0.7) calc(20px + 13vh), rgba(0, 0, 0, 0.2) 40%, rgba(0, 0, 0, 0) 100%)`
        : `linear-gradient( 90deg,rgba(0,0,0, 1) 0%,rgba(0,0,0,0.6) calc(20px + 35vh),rgba(0,0,0,0.5) calc(20px + 40vh),rgba(0,0,0,0.2) 40%,rgba(0,0,0,0) 100%)`};
`;

const BackgroundImage = styled.div<{
  url: string;
  opacity: number;
  visible: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  right: 0;
  background: url(${(props) => props.url}) center;
  background-size: cover;
  transition: opacity 2s;
  opacity: ${({ opacity }) => opacity};
  display: ${({ visible }) => (visible ? 'block' : 'none')};
`;

export const Background = () => {
  const backgrounds = useAppSelector((state) => state.app.backgrounds);
  const currentPage = useAppSelector((state) => state.app.currentPage);
  const [currentBackground, setCurrentBackground] = useState(0);

  const backgroundDirection = useMemo(() => {
    if (currentPage === 'profile-selection') {
      return 'left';
    }
    return 'none';
  }, [currentPage]);

  useEffect(() => {
    setCurrentBackground(0);
    const interval = setInterval(() => {
      setCurrentBackground((prev) => (prev + 1) % backgrounds.length);
    }, 6e4 /* 1 minute */);
    return () => clearInterval(interval);
  }, [backgrounds.length]);

  if (!backgrounds.length) {
    return null;
  }

  return (
    <BackgroundContainer direction={backgroundDirection}>
      {backgrounds.map((background, index) => (
        <BackgroundImage
          key={index}
          url={background}
          visible={
            currentBackground === index ||
            currentBackground ===
              (index + backgrounds.length - 1) % backgrounds.length ||
            currentBackground === (index + 1) % backgrounds.length
          }
          opacity={currentBackground === index ? 1 : 0}
        />
      ))}
    </BackgroundContainer>
  );
};
