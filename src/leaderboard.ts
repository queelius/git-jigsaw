import type { PuzzleState, PlaceEvent } from './puzzle';
import { isCanonicalSolved } from './completion';

export interface ActorStats {
  actor: string;
  placements: number;
  finalPieces: number;
  firstPlacement: { piece: number; ts: string };
  lastPlacement: { piece: number; ts: string };
}

export interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;
  totalPlacements: number;
  contributors: number;
  closedItOut: string;
  rows: ActorStats[];
}

export function buildLeaderboard(state: PuzzleState): LeaderboardData {
  const placeEvents = state.history.filter((e): e is PlaceEvent => e.op === 'place');
  const sorted = [...placeEvents].sort((a, b) => a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha));

  const byActor = new Map<string, PlaceEvent[]>();
  for (const e of sorted) {
    const arr = byActor.get(e.actor) ?? [];
    arr.push(e);
    byActor.set(e.actor, arr);
  }

  // Final-piece ownership
  const finalCounts = new Map<string, number>();
  for (const [, p] of state.placements) {
    finalCounts.set(p.actor, (finalCounts.get(p.actor) ?? 0) + 1);
  }

  const rows: ActorStats[] = [];
  for (const [actor, arr] of byActor) {
    rows.push({
      actor,
      placements: arr.length,
      finalPieces: finalCounts.get(actor) ?? 0,
      firstPlacement: { piece: arr[0].piece, ts: arr[0].ts },
      lastPlacement: { piece: arr.at(-1)!.piece, ts: arr.at(-1)!.ts },
    });
  }

  rows.sort((a, b) =>
    b.finalPieces - a.finalPieces ||
    b.placements - a.placements ||
    a.firstPlacement.ts.localeCompare(b.firstPlacement.ts),
  );

  const startedAt = sorted[0]?.ts ?? '';
  const solvedAt = sorted.at(-1)?.ts ?? '';

  // closedItOut: the last place event's actor when canonical-solved is true
  let closedItOut = '';
  if (isCanonicalSolved(state)) {
    closedItOut = sorted.at(-1)?.actor ?? '';
  }

  return {
    solvedAt,
    startedAt,
    durationMs: startedAt && solvedAt ? new Date(solvedAt).getTime() - new Date(startedAt).getTime() : 0,
    totalPieces: state.gridSize * state.gridSize,
    totalPlacements: sorted.length,
    contributors: byActor.size,
    closedItOut,
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

function extLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function renderLeaderboard(data: LeaderboardData, week: string, dataRepo: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'jigsaw-leaderboard';

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = `Solved ${week} in ${formatDuration(data.durationMs)}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const placementsNote = data.totalPlacements > data.totalPieces ? ` · ${data.totalPlacements} placements` : '';
  meta.textContent = `${data.contributors} contributors · ${data.totalPieces} pieces${placementsNote}`;
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
    const placements = document.createElement('span');
    placements.className = 'pieces';
    const finalNote = row.placements > row.finalPieces ? ` (${row.finalPieces} final)` : '';
    placements.textContent = `${row.placements} placements${finalNote}`;
    li.append(actor, placements);
    if (row.actor === data.closedItOut) {
      const badge = document.createElement('span');
      badge.className = 'badge closed-it-out';
      badge.title = 'Placed the final canonical piece';
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
