import { startupTizen } from './startup/tizen';

const logo = document.getElementById('logo');
if (logo) {
  logo.style.display = '';
}
if ('tizen' in window) {
  startupTizen();
} else {
  console.log('Not a Tizen device');
}
