// -----------------------------------------------------------------------------
// From the raw Deck answers to what Gladys shows: boards, lists and cards
// with their due time in milliseconds, and the counters of a local day (the
// time zone of Gladys, injected by the supervisor as TZ).
//
// Deck calls the columns "stacks" in its API and "lists" in its interface:
// the integration says lists, like the interface.
//
// Definitions, the same in the devices, the widget, the scene actions and the
// documentation:
//   - open card: a card not marked done (Deck 1.13+; archived and deleted
//     cards are never returned by the API);
//   - pending due date: the due date of an open card;
//   - overdue: an open card whose due date has passed;
//   - due today: an open card whose due date falls in the local day, passed
//     or not;
//   - next due date: the earliest pending due date still ahead.
// Ids are kept as strings (Deck's are integers): the same code as Planka's.
// -----------------------------------------------------------------------------

const time = (value) => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const idOf = (value) =>
  typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : Number.isInteger(value)
      ? String(value)
      : null;
const position = (value) => (Number.isFinite(value) ? value : Infinity);

/**
 * The boards the user sees, neither archived nor deleted, in Deck's order
 * (by id: the order of creation, as in its navigation).
 * @param {unknown} raw answer of GET /boards
 * @returns {Array<{ id: string, name: string }>}
 */
export function parseBoards(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((board) => idOf(board?.id) && board.archived !== true && !board.deletedAt)
    .map((board) => ({ id: idOf(board.id), name: text(board.title) || `#${board.id}` }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * The lists (stacks, by order) and the cards of a board. A list without
 * cards comes without its `cards` key.
 * @param {string} boardId
 * @param {unknown} raw answer of GET /boards/:id/stacks
 */
export function parseStacks(boardId, raw) {
  const stacks = (Array.isArray(raw) ? raw : []).filter(
    (stack) => idOf(stack?.id) && !stack.deletedAt,
  );
  const lists = stacks
    .map((stack) => ({
      id: idOf(stack.id),
      name: text(stack.title) || `#${stack.id}`,
      position: position(stack.order),
    }))
    .sort((a, b) => a.position - b.position || Number(a.id) - Number(b.id));
  const cards = stacks
    .flatMap((stack) =>
      (Array.isArray(stack.cards) ? stack.cards : []).map((card) => ({ card, stack })),
    )
    .filter(({ card }) => idOf(card?.id) && card.archived !== true && !card.deletedAt)
    .map(({ card, stack }) => ({
      id: idOf(card.id),
      name: text(card.title) || `#${card.id}`,
      boardId,
      listId: idOf(stack.id),
      // `done` holds the date the card was marked done, null when it is not
      // (absent before Deck 1.13: every card is open then).
      open: !card.done,
      dueAt: time(card.duedate),
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt * 1000 : null,
      position: position(card.order),
    }))
    .sort(
      (a, b) =>
        (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
        a.position - b.position ||
        Number(a.id) - Number(b.id),
    );
  return { lists, cards };
}

/** The due time that still matters: an open card's. */
export const pendingDue = (card) => (card.open && card.dueAt !== null ? card.dueAt : null);

// --- Local days -------------------------------------------------------------------

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
  return parts;
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** UTC instant of a local wall-clock time (in a DST overlap, one of the two). */
export function localTime(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Start and end (exclusive) of the local day holding `now`. */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const start = localMidnight(p.year, p.month, p.day, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

// --- Counters ---------------------------------------------------------------------

/**
 * Counters of one day, for a set of cards (one board, or every followed one).
 * @param {ReturnType<typeof parseBoard>['cards']} cards
 * @param {{ now: number, day: { start: number, end: number } }} options
 */
export function summarize(cards, { now, day }) {
  const open = cards.filter((card) => card.open);
  const dated = open
    .filter((card) => pendingDue(card) !== null)
    .sort((a, b) => a.dueAt - b.dueAt || Number(a.id) - Number(b.id));
  // Every card a list shows, done or not: the figure of its column.
  const perList = new Map();
  for (const card of cards) {
    perList.set(card.listId, (perList.get(card.listId) ?? 0) + 1);
  }
  return {
    open: open.length,
    overdue: dated.filter((card) => card.dueAt < now).length,
    dueToday: dated.filter((card) => card.dueAt >= day.start && card.dueAt < day.end).length,
    perList,
    next: dated.find((card) => card.dueAt >= now) ?? null,
    // What is left by tonight: overdue first, then today's, by due time.
    agenda: dated.filter((card) => card.dueAt < day.end),
  };
}

const fold = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Find an item by its id (`42`, `#42`, as Deck shows it in its addresses) or its exact name (case, accents and repeated blanks
 * ignored).
 * @template {{ id: string, name: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findByIdOrName(items, query) {
  const wanted = String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const number = wanted.match(/^#?(\d+)$/);
  if (number) {
    const byId = items.find((item) => item.id === number[1]);
    if (byId) {
      return { item: byId };
    }
  }
  const matches = items.filter((item) => fold(item.name) === fold(wanted));
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
