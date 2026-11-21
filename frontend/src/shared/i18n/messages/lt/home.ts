import type { home as english } from '../en/home';
import type { Translation } from '../types';

export const home: Translation<typeof english> = {
  'home.loadingCategories': 'Įkeliamos kategorijos…',
  'home.categoriesFailed': 'Nepavyko įkelti kategorijų.',
  'home.titleFailedHeading': 'Nepavyko įkelti šio kūrinio',
  'home.titleFailed': 'Nepavyko įkelti šio kūrinio.',
  'home.loadingTitle': 'Įkeliamas kūrinys…',
  'home.continueWatching': 'Tęsti peržiūrą',
  'home.previousItems': 'Ankstesni kategorijos „{category}“ kūriniai',
  'home.nextItems': 'Kiti kategorijos „{category}“ kūriniai',
  'home.loadFailed': 'Nepavyko įkelti turinio.',
  'home.nothingHere': 'Čia kol kas nėra kūrinių.',
  'home.navigation': 'Pradžios meniu',
  'home.profile': 'Profilis',
  'home.profileWatching': 'Profilis „{name}“',
  'home.settings': 'Nustatymai',
  'home.notifications': 'Pranešimai',
  'home.unread': 'Neperskaityti: {count}',
  'home.area.configuration': 'Konfigūracija',
  'home.area.storage': 'Saugykla',
  'home.area.sources': 'Šaltiniai',
  'home.area.server': 'Keisti serverį',
  'home.areaDescription.configuration': 'Serverio nustatymai ir integracijos',
  'home.areaDescription.storage': 'Atsisiuntimai ir jų užimama vieta',
  'home.areaDescription.sources':
    'Tvarkykite šaltinius ir pasirinkite, kuriuos tikrinti pirmiausia',
  'home.noSource': 'Nėra šaltinio',
  'home.checking': 'Tikrinama…',
};
