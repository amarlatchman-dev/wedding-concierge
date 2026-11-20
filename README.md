# Rohan & Gazal: Wedding Guest Concierge

A mobile web app for guests at Neejanand Luxurious Resort (Dec 4–5, 2026), plus an admin dashboard.
It's a static site with no build step and no server, so it can be hosted anywhere static files are served, such as GitHub Pages.

## Several weddings, one repo
Each wedding has its own folder (`rohan-gazal/`, …) with its own guest app, admin, password and data. All weddings share the code at the root (`js/`, `app.css`, `vendor/`).
The root `index.html` and `admin.html` redirect to `rohan-gazal/`, so links sent before the move keep working.

**New wedding:** `node tools/new-wedding.mjs <folder> "<Couple>" <first-day> <last-day> "<Venue>" <admin-password> ["<address>"]`, then commit and push.
The site is live at `https://amarlatchman-dev.github.io/wedding-concierge/<folder>/`. The organizer uploads the venue map and edits the events in `<folder>/admin.html`.
A new wedding starts without invitation artwork (`wedding.art: false`) and with the original-image map. An illustrated map, like Rohan & Gazal's (`tools/areas.mjs`), has to be traced by hand for each venue.
Note: a GitHub publishing token can write to every folder in the repo.

Inside each wedding folder:
- `index.html`: guest app. Personal links look like `index.html#/g/<token>`.
- `admin.html`: admin dashboard (password protected).
- `data/wedding.json`: all published data. Guest details are encrypted per guest (AES-GCM, with the key derived from that guest's link token).
  The admin copy is encrypted with the admin password (PBKDF2, 250k rounds), so nothing personal is readable in this public file.
- `data/map.jpg`: property map. Admins can replace it with a PDF or image, which PDF.js renders in the browser.
- `tools/seed.mjs`: regenerates the starting data (`node tools/seed.mjs <admin-password> <links-file>`). **This overwrites admin edits.**

## How publishing works
Admin edits stay in the browser until **Publish** is clicked. With a GitHub token saved in Settings (fine-grained, Contents read/write on this repo only),
Publish commits `data/wedding.json` directly, and guests pick up the change within about 2 minutes. Without a token, Publish downloads the file so it can be uploaded by hand.

## Routing
Admins draw a path network (points and segments, each marked walk, vehicle or both, and optionally restricted). Routes use Dijkstra over that network.
Places join the network at the nearest point on a segment. Distance comes from `metersPerPixel` (set with **Set scale**), and walking time assumes 1.2 m/s.
GPS is used only after two lat/lng anchor points are set under **GPS setup**. Otherwise directions start from the guest's cottage.

## WhatsApp
**Admin → WhatsApp** writes complete messages for each guest: event reminders, the day's schedule, and schedule changes. Each one includes the time, the venue, walking directions from that guest's cottage, the dress code and their personal link, so it works even for guests who never open the app.
Sending uses WhatsApp click-to-chat. Tap **Send** (or **Send to next guest**) and WhatsApp opens with the message ready, sent from the organizer's own number. Sent status is remembered in that browser.
A general version (no names) can be copied into a WhatsApp group or broadcast list.

Automatic sending (no taps) would need the WhatsApp Business Cloud API, run from a scheduled GitHub Action. That requires a Meta Business account, a dedicated phone number and approved message templates.
