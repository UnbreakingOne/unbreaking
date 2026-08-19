## Move apps into games and rename navigation

This PR merges the existing Apps content into the Games page and renames the Games navigation label to "Apps" so the app listing appears under the same UI. It also updates JavaScript to be defensive against the removed appsContent element to avoid runtime errors.

Changes:
- public/index.html: moved apps cards into the gamesLinksContainer, removed the separate appsContent block, updated sidebar nav label to Apps.
- public/js.js: guarded hideAllSections against missing appsContent; made setupSearch defensive; aliased showApps to showGames.

Why:
- You asked to move all apps from the apps page into the games page and make the games page name "Apps" while keeping behavior identical.

Testing notes:
- Click the "Apps" sidebar item to view the merged listing.
- Search should filter cards without console errors.
- Embedded /app/* and /game/* links should still load as before.
