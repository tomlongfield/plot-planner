# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-10-17

The first release: the core planner (phase 1).

### Added
- Month view: the plan drawn to scale in the plot's own orientation, coloured by crop family, with that month's jobs on and off the plot. Small multiples for all months.
- Layout editor for plots, beds, sections, rows, containers and features, by dragging or typing, with snapping and dates for layouts that change over time.
- Frost-date climate model with re-anchoring when frost dates or hemisphere change, and protection shifts for tender crops under cover.
- A 50-crop starter library as open data, with a JSON Schema and validation.
- Plantings with draft and agreed states, worked-out dates, successions, interplanting by rows, and checks for capacity, overlaps, rotation, crossing, frost, season length, module time and tenancy end.
- Tasks generated from plantings, manual and recurring tasks, and calendar (ICS) export.
- Seed inventory with viability warnings, germination tests and CSV or XLSX import with column mapping and suggestions.
- JSON backup and restore with schema versioning, undo, offline support, light and dark themes.
