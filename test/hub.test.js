// -----------------------------------------------------------------------------
// The hub against the in-memory Deck (real answers of Nextcloud 31 with Deck
// 1.15): counters, followed boards, scene events, the scene actions and the
// error cases. The clock starts on 19/11/2026 at 21:30 in Paris.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  BOARD_ID,
  COURSES_ID,
  FakeDeck,
  LISTS,
  START,
  URL_1,
  boardId,
  createClock,
  createWorld,
} from './helpers/world.js';

const at = (day, h, m = 0, s = 0) => Date.UTC(2026, 10, day, h, m, s); // UTC, November 2026

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const counters = (w, id = BOARD_ID) => {
  const ids = boardId(w.gladys, id);
  return {
    open: w.fake.lastState(ids.feature('open')),
    dueToday: w.fake.lastState(ids.feature('due_today')),
    overdue: w.fake.lastState(ids.feature('overdue')),
    next: w.fake.lastState(ids.feature('next_due')),
  };
};

const keys = (w) => w.fake.sceneEvents.map((event) => `${event.key}:${event.data.card}`);

test('the fixtures start where the tests expect them', () => {
  assert.equal(new Date(START).toISOString(), '2026-11-19T20:30:00.000Z');
  assert.equal(URL_1, 'http://192.0.2.20:8080');
});

test('one device per board (not the archived one), its counters and its lists', async (t) => {
  const w = await world(t);
  assert.deepEqual(counters(w), {
    open: 6,
    dueToday: 2,
    overdue: 2,
    next: 'Arroser les plantes · Thu 19 Nov, 23:30',
  });
  const ids = boardId(w.gladys);
  const lists = [LISTS.TODO, LISTS.DONE, LISTS.DOING, LISTS.EMPTY].map((list) =>
    w.fake.lastState(ids.feature(`list-${list}`)),
  );
  assert.deepEqual(lists, [5, 1, 2, 0], 'a done card still sits in its list');
  const [device] = w.fake.discoveredDevices;
  assert.deepEqual(
    device.features.map((feature) => feature.name),
    [
      'Open cards',
      'Cards due today',
      'Overdue cards',
      'À faire',
      'Fait',
      'En cours',
      'Vide',
      'Next due date',
    ],
  );
  assert.equal(device.should_poll, false);
  assert.deepEqual(counters(w, COURSES_ID), {
    open: 2,
    dueToday: 0,
    overdue: 0,
    next: 'Lait · Fri 20 Nov, 10:00',
  });
  assert.deepEqual(
    w.fake.discoveredDevices.map((item) => item.name),
    ['Deck Maison', 'Deck Courses'],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the feature names and the next due date in the configured language', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  assert.equal(counters(w).next, 'Arroser les plantes · jeu. 19 nov., 23:30');
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Cartes ouvertes');
});

test('only the followed boards, by name or id; unknown ones are reported', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, boards: `courses; Atelier` } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Deck Courses'],
  );
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.en, /2 open card\(s\) in 1 followed board\(s\)\. Unknown board/);
  const byId = await world(t, { config: { ...BASE_CONFIG, boards: `#${BOARD_ID}` } });
  assert.equal(byId.fake.discoveredDevices.length, 1);
});

test('a list renamed keeps its feature', async (t) => {
  const w = await world(t);
  w.server.stacks.get(2).find((stack) => String(stack.id) === LISTS.TODO).title = 'Idées';
  await w.hub.rediscover();
  const ids = w.fake.discoveredDevices[0].features.map((feature) => feature.external_id);
  assert.ok(ids.includes(boardId(w.gladys).feature(`list-${LISTS.TODO}`)));
});

test('nothing fires at the first reading; a move fires once, with both lists', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, []);
  w.server.move('Ranger le garage', LISTS.DONE);
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(keys(w), ['card_moved:Ranger le garage']);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    card: 'Ranger le garage',
    card_id: '11',
    board: boardId(w.gladys).device,
    board_name: 'Maison',
    list: 'Fait',
    previous_list: 'En cours',
    due_date: '',
  });
  clock.advance(60_000);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1, 'not repeated');
});

