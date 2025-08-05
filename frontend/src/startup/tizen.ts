import './utils/polyfillQMicroTask';

import type { TVInputDeviceKeyName } from '../tizen';
import { loadReactScripts } from './utils/loadReactScripts';
import { querySubNet } from './utils/querySubNet';

const appSupportedKeys: TVInputDeviceKeyName[] = [
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaPlayPause',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'MediaRewind',
  'MediaFastForward',
  'Exit',
  'Menu',
  'Info',
  'Search',
  'Caption',
];

function getIpAddress(): Promise<string> {
  return new Promise((resolve, reject) => {
    window.tizen.systeminfo.getPropertyValue('NETWORK', ({ networkType }) => {
      switch (networkType) {
        case 'ETHERNET':
          window.tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', ({ ipAddress }) => {
            resolve(ipAddress);
          });
          break;
        case 'WIFI':
          window.tizen.systeminfo.getPropertyValue('WIFI_NETWORK', ({ ipAddress }) => {
            resolve(ipAddress);
          });
          break;
        default:
          reject('No network connection');
      }
    });
  });
}

function loadScript(src: string) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = src;
  document.body.append(script);
}

function registerRemoteKeys() {
  const supportedKeys = window.tizen.tvinputdevice.getSupportedKeys();
  supportedKeys
    .filter(key => appSupportedKeys.includes(key.name))
    .forEach(key => {
      window.tizen.tvinputdevice.registerKey(key.name);
      window.REMOTE_KEY_MAP[key.name] = key.code;
      window.INVERTED_REMOTE_KEY_MAP[key.code] = key.name;
    });
}

export async function startupTizen() {
  const myLocalIp = await getIpAddress();
  const subNet = myLocalIp.split('.').slice(0, 3).join('.');
  try {
    const backendAddress = await querySubNet(subNet);
    console.log('server found', backendAddress);
    window.API_URL = backendAddress;
    await loadReactScripts();
    loadScript('$WEBAPIS/webapis/webapis.js');
    registerRemoteKeys();
  } catch (err) {
    console.error('Server not found', err);
    // ToDo: Display a screen to enter server address manually and try again
  }
}

window.REMOTE_KEY_MAP = {};
window.INVERTED_REMOTE_KEY_MAP = {};
startupTizen();
