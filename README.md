# GuideRail

GuideRail is a vanilla HTML/CSS/JavaScript web application for managing and organizing a Steam game library. It provides a clean, responsive interface for searching, filtering, and sorting your Steam games with persistent local storage and theme customization.

## Features

### Core Functionality
- **Steam Library Management**: Fetch your Steam game library via the Steam Web API
- **Game Organization**: Search, filter, and sort games by playtime (unplayed, light, heavy) and name
- **Data Persistence**: All user data and preferences are stored locally in `localStorage` for offline access
- **Data Import/Export**: Download your game library as JSON or import from previously exported files
- **User Profiles**: View detailed Steam profile information including avatar, creation date, and last online time

### User Experience
- **Multiple Pages**: 
  - **Home/Login** (`index.html`): Initial Steam API key and username entry
  - **Profile** (`profile.html`): Main dashboard with library view and import/export controls
  - **Settings** (`settings.html`): Configure default library preferences
  - **About** (`about.html`): Application information
- **Theme Support**: Toggle between original green theme and new blue Steam-inspired theme with persistent storage
- **Responsive Design**: Works on screens 320px and larger with mobile-optimized layouts

### Accessibility
- Semantic HTML5 structure with proper heading hierarchy
- WCAG 2.1 AA compliant color contrast ratios
- Full keyboard navigation support for all interactive elements
- ARIA labels and live regions for screen reader users
- Focus indicators for keyboard navigation

## Technical Architecture

### Pages
- **index.html**: Login form for Steam API key and Steam username/ID input
- **profile.html**: Main profile and library management interface
- **settings.html**: Preferences configuration (search defaults, filter, sort)
- **about.html**: About page with project information

### Styling
- **styles/color.css**: Core color schemes and layout (green and blue themes)
- **styles/profile.css**: Profile and library-specific styles
- **styles/dashboard.css**: Dashboard-specific styles
- **styles/about.css**: About page styles

### JavaScript
- **scripts/login.js**: Handles Steam API authentication and profile fetching
- **scripts/profile.js**: Main application logic including:
  - Theme management and toggle functionality
  - Game library filtering, searching, and sorting
  - Game preference persistence
  - Import/export functionality
  - Keyboard navigation for tabs
  - Back button navigation between Settings and Profile

## Data Storage

All user data is stored in the browser's `localStorage`:

| Key | Description |
|-----|-------------|
| `guideRail_theme` | Current theme preference (`green` or `blue`) |
| `guideRail_profile` | Cached Steam profile data (personaname, avatar, steamid, etc.) |
| `guideRail_games` | List of user's Steam games with metadata |
| `guideRail_api_key` | User's Steam Web API key |
| `guideRail_game_preferences` | Default search, filter, and sort preferences |

## Third-party API

GuideRail integrates with the Steam Web API through a CORS proxy:

- **GetPlayerSummaries**: Fetch Steam profile information
- **ResolveVanityURL**: Convert Steam username to Steam ID
- **GetOwnedGames**: Retrieve user's game library with playtime data

The proxy endpoint is configured in `src/server.js` and accessed via the Approxi proxy service.

## Game Preferences System

Users can configure library defaults in the Settings tab:
- **Starting Search**: Default text to pre-fill search field
- **Starting Filter**: Default playtime filter (All, Never Played, Light, Heavy)
- **Starting Sort**: Default sort order (Most Played, Least Played, Name A-Z, Name Z-A)

These preferences are automatically applied when loading the Profile page and can be modified anytime in Settings.

## Theme System

GuideRail supports two color themes:
- **Green Theme** (default): Original earthy green aesthetic with yellow accents
- **Blue Theme**: Modern Steam-inspired blue palette with light blue accents

Theme preference is saved to `localStorage` and persists across sessions. The theme toggle is available in the header on all pages.

## Responsive Design

The application uses CSS media queries to optimize for different screen sizes:
- **Desktop (>600px)**: Full layout with multi-column games grid
- **Mobile (<600px)**: Single-column layout with optimized spacing and touch targets

## Browser Compatibility

GuideRail uses:
- ES6 JavaScript (const, let, arrow functions)
- CSS Grid and Flexbox
- `fetch` API
- `localStorage` API
- `FileReader` API

Requires a modern browser supporting ES6+ features.

## Getting Started

1. **Clone the repository** and navigate to the `/src` directory
2. **Start the server**: Run `node server.js` (requires Node.js)
3. **Open the application**: Navigate to `http://localhost:3000` in your browser
4. **Enter credentials**: 
   - Obtain a Steam API key from [Steam Web API page](https://steamcommunity.com/dev/apikey)
   - Enter your Steam username or profile URL
   - Click "Login" to fetch your profile and library

## Code Style

- Semantic HTML5 elements used for structure
- Vanilla JavaScript with no frameworks or build tools
- Modular JS functions organized by feature
- Consistent naming conventions and comments for clarity
- All styles separated into distinct CSS files by concern
- No inline styles or event handlers

## Accessibility Compliance

GuideRail follows WCAG 2.1 AA guidelines:
- Semantic HTML structure (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`)
- Proper heading hierarchy (h1 → h2 → h3)
- Color contrast ratios exceeding 3:1 for text
- ARIA labels for form controls and dynamic content
- Keyboard navigable interface
- Focus visible indicators

---

**Project Name**: GuideRail  
**Type**: Vanilla web application  
**Year**: 2026  
**University**: CS 343 Course Project
