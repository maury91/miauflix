import { gsap } from 'gsap';

export async function introAnimation(callback: () => void) {
  const logo = document.getElementById('logo');
  const backdrop = document.getElementById('backdrop');
  const h1 = logo?.querySelector('h1');
  if (logo && backdrop && h1) {
    const [m, i, a, u, f, l, i2, x] = Array.from(logo.querySelectorAll('svg'));
    const boxes = [m, i, a, u, f, l, i2, x].map(letter => letter.getBoundingClientRect());
    [m, i, a, u, f, l, i2, x].forEach((letter, index) => {
      const { left, top, width, height } = boxes[index];
      letter.style.position = 'fixed';
      letter.style.display = 'block';
      letter.style.left = `${left}px`;
      letter.style.top = `${top}px`;
      letter.style.width = `${width}px`;
      letter.style.height = `${height}px`;
      letter.style.margin = '0';
    });
    const duration = 2.5;
    const tl = gsap.timeline({
      delay: 1,
      paused: true,
      onComplete: () => {
        logo.remove();
        backdrop.remove();
        callback();
      },
    });
    const { width: uWidth } = u.getBoundingClientRect();
    tl.fromTo(
      m,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(-${uWidth * 5}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      i,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(-${uWidth * 3.5}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      a,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(-${uWidth * 2.2}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      u,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(-${uWidth}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      f,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(${uWidth}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      l,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(${uWidth * 2.2}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      i2,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(${uWidth * 3.5}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.fromTo(
      x,
      {
        transform: 'scale(1) translateX(0)',
      },
      {
        transform: `scale(10) translateX(${uWidth * 5}px)`,
        duration: duration,
        ease: 'expoScale(1, 10)',
      },
      0
    );
    tl.call(
      () => {
        gsap.killTweensOf([m, x]);
        m.remove();
        x.remove();
      },
      [],
      duration * 0.3
    );
    tl.call(
      () => {
        gsap.killTweensOf([i, i2]);
        i.remove();
        i2.remove();
      },
      [],
      duration * 0.4
    );
    tl.call(
      () => {
        gsap.killTweensOf([a, l]);
        a.remove();
        l.remove();
      },
      [],
      duration * 0.65
    );
    if (!('tizen' in window)) {
      // Blur is too heavy on the tizen browser
      tl.fromTo(
        [i, a, u, f, l, i2],
        {
          filter: 'blur(0)',
        },
        {
          filter: 'blur(10px)',
          duration: duration * 0.8,
        },
        duration * 0.3
      );
    }
    tl.fromTo(
      [u, f],
      {
        opacity: 1,
      },
      {
        opacity: 0,
        duration: duration * 0.4,
      },
      duration * 0.6
    );
    tl.fromTo(
      backdrop,
      {
        opacity: 1,
      },
      {
        opacity: 0,
        duration: duration * 0.4,
      },
      'tizen' in window ? duration * 0.7 : duration * 0.6
    );
    tl.play();
  }
}