test('a new card fires card_created once; one from the archive does not', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  clock.advance(60_000);
  const ok = await w.fake.sceneAction('add_card', { title: 'Tondre la pelouse', list: 'En cours' });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(keys(w), ['card_created:Tondre la pelouse']);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    card: 'Tondre la pelouse',
    card_id: ok.data.outputs.card_id,
    board: boardId(w.gladys).device,
    board_name: 'Maison',
    list: 'En cours',
    due_date: '',
  });
  // A card unarchived in Deck: unknown to the integration, created long ago.
  w.server.stacks
    .get(2)[0]
    .cards.push({ ...w.server.card('Vidange'), id: 50, title: 'Ancienne', createdAt: 1700000000 });
  clock.advance(60_000);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1, 'not repeated, the old card is no news');
});

test('the cards of a board followed from now on are no news', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock, config: { ...BASE_CONFIG, boards: 'Maison' } });
  await w.fake.configUpdated({ ...w.fake.config, boards: 'Maison, Courses' });
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('due times and midnight fire once; a card marked done fires nothing', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  clock.time = at(19, 22, 30, 30); // 23:30:30 Paris
  await w.hub.poll();
  assert.deepEqual(keys(w), ['card_due:Arroser les plantes']);
  assert.equal(w.fake.sceneEvents[0].data.list, 'À faire');
  assert.equal(w.fake.sceneEvents[0].data.due_date, '2026-11-19T22:30:00.000Z');
  clock.time = at(19, 23, 0, 5); // 00:00:05 Paris, 20/11
  await w.hub.poll();
  assert.deepEqual(keys(w).slice(1), [
    'card_overdue:Appeler le plombier',
    'card_overdue:Arroser les plantes',
  ]);
  clock.time = at(19, 23, 40); // "Réparer le robinet" due at 23:30 UTC
  w.server.card('Réparer le robinet').done = '2026-11-19T23:20:00+00:00';
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 3, 'done before its due time: nothing');
  assert.deepEqual(counters(w), {
    open: 5,
    dueToday: 0,
    overdue: 3,
    next: 'Vidange · Tue 1 Dec, 11:00',
  });
});

test('the day turns at local midnight, not UTC midnight', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  clock.time = at(19, 23, 0, 1); // 00:00:01 Paris, 20/11
  await w.hub.poll();
  // "Réparer le robinet" (00:30 Paris) is now due today; yesterday's are not.
  assert.equal(counters(w).dueToday, 1);
});

test('the events survive a restart: a move and a due time while down', async (t) => {
  const clock = createClock();
  const server = new FakeDeck({ now: clock.now });
  const first = await createWorld({ clock, server });
  const { dataDir } = first;
  await first.app.stop();
  server.move('Sortir les poubelles', LISTS.DOING);
  clock.time = at(19, 22, 40); // after "Arroser les plantes" was due
  const second = await world(t, { clock, server, dataDir });
  assert.deepEqual(keys(second), [
    'card_moved:Sortir les poubelles',
    'card_due:Arroser les plantes',
  ]);
  assert.equal(second.fake.sceneEvents[0].data.previous_list, 'À faire');

  await second.app.stop();
  clock.time = at(20, 0, 25); // midnight Paris is 85 min old: dropped
  const third = await world(t, { clock, server, dataDir });
  assert.deepEqual(keys(third), ['card_due:Réparer le robinet'], 'due 55 min ago: kept');
});

test('an event Gladys refuses is tried again at the next reading, the others not repeated', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  t.mock.method(w.gladys, 'publishSceneEvent', async (key, data) => {
    if (refuse && (key === 'card_moved' || key === 'card_created')) {
      throw new Error('Gladys is restarting');
    }
    return publish(key, data);
  });
  w.server.move('Ranger le garage', LISTS.TODO);
  clock.time = at(19, 22, 31);
  await w.fake.sceneAction('add_card', { title: 'Nouvelle' });
  assert.deepEqual(keys(w), ['card_due:Arroser les plantes']);
  refuse = false;
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(keys(w).slice(1).sort(), [
    'card_created:Nouvelle',
    'card_moved:Ranger le garage',
  ]);
  clock.advance(60_000);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 3);
});

test('add_card: first list by default, at the bottom, with a due date', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ok = await w.fake.sceneAction('add_card', {
    title: ' Acheter du lait ',
    board: 'courses',
    due: '2026-11-24 18:00',
  });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    card: 'Acheter du lait',
    card_id: ok.data.outputs.card_id,
    board_name: 'Courses',
    list: 'Liste',
    due_date: '2026-11-24T17:00:00.000Z',
  });
  const created = w.server.card('Acheter du lait');
  assert.equal(created.order, 2, 'below "Lait"');
  assert.equal(created.duedate, '2026-11-24T17:00:00+00:00');
  assert.equal(counters(w, COURSES_ID).open, 3, 'the counters follow at once');

  const inList = await w.fake.sceneAction('add_card', {
    title: 'Purger les radiateurs',
    list: 'en cours',
    due: '+2h',
  });
  assert.equal(inList.data.outputs.board_name, 'Maison', 'the first board');
  assert.equal(inList.data.outputs.list, 'En cours');
  assert.equal(inList.data.outputs.due_date, new Date(START + 2 * 3_600_000).toISOString());
  const empty = await w.fake.sceneAction('add_card', { title: 'Premier', list: 'Vide' });
  assert.equal(w.server.card('Premier').order, 0, 'an empty list starts at 0');
  assert.equal(empty.success, true);
  const noon = await w.fake.sceneAction('add_card', { title: 'Semer', due: '2026-11-25' });
  assert.equal(noon.data.outputs.due_date, '2026-11-25T11:00:00.000Z', 'noon, winter time');

  const fails = [
    [{ title: 'X', due: 'demain' }, /Échéance incomprise/],
    [{ title: 'X', due: '2026-02-30' }, /Échéance incomprise/],
    [{ title: ' ' }, /titre de la nouvelle carte/],
    [{ title: 'X', board: 'Atelier' }, /Aucun tableau/],
    [{ title: 'X', board: 'Personal' }, /Aucun tableau/],
    [{ title: 'X', list: 'Jamais' }, /Aucune liste/],
  ];
  for (const [fields, expected] of fails) {
    const ack = await w.fake.sceneAction('add_card', fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error.fr, expected);
    assert.ok(ack.error.en && ack.error.de && ack.error.es);
  }
  w.server.viewer = true;
  const refused = await w.fake.sceneAction('add_card', { title: 'X' });
  assert.equal(refused.success, false);
  assert.match(refused.error.fr, /^Deck : tableau disparu, .* \(HTTP 403\)$/);
});

test('move_card: by name, to a list by name, with the previous list', async (t) => {
  const w = await world(t);
  const ok = await w.fake.sceneAction('move_card', { card: 'réparer LE robinet', list: 'fait' });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    card: 'Réparer le robinet',
    card_id: '10',
    board_name: 'Maison',
    list: 'Fait',
    previous_list: 'À faire',
  });
  const card = w.server.card('Réparer le robinet');
  assert.equal(card.stackId, Number(LISTS.DONE));
  assert.equal(card.order, 1, 'below "Payer la cantine"');

  const fails = [
    [{ card: 'Tondre', list: 'Fait' }, /No card/],
    [{ card: 'Pain', list: 'Fait' }, /No list/],
    [{ card: 'Pain', list: 'Liste', board: 'Atelier' }, /No board/],
    [{ card: '', list: 'Fait' }, /name of the card/],
  ];
  for (const [fields, expected] of fails) {
    const ack = await w.fake.sceneAction('move_card', fields);
    assert.equal(ack.success, false);
    assert.match(ack.error.en, expected);
  }
  w.server.card('Pain').title = 'Sortir les poubelles';
  const twice = await w.fake.sceneAction('move_card', {
    card: 'Sortir les poubelles',
    list: 'Fait',
  });
  assert.match(twice.error.en, /Several cards/);
});

