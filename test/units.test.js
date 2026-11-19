// -----------------------------------------------------------------------------
// Unit tests of the pure parts: the address and the board list typed by the
// user, the parsing of real Deck answers, the counters, the search by id or
// name, the due dates typed in a scene, the client's errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, normalizeConfig, parseBoardList, parseServerUrl } from '../src/config.js';
import {
  findByIdOrName,
  localDay,
  localTime,
  parseBoards,
  parseStacks,
  summarize,
} from '../src/deck/model.js';
import { DeckClient, DeckError } from '../src/deck/client.js';
import { START } from './helpers/world.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/deck/${name}.json`, import.meta.url), 'utf8'));

test('the address: bare host, copied browser URL, sub-path, credentials refused', () => {
  assert.equal(parseServerUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(
    parseServerUrl(' https://cloud.example.org/index.php/apps/deck/board/3 '),
    'https://cloud.example.org',
  );
  assert.equal(
    parseServerUrl('https://example.org/nextcloud/apps/deck/'),
    'https://example.org/nextcloud',
  );
  assert.equal(parseServerUrl('https://example.org/nextcloud/'), 'https://example.org/nextcloud');
  assert.equal(parseServerUrl('https://example.org/login'), 'https://example.org');
  assert.equal(parseServerUrl('https://user:pass@example.org'), null, 'no credentials');
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the followed boards and the defaults', () => {
  assert.deepEqual(parseBoardList(' Maison ; Courses,,Maison\n'), ['Maison', 'Courses']);
  const config = normalizeConfig({ url: 'x.example', password: ' abcde-fghij \n' });
  assert.equal(config.password, 'abcde-fghij', 'the blanks of a copy and paste go');
  assert.equal(config.language, DEFAULT_CONFIG.language);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ poll_interval: '42' }).pollIntervalMs, 300_000);
});

test('real boards: the archived and deleted ones are left out', () => {
  assert.deepEqual(parseBoards(fixture('real-boards')), [
    { id: '2', name: 'Maison' },
    { id: '3', name: 'Courses' },
  ]);
  const deleted = fixture('real-boards');
  deleted[2].deletedAt = 1795119677;
  assert.deepEqual(
    parseBoards(deleted).map((board) => board.name),
    ['Maison'],
  );
  assert.deepEqual(parseBoards({}), []);
});

test('a real board: lists by order (an empty one has no cards key), done cards', () => {
  const raw = fixture('real-stacks-maison');
  assert.equal(
    raw.find((stack) => stack.title === 'Vide').cards,
    undefined,
    'as the server answers',
  );
  const board = parseStacks('2', raw);
  assert.deepEqual(
    board.lists.map((list) => list.name),
    ['À faire', 'Fait', 'En cours', 'Vide'],
  );
  assert.equal(board.cards.length, 8);
  const done = board.cards.find((card) => card.name === 'Changer les draps');
  assert.equal(done.open, false);
  assert.equal(done.boardId, '2');
  assert.equal(done.listId, '7');
  const open = board.cards.find((card) => card.name === 'Arroser les plantes');
  assert.equal(open.open, true);
  assert.equal(open.dueAt, Date.UTC(2026, 10, 19, 22, 30));
  assert.equal(open.createdAt, 1795119615000);
  const old = parseStacks('2', [{ id: 1, title: 'A', cards: [{ id: 9, title: 'x' }] }]);
  assert.equal(old.cards[0].open, true, 'no done field (Deck < 1.13): open');
});

test('the counters of a day', () => {
  const { cards } = parseStacks('2', fixture('real-stacks-maison'));
  const summary = summarize(cards, { now: START, day: localDay(START, 'Europe/Paris') });
  assert.equal(summary.open, 6);
  assert.equal(summary.overdue, 2);
  assert.equal(summary.dueToday, 2);
  assert.equal(summary.next.name, 'Arroser les plantes');
  assert.equal(summary.perList.get('7'), 2, 'a list counts its done cards too');
  assert.deepEqual(
    summary.agenda.map((card) => card.name),
    ['Sortir les poubelles', 'Appeler le plombier', 'Arroser les plantes'],
  );
});

test('find by id or exact name', () => {
  const items = [
    { id: '2', name: 'Tâches de la maison' },
    { id: '12', name: 'Courses' },
    { id: '13', name: 'courses ' },
  ];
  assert.equal(findByIdOrName(items, 'taches  DE la maison').item.id, '2');
  assert.equal(findByIdOrName(items, '#2').item.name, 'Tâches de la maison');
  assert.equal(findByIdOrName(items, 'Courses').reason, 'ambiguous');
  assert.equal(findByIdOrName(items, ' ').reason, 'empty');
  assert.equal(findByIdOrName(items, 'Jardin').reason, 'not_found');
});

test('local wall-clock times, across a DST change', () => {
  // 25/10/2026: Paris goes back from UTC+2 to UTC+1 at 03:00.
  assert.equal(
    new Date(localTime(2026, 10, 24, 18, 0, 'Europe/Paris')).toISOString(),
    '2026-10-24T16:00:00.000Z',
  );
  assert.equal(
    new Date(localTime(2026, 10, 25, 12, 0, 'Europe/Paris')).toISOString(),
    '2026-10-25T11:00:00.000Z',
  );
  assert.equal(
    new Date(localTime(2026, 3, 29, 12, 0, 'Europe/Paris')).toISOString(),
    '2026-03-29T10:00:00.000Z',
  );
});

test('the client: Basic authentication and the OCS header, errors by kind', async () => {
  const seen = [];
  const answer = (status, body) => async (url, options) => {
    seen.push({ url, options });
    return { status, headers: {}, body: typeof body === 'string' ? body : JSON.stringify(body) };
  };
  const client = (request) =>
    new DeckClient({ url: 'http://x/nc', username: 'alice', password: 'p-w', request });
  assert.deepEqual(await client(answer(200, [])).boards(), []);
  assert.equal(seen[0].url, 'http://x/nc/index.php/apps/deck/api/v1.0/boards');
  assert.equal(seen[0].options.headers.authorization, `Basic ${btoa('alice:p-w')}`);
  assert.equal(seen[0].options.headers['ocs-apirequest'], 'true');
  await assert.rejects(client(answer(401, { message: '' })).boards(), { kind: 'auth' });
  await assert.rejects(client(answer(404, '<!DOCTYPE html>')).boards(), { kind: 'not_deck' });
  await assert.rejects(client(answer(404, { message: 'x' })).boards(), { kind: 'not_deck' });
  await assert.rejects(client(answer(200, { ocs: {} })).boards(), { kind: 'not_deck' });
  await assert.rejects(client(answer(403, { message: 'Permission denied' })).stacks('9'), {
    kind: 'forbidden',
  });
  await assert.rejects(
    client(answer(400, { status: 400, message: 'title must be provided' })).createCard('1', '2', {
      title: '',
    }),
    (err) => err instanceof DeckError && err.kind === 'http' && /title must/.test(err.message),
  );
  await assert.rejects(client(answer(429, {})).boards(), { kind: 'rate_limit' });
  await assert.rejects(client(answer(503, '<html>')).boards(), { kind: 'maintenance' });
  await assert.rejects(client(answer(302, '')).boards(), { kind: 'redirect' });
  const tls = async () => {
    throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  };
  await assert.rejects(client(tls).boards(), { kind: 'tls' });
});
