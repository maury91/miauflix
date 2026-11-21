import type { server as english } from '../en/server';
import type { Translation } from '../types';

export const server: Translation<typeof english> = {
  'server.noAnswer': 'Nessun server Miauflix risponde a {address}',
  'server.typeAddress': 'Inserisci l’indirizzo del server, per esempio 192.168.1.10:3000.',
  'server.title': 'Collegati al tuo server Miauflix',
  'server.lastDown':
    '{address} non risponde. La TV si ricollegherà quando il server sarà di nuovo online.',
  'server.needsServer': 'Scegli il server Miauflix a cui collegare la TV.',
  'server.onNetwork': 'Nella tua rete',
  'server.servers': 'Server',
  'server.lastUsed': '(ultimo usato)',
  'server.looking': 'Ricerca dei server…',
  'server.noneFound':
    'Nessun server trovato. Controlla che il server e la TV siano sulla stessa rete.',
  'server.pick': 'Scegli il tuo server.',
  'server.searchAgain': 'Cerca di nuovo',
  'server.address': 'Indirizzo del server',
  'server.connect': 'Collegati',
  'server.orType': 'Oppure inserisci l’indirizzo del server',
};
