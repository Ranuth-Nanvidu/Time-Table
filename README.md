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

## Browse weeks

The bar above the timetable shows which week you're looking at. Use the arrows to step a week back or forward, click the dates to jump to the week containing any date, or click "This week" to come back. Each day shows its date. Holidays in the chosen week are listed beside the bar with how many of your classes they cancel, and those classes are faded and struck through.

You can browse from the semester start, or from this week if that's later, through the last teaching week. Until `start` and `weeks` are set, you can browse up to the last holiday in `config/semester.json`. When the dates are set, the bar also shows the teaching week number.

## Build your own timetable

`custom.html`, linked as "Build your own" in the header, lets a student mix slots from different groups. Each module is split into the parts every group attends each week, such as the CM2607 lecture and the CM2607 tutorial. The student picks one slot for each part, so the week always covers the same number of sessions per module as a group's week. Parts with only one slot, such as a lecture all groups share, are picked automatically.

- Start from a group copies that group's slots, so you only swap the ones you want.
- Fill the rest picks a slot for every open part with no clashes, where possible.
- A slot that overlaps one you already picked is marked, and clashing tiles sit side by side in the preview.
- Save as image draws the week as a PNG. Download .ics works like the group calendar file and skips holidays.
- Picks are saved in the browser and in the URL, so Copy link shares the exact week.

The parts come from the data, so a new FET export needs no changes here. The URL stores session ids, so links made before a timetable update may lose picks whose sessions changed.

## Attendance

`attendance.html`, linked as "Attendance" in the header, lets a student mark each class as Attended, Missed or Cancelled once it has started. Each lecture and tutorial is counted separately, the same parts the build-your-own page uses.

- Your timetable picks a group, or "My week" for the week saved on the build-your-own page.
- To mark lists the classes that have started and have no mark yet. Holidays from `config/semester.json` are skipped. The three most recent days are open, and older ones are folded away.
- By lecture and tutorial shows the attendance percentage for each part and how many more classes can be missed while staying at the target. The count covers every class from the start date to the semester end. Cancelled classes don't count either way.
- Settings sets the target (80% by default), the start date and the semester end. When `start` and `weeks` are set in `config/semester.json`, they are the defaults. Until then, tracking starts on the Monday of the first visit and runs for 12 weeks.
- Marks are stored in the browser only. Settings can export them to a `.json` file and import them back.

Each mark stores the part it belongs to, so totals survive a new FET export. A mark whose session no longer exists still counts, and is listed as no longer in the timetable.

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
| `site/model.js` | Derived values: display labels, visible days, hour range, per-group and compare statistics, holidays, the weekly parts each module needs, a custom week from its ids, and date helpers in the timetable's time zone. |
| `site/app.js` | Group picker, compare mode, grid, phone agenda, next-class card, downloads, calendar subscription. |
| `site/custom.html`, `site/custom.js` | The build-your-own page: slot picker, clash checks, preview, image and calendar downloads. |
| `site/attendance.html`, `site/attendance.js` | The attendance page: marking, per-part totals, settings, backup. |
| `site/attendance-core.js` | Attendance counting with no DOM: classes in a date range, which have started, totals and how many can still be missed. |
| `site/poster.js` | Draws the PNG on a canvas at 3200 px wide, for a group or a custom week. |
| `site/ics.js` | Builds the calendar file for a group or any list of sessions. Times use the `Asia/Colombo` zone. |
| `site/styles.css` | Light and dark themes. Module colours are the `--m0` to `--m4` tokens. |
