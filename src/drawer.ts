export type DrawerState = 'peek' | 'half' | 'full';

const ORDER: DrawerState[] = ['peek', 'half', 'full'];

type ChangeListener = (s: DrawerState) => void;

export class Drawer {
  private root: HTMLElement;
  private body: HTMLElement;
  private handle: HTMLElement;
  private listeners = new Set<ChangeListener>();
  state: DrawerState = 'peek';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'jigsaw-drawer drawer-peek';
    this.handle = document.createElement('button');
    this.handle.className = 'jigsaw-drawer-handle';
    this.handle.setAttribute('aria-label', 'Toggle drawer');
    this.handle.addEventListener('click', () => {
      if (this.state === 'peek') this.expand();
      else this.collapse();
    });
    this.body = document.createElement('div');
    this.body.className = 'jigsaw-drawer-body';
    this.root.append(this.handle, this.body);
    host.appendChild(this.root);
    this.installSwipe();
  }

  expand(): void {
    const idx = ORDER.indexOf(this.state);
    if (idx < ORDER.length - 1) this.setState(ORDER[idx + 1]);
  }

  collapse(): void {
    const idx = ORDER.indexOf(this.state);
    if (idx > 0) this.setState(ORDER[idx - 1]);
  }

  setContent(child: HTMLElement): void {
    this.body.replaceChildren(child);
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: DrawerState): void {
    this.state = s;
    this.root.classList.remove('drawer-peek', 'drawer-half', 'drawer-full');
    this.root.classList.add(`drawer-${s}`);
    for (const fn of this.listeners) fn(s);
  }

  private installSwipe(): void {
    let startY: number | null = null;
    this.handle.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 30) {
        if (dy < 0) this.expand();
        else this.collapse();
        startY = e.clientY;
      }
    });
    const end = () => { startY = null; };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }
}
