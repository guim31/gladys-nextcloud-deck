# Nextcloud Deck

Bring the kanban boards of [Nextcloud Deck](https://apps.nextcloud.com/apps/deck)
into Gladys: the cards due today, the overdue ones, the next due date and the
number of cards in each list of a board. A scene reacts when a card is created,
arrives in a list (`Done`, `To check`…) or falls due, another one adds "buy
bread" from a button or moves a card from an NFC tag, a tap on the dashboard
marks a card done, and Gladys can read out the cards of the day every morning.

This integration covers the Deck app only. To watch the Nextcloud server
itself (storage, users, updates), see the Nextcloud integration.

> **Feedback welcome.** This integration was tested against a real Nextcloud
> (Docker image `nextcloud` 31.0.14 with Deck 1.15.12, November 2026), not yet
> in everyday use. If something does not work as described, please say so on
> the [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-nextcloud-deck/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Nextcloud with the Deck app** (tested with Nextcloud 31 and Deck 1.15),
  reachable from Gladys. Marking cards done needs Deck 1.13 or later.
- The **username** of a Nextcloud user and an **app password** for it:
  in Nextcloud, **Personal settings** → **Security** → **Devices & sessions**
  → **Create new app password**. Copy it: Nextcloud shows it only once. It
  works with two-factor login, and can be revoked at any time without
  changing the account password. The account password also works, without
  two-factor login, but is not recommended.

The integration sees the boards this user sees (their own and the shared
ones), and acts **as this user**. A user who may only read a board can follow
it, but cannot add, move or mark done its cards.

## Set up

1. In Gladys, **Integrations** → install **Nextcloud Deck**.
2. In the **Configuration** screen, fill in:
   - **Address**: the address of Nextcloud as in the browser, for example
     `https://cloud.example.org`, or `http://192.168.1.20:8080` (a path such
     as `/nextcloud` is kept; a copied board address works too);
   - **Username** and **App password**.
3. Options:
   - **Followed boards**: names separated by commas (`Home, Shopping`), or
     the id of a board (the number in its address). Empty: every board of the
     user, 20 at most. Archived boards and boards in the trash are left out;
   - **Accept self-signed certificates**: for an `https://` address with a
     self-signed certificate, on your own server only;
   - **Refresh interval**: 1 to 10 minutes (5 by default). Due dates and
     midnight are always followed on time, whatever the interval;
   - **Language of the feature names**: the names given to the features when
     a device is added (French by default), and the texts sent to scenes.
4. Save, then **Test the connection**: it reads Deck and gives the number of
   open cards and of followed boards.
5. In the **Discovery** tab, add the devices you want.

## Devices

**Deck _board_** for each followed board, with these features:

| Feature           | What it says                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| `Open cards`      | the cards not marked done (archived cards are never counted)                           |
| `Cards due today` | open cards whose due date falls today, passed or not                                   |
| `Overdue cards`   | open cards whose due date has passed                                                   |
| one per list      | the number of cards shown in each of the first five lists, named after the list        |
| `Next due date`   | the card with the earliest due date still ahead, and its date; `None` if there is none |

"Today" is the day in the time zone of Gladys. A card marked done is no longer
due, but still counts in its list, as Deck still shows it there. Feature names
are set when the device is added: a list renamed later keeps its old name in
Gladys. A new list among the first five makes Gladys offer to update the
device in the **Discovery** tab.

## Dashboard

The **Today's cards** widget shows two tiles (due today, overdue), the list of
the cards due by tonight, overdue first, with their time, their list and their
board (named as in Gladys once its device is added), and a button for each of
the four most urgent: a tap marks the card done in Deck. Choose a board device
in the widget settings to see only its cards; leave it empty for every
followed board. Untick **Show the "done" buttons** for a read-only screen.
When nothing is due, the widget says so and gives the next due date.

The counters can also go on the dashboard as any device feature.

## Scenes

### Triggers

- **New Deck card**: a card was created in a followed board. Filters: the
  board (a board device), the **list name**, exactly as written in Deck.
- **Deck card moved**: a card arrived in another list of its board. Same
  filters (`Done`). It also passes on the previous list.
- **Deck card due**: an open card reached its due time without being marked
  done.
- **Deck card overdue**: at midnight, a card due that day is still not done.
  Once per card and due date.

Filters of the last two: the board, the card name. Information passed on to
the actions: the card, its id, its board, its list, its due date.

A new card or a move is seen at the next reading: within the refresh
interval. A card brought back from the archive, or from another board, is
neither new nor a move, and the cards of a board followed from now on are no
news. A card marked done before its due time fires nothing, and a due date
moved by hand to a moment before the previous reading fires nothing either. A
restart does not fire anything twice; a card created or moved while the
integration was stopped fires when it starts again (created less than an hour
before), and so does a due time less than an hour old.

### Actions

- **Add a Deck card**: a title; the board by name (empty: the first followed
  board); the list by name (empty: its first list, on the left); an optional
  **due date**, in the time of Gladys: `2026-10-24 18:00`, `2026-10-24`
  (noon), or from now `+30m`, `+2h`, `+3d`. The card goes at the bottom of
  the list. Results: the card, its id, its board, its list, its due date.
- **Move a Deck card**: the card by its exact name (case and accents ignored)
  or its id, the destination list by name, and the board if two boards hold a
  card of that name. The card goes at the bottom of the list. Results: the
  card, its id, its board, its list, the previous list.
- **Read today's Deck cards**: the cards due by tonight as a sentence
  (`3 card(s) due by tonight: …. 2 overdue.`), for every followed board or one
  of them. Results: the sentence, the number of cards due by tonight, of
  overdue cards. Send the sentence in a message, or have Gladys say it.

The fields accept scene variables: `{{triggerEvent.data.card}}` moves the card
that triggered the scene. A failed action (no such list, Deck down) shows in
red with its reason.

### Scene ideas

- At 7:30, **Read today's Deck cards**, then send the sentence on Telegram.
- **New Deck card** in the `Shopping` board: send it to the family.
- **Deck card moved** to the `Done` list of the `Home` board: turn off the
  reminder light.
- When the washing machine stops, **Add a Deck card** `Hang the laundry` in
  `To do`, due `+1h`.
- An NFC tag on the bins runs **Move a Deck card** `Take out the bins` to
  `Done`.

## Troubleshooting

- **"Nextcloud does not answer"**: check the address and the port from the
  Gladys machine (the address opens Nextcloud in a browser).
- **"Username or app password refused"**: the app password was revoked, or
  mistyped. Create a new one. After a refusal the integration waits for the
  refresh interval before trying again: Nextcloud slows down, then blocks,
  the logins that keep failing.
- **"Too many requests or failed logins"**: Nextcloud's brute-force
  protection; it clears by itself, or an administrator runs
  `occ security:bruteforce:reset <address of Gladys>`.
- **"No Deck app at this address"**: install and enable Deck in Nextcloud
  (**Apps**), or check the address and its path.
- **"The address redirects"**: enter the `https://` address.
- **"Nextcloud is in maintenance or updating"**: wait for the end of the
  update.
- **"Board gone, or this user may not edit it"**: the board was deleted or
  is no longer shared with the user, or the user may only read it.
- **A board is missing**: it must be shared with the user, and neither
  archived nor in the trash; a name typed in **Followed boards** that matches
  no board is ignored, and **Test the connection** lists it. Beyond 20
  boards, list the ones to follow.
- **"Several cards have this name"**: give the board, or the id of the card.
- Logs: `LOG_LEVEL=debug` on the container shows every reading.

## Limits

- Deck is read every 1 to 10 minutes (and at each due time and at midnight):
  a change in Deck shows up in Gladys within that delay. Nextcloud's
  notifications are not used.
- One request for the boards, plus one per followed board, at each reading.
- The integration adds cards, moves them and marks them done; it does not
  edit, delete or assign them, nor read their labels, comments or
  attachments. Marking a card done rewrites it as it was read just before:
  an edit made in Deck in that very second could be lost.
- Only the first five lists of a board get a counter.
- Tested with Nextcloud 31 and Deck 1.15.12.
- Gladys keeps no Deck data beyond `/data/deck-state.json` (the time of the
  last reading, the followed boards and the list of each card, so that no
  event fires twice).
- Not affiliated with Nextcloud GmbH.
