# Isolator

A Firefox WebExtension that turns the current page into an element picker. Click the toolbar button, hover to highlight an element, then click to open a new tab that renders only that picked element.

## Load in Firefox

1. Open `about:debugging`.
2. Select `This Firefox`.
3. Click `Load Temporary Add-on`.
4. Pick [`manifest.json`](/home/eugene/src/Isolate/manifest.json).

## Behavior

- Click the extension button to toggle picker mode on the active tab.
- Hovering shows a highlight box and a compact element label.
- While picker mode is active, scroll down to move the selection to its parent element and scroll up to drill back down toward the originally hovered element.
- Clicking an element opens a new tab that renders only the picked element and its descendants, using the page's own stylesheets.
- Press `Escape` to cancel picker mode.
