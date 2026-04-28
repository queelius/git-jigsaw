export function showToast(message: string, durationMs = 4000): void {
  let host = document.querySelector('.jigsaw-toast-host') as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.className = 'jigsaw-toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'jigsaw-toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.remove(), durationMs);
}
