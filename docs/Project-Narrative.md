# GuideRail

## Your Steam Backlog, On Track

**Team Name:** The Conductors
**Team Members:** Michael & Mubarak

---

## Purpose

Many Steam players have a growing library but no clear plan for it. Steam is excellent at helping users buy, install, and launch games, but its default library view is not designed as a backlog planning system. It shows what you own, yet it does not actively guide choices, estimate completion timelines, or help users recover momentum after long gaps.

**GuideRail turns a Steam library into an action-focused backlog map that helps users decide, commit, and finish.**

Compared with the default Steam library, GuideRail goes beyond sorting and filtering in four ways:

1. It introduces a progression model (Main Line, Branch Lines, Sidetracks, Rail Yard) so users can see not just what they own, but what role each game plays in their current plan.
2. It predicts backlog completion with an ETA calculator tied to play pace, making progress measurable rather than vague.
3. It supports decision support features like short-session picks, weekend picks, and next-best-game recommendations based on personal status and estimated length.
4. It keeps personal intent with each game (notes, categories, and custom statuses), which Steam does not capture in a focused backlog workflow.

The core problem GuideRail solves is decision fatigue. Instead of opening Steam and scrolling through hundreds of titles, users get a clear path forward and a realistic estimate of where that path leads. This creates a sense of control, reduces guilt around unfinished purchases, and encourages sustainable, enjoyable progress.

---

## Users

GuideRail is designed for Steam players who need structure, not more storefront features. The application targets three primary user types:

1. **Casual backlog collectors**
These players buy games during seasonal sales, bundles, or recommendations from friends, then rarely return to organize what they bought. Their challenge is not lack of interest, but overload. GuideRail gives them a low-friction starting point by importing their library and surfacing a short list of manageable options first.

2. **Active multi-game players**
These users rotate across competitive, co-op, and single-player games in the same month. They need a system that reflects real behavior, where some games are ongoing while others are intentionally paused. GuideRail helps by separating active titles from side activities and abandoned tracks, reducing context switching and helping users keep momentum.

3. **Returning players**
Returning players may have been away from gaming for months or years and no longer remember where they left off. They need quick orientation and confidence-building choices. GuideRail helps them restart with familiar games, lightweight wins, and clear next steps instead of forcing them to rebuild context manually.

Across all user types, onboarding is intentionally simple: enter a Steam username, import data, and begin planning immediately. No account creation is required, and user-created annotations remain local and private.

---

## Features

Users of GuideRail will:

1. **Steam username import (API-based)**
The user enters a Steam vanity name or SteamID. GuideRail fetches owned games, playtimes, and basic metadata using the Steam Web API and normalizes records into a consistent app format.

2. **Batch import from file (JSON backup/migration)**
Users can import a previously exported GuideRail JSON file to restore annotations instantly, or merge imported records with current local data. This supports fast recovery and migration between devices.

3. **OnTrack Railway Map visualization**
Games are organized into a Main Line (current focus), Branch Lines (multiplayer/social), Sidetracks (paused/abandoned), and a Rail Yard (unplayed backlog). Sorting options include playtime, date added, and estimated completion length.

4. **ETA and pacing calculator**
GuideRail projects a backlog completion date from current behavior and allows "what-if" adjustments (for example, increasing weekly play hours). This turns progress planning into a visible, editable forecast.

5. **Personal game management (CRUD)**
Users can update status, add/edit/delete notes, and create custom categories or tags. Bulk actions are supported for batch status changes (for example, moving multiple titles to Paused or Completed in one step).

6. **Recommendation helpers**
GuideRail can surface candidates such as "quick win" games, shortest remaining titles, and "resume next" suggestions based on inactivity and previous progress.

7. **Import/Export with validation**
Exported files include a version stamp and schema checks. Import flow validates structure, reports malformed entries, and prevents accidental data loss with merge/overwrite choices.

*Example: A user imports 200 games. GuideRail places 3 in-progress games on the Main Line, surfaces 5 short games as weekend picks, and calculates that finishing the backlog will take until 2039 at their current pace.*

---

## Data

Users create, read, update, and delete **Game Records** - one per game:

```json
{
  "appId": 730,
  "title": "Counter-Strike 2",
  "steamAppId": 730,
  "playtimeHours": 342,
  "estimatedHoursToBeat": 120,
  "hoursRemaining": 15,
  "userStatus": "playing",
  "personalNotes": "Play ranked on weekends with Mubarak",
  "category": "FPS with friends",
  "tags": ["friends", "competitive"],
  "priority": "high",
  "lastPlayedDate": "2026-04-10",
  "dateAdded": "2026-03-03",
  "updatedAt": "2026-04-12T15:05:00Z"
}
```

In addition to game-level records, GuideRail stores lightweight user and app-level data to support planning features:

1. **User preference data**
Default weekly play hours, preferred game length range, interface sorting defaults, and selected recommendation strategy.

2. **App usage data**
Last sync time, import history, ETA snapshots, and active filter state so users can return to the same planning context quickly.

3. **Backup metadata**
Export version, created timestamp, and checksum/hash value for safer import validation and future schema migration.

GuideRail also stores relationship-oriented fields that connect records across features. Examples include source flags (imported from Steam API vs. created locally), sync confidence scores when metadata is incomplete, and recommendation reasons that explain why a game was suggested (for transparency and user trust). Where possible, timestamps are normalized to ISO format so calculations remain consistent across devices and time zones.

From an implementation perspective, data is grouped into named localStorage keys rather than one giant object. This allows safer partial updates, faster reads, and lower risk of full-state corruption when one field fails validation. Before writing imported data, the app performs schema checks and sanitizes unexpected fields so broken files do not crash the interface. If invalid records appear, they are skipped with user-facing warnings and a count of accepted vs. rejected entries.

All data is stored in localStorage - no backend account is required. Users can export their full annotation set as a .json file and restore it at any time. This approach protects privacy, supports offline use, and keeps the project aligned with course requirements while still enabling rich planning behavior.

---

## References

1. [Steam Web API Documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API)
2. [HowLongToBeat](https://howlongtobeat.com) — used to estimate game completion times
3. [MDN Web Docs: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
4. [WCAG 2.1 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/)

These references are not only citation links; they directly shape the project architecture and user experience decisions.

The Steam Web API is the foundation for automatic library intake, giving GuideRail its low-friction onboarding model. Without this API integration, users would need to manually type each game, which would undermine usability for large libraries. Steam metadata also enables playtime-informed sorting and smarter recommendation logic.

HowLongToBeat provides estimated completion durations that complement Steam playtime data. Steam can show hours already played, but it does not tell a user how long a game typically takes to finish. By combining both values, GuideRail can estimate remaining effort and generate practical planning outputs such as ETA and short-session picks.

MDN documentation for localStorage is relevant because the project intentionally uses client-only persistence with no backend. This source supports implementation details for storing, validating, and restoring user records safely in the browser environment.

WCAG 2.1 guidance informs layout semantics, color contrast, and keyboard accessibility. Since GuideRail targets broad student and gamer audiences on different devices, accessibility is treated as a core product requirement rather than an optional polish step.