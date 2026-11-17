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

## Semester dates and holidays

`config/semester.json` holds what the FET export doesn't:

- `start`: the Monday of week 1, as `YYYY-MM-DD`.
- `weeks`: how many teaching weeks, from 1 to 30.
- `holidays`: single days as `{ "date", "name" }`, or ranges such as a study week as `{ "from", "to", "name" }`.

When `start` and `weeks` are set, the build writes one subscribable calendar feed per group to `site/cal/`. Students who subscribe get timetable changes automatically. Until both are set, the build warns, skips the feeds, and the site hides the Subscribe option. Classes on holiday dates are left out of both the feeds and the downloaded `.ics`, and the site shows when today is a holiday.

The build stops with an error if a date is malformed, `start` isn't a Monday, `weeks` is out of range, or a range runs backwards. Check the holiday list against the government gazette each year.

## Online meeting links

`config/meetings.json` holds the Microsoft Teams link for each online session. An entry attaches to every online session with the same `module` and `kind`, and `groups` says who the meeting is for. A group split across two meetings, such as B in the CM2603 tutorial, is listed in both, and its students see both links with a note to join the one they were assigned to.

On the site, online tiles show a Join tag. Clicking one opens a sheet with a Join in Teams button and a Copy link button. The next-class card also shows a Join button when the next class is online. Downloaded calendar files and feeds include the links in each event.

The build stops if an entry has a missing label, a URL that isn't `https://`, or matches no online session. It warns when an online session has a group with no link.

## Compare groups

Pick "Compare with" under the group letters to see the classes two or more groups share and the free time they have in common. The URL updates to, for example, `#B+C`, so you can send it to a friend.

## Files

| File | Purpose |
| --- | --- |
| `scripts/build-data.mjs` | Parses the FET export into one list of sessions, each with the groups that attend it. |
| `config/semester.json` | Semester start, length, and holidays. Edit by hand. |
| `config/meetings.json` | Teams links for online sessions. Edit by hand. |
| `site/data.js` | Generated data. Do not edit by hand. |
| `site/cal/` | Generated calendar feeds, one per group. Not committed. |
| `site/model.js` | Derived values: display labels, visible days, hour range, per-group and compare statistics, holidays. |
| `site/app.js` | Group picker, compare mode, grid, phone agenda, next-class card, downloads, calendar subscription. |
| `site/poster.js` | Draws the PNG on a canvas at 3200 px wide. |
| `site/ics.js` | Builds the calendar file. Times use the `Asia/Colombo` zone. |
| `site/styles.css` | Light and dark themes. Module colours are the `--m0` to `--m4` tokens. |
