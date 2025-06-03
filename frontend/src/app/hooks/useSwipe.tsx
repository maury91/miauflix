import { useEffect } from 'react';

type useSwipeArgs =
  | {
      directions: 'horizontal';
      onSwipe: (direction: 'left' | 'right') => void;
    }
  | { directions: 'vertical'; onSwipe: (direction: 'up' | 'down') => void };

export const useSwipe = ({ directions, onSwipe }: useSwipeArgs) => {
  useEffect(() => {
    const deltaProp = directions === 'vertical' ? 'deltaY' : 'deltaX';
    let lastEventTime = 0;
    let lastDelta = 0;
    let lastFiredEventTime = 0;
    const scrollListener = (ev: WheelEvent) => {
      if (Math.abs(ev[deltaProp]) > 10) {
        ev.preventDefault();
        const now = Date.now();
        const wasTriggeredRecently = now - lastEventTime < 100;
        const changedDirection = lastDelta <= 0 !== ev[deltaProp] <= 0;
        const speedDecreased = Math.abs(ev[deltaProp]) < Math.abs(lastDelta / 0.8);

        const isNotInertia = changedDirection || !wasTriggeredRecently || !speedDecreased;

        if (isNotInertia) {
          if (lastFiredEventTime + 150 < now) {
            if (directions === 'horizontal') {
              onSwipe(ev[deltaProp] > 0 ? 'right' : 'left');
            } else {
              onSwipe(ev[deltaProp] > 0 ? 'down' : 'up');
            }
            lastFiredEventTime = now;
          }
        }

        lastEventTime = now;
        lastDelta = ev[deltaProp];
      }
      return false;
    };
    window.addEventListener('wheel', scrollListener, { passive: false });
    return () => window.removeEventListener('wheel', scrollListener);
  }, [onSwipe, directions]);
};
