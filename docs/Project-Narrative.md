# GuideRail

## Your Steam Backlog, On Track

**Team Name:** The Conductors
**Team Members:** Michael & Mubarak

---

## Purpose

The average Steam user has more games than they can imagine. Without structure, a large library makes it hard to choose which path to take next — creating anxiety because of all these games stacked up.

**GuideRail turns a Steam library into a map to help players visualize, organize, and actually make progress on their backlog.**

Games become stations to start your journey. Progress gest turned into distance traveled. The software manages the backlog, making it less stressing, and helps players answer the simplest question: *what should I play next?*

---

## Users

GuideRail is for PC gamers on Steam — casual players who buy games on sale and forget them, dedicated players juggling multiple titles, and returning players who lost track of something they started.

Users need clarity and a low-friction starting point. GuideRail requires only a Steam username to get going. No account, no setup. The library imports automatically and is immediately presented in a structured, visual format anyone can understand.

---

## Features

Users of GuideRail will:

1. **Import their Steam library** by entering a username — the app fetches all games, playtimes, and metadata via the Steam Web API
2. **View the OnTrack Railway Map** — games organized into a Main Line (active), Branch Lines (multiplayer), Sidetracks (paused/abandoned), and a Rail Yard (unplayed, sorted by length)
3. **Check the ETA Calculator** — projects a backlog completion date based on current pace, with an adjustable slider for "what if I played more?"
4. **Manage game notes and status (CRUD)** — add personal notes, set status (Playing, Paused, Abandoned, Completed), and create custom categories
5. **Import/Export** — back up all annotations as JSON and restore from backup

*Example: A user imports 200 games. GuideRail places 3 in-progress games on the Main Line, surfaces 5 short games as weekend picks, and calculates that finishing the backlog will take until 2039 at their current pace.*

---

## Data

Users create, read, update, and delete **Game Records** — one per game:

```json
{
  "appId": 730,
  "title": "Counter-Strike 2",
  "playtimeHours": 342,
  "userStatus": "playing",
  "personalNotes": "Play ranked on weekends with Mubarak",
  "category": "FPS with friends",
  "dateAdded": "2026-03-03"
}
```

All data is stored in `localStorage` — no backend or account required. Users can export their full annotation set as a `.json` file and restore it at any time.

---

## References

1. [Steam Web API Documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API)
2. [HowLongToBeat](https://howlongtobeat.com) — used to estimate game completion times