# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-19

### Added

- One device per followed Nextcloud Deck board: open cards, cards due today,
  overdue cards, one counter per list (the first five) and the next due date.
- Dashboard widget "Today's cards": the cards due by tonight, overdue first,
  with a button to mark each of the four most urgent done (can be hidden).
- Scene triggers: new card, card moved to another list, card due, card still
  undone at midnight; once each, across restarts.
- Scene actions: add a card (board, list, title, optional due date), move a
  card, read today's cards as a sentence.
- Authentication with a username and an app password; followed boards chosen
  by name or id; refresh every 1 to 10 minutes, and on time at each due date
  and at midnight.
- A "Test the connection" button and a connection status naming the problem.
- Every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-nextcloud-deck/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-nextcloud-deck/releases/tag/v1.0.0
