// -----------------------------------------------------------------------------
// Nextcloud Deck API client: the calls the integration needs, on the REST API
// v1.0 of the Deck app. Checked against a real Nextcloud 31.0.14 with Deck
// 1.15.12 in Docker, November 2026.
//
// Authentication: HTTP Basic with the Nextcloud username and an app password
// (Personal settings → Security → Devices & sessions), plus the
// `OCS-APIRequest: true` header. Nothing is kept between requests.
//
//   GET  /boards                                  Board[] (archived and deleted included)
//   GET  /boards/:b/stacks                        Stack[] with their cards (no archived card)
//   GET  /boards/:b/stacks/:s/cards/:c            Card
//   POST /boards/:b/stacks/:s/cards               Card (create)
//   PUT  /boards/:b/stacks/:s/cards/:c            Card (full update: marks it done)
//   PUT  /boards/:b/stacks/:s/cards/:c/reorder    Card[] (move to another list)
//
// Pitfalls found on the real server:
//   - A wrong password answers 401 `{"message":""}`, after a delay that grows
//     with the failed attempts (Nextcloud's brute-force protection), then 429.
//   - A board that does not exist, or that the user does not see, answers
//     403 "Permission denied", not 404.
//   - Without the Deck app, Nextcloud answers its HTML 404 page.
//   - The full update needs title, type and owner, and replaces the
//     description and the due date: the card is read just before.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const API_PATH = '/index.php/apps/deck/api/v1.0';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // wrong username or app password
  FORBIDDEN: 'forbidden', // the board is gone, or the user may not do this
  NOT_FOUND: 'not_found', // the card is gone
  NOT_DECK: 'not_deck', // something answers, but not the Deck API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: brute-force protection or a proxy's limit
  MAINTENANCE: 'maintenance', // 503: maintenance mode or an upgrade
  HTTP: 'http', // any other unexpected answer
});

export class DeckError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'DeckError';
    this.kind = kind;
    this.status = status;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new DeckError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new DeckError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

const id = (value) => encodeURIComponent(String(value));

export class DeckClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of Nextcloud, without trailing slash
   * @param {string} options.username
   * @param {string} options.password app password (or the account password)
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/deck/http.js)
   */
  constructor({ url, username, password, insecure = false, request }) {
    this.url = url;
    this.insecure = insecure;
    this.request = request ?? httpRequest;
    this.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  async call(path, { method = 'GET', json } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${API_PATH}${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: { authorization: this.authorization, 'ocs-apirequest': 'true' },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    let parsed;
    let parsedOk = true;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsedOk = false;
    }
    // The server's own message, short; it never echoes a secret.
    const said =
      parsedOk && typeof parsed?.message === 'string' && parsed.message
        ? ` ${parsed.message.slice(0, 200)}`
        : '';
    if (status === 429) {
      throw new DeckError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status === 503) {
      throw new DeckError(ERROR_KINDS.MAINTENANCE, 'HTTP 503', status);
    }
    if (status >= 300 && status < 400) {
      throw new DeckError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (status === 401) {
      throw new DeckError(ERROR_KINDS.AUTH, `HTTP 401${said}`, status);
    }
    if (!parsedOk) {
      // Nextcloud without Deck answers its HTML page, another server anything.
      throw new DeckError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_DECK : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status === 403) {
      throw new DeckError(ERROR_KINDS.FORBIDDEN, `HTTP 403${said}`, status);
    }
    if (status === 404) {
      throw new DeckError(ERROR_KINDS.NOT_FOUND, `HTTP 404${said}`, status);
    }
    if (status < 200 || status >= 300) {
      throw new DeckError(ERROR_KINDS.HTTP, `HTTP ${status}${said}`, status);
    }
    return parsed;
  }

  /** Every board the user sees (archived and deleted ones included). */
  async boards() {
    let data;
    try {
      data = await this.call('/boards');
    } catch (err) {
      // Another JSON API, or a path prefix missing from the address.
      if (err instanceof DeckError && err.kind === ERROR_KINDS.NOT_FOUND) {
        throw new DeckError(ERROR_KINDS.NOT_DECK, 'no Deck API', 404);
      }
      throw err;
    }
    if (!Array.isArray(data)) {
      throw new DeckError(ERROR_KINDS.NOT_DECK, 'no board list in /boards', 200);
    }
    return data;
  }

  /** The lists of a board with their cards. */
  async stacks(boardId) {
    const data = await this.call(`/boards/${id(boardId)}/stacks`);
    if (!Array.isArray(data)) {
      throw new DeckError(ERROR_KINDS.NOT_DECK, 'no list in /stacks', 200);
    }
    return data;
  }

  async card(boardId, stackId, cardId) {
    return this.call(`/boards/${id(boardId)}/stacks/${id(stackId)}/cards/${id(cardId)}`);
  }

  /** Create a card in a list; `duedate` an ISO string or omitted. */
  async createCard(boardId, stackId, { title, order, duedate }) {
    const json = { title, type: 'plain', order };
    if (duedate) {
      json.duedate = duedate;
    }
    return this.call(`/boards/${id(boardId)}/stacks/${id(stackId)}/cards`, {
      method: 'POST',
      json,
    });
  }

  /** Move a card to another list of its board, at `order`. */
  async moveCard(boardId, stackId, cardId, { toStackId, order }) {
    return this.call(`/boards/${id(boardId)}/stacks/${id(stackId)}/cards/${id(cardId)}/reorder`, {
      method: 'PUT',
      json: { stackId: Number(toStackId), order },
    });
  }

  /**
   * Mark a card done. The update replaces every field: the card is read
   * first, and sent back as it is, plus the date it is done.
   */
  async markDone(boardId, stackId, cardId, doneAt) {
    const card = await this.card(boardId, stackId, cardId);
    if (!card || typeof card.title !== 'string') {
      throw new DeckError(ERROR_KINDS.NOT_DECK, 'no card in /cards', 200);
    }
    const owner = typeof card.owner === 'string' ? card.owner : card.owner?.uid;
    // The list in the URL is applied by Deck: the card's own, as just read.
    const listId = card.stackId ?? stackId;
    return this.call(`/boards/${id(boardId)}/stacks/${id(listId)}/cards/${id(cardId)}`, {
      method: 'PUT',
      json: {
        title: card.title,
        type: card.type ?? 'plain',
        owner,
        description: card.description ?? '',
        order: card.order ?? 0,
        duedate: card.duedate ?? null,
        archived: card.archived === true,
        done: doneAt,
      },
    });
  }
}
