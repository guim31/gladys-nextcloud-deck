// -----------------------------------------------------------------------------
// The "today's cards" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the all-boards and one-board views, the
// "done" buttons, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  BASE_CONFIG,
  BOARD_ID,
  COURSES_ID,
  boardId,
  createClock,
  createWorld,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('cards_today', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);

test('every board: tiles, the cards of the day with their list and board, buttons', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.ok(data.components.length <= 8);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => tile.value),
    [2, 2],
  );
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value, row.color]),
    [
      ['Sortir les poubelles', 'Overdue · À faire · Maison', 'danger'],
      ['Appeler le plombier', 'Overdue · À faire · Maison', 'danger'],
      ['Arroser les plantes', '23:30 · À faire · Maison', 'neutral'],
    ],
  );
  assert.deepEqual(
    ofType(data, 'button').map((button) => [button.action.key, button.label]),
    [
      ['done_1', 'Sortir les poubelles'],
      ['done_2', 'Appeler le plombier'],
      ['done_3', 'Arroser les plantes'],
    ],
  );
});

test('a board view shows only its cards, in the language of the user', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: boardId(w.gladys, BOARD_ID).device }, 'fr');
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => row.value),
    ['En retard · À faire', 'En retard · À faire', '23:30 · À faire'],
  );
  assert.equal(ofType(data, 'value')[0].label, "Aujourd'hui");
});

test('nothing today: a sentence and the next due date', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  for (const name of ['Sortir les poubelles', 'Appeler le plombier', 'Arroser les plantes']) {
    w.server.card(name).done = '2026-11-19T20:00:00+00:00';
  }
  await w.hub.poll();
  const data = await content(w, {}, 'fr');
  assert.equal(ofType(data, 'text')[0].text, "Aucune carte due aujourd'hui.");
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [['Réparer le robinet', 'Prochaine · ven. 20 nov.']],
  );
  w.server.card('Lait').duedate = null;
  await w.hub.poll();
  const courses = await content(w, { device: boardId(w.gladys, COURSES_ID).device });
  assert.equal(ofType(courses, 'status').length, 0, 'no due date at all: no next row');
});

test('a "done" button marks the card done, keeps the rest, answers a toast', async (t) => {
  const w = await world(t);
  const card = w.server.card('Vidange');
  const before = { ...card };
  const id = String(card.id);
  const ack = await w.fake.widgetAction('cards_today', 'done_2', { id }, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, '« Vidange » : marquée comme faite.');
  assert.equal(card.done, new Date(w.clock.now()).toISOString());
  for (const key of ['title', 'description', 'duedate', 'order', 'stackId']) {
    assert.equal(card[key], before[key], `${key} unchanged`);
  }
  assert.equal(card.description, 'garage');
  const again = await w.fake.widgetAction('cards_today', 'done_2', { id }, { settings: {} });
  assert.equal(again.success, false);
  assert.match(again.error.en, /already done meanwhile/);
  const bad = await w.fake.widgetAction('cards_today', 'done_9', { id }, { settings: {} });
  assert.equal(bad.success, false);
  assert.ok(bad.error.fr);
  w.server.viewer = true;
  const pain = String(w.server.card('Lait').id);
  const refused = await w.fake.widgetAction(
    'cards_today',
    'done_1',
    { id: pain },
    { settings: {} },
  );
  assert.equal(refused.success, false);
  assert.match(refused.error.de, /^Deck: /);
});

test('a card moved in Deck since the last reading is marked done in its new list', async (t) => {
  const w = await world(t);
  w.server.move('Arroser les plantes', '7');
  const id = String(w.server.card('Arroser les plantes').id);
  const ack = await w.fake.widgetAction('cards_today', 'done_3', { id }, { settings: {} });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  const card = w.server.card('Arroser les plantes');
  assert.equal(card.stackId, 7, 'not put back in its old list');
  assert.ok(card.done);
  w.server.detach(w.server.card('Vidange'));
  const gone = await w.fake.widgetAction('cards_today', 'done_1', { id: '6' }, { settings: {} });
  assert.equal(gone.success, false);
  assert.match(gone.error.en, /No card/);
});

test('the buttons can be hidden; boards are named as in Gladys', async (t) => {
  const w = await world(t);
  const data = await content(w, { show_buttons: false });
  assert.deepEqual(ofType(data, 'button'), []);
  const [device] = w.fake.discoveredDevices;
  await w.fake.deviceCreated({ ...device, name: 'Tâches' });
  const named = await content(w);
  assert.equal(ofType(named, 'status')[0].items[0].value, 'Overdue · À faire · Tâches');
});

test('degraded states: not configured, unknown board, Deck down', async (t) => {
  const empty = await world(t, { config: { url: '', language: 'en' } });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const w = await world(t, { config: { ...BASE_CONFIG, boards: 'Courses' } });
  const gone = await content(w, { device: boardId(w.gladys, BOARD_ID).device });
  assert.match(gone.components[0].text, /no longer followed/);

  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.equal(stale.components[0].variant, 'caption');
  assert.deepEqual(ofType(stale, 'button'), [], 'no button while Deck is down');

  const clock = createClock();
  const down = await createWorld({ clock, connect: false });
  t.after(() => down.app.stop());
  down.server.online = false;
  await down.gladys.connect();
  await down.app.ready;
  assert.match((await content(down)).components[0].text, /does not answer/);
});
