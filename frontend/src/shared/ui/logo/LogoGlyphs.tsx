import type { HTMLAttributes } from 'react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import styled from 'styled-components';

export type LogoHandle = {
  m: SVGSVGElement;
  i: SVGSVGElement;
  a: SVGSVGElement;
  u: SVGSVGElement;
  f: SVGSVGElement;
  l: SVGSVGElement;
  i2: SVGSVGElement;
  x: SVGSVGElement;
};

const LogoText = styled.h1`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  position: relative;
  letter-spacing: 0;
  fill: #db202c;
  stroke: #db202c;
  margin: 0;
`;

const M = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20.144 228.675 35.416 70.128"
      className={className}
    >
      <path d="m20.144 227.75 10.412.012 7.874 37.474 6.15-37.471 10.98-.09-.107 65.804-10.799 1.131.542-35.307-3.507 23.972-7.347.195-3.066-24.265.06 37.104-11.089 1.494-.103-70.053Z" />
    </svg>
  ))
)`
  margin: 0 0.04em 0 0;
  height: 1em;
`;

const I = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="60.789 228.729 10.599 65.095"
      className={className}
    >
      <path d="m60.789 227.729.112 65.095c3.48-.31 7.007-.54 10.487-.8l-.185-64.276-10.414-.019Z" />
    </svg>
  ))
)`
  margin: 0 0.02em 0 0.065em;
  height: 0.92em;
`;

const A = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="76.698 228.719 31.565 63.869"
      className={className}
    >
      <path d="m85.296 227.727 11.937-.008c3.28 19.84 11.03 61.62 11.03 61.62l-10.411.529-1.964-14.882-7.396.295-1.364 15.522-10.43.785 8.598-63.861Zm-.981 28.953c-.717.414-.824 1.569-.24 2.579.584 1.011 1.638 1.494 2.354 1.08.716-.414.824-1.568.24-2.579-.584-1.01-1.638-1.494-2.354-1.08Zm4.61-4.028c-.817.219-1.244 1.304-.954 2.423.29 1.12 1.187 1.851 2.003 1.632.817-.218 1.244-1.303.954-2.423-.29-1.12-1.187-1.85-2.003-1.632Zm6.268.011c-.802-.199-1.677.549-1.955 1.67-.279 1.121.146 2.191.948 2.39.802.199 1.678-.549 1.956-1.67s-.147-2.191-.949-2.39Zm4.599 4.027c-.719-.413-1.773.072-2.353 1.083-.581 1.01-.469 2.165.25 2.578.718.413 1.772-.072 2.352-1.083.581-1.011.469-2.165-.249-2.578Zm-7.713 2.086-.041.001c-1.513.118-1.782.386-3.376 2.685-.96 1.386-2.315 2.64-1.355 4.318.735 1.282 3.166.971 4.624.74l.305.001c1.458.231 3.845.541 4.579-.742.961-1.677-.394-2.931-1.355-4.318-1.593-2.298-1.867-2.567-3.381-2.685Z" />
    </svg>
  ))
)`
  margin: 0 0.04em;
  height: 0.9em;
`;

const U = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="112.959 228.599 32.5 61.681"
      className={className}
    >
      <path d="M112.959 268.759v-41.16h10.26v42.445c0 5.787.64 10.973 5.99 10.973 5.35 0 6.06-5.186 6.06-10.973v-42.445h10.19v41.17c0 12.775-3.35 20.511-16.25 20.511s-16.25-7.736-16.25-20.511v-.01Z" />
    </svg>
  ))
)`
  margin: 0 0.045em;
  height: 0.88em;
`;

const F = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="151.339 228.766 29.16 60.727"
      className={className}
    >
      <path d="M180.499 238.653v-10.887h-29.16v60.727h10.44v-24.92h14.16V252.78h-14.16v-14.117h18.71l.01-.01Z" />
    </svg>
  ))
)`
  margin: 0 0.045em;
  height: 0.87em;
`;

const L = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="186.379 228.709 28.36 63.221"
      className={className}
    >
      <path d="M196.819 278.992v-51.283h-10.44v61.711c9.49.348 18.94.856 28.36 1.51v-10.871c-5.95-.422-11.93-.771-17.91-1.067h-.01Z" />
    </svg>
  ))
)`
  margin: 0 0.04em;
  height: 0.9em;
`;

const I2 = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="1238.756 726.378 34.9 214.809"
      className={className}
    >
      <path d="m1238.797 938.72-.041-212.342 34.9.027-.026 214.782c-11.851-1.35-25.356-2.452-34.833-2.467Z" />
    </svg>
  ))
)`
  margin: 0 0.045em;
  height: 0.915em;
`;

const X = styled(
  forwardRef<SVGSVGElement, { className?: string }>(({ className }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="1300.963 726.277 130.928 233.985"
      className={className}
    >
      <path d="m1300.963 943.433 46.616-107.072-42.048-109.888 37.981-.061s21.634 54.591 23.99 61.266c3.302-8.471 25.64-61.362 25.64-61.362l38.632-.039-46.011 111.46 46.128 122.525c-17.501-3.259-25.265-4.37-39.597-6.65 0 0-24.067-62.988-26.289-68.594-3.303 8.472-26.385 62.576-26.385 62.576-13.635-1.556-28.273-3.72-38.657-4.161Z" />
    </svg>
  ))
)`
  margin: 0 0em 0 0.055em;
  height: 1em;
`;

export const LogoGlyphs = forwardRef<LogoHandle | null, HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const mRef = useRef<SVGSVGElement>(null);
    const iRef = useRef<SVGSVGElement>(null);
    const aRef = useRef<SVGSVGElement>(null);
    const uRef = useRef<SVGSVGElement>(null);
    const fRef = useRef<SVGSVGElement>(null);
    const lRef = useRef<SVGSVGElement>(null);
    const i2Ref = useRef<SVGSVGElement>(null);
    const xRef = useRef<SVGSVGElement>(null);

    useImperativeHandle<LogoHandle | null, LogoHandle | null>(ref, () => {
      // Return null if any ref is not initialized
      if (
        !mRef.current ||
        !iRef.current ||
        !aRef.current ||
        !uRef.current ||
        !fRef.current ||
        !lRef.current ||
        !i2Ref.current ||
        !xRef.current
      ) {
        return null;
      }

      return {
        m: mRef.current,
        i: iRef.current,
        a: aRef.current,
        u: uRef.current,
        f: fRef.current,
        l: lRef.current,
        i2: i2Ref.current,
        x: xRef.current,
      };
    });

    return (
      <LogoText {...props}>
        <M ref={mRef} />
        <I ref={iRef} />
        <A ref={aRef} />
        <U ref={uRef} />
        <F ref={fRef} />
        <L ref={lRef} />
        <I2 ref={i2Ref} />
        <X ref={xRef} />
      </LogoText>
    );
  }
);

LogoGlyphs.displayName = 'LogoGlyphs';
