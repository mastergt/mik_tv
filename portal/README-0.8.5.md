# mik_tv — Portal v0.8.5 (Stage A.5)

This release adds an on-screen keyboard for remote-only TV terminals, especially MAG250.
The code remains ES5 and uses no UI framework or new runtime dependency.

## New behavior

- MAG250: opening the subscriber login dialog automatically opens the TV keyboard.
- Chrome/Android: the usual physical/software keyboard remains the default; click **Экранная клавиатура** in the login dialog to test TV input.
- RU/EN letters, shift/caps, digits, space, erase, clear, next field, submit and close.
- Keyboard navigation: arrows move the orange focus; OK enters the highlighted key; BACK/Escape closes the keyboard, then another BACK closes login.
- The **Далее** key moves from login to password. The **OK** key on the keyboard moves to password when entering a login, and submits from the password field.
- Passwords are not copied into any preview text: the keyboard header shows bullets, and closing the login clears the password input.
- The virtual keyboard uses about 50 buttons, rebuilds the layout only when switching RU/EN or case and does not perform network requests.

## Testing

After merging this PR:

```bash
cd /usr/local/nodejs/dev/iptv_front
git switch main
git pull --ff-only origin main

node portal/tests/check.cjs
node portal/tests/mag-adapter.test.cjs
node portal/tests/navigation.test.cjs
node portal/tests/dvr-epg.test.cjs
node portal/tests/remote-ux.test.cjs
node portal/tests/tv-keyboard.test.cjs
```

Reload the portal. There are no backend, Angular, PostgreSQL, environment, build or PM2 changes.

### Manual checks in Chrome

1. Open the portal and click **Войти**, then **Экранная клавиатура**.
2. Use arrow keys and Enter, switch from RU to EN, try Shift/123, Backspace and Delete.
3. Select **Далее** to input a password. The keyboard should display only masked characters.
4. Close the keyboard using Escape; the ordinary login form should still be accessible.
5. Test a 1280x720 browser window and a small 720x576 window.

### Hardware checks when MAG250 becomes available

- Automatic keyboard launch on login.
- Actual remote Back/OK/navigation scan codes.
- Layout fitting in 720p and 576p.
- Native on-screen input API interaction (some firmware may display its own keyboard).
- Whether HTTPS is available on this firmware: do not enter real subscriber passwords over untrusted HTTP.

## Limitations

The CSS follows the existing mik_tv visual scheme rather than copying third-party bitmap assets.
Chrome automated screenshot validation did not complete in the current environment; the six Node tests passed locally. Real MAG250 hardware remains untested.
