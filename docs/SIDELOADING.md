# Building and installing Fuel on your iPhone (no Mac)

Fuel is installed like any app you build yourself: GitHub builds an unsigned
`.ipa`, and a sideloading tool signs it on your iPhone with **your own free
Apple ID**. Apple allows this for your own devices. Apps signed this way expire
after 7 days and must be refreshed (the tools below do this for you).

> Keep the `.ipa` to yourself. Don't redistribute it. This project doesn't
> publish app binaries.

## 1. One-time iPhone setup

1. Install **AltStore Classic** using **AltServer for Windows**, following the
   official guide: <https://faq.altstore.io/>. AltServer needs Apple's iTunes
   and iCloud for Windows (the versions from apple.com, not the Microsoft Store).
   You type your Apple ID into AltServer yourself.
   - Alternative: **SideStore** (<https://docs.sidestore.io/>) refreshes on the
     phone without a PC after setup, but setup takes more steps.
2. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode**
   (required for apps you sign yourself), then restart when asked.

## 2. Build the app on GitHub

1. Go to **Actions → iOS build (unsigned) → Run workflow**.
2. Pick a configuration:
   - **Debug**: a development client. Loads the JavaScript from `npm start`
     on your PC, with instant reloads while developing. Rebuild only when
     native modules change.
   - **Release**: a standalone app that works without the PC.
3. When the run finishes (about 15–25 min), download the artifact:

   ```bash
   gh run download --repo Naftali-S/fuel --name Fuel-Debug-<run number>
   ```

## 3. Install

- **AltStore:** with AltServer running and the iPhone connected (USB, or
  Wi-Fi sync enabled), **Shift + click** the AltServer tray icon →
  **Sideload .ipa…** → pick the downloaded `.ipa`.
- **SideStore:** move the `.ipa` to the iPhone (for example iCloud Drive), open
  it in SideStore → **My Apps → +**.

Then open **Settings → General → VPN & Device Management** and trust your
Apple ID's developer certificate, if asked.

## 4. Development loop (Debug build)

```bash
npm start
```

Phone and PC on the same Wi-Fi → open Fuel → pick the server shown, or enter
`http://<your-PC-IP>:8081`. If it can't connect, allow **Node.js** on private
networks in Windows Defender Firewall, or run `npx expo start --dev-client --tunnel`.

## 5. Refresh every 7 days

AltStore refreshes in the background when AltServer is running on the same
Wi-Fi. SideStore refreshes on the phone. If the app expires, refresh it; your
data stays as long as you don't delete the app.
