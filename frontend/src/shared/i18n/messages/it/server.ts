import type { server as english } from '../en/server';
import type { Translation } from '../types';

export const server: Translation<typeof english> = {
  'server.noAnswer': 'Nessun server Miauflix risponde a {address}',
  'server.typeAddress': 'Scrivi l’indirizzo del tuo server, ad esempio 192.168.1.10:3000',
  'server.title': 'Collegati al tuo server Miauflix',
  'server.lastDown': '{address} non risponde. La TV si ricollega quando torna disponibile.',
  'server.needsServer': 'La TV deve sapere dove si trova il tuo server Miauflix.',
  'server.onNetwork': 'Nella tua rete',
  'server.servers': 'Server',
  'server.lastUsed': '(ultimo usato)',
  'server.looking': 'Ricerca dei server…',
  'server.noneFound': 'Nessun server trovato. Deve essere nella stessa rete della TV.',
  'server.pick': 'Scegli il tuo server.',
  'server.searchAgain': 'Cerca di nuovo',
  'server.address': 'Indirizzo del server',
  'server.connect': 'Collegati',
  'server.orType': 'Oppure scrivi il suo indirizzo',
};
