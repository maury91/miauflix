import type { MessageSection } from '../types';

/** Finding the Miauflix server from the TV. */
export const server = {
  'server.noAnswer': 'No Miauflix server responded at {address}. Check the address and try again.',
  'server.typeAddress': 'Enter your server address, for example 192.168.1.10:3000.',
  'server.title': 'Connect to your Miauflix server',
  'server.lastDown':
    "{address} isn't responding. The TV will reconnect when the server is back online.",
  'server.needsServer': 'Choose the Miauflix server your TV should connect to.',
  'server.onNetwork': 'On your network',
  'server.servers': 'Servers',
  'server.lastUsed': '(last used)',
  'server.looking': 'Looking for servers…',
  'server.noneFound': 'No servers found. Make sure your server and TV are on the same network.',
  'server.pick': 'Choose a server to connect.',
  'server.searchAgain': 'Search again',
  'server.address': 'Server address',
  'server.connect': 'Connect',
  'server.orType': 'Or enter the server address',
} satisfies MessageSection;
