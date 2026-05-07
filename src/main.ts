import { PuzzleState, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore, type StoreLike } from './store-config';

function currentWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function buildShell(root: HTMLElement): { headerEl: HTMLElement; canvas: HTMLCanvasElement; trayEl: HTMLElement } {
  const headerEl = document.createElement('header');
  headerEl.className = 'jigsaw-header';
  const canvas = document.createElement('canvas');
  canvas.className = 'jigsaw-board';
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const trayEl = document.createElement('div');
  trayEl.className = 'jigsaw-tray';
  root.replaceChildren(headerEl, canvas, trayEl);
  return { headerEl, canvas, trayEl };
}

function renderTray(trayEl: HTMLElement, state: PuzzleState, store: StoreLike, week: string, gridSize: number, onAfterPlace: () => void): void {
  const actor = store.currentActor() ?? 'guest';
  const t = new Tray(state, actor, gridSize);
  const buttons = t.unplaced().map((piece) => {
    const btn = document.createElement('button');
    btn.className = 'jigsaw-piece';
    btn.dataset.piece = piece.toString();
    btn.textContent = piece.toString().padStart(3, '0');
    btn.addEventListener('click', async () => {
      const slot: [number, number] = [Math.floor(piece / gridSize), piece % gridSize];
      await attemptPlace({ piece, slot, rotation: 0, gridSize, state, store, week });
      onAfterPlace();
    });
    return btn;
  });
  trayEl.replaceChildren(...buttons);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('jigsaw-root');
  if (!root) throw new Error('jigsaw-root not found');
  const { headerEl, canvas, trayEl } = buildShell(root);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const params = new URLSearchParams(location.search);
  const week = params.get('week') ?? currentWeek();

  const store = makeStore(week);
  await store.restoreSession();
  const assets = await loadAssets(__DATA_REPO__, week);
  const state = await loadInitialState(store, week, assets.gridSize);

  mountAuthBar(headerEl, { state, store, week, gridSize: assets.gridSize });

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed, assets.gridSize);
  const refreshTray = (): void => renderTray(trayEl, state, store, week, assets.gridSize, refreshTray);
  state.on('change', repaint);
  state.on('change', refreshTray);
  repaint();
  refreshTray();

  store.subscribe((events: Event[]) => {
    for (const e of events) state.applyEvent(e);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  const root = document.getElementById('jigsaw-root');
  if (root) root.textContent = `Failed to load jigsaw: ${err.message}`;
});
