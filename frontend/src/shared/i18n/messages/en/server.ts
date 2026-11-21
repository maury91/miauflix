import type { MessageSection } from '../types';

/** Finding the Miauflix server from the TV. */
export const server = {
  'server.noAnswer': 'No Miauflix server answers at {address}',
  'server.typeAddress': 'Type the address of your server, like 192.168.1.10:3000',
  'server.title': 'Connect to your Miauflix server',
  'server.lastDown': "{address} doesn't answer. The TV reconnects when it is back.",
  'server.needsServer': 'The TV needs to know where your Miauflix server is.',
  'server.onNetwork': 'On your network',
  'server.servers': 'Servers',
  'server.lastUsed': '(last used)',
  'server.looking': 'Looking for servers…',
  'server.noneFound': 'No server found. It has to be on the same network as the TV.',
  'server.pick': 'Pick your server.',
  'server.searchAgain': 'Search again',
  'server.address': 'Server address',
  'server.connect': 'Connect',
  'server.orType': 'Or type its address',
} satisfies MessageSection;
