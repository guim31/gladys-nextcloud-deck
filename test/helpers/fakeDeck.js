// -----------------------------------------------------------------------------
// An in-memory Nextcloud with the Deck app, answering the routes the
// integration calls the way the real server does (Basic authentication, 401
// `{"message":""}`, 403 "Permission denied" for a board the user does not
// see, 400 for a missing field, the HTML 404 page outside the app). Its
// starting data are real answers of Nextcloud 31.0.14 with Deck 1.15.12 in
// Docker (November 2026, test/fixtures/deck/real-*.json): three boards, one
// archived. "Maison" holds four lists and eight cards: two overdue, one due
// tonight, one tomorrow, one later, one undated, two marked done.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/deck/${name}.json`, import.meta.url), 'utf8'));

export const USERNAME = 'alice';
export const PASSWORD = 'Xk7pQ-2mRtv-9LsWe-4HbNc-8JyFa';

export const BOARD_ID = '2';
export const COURSES_ID = '3';
export const LISTS = Object.freeze({ TODO: '4', DONE: '5', EMPTY: '6', DOING: '7' });

const API = '/index.php/apps/deck/api/v1.0';

const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(value),
});
const denied = () => json(403, { status: 403, message: 'Permission denied' });

export class FakeDeck {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.boards = fixture('real-boards');
    this.stacks = new Map([
      [2, fixture('real-stacks-maison')],
      [3, fixture('real-stacks-courses')],
    ]);
    this.online = true;
    /** The user may read the boards, not edit them. */
    this.viewer = false;
    this.requests = [];
    this.nextId = 100;
  }

  allCards() {
    return [...this.stacks.values()].flat().flatMap((stack) => stack.cards ?? []);
  }

  card(idOrName) {
    return this.allCards().find((card) => String(card.id) === idOrName || card.title === idOrName);
  }

  stackOf(stackId) {
    for (const [boardId, stacks] of this.stacks) {
      const stack = stacks.find((item) => item.id === Number(stackId));
      if (stack) {
        return { boardId, stack };
      }
    }
    return null;
  }

  detach(card) {
    const { stack } = this.stackOf(card.stackId);
    stack.cards.splice(stack.cards.indexOf(card), 1);
    if (stack.cards.length === 0) {
      delete stack.cards; // as the real server: an empty list has no `cards`
    }
  }

  attach(card, stackId) {
    const { stack } = this.stackOf(stackId);
    card.stackId = stack.id;
    (stack.cards ??= []).push(card);
  }

  /** What the web app does when a card is dragged to another list. */
  move(cardName, stackId) {
    const card = this.card(cardName);
    this.detach(card);
    this.attach(card, stackId);
  }

  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const { pathname } = new URL(url);
    this.requests.push({ method, path: pathname });
    if (!pathname.startsWith(`${API}/`)) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: '<!DOCTYPE html>' };
    }
    const expected = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;
    if (headers.authorization !== expected) {
      return json(401, { message: '' });
    }
    const path = pathname.slice(API.length);
    const stacks = path.match(/^\/boards\/(\d+)\/stacks$/);
    const cards = path.match(/^\/boards\/(\d+)\/stacks\/(\d+)\/cards$/);
    const card = path.match(/^\/boards\/(\d+)\/stacks\/(\d+)\/cards\/(\d+)(\/reorder)?$/);
    const visible = (boardId) =>
      this.boards.some((board) => board.id === Number(boardId) && !board.deletedAt) &&
      this.stacks.has(Number(boardId));

    if (method === 'GET' && path === '/boards') {
      return json(200, this.boards);
    }
    if (method === 'GET' && stacks) {
      return visible(stacks[1]) ? json(200, this.stacks.get(Number(stacks[1]))) : denied();
    }
    if (method === 'POST' && cards) {
      const found = this.stackOf(cards[2]);
      if (!visible(cards[1]) || !found || found.boardId !== Number(cards[1]) || this.viewer) {
        return denied();
      }
      if (typeof body?.title !== 'string' || body.title === '') {
        return json(400, { status: 400, message: 'title must be provided and must be not empty' });
      }
      const created = {
        id: this.nextId++,
        title: body.title,
        description: body.description ?? '',
        stackId: found.stack.id,
        type: body.type ?? 'plain',
        lastModified: Math.floor(this.now() / 1000),
        createdAt: Math.floor(this.now() / 1000),
        owner: { primaryKey: USERNAME, uid: USERNAME, displayname: USERNAME, type: 0 },
        order: body.order ?? 999,
        archived: false,
        done: null,
        duedate: body.duedate
          ? new Date(body.duedate).toISOString().replace('.000Z', '+00:00')
          : null,
        deletedAt: 0,
      };
      this.attach(created, found.stack.id);
      return json(200, created);
    }
    if (card) {
      const target = this.allCards().find((item) => item.id === Number(card[3]));
      // The full update applies the list of its URL (CardService::update):
      // a stale list puts the card back there.
      const fullUpdate = method === 'PUT' && !card[4];
      if (!visible(card[1]) || !target || (!fullUpdate && target.stackId !== Number(card[2]))) {
        return denied();
      }
      if (method === 'GET' && !card[4]) {
        return json(200, target);
      }
      if (this.viewer) {
        return denied();
      }
      if (method === 'PUT' && card[4]) {
        const to = this.stackOf(body?.stackId);
        if (!to || to.boardId !== Number(card[1])) {
          return denied();
        }
        this.detach(target);
        this.attach(target, to.stack.id);
        target.order = body.order;
        return json(200, to.stack.cards);
      }
      if (method === 'PUT') {
        for (const key of ['title', 'type', 'owner']) {
          if (!body?.[key]) {
            return json(400, { status: 400, message: `${key} must be provided` });
          }
        }
        if (target.stackId !== Number(card[2])) {
          this.detach(target);
          this.attach(target, card[2]);
        }
        Object.assign(target, {
          title: body.title,
          type: body.type,
          description: body.description ?? '',
          order: body.order ?? 0,
          duedate: body.duedate ?? null,
          ...('done' in body ? { done: body.done } : {}),
        });
        return json(200, target);
      }
    }
    return json(404, { status: 404, message: 'Not found' });
  }
}

/** The network: one fake server per base URL; anything else does not answer. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
