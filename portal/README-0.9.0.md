# mik_tv — software completion batch v0.9.0 (A.7–A.9)

This is a cumulative change **on top of v0.8.6 / PR #5**. It completes the planned software work on remote search, category switching and bounded LIVE recovery. Physical acceptance on MAG250 and Android remains open.

## A.7 — channel search and remote navigation

- **S** or **/** on a PC, the **Search** button, or **Home → Search** opens the search dialog.
- On MAG250, the TV on-screen keyboard opens with the dialog. OK submits; Back first closes the keyboard and then the dialog.
- Case-insensitive partial matching on **channel name, number, and genre label**.
- Search initially covers the locally loaded part of the catalogue; if there is no match, up to **12 additional pages** are fetched serially from the existing `/api/v1/client/streams` endpoint.
- If a result is found, automatic paging stops. The operator can still use **Load more** to expand the results manually. No unrestricted download of the entire catalogue.
- Back clears an active search filter before dismissing the channel list. A new channel category selection also clears the search.
- While the channel panel is open, **Left/Right** cycles **All → Favorites → Genres** from the loaded catalogue. Left/Right in EPG and DVR retain their previous uses.

## A.8 — stream reliability

- Continue to try each configured source in priority order when an HTML5/MAG player reports an error.
- If all LIVE sources fail or a playback-start API request has a transient error (network or HTTP 5xx), schedule **at most 3 replays** at **1.5 s, 3 s and 6 s**. This does not loop forever.
- Invalid account/session/access errors (including 401, 403, 404, 409) are **not retried**. A rejected heartbeat also stops the player; only transient network/server errors enter bounded recovery.
- The UI shows the current recovery attempt and offers **Retry** after attempts are exhausted. Changing channels cancels pending retries and resets the budget.
- In HTML5 mode, `waiting`/`stalled` events start an **18-second watchdog**. `playing`/`canplay`, stop, pause, or readiness of buffered video cancel/suppress false alarms. Native MAG uses its existing event-driven errors; there is no HTML5 watchdog on MAG.
- DVR seeking is left separate from LIVE recovery to avoid unintentionally switching from an archive to LIVE.

## A.9 — verification and deployment

Run tests on a working clone **after merging PR #5 and this PR**:

```bash
cd /usr/local/nodejs/dev/iptv_front
node portal/tests/check.cjs
for test in portal/tests/*.test.cjs; do node "$test" || exit 1; done
```

For manual Chrome validation:
1. Open the channel list; press `S`, search by Cyrillic name, channel number or genre. Clear and try again.
2. Open channel list and press Left/Right to cycle categories. Try favorites and an empty category.
3. Open the home menu, choose Search, and use the on-screen keyboard from the search field.
4. Test a channel with two sources where the primary one fails: playback should choose the backup.
5. Test both sources failing: the recovery banner should display three spaced retry attempts, stop, and offer a manual retry.
6. During a pending retry, switch to another channel. The old stream must not start again.
7. Verify EPG, DVR, parental restrictions, notifications, login/logout and last-channel resume.

Hardware tests **required later**:
- MAG250 (firmware version, key scan codes, chromakey, native HLS/UDP playback, memory and 720×576/720p layout).
- Android STB (system browser vs app WebView, back/home keys, HTML5/HLS video, buffer recovery and fullscreen behavior).
- Trial with authenticated subscriber accounts using **HTTPS** and live/blocked streams; do not send subscriber credentials across insecure HTTP.

### Deploy

After PR #5 is merged, merge this PR, then:

```bash
cd /usr/local/nodejs/dev/iptv_front
git switch main
git pull --ff-only origin main
for test in portal/tests/*.test.cjs; do node "$test" || exit 1; done
```

The existing DEV directory name may stay `iptv_front`; the codebase is **mik_tv**. No PostgreSQL migration, environment changes, Angular rebuild or PM2 restart is required. Refresh the static TV portal: CSS/JS query version is now `v=0.9.0`.

### Known limitations

- A search on a very large catalogue only scans the loaded results plus 12 pages, to protect old devices.
- Browser `play()` permission and network stall detection depend on the browser/firmware; a test on an actual set-top box is mandatory for production acceptance.
- This batch does **not** add a new Android native APK, Electron desktop client, new DVR storage, or backend features; those would be separate projects, not remaining parts of the TV portal compatibility stage.
- The existing repository is currently **public**. Keep `.env`, device secrets, subscriber data, and production dumps out of Git history.