test('read_today: a sentence for a message or a voice announcement', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_today', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    text: '3 carte(s) à finir ce soir : Sortir les poubelles, Appeler le plombier et Arroser les plantes. 2 en retard.',
    count: 3,
    overdue: 2,
  });
  const courses = await w.fake.sceneAction('read_today', { board: 'Courses' });
  assert.equal(courses.data.outputs.text, "Aucune carte due aujourd'hui.");
});

test('a wrong password says so, and is not retried soon (brute-force protection)', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, password: 'wrong' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /app password refused/);
  assert.equal(w.hub.nextDelay(), 300_000);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /^Deck : identifiant ou mot de passe d'application refusé\.$/);
});

test('an address without Deck, or that does not answer', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.99:8080' } });
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(w.hub.nextDelay(), 30_000, 'an outage is retried soon');
  const noDeck = new FakeDeck();
  const handle = noDeck.handle.bind(noDeck);
  noDeck.handle = (url, options) =>
    url.includes('/apps/deck/')
      ? { status: 404, headers: {}, body: '<!DOCTYPE html><html>' }
      : handle(url, options);
  const other = await world(t, { server: noDeck });
  assert.match(other.fake.connectionStatus.message.en, /no Deck app/);
  const maintenance = new FakeDeck();
  maintenance.handle = () => ({ status: 503, headers: {}, body: '{"message":"maintenance"}' });
  const busy = await world(t, { server: maintenance });
  assert.match(busy.fake.connectionStatus.message.en, /maintenance/);
});

test('no configuration: a clear status, no request', async (t) => {
  const w = await world(t, { config: { url: '' } });
  assert.match(w.fake.connectionStatus.message.en, /address of your Nextcloud/);
  const half = await world(t, { config: { url: URL_1, username: 'alice' } });
  assert.match(half.fake.connectionStatus.message.en, /username and an app password/);
  assert.equal(half.server.requests.length, 0);
  const bad = await world(t, { config: { url: 'ftp://x' } });
  assert.match(bad.fake.connectionStatus.message.en, /not understood/);
  const ack = await half.fake.sceneAction('read_today', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /pas configuré/);
});

test('an outage keeps the devices and marks them unreachable, then back', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.discoveredDevices.length, 2);
  assert.ok(w.fake.transports.some((entry) => entry.transport === 'unreachable'));
  w.server.online = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a board deleted between the two requests (403) is left out', async (t) => {
  const w = await world(t);
  w.server.stacks.delete(Number(COURSES_ID));
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.hub.followed.length, 1);
});

test('a board in the trash of Deck is no longer followed', async (t) => {
  const w = await world(t);
  w.server.boards[2].deletedAt = 1795119677;
  await w.hub.poll();
  assert.deepEqual(
    w.hub.followed.map((board) => board.name),
    ['Maison'],
  );
});

test('the states are published again when a device is added', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length > before);
});

test('a reading of the old instance during a reconfiguration is dropped', async (t) => {
  const w = await world(t);
  const reading = w.hub.poll();
  await w.fake.configUpdated({ ...w.fake.config, url: 'http://192.0.2.99:8080' });
  await reading;
  assert.deepEqual(w.hub.cards, [], 'nothing of the old instance kept');
  assert.equal(w.fake.connectionStatus.connected, false);
});

test('a card brought from another followed board is neither new nor a move', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const card = w.server.card('Ranger le garage');
  w.server.detach(card);
  w.server.attach(card, 8);
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(w.fake.sceneEvents, [], 'created 10 min ago, but known');
  assert.equal(counters(w, COURSES_ID).open, 3);
});

test('two boards of the same name: both followed, distinct device names', async (t) => {
  const server = new FakeDeck();
  server.boards[2].title = 'Maison';
  const w = await world(t, { server, config: { ...BASE_CONFIG, boards: 'Maison' } });
  const names = w.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, ['Deck Maison #2', 'Deck Maison #3']);
});
