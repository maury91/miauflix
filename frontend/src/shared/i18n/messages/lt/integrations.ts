import type { integrations as english } from '../en/integrations';
import type { Translation } from '../types';

export const integrations: Translation<typeof english> = {
  'integrations.scanQr': 'Nuskaitykite QR kodą',
  'integrations.orOpen': 'Arba atverkite {url} ir įveskite šį kodą.',
  'integrations.scanLabel': 'QR kodas „Trakt“ paskyrai susieti',
  'integrations.code': 'Kodas',
  'integrations.codeCopied': 'Kodas nukopijuotas',
  'integrations.benefit.watchlist': 'Sinchronizuokite sąrašą „Žiūrėti vėliau“',
  'integrations.benefit.progress': 'Stebėkite peržiūrų eigą',
  'integrations.benefit.recommendations': 'Gaukite filmų rekomendacijų',
  'integrations.withTrakt': 'Su „Trakt“ galite:',
  'integrations.benefits': '„Trakt“ privalumai',
  'integrations.copyFailed': 'Nepavyko nukopijuoti kodo. Įveskite jį ranka.',
  'integrations.startFailed': 'Nepavyko pradėti susiejimo su „Trakt“',
  'integrations.title': 'Susieti su „Trakt“',
  'integrations.description': 'Susiekite savo „Trakt“ ir „Miauflix“ paskyras.',
  'integrations.close': 'Užverti „Trakt“ langą',
  'integrations.openTrakt': 'Atverti „Trakt“',
  'integrations.copyCode': 'Kopijuoti kodą',
  'integrations.letsGo': 'Pradėti',
  'integrations.neverAsk': 'Daugiau nebeklausti',
};
