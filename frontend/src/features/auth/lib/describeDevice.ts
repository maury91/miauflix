import { t } from '@shared/i18n';
export interface DeviceDescription {
  kind: 'tv' | 'phone' | 'computer' | 'unknown';
  /** A short name for people, e.g. "Samsung TV" or "Chrome on macOS". */
  name: string;
}

const TVS: Array<[RegExp, string]> = [
  [/Tizen|SMART-TV.*Samsung|SamsungBrowser.*TV/i, 'Samsung TV'],
  [/Web0S|webOS|NetCast/i, 'LG TV'],
  [/AFT[A-Z]|Fire TV/i, 'Fire TV'],
  [/Android TV|GoogleTV|BRAVIA/i, 'Android TV'],
  [/AppleTV|tvOS/i, 'Apple TV'],
  [/SMART-TV|SmartTV|HbbTV/i, 'Smart TV'],
];

const SYSTEMS: Array<[RegExp, string, DeviceDescription['kind']]> = [
  [/iPhone/i, 'iPhone', 'phone'],
  [/iPad/i, 'iPad', 'phone'],
  [/Android/i, 'Android', 'phone'],
  [/Mac OS X|Macintosh/i, 'macOS', 'computer'],
  [/Windows/i, 'Windows', 'computer'],
  [/CrOS/i, 'ChromeOS', 'computer'],
  [/Linux/i, 'Linux', 'computer'],
];

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/OPR\//, 'Opera'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** What kind of device asked to sign in, from its user agent. */
export function describeDevice(userAgent: string | null | undefined): DeviceDescription {
  if (!userAgent) return { kind: 'unknown', name: t('auth.newDevice') };
  const tv = TVS.find(([pattern]: [RegExp, string]) => pattern.test(userAgent));
  if (tv) return { kind: 'tv', name: tv[1] };
  const system = SYSTEMS.find(([pattern]: [RegExp, string, DeviceDescription['kind']]) =>
    pattern.test(userAgent)
  );
  const browser = BROWSERS.find(([pattern]: [RegExp, string]) => pattern.test(userAgent));
  if (!system) return { kind: 'unknown', name: browser?.[1] ?? t('auth.newDevice') };
  return {
    kind: system[2],
    name: browser ? t('auth.browserOn', { browser: browser[1], system: system[1] }) : system[1],
  };
}
