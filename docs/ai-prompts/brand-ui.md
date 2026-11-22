# Prompt: Jiwar brand for the UI

Brief given to Claude Code for this part, consolidated from the working session. Referenced from [AI_USAGE.md](../../AI_USAGE.md).

---

# Task: make the UI look like Jiwar

The React UI works but uses a generic style. Restyle it with the Jiwar brand we already use in our decks and poster. Change how it looks, not how it works: no changes to routes, data loading or the API client.

## Brand (from our earlier Jiwar design notes)
- Colours: `green-900` #163F2A (text, dark sections), `green-700` #1F5C3D (primary buttons, highlighted cards, logo background), `green-600` #2A6B49 (hover), `green-100` #DCE8DF (success), `cream-100` #F4EFE3 (page background), `cream-50` #FBF8F0 (cards), `sand-300` #DDD5C0 (borders), `sand-500` #D9D2BF (secondary text on green), `muted-600` #4A6B57 (secondary text), `red-600` #B8362D (section labels, warnings), `red-500` #D9443A (the logo's dot and urgent alerts only).
- Type: Cormorant Garamond 600 for headings, Inter for text (at least 16 px); in Arabic, Amiri for headings and the wordmark and IBM Plex Sans Arabic for text. All from Google Fonts.
- Components: cream cards with a 1 px sand border and 24 px corners; highlighted cards in `green-700` with cream text; pill-shaped buttons (primary green with cream text, secondary outlined); small bold letter-spaced labels in `red-600` above headings; status badges always with a word, never colour alone.
- Logo: the arched doorway with a leaf and red dot above a key, with جوار and JIWAR, on deep green. Use our existing files: `jiwar-logo.png`, `jiwar-key.svg` (cream key for dark backgrounds), `jiwar-key-on-cream.svg` and `favicon.svg`, copied into `ui/public/brand/`.

## Scope
- Define the colours once as CSS variables and use the names everywhere; swap the fonts for Arabic with `:lang(ar)`.
- Header: deep green bar with the cream key mark, the wordmark "Jiwar" and "جوار", the navigation with a red underline for the active page, the demo-user switcher and the language toggle.
- Home: a green hero card with the logo, a label ("Learn, then earn"), a serif heading, the tagline and a "Browse courses" button; the service status as cards with worded badges.
- Course pages: a red label above the heading, cream cards with serif titles, and the form in a card.
- Favicon, page title "Jiwar · جوار", theme colour and description in `index.html`.
- All new text in both languages in the translation file.
- Keep the layout mobile first, keep logical properties for right-to-left, and keep a visible focus style.

## Process
Check the result in the browser on desktop, on a phone-sized screen and in Arabic. Run lint, the format check and the UI build.
