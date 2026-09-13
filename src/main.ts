import './styles/base.css';
import './styles/screens.css';
import { App } from './app/App';
import { createFeedback } from './app/feedback';
import { S } from './app/strings';
import { Haptics } from './audio/haptics';
import { Sfx } from './audio/sfx';

/*
 * Nothing here reports anywhere: the app has no network, no analytics and no
 * crash service, by design. These exist so a failure lands in the console with
 * a stack rather than vanishing — several promises in the app are deliberately
 * fire-and-forget, and an unhandled rejection is otherwise silent.
 */
window.addEventListener('error', (event) => {
  console.error('Uncaught error', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection', event.reason);
});

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app not found');

/*
 * Boot is synchronous all the way down: settings, progress, and — when a saved
 * board is resumed — generating that level. A throw anywhere in there used to
 * leave an empty page with no explanation and no way forward.
 */
try {
  const app = new App({ root });
  app.setFeedback(
    createFeedback(new Sfx(), new Haptics(), () => app.currentSettings),
  );
  app.start();
} catch (error) {
  console.error('Failed to start', error);
  root.textContent = S.bootError;
}
