declare module '~icons/*' {
  import type { ComponentType, SVGProps } from 'react';
  const Icon: ComponentType<SVGProps<SVGSVGElement>>;
  export default Icon;
}

/**
 * An icon's SVG markup (unplugin-icons `?raw`), for pictures drawing it with canvas 2D. Per icon
 * set: a pattern with a longer prefix than `~icons/*` wins.
 */
declare module '~icons/mdi/*?raw' {
  const svg: string;
  export default svg;
}
