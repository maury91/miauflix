import type { integrations as english } from '../en/integrations';
import type { Translation } from '../types';

export const integrations: Translation<typeof english> = {
  'integrations.scanQr': 'Inquadra il codice QR',
  'integrations.orOpen': 'Oppure apri {url} e inserisci questo codice.',
  'integrations.scanLabel': 'Codice QR per collegare il tuo account Trakt',
  'integrations.code': 'Codice',
  'integrations.codeCopied': 'Codice copiato',
  'integrations.benefit.watchlist': 'Sincronizza la watchlist',
  'integrations.benefit.progress': 'Tieni traccia dei tuoi progressi',
  'integrations.benefit.recommendations': 'Ricevi consigli sui film',
  'integrations.withTrakt': 'Con Trakt puoi:',
  'integrations.benefits': 'Vantaggi di Trakt',
  'integrations.copyFailed': 'Impossibile copiare il codice. Inseriscilo a mano.',
  'integrations.startFailed': 'Impossibile avviare il collegamento con Trakt',
  'integrations.title': 'Collega Trakt',
  'integrations.description': 'Collega il tuo account Trakt a Miauflix.',
  'integrations.close': 'Chiudi la finestra di Trakt',
  'integrations.openTrakt': 'Apri Trakt',
  'integrations.copyCode': 'Copia codice',
  'integrations.letsGo': 'Iniziamo',
  'integrations.neverAsk': 'Non chiedere più',
};
