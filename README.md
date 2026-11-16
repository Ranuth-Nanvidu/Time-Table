# AI & DS Stage 2 timetable

A static site that shows the Semester 1 timetable for groups A to E. A student picks a group, then saves the week as a PNG or downloads an `.ics` calendar file.

## Deploy to Netlify

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow rebuilds `site/data.js` from the raw export, then publishes the `site` folder to Netlify. A parse error fails the run and nothing is published.

The workflow needs two repository secrets, set under Settings, Secrets and variables, Actions:

| Secret | Where to find it |
| --- | --- |
| `NETLIFY_AUTH_TOKEN` | Netlify, User settings, Applications, Personal access tokens, New access token. |
| `NETLIFY_SITE_ID` | Netlify, your site, Site configuration, Site details, Site ID. |

To run a deploy without pushing, open the Actions tab, choose "Deploy to Netlify", and select "Run workflow".

To preview locally, open `site/index.html` in a browser.

## Update the timetable

1. Replace the `.html` file in `Raw Time Table` with the new FET export. Keep exactly one `.html` file in that folder.
2. Run `node scripts/build-data.mjs`.

The script rewrites `site/data.js`. It stops with an error if a cell's printed time disagrees with its position in the grid, or if a shared session is missing from one of the groups it names.

## Files

| File | Purpose |
| --- | --- |
| `scripts/build-data.mjs` | Parses the FET export into one list of sessions, each with the groups that attend it. |
| `site/data.js` | Generated data. Do not edit by hand. |
| `site/model.js` | Derived values: display labels, visible days, hour range, per-group statistics. |
| `site/app.js` | Group picker, grid, phone agenda, next-class card, downloads. |
| `site/poster.js` | Draws the PNG on a canvas at 3200 px wide. |
| `site/ics.js` | Builds the calendar file. Times use the `Asia/Colombo` zone. |
| `site/styles.css` | Light and dark themes. Module colours are the `--m0` to `--m4` tokens. |
