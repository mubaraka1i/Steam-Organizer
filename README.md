# GuideRail

GuideRail is a client-side vanilla HTML, CSS, and JavaScript web application designed to organize and visualize a user’s Steam backlog. The application integrates with the Steam Web API and IGDB APIs to import game libraries, estimate completion times, manage backlog progress, and persist user data through localStorage. GuideRail uses modular JavaScript files, responsive layouts, persistent browser storage, and a lightweight Node.js proxy server for secure API communication.

---

# Features

## Core Functionality

* Steam Library Import using the Steam Web API
* Game searching, filtering, and sorting
* Railroad-style backlog visualization system
* ETA estimation system for backlog completion
* IGDB completion-time integration
* Import/export support using JSON files
* Persistent localStorage caching
* Theme persistence between sessions
* Responsive layouts for desktop and mobile devices

---

# Pages

## Main Views

* `index.html`

  * Login and Steam account entry page

* `profile.html`

  * Main dashboard and Steam library management

* `map.html`

  * Interactive railroad-style backlog visualization

* `eta.html`

  * Weekly gaming schedule and backlog ETA calculator

* `settings.html`

  * User preference configuration

* `about.html`

  * Project overview and application information

---

# Application Architecture

GuideRail follows a lightweight client-server architecture.

```text
Browser UI
   ↓
JavaScript Controllers
   ↓
Node.js Proxy Server
   ↓
Steam Web API + IGDB API
```

## Frontend Structure

### HTML Pages

* `index.html`

  * Login page and initial authentication flow

* `profile.html`

  * Main library dashboard

* `map.html`

  * Railroad visualization interface

* `eta.html`

  * Backlog completion estimator

* `settings.html`

  * Preference management

* `about.html`

  * Documentation and overview page

---

## CSS Files

* `styles/color.css`

  * Global themes and color palettes

* `styles/profile.css`

  * Profile and game grid styling

* `styles/dashboard.css`

  * Dashboard layouts and statistics

* `styles/about.css`

  * About page styling

---

## JavaScript Files

* `scripts/login.js`

  * Steam profile authentication and login handling

* `scripts/profile.js`

  * Steam library rendering
  * Filtering/searching/sorting
  * Import/export system
  * Preference persistence
  * Theme handling

* `scripts/map.js`

  * Railroad backlog visualization
  * Track assignment system
  * Game node creation
  * ETA calculations
  * IGDB completion-time integration
  * Track pagination and drag/drop importing

* `scripts/eta.js`

  * Weekly gaming schedule management
  * Backlog completion time estimation
  * Schedule persistence

---

# Data Storage

GuideRail stores all persistent application data inside browser localStorage.

| Key                                 | Purpose                                     |
| ----------------------------------- | ------------------------------------------- |
| `team03_guideRail_theme`            | Stores the currently selected theme         |
| `team03_guideRail_profile`          | Cached Steam profile information            |
| `team03_guideRail_games`            | Imported Steam game library                 |
| `team03_guideRail_api_key`          | Cached API key information                  |
| `team03_guideRail_game_preferences` | Saved search/filter/sort preferences        |
| `team03_guideRail_game_name_map`    | Game lookup mapping for the map page        |
| `team03_guideRail_eta_weekly`       | Weekly gaming schedule for ETA calculations |
| `team03_guideRail_account_list`     | Saved Steam account list                    |

---

# Third-Party APIs

## Steam Web API

GuideRail integrates with the Steam Web API for:

* `GetPlayerSummaries`

  * Retrieves Steam profile information

* `ResolveVanityURL`

  * Converts custom Steam usernames into Steam IDs

* `GetOwnedGames`

  * Retrieves the user’s Steam library and playtime data

Steam API Documentation:

[Steam Web API Documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API?utm_source=chatgpt.com)

---

## IGDB API

GuideRail integrates with IGDB to retrieve estimated game completion times.

Features include:

* Main story completion estimates
* Completionist estimates
* Rushed playthrough estimates

IGDB Documentation:

[IGDB API Documentation](https://api-docs.igdb.com/?utm_source=chatgpt.com#getting-started)

---

# API Proxy System

GuideRail routes API requests through a lightweight proxy system implemented in:

```text
src/server.js
```

The proxy system is used to:

* Prevent CORS issues
* Protect sensitive API credentials
* Handle authenticated API communication securely

GuideRail uses the Approxi proxy service for secure request forwarding.

---

# Third-Party Libraries and Services

GuideRail primarily uses vanilla HTML, CSS, and JavaScript with minimal external dependencies.

## Libraries / Services Used

- Node.js HTTP Module  
  https://nodejs.org/api/http.html

- Google Fonts (Nunito)  
  https://fonts.google.com/specimen/Nunito

- Approxi Proxy Service  
  Used to securely proxy Steam and IGDB API requests while preventing CORS issues and hiding sensitive credentials.

---

# Theme System

GuideRail supports two persistent themes:

## Green Theme

Original retro-inspired green interface.

## Blue Theme

Modern Steam-inspired blue interface.

Themes persist using localStorage and can be toggled from every page.

---

# ETA System

The ETA system allows users to estimate backlog completion time using:

* Weekly gaming schedules
* Completion-time estimates from IGDB
* Track-based backlog organization

The ETA system calculates estimated completion durations in days and years based on:

* Current playtime
* Remaining completion hours
* Weekly gaming availability

---

# Map System

The railroad map system visually organizes games into tracks:

* Main Line
* Branch Line
* Sidetrack
* Yard (unassigned)

Users can:

* Move games between tracks
* Reorder games
* Assign completion statuses
* Estimate backlog completion visually

Each game node stores:

* Playtime
* Completion estimates
* Track assignment
* Status metadata

---

# Accessibility

GuideRail follows WCAG 2.1 AA accessibility guidelines.

Features include:

* Semantic HTML5 structure
* Keyboard navigation support
* ARIA labels
* Focus indicators
* Accessible color contrast ratios
* Responsive layouts for mobile devices

---

# Responsive Design

GuideRail supports responsive layouts for:

* Desktop devices
* Tablets
* Mobile devices (320px+)

The application uses:

* CSS Grid
* Flexbox
* Media queries

for adaptive layouts.

---

# Browser Compatibility

GuideRail requires a modern browser supporting:

* ES6 JavaScript
* fetch API
* localStorage API
* FileReader API
* CSS Grid and Flexbox

---

# Environment Setup

If running locally, create a `.env` file for proxy configuration if required.

Example:

```env
PROXY_TOKEN=your_proxy_token_here
```

---

# Getting Started

## Run Locally

1. Clone the repository
2. Navigate to the `/src` directory
3. Start the Node.js server:

```bash
node server.js
```

4. Open:

```text
http://localhost:3000
```

5. Login using:

   * Steam username or profile URL
   * Steam API access through the proxy system

---

# Code Style

* Semantic HTML5 structure
* Vanilla JavaScript only
* Modular feature-based scripts
* Separated CSS concerns
* No inline styles
* No inline event handlers
* Consistent naming conventions
* Extensive JSDoc comments

---

# Project Information

* Project Name: GuideRail
* Type: Vanilla Web Application
* Course: CS 343
* Year: 2026
