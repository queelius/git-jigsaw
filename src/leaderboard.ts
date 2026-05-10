import type { PuzzleState, PlaceEvent } from './puzzle';

export interface ActorStats {
  actor: string;
  pieces: number;
  firstPlacement: { piece: number; ts: string };
  lastPlacement:  { piece: number; ts: string };
}

export interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;
  contributors: number;
  closedItOut: string;
  rows: ActorStats[];
}

export function buildLeaderboard(state: PuzzleState, gridSize: number): LeaderboardData {
  const events = [...state.validEvents].sort((a, b) => a.ts.localeCompare(b.ts));
  const byActor = new Map<string, PlaceEvent[]>();
  for (const e of events) {
    const arr = byActor.get(e.actor) ?? [];
    arr.push(e);
    byActor.set(e.actor, arr);
  }
  const rows: ActorStats[] = [];
  for (const [actor, arr] of byActor) {
    rows.push({
      actor,
      pieces: arr.length,
      firstPlacement: { piece: arr[0].piece, ts: arr[0].ts },
      lastPlacement:  { piece: arr.at(-1)!.piece, ts: arr.at(-1)!.ts },
    });
  }
  rows.sort((a, b) =>
    b.pieces - a.pieces ||
    a.firstPlacement.ts.localeCompare(b.firstPlacement.ts),
  );
  const startedAt = events[0]?.ts ?? '';
  const solvedAt = events.at(-1)?.ts ?? '';
  return {
    solvedAt,
    startedAt,
    durationMs: startedAt && solvedAt ? new Date(solvedAt).getTime() - new Date(startedAt).getTime() : 0,
    totalPieces: gridSize * gridSize,
    contributors: byActor.size,
    closedItOut: events.at(-1)?.actor ?? '',
    rows,
  };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function renderLeaderboard(data: LeaderboardData, week: string, dataRepo: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'jigsaw-leaderboard';

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = `Solved ${week} in ${formatDuration(data.durationMs)}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${data.contributors} contributors · ${data.totalPieces} pieces`;
  header.append(title, meta);

  const ol = document.createElement('ol');
  ol.className = 'rows';
  data.rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.rank = String(i + 1);
    const actor = document.createElement('span');
    actor.className = 'actor';
    actor.textContent = row.actor;
    const pieces = document.createElement('span');
    pieces.className = 'pieces';
    pieces.textContent = `${row.pieces} pieces`;
    const span = document.createElement('span');
    span.className = 'span';
    span.textContent = `first ${row.firstPlacement.piece} · last ${row.lastPlacement.piece}`;
    li.append(actor, pieces, span);
    if (row.actor === data.closedItOut) {
      const badge = document.createElement('span');
      badge.className = 'badge closed-it-out';
      badge.title = 'Placed the final piece';
      badge.textContent = '🧩';
      li.appendChild(badge);
    }
    ol.appendChild(li);
  });

  const footer = document.createElement('footer');
  footer.className = 'actions';
  footer.append(
    extLink(`https://github.com/${dataRepo}/commits/main/jigsaw/${week}`, 'View git log'),
    extLink(`https://raw.githubusercontent.com/${dataRepo}/main/jigsaw/${week}/source.png`, 'Download source.png'),
  );

  section.append(header, ol, footer);
  return section;
}

function extLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
