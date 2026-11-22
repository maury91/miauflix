import type { server as english } from '../en/server';
import type { Translation } from '../types';

export const server: Translation<typeof english> = {
  'server.noAnswer':
    'Adresu {address} neatsiliepė joks „Miauwatch“ serveris. Patikrinkite adresą ir bandykite dar kartą.',
  'server.typeAddress': 'Įveskite serverio adresą, pvz., 192.168.1.10:3000.',
  'server.title': 'Prisijungti prie „Miauwatch“ serverio',
  'server.lastDown':
    '{address} neatsiliepia. Televizorius vėl prisijungs, kai serveris pradės veikti.',
  'server.needsServer': 'Pasirinkite, prie kurio „Miauwatch“ serverio prijungti televizorių.',
  'server.onNetwork': 'Jūsų tinkle',
  'server.servers': 'Serveriai',
  'server.lastUsed': '(paskutinis naudotas)',
  'server.looking': 'Ieškoma serverių…',
  'server.noneFound':
    'Serverių nerasta. Patikrinkite, ar serveris ir televizorius prijungti prie to paties tinklo.',
  'server.pick': 'Pasirinkite serverį, prie kurio norite prisijungti.',
  'server.searchAgain': 'Ieškoti dar kartą',
  'server.address': 'Serverio adresas',
  'server.connect': 'Prisijungti',
  'server.orType': 'Arba įveskite serverio adresą',
};
