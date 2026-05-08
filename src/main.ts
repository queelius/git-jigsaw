import { isSolved, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore, type StoreLike } from './store-config';
import { Drawer } from './drawer';
import { Dragger } from './dragger';
import { buildLeaderboard, renderLeaderboard } from './leaderboard';
import { fireConfetti } from './confetti';
import { pieceThumbnail, clearThumbnailCache } from './thumbnail';

function currentWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function buildShell(root: HTMLElement): { headerEl: HTMLElement; canvas: HTMLCanvasElement; drawerHost: HTMLElement } {
  const headerEl = document.createElement('header');
  headerEl.className = 'jigsaw-header';
  const canvas = document.createElement('canvas');
  canvas.className = 'jigsaw-board';
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const drawerHost = document.createElement('div');
  drawerHost.className = 'jigsaw-drawer-host';
  root.replaceChildren(headerEl, canvas, drawerHost);
  return { headerEl, canvas, drawerHost };
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('jigsaw-root');
  if (!root) throw new Error('jigsaw-root not found');
  const { headerEl, canvas, drawerHost } = buildShell(root);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const params = new URLSearchParams(location.search);
  const week = params.get('week') ?? currentWeek();
  const dataRepo = __DATA_REPO__;

  const store: StoreLike = makeStore(week);
  await store.restoreSession();
  const assets = await loadAssets(dataRepo, week);
  const state = await loadInitialState(store, week, assets.gridSize);
  const startedSolved = isSolved(state, assets.gridSize);
  let confettiAlreadyFired = false;

  mountAuthBar(headerEl, { state, store, week, gridSize: assets.gridSize });

  const drawer = new Drawer(drawerHost);
  const tray = new Tray(state, store.currentActor() ?? 'guest', assets.gridSize);

  const renderTray = (): void => {
    drawer.setContent(tray.render({
      source: assets.source,
      seed: assets.seed,
      rotationEnabled: assets.rotationEnabled,
      onRotate: () => renderTray(),
    }));
  };

  const renderLeaderboardContent = (): void => {
    const data = buildLeaderboard(state, assets.gridSize);
    drawer.setContent(renderLeaderboard(data, week, dataRepo));
  };

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed, assets.gridSize);

  const refresh = (): void => {
    repaint();
    if (isSolved(state, assets.gridSize)) {
      renderLeaderboardContent();
      if (!startedSolved && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    } else {
      renderTray();
    }
  };

  state.on('change', refresh);
  refresh();

  const dragger = new Dragger({
    board: canvas,
    gridSize: assets.gridSize,
    getRotation: (piece) => tray.rotationOf(piece),
    getThumbnail: (piece, rotation) =>
      pieceThumbnail(piece, rotation, assets.source, assets.seed, assets.gridSize),
    onAttempt: (piece, slot, rotation) =>
      attemptPlace({ piece, slot, rotation, gridSize: assets.gridSize, state, store, week }),
  });
  dragger.attach(document.body);

  store.subscribe((events: Event[]) => {
    for (const e of events) state.applyEvent(e);
  });

  drawer.on('change', (s) => {
    if (s === 'peek') clearThumbnailCache();
  });
}

bootstrap().catch((err) => {
  console.error(err);
  const root = document.getElementById('jigsaw-root');
  if (root) root.textContent = `Failed to load jigsaw: ${err.message}`;
});
