# GuideRail

GuideRail is a vanilla HTML/CSS/JS web app for organizing a Steam backlog.

## Third-party API

GuideRail integrates with the Steam Web API through a local Node proxy in [src/server.js](src/server.js):

- GetPlayerSummaries: profile lookup
- ResolveVanityURL: vanity name to Steam ID lookup
- GetOwnedGames: game library import

## Local data persistence

The app stores user data in localStorage:

- guideRail_profile: Steam profile summary
- guideRail_games: imported owned games list
