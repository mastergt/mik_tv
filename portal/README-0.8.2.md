# IPTV Portal v0.8.2 — remote navigation and EPG

This patch modifies only the static portal and adds a repository-wide `.gitignore`.
No changes to NestJS, Angular, database, or environment variables.

## Changes

- Up/Down and PageUp/PageDown (7 entries) work with the channel list and EPG.
- As the remote approaches the end of a loaded channel page, the next batch is fetched.
- Paginated channel loads preserve the currently highlighted channel.
- Old API responses from previous logins/providers are ignored.
- Favorite-only list restores a visible selection when switching tabs.
- EPG opens at the current broadcast; the header date follows the selected program.
- Late DVR responses cannot interrupt a newer channel.
- Setup dialog focuses provider selection; Enter connects.
- Subscriber login supports Up/Down focus and Enter/Back without a mouse.
- Client registration reports app version 0.8.2; browser assets use v=0.8.2.

## Deploy to DEV

```sh
cd /usr/local/nodejs/dev/iptv_front
git fetch origin
git switch main
git pull --ff-only origin main
node portal/tests/check.cjs
node portal/tests/mag-adapter.test.cjs
node portal/tests/navigation.test.cjs
```

The branch is prepared as a PR: review/merge it before `git pull`.
The portal is static; no build or PM2 restart is needed. Reload the TV portal or clear its browser cache.

## Verify in Chrome

1. Choose a provider with Enter.
2. Open a channel; press arrow keys to navigate.
3. In a catalogue larger than PAGE_SIZE, use Down or PageDown to fetch more without clicking.
4. Open EPG (I/E, or MAG F2), verify selection starts at the current show.
5. Use Up/Down/PageUp/PageDown; date should change when crossing midnight.
6. Open login (L), navigate with arrows, and close with Escape.
7. Switch to a different channel while a DVR request is pending; the old archive must not start.

MAG250 native playback and special remote codes require testing on real hardware.
Keep credentials on HTTPS; do not enter subscriber passwords into an untrusted HTTP portal.
