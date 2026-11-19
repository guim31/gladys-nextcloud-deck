# Nextcloud Deck for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the kanban boards of [Nextcloud Deck](https://apps.nextcloud.com/apps/deck)
into Gladys, over the local network: the cards due today and the overdue
ones, the number of cards in each list, scene triggers when a card is
created, arrives in a list or falls due, and cards added or moved from a
scene or marked done from the dashboard.

This integration covers the **Deck app only**. To watch the Nextcloud server
itself (storage, users, updates, apps), see
[gladys-nextcloud](https://github.com/guim31/gladys-nextcloud).

> **Feedback welcome.** The integration was checked against a real Nextcloud
> (Docker image `nextcloud` 31.0.14 with Deck 1.15.12, November 2026), but not
> yet in everyday use with a real Gladys. Please report what works and what
> does not in the [issues](https://github.com/guim31/gladys-nextcloud-deck/issues).

## Features

- **One device per followed board** (all by default, or a list of names),
  with _open cards_, _cards due today_, _overdue cards_, one counter per list
  (the first five lists) and the _next due date_ (text).
- **Dashboard widget** "Today's cards": two tiles, the cards due by tonight
  (overdue first, time, list, board) and a button to mark each of the four
  most urgent done (the buttons can be hidden); for every board or one.
- **Scene triggers**: _New Deck card_ and _Deck card moved_ (filters on the
  board and the list: "a card arrived in Done"), _Deck card due_ and _Deck
  card overdue_ (at midnight, the card of the day still undone); the card, its
  board, its list (and the previous one) and its due date as variables. Once
  each, across restarts.
- **Scene actions**: _Add a Deck card_ (board, list, title, optional due date
  such as `2026-10-24 18:00` or `+2h`), _Move a Deck card_ (by name, to a list
  by name) and _Read today's Deck cards_ (a sentence for a message or a voice
  announcement). A failed action shows in red with its reason.
- On time: besides the refresh interval (1 to 10 minutes, 5 by default), the
  integration reads Deck at each due time and at local midnight (the time
  zone of Gladys).
- A **Test the connection** button, a connection status that names the
  problem (password refused, no Deck app, maintenance…), and a transport badge
  per device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **Nextcloud with the Deck app** (tested with Nextcloud 31 and Deck
  1.15.12; marking cards done needs Deck 1.13+), reachable from Gladys.
- The username of a Nextcloud user and an **app password** (Personal settings
  → Security → Devices & sessions → Create new app password). The
  integration acts as this user.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-nextcloud-deck`
   (or install **Nextcloud Deck** from the catalog once it is listed).
2. In **Configuration**, enter the address of Nextcloud
   (`https://cloud.example.org`, `http://192.168.1.20:8080`…), the username
   and the app password. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the REST API v1.0 of Deck,
`/index.php/apps/deck/api/v1.0`, with HTTP Basic authentication (username and
app password) and the `OCS-APIRequest: true` header:

| Request                                           | Use                                    |
| ------------------------------------------------- | -------------------------------------- |
| `GET /boards`                                     | the boards the user sees               |
| `GET /boards/{b}/stacks`                          | lists and cards of a followed board    |
| `POST /boards/{b}/stacks/{s}/cards`               | add a card (at the bottom of the list) |
| `PUT /boards/{b}/stacks/{s}/cards/{c}/reorder`    | move a card to another list            |
| `GET` then `PUT /boards/{b}/stacks/{s}/cards/{c}` | mark a card done (`done`)              |

Deck is read on a timer of the container; the devices are published with
`should_poll: false`. States are published only when they change, and every
12 hours otherwise. A new card is a card unknown to the previous reading,
created within the hour, in a board already followed; a move is a card whose
list changed between two readings; the due events are the moments (due time,
end of the due day) crossed since the previous reading. The time of the last
reading, the followed boards and the list of each card are kept in
`/data/deck-state.json`. After a refused password the integration waits for
the refresh interval: Nextcloud's brute-force protection slows down, then
blocks, repeated failed logins.

## Checked on a real Nextcloud, and what was not

Checked against `nextcloud:31-apache` (31.0.14, SQLite) with Deck 1.15.12
installed by `occ app:install deck`, in a Docker network: an app password
created by `occ user:add-app-password`, two boards and an archived one, four
lists (one empty), cards due in the past, today (one done), tomorrow, later
and never, one archived; a board deleted (trash). The real answers are in
`test/fixtures/deck/` and drive the tests. The integration ran in its own
container under the Gladys sandbox limits (read-only root, no capabilities,
256 MB, about 21 MB used at rest) against that server and the SDK's fake
Gladys: devices and states, test of the connection, a card added with a due
date (_New Deck card_ fired), moved (_Deck card moved_ fired), read out,
marked done from the widget (its description and due date kept), a list that
does not exist, a wrong password, the server stopped, an address without
Deck.

Not checked: a real Gladys instance, Nextcloud behind a reverse proxy with a
path prefix, two-factor login (an app password is the documented way), Deck
versions other than 1.15.12, a board shared by another user.

## Limitations

- Adds cards, moves them and marks them done; does not edit, delete or assign
  them, nor read their labels, comments or attachments. Marking done rewrites
  the card as it was read just before (the Deck API has no partial update).
- A change made in Deck shows up within the refresh interval.
- Up to 20 boards are read, one request each per reading.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Deck (`test/helpers/fakeDeck.js`) built from real answers.
See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Deck](https://github.com/nextcloud/deck) by Nextcloud GmbH and its
  contributors (AGPL-3.0): the integration only talks to its API; no code was
  copied. The cover uses the Deck app icon from its repository
  (`img/deck.svg`), to name the service.
- The architecture and the conformity tests follow
  [gladys-planka](https://github.com/guim31/gladys-planka) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Nextcloud GmbH.
The Nextcloud and Deck names and logos belong to their owners.

## License

Apache-2.0
