/// <reference types="vite/client" />

declare module '~icons/*' {
  import { ComponentType, SVGProps } from 'react';
  const component: ComponentType<SVGProps<SVGSVGElement>>;
  export default component;
}
