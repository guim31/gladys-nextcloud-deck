// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Deck on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Deck with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import {
  BOARD_ID,
  COURSES_ID,
  FakeDeck,
  LISTS,
  PASSWORD,
  USERNAME,
  createNetwork,
} from './fakeDeck.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:8080';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 19/11/2026 at 20:22 UTC; the tests start at
// 20:30 UTC (21:30 in Paris). "Maison": "Sortir les poubelles" overdue since
// yesterday, "Appeler le plombier" overdue since 20:00 Paris, "Arroser les
// plantes" due at 23:30 Paris, "Réparer le robinet" tomorrow at 00:30 Paris,
// "Changer les draps" due today but done, "Vidange" on 1 December.
export const START = Date.UTC(2026, 10, 19, 20, 30, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = {
  url: URL_1,
  username: USERNAME,
  password: PASSWORD,
  language: 'en',
};

/**
 * @param {object} [options]
 * @param {FakeDeck} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-deck-')),
  timings = {},
  timers = false,
} = {}) {
  const deck = server ?? new FakeDeck({ now: clock.now });
  const network = createNetwork({ [URL_1]: deck });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: deck, app, hub: app.hub, clock, dataDir };
}

export const boardId = (gladys, id = BOARD_ID) => gladys.externalIds('board', `board-${id}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { BOARD_ID, COURSES_ID, FakeDeck, LISTS, PASSWORD, USERNAME };
