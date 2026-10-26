import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/notion.css';

const rootEl = document.getElementById('root');

function showBootError(error: unknown): void {
  if (!rootEl) {
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'mdotion-boot-error';
  pre.textContent = `MDotion failed to start.\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  rootEl.replaceChildren(pre);
}

window.addEventListener('error', (event) => {
  if (rootEl && !rootEl.querySelector('.mdotion-app')) {
    showBootError(event.error ?? event.message);
  }
});

if (rootEl) {
  try {
    createRoot(rootEl).render(<App />);
  } catch (error) {
    showBootError(error);
  }
}
