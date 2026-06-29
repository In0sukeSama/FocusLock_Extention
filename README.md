# FocusLock 🔒

A free, open-source Chrome extension to stop doomscrolling and manage your browsing time with smart **focus budgets**.

## Features
- Set daily time budgets per website (YouTube, Reddit, Instagram, etc.)
- Tracks **active** browsing time only — paused when tab is hidden or window is unfocused
- Blocks access with a motivational page when budget runs out
- Resets automatically at midnight
- Pause protection for a set duration
- Insights dashboard with weekly usage charts
- Dark mode

## Installation (since it's not on the Chrome Web Store)

1. Download this repo — click the green **Code** button → **Download ZIP**
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked**
6. Select the unzipped `focuslock` folder
7. The extension is now active — pin it to your toolbar!

## How it works
Add any website, set a daily budget (e.g. 30 min), and FocusLock silently tracks your active time on that site. When the budget runs out, you're redirected to a block page. The budget resets at midnight every day.

## Tech stack
- Manifest V3
- Vanilla JavaScript
- Chrome Extension APIs (`storage`, `tabs`, `alarms`, `notifications`, `scripting`)

## Contributing
Pull requests welcome. Open an issue first for major changes.

## License
MIT
