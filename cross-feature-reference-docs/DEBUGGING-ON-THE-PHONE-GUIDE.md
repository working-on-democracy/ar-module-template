# Debugging on the phone (the console of a phone, on your computer)

<!-- overview -->
## Introduction

When something goes wrong in a web page, the browser writes a message
into its console: an error, a warning, a line a component logged on
purpose. On a computer you open the console with a right-click. On a phone
there's no such window, and AR only really runs on a phone. So the most
useful clue, the error message, is usually invisible exactly where it's
needed.

This guide shows two ways to get it onto your computer. The first works
with any phone and any browser, needs no cable, and puts the messages in a
file an AI assistant can read by itself. The second uses the browsers' own
remote debugging with a cable, for when you need more than messages.

<!-- /overview -->

## About this guide

For anyone testing on a phone with the dev servers (`npm run dev:ar`, and
`npm run dev` on a tablet or another computer). Not tied to one feature, so
it lives here rather than in a feature guide. The mechanism is
`scripts/dev-console-relay.ts`, registered in `vite.config.ts`.

## 1. The quick way: `dev-console.log`

While a dev server runs, every browser that opens one of its pages (phone,
tablet, computer) sends its console output to the server:

- **Warnings and errors** appear in the terminal where the server runs,
  right away, with the device in front: `[iOS Safari] error …`.
- **Everything** goes into the file `dev-console.log` in the project folder:
  logs, warnings, errors with their stack trace, uncaught errors and
  rejected promises, one line per message with time and device:

  ```
  16:04:05 [iOS Safari] ERROR TypeError: Cannot read properties of undefined (reading 'position')
      at tick (…/a-frame-components/float-and-spin.ts:24:19)
  ```

The file starts empty with every server start and is ignored by Git
(`*.log` in `.gitignore`). Nothing to set up on the phone: open the page as
usual (QR code), and the messages arrive.

**Handing it to an AI agent:** "Read dev-console.log and explain the first
error." The agent reads the file itself; nothing to copy. The first error is
usually the cause; later ones often follow from it.

**Logging on purpose:** `console.log(...)` in a component ends up in the file
too, which makes it a simple way to see what happens when on the phone.
Don't log in every frame (`tick`): the page sends at most 200 messages per
batch and cuts the rest, and the file stops at 5 MB.

**What it can't do:** show the page's elements, step through code, or catch
a message from before the page started loading. For that, see section 2.

## 2. With a cable: the browsers' remote debugging

The browser's full developer tools, running on the computer, attached to
the page on the phone.

| Phone | Computer | How |
|---|---|---|
| Android, Chrome | any, with Chrome | Phone: *Settings* → *About phone* → tap *Build number* seven times → *Developer options* → *USB debugging* on. Connect by USB, allow the computer on the phone. Computer: Chrome → `chrome://inspect` → *inspect* under the page. |
| Android, Firefox | any, with Firefox | Phone: Firefox *Settings* → *Remote debugging via USB* on, plus *USB debugging* as above. Computer: Firefox → `about:debugging` → the phone → the tab. |
| iPhone / iPad, Safari | Mac only | iPhone: *Settings* → *Apps* → *Safari* → *Advanced* → *Web Inspector* on. Mac: Safari → *Settings* → *Advanced* → *Show features for web developers*. Connect by cable; Safari's *Develop* menu → the phone → the page. Other browsers on the iPhone use the same engine; if they don't show up there, test in Safari. |
| iPhone / iPad | Windows or Linux | No built-in way: use `dev-console.log` (section 1). |

**Handing it to an AI agent:** in Chrome's console, right-click → *Save as…*
and give the agent the saved file; in Safari or Firefox, select the messages
and copy them into the chat. Paste error messages as they are, don't
paraphrase them.

## 3. Which one when

| You want to … | Use |
|---|---|
| see why something doesn't work on the phone | `dev-console.log` |
| let an AI agent look at the errors | `dev-console.log` ("read dev-console.log") |
| check what a component does over time | `console.log` in the component → `dev-console.log` |
| look at the page's elements, styles, network requests | remote debugging (section 2) |
| pause the code and step through it | remote debugging (section 2) |
| test without any phone at all | [HEADLESS-AR-TESTING-GUIDE.md](HEADLESS-AR-TESTING-GUIDE.md) |

## 4. How it works

`scripts/dev-console-relay.ts` is a Vite plugin that only runs in the dev
servers (`apply: "serve"`), so no build contains any of it. It adds a small
script at the very top of every page the dev server delivers. That script
wraps `console.log`, `info`, `warn` and `error`, listens for uncaught errors
and rejected promises, and sends the messages in small batches to
`/__dev-console` on the dev server, which appends them to `dev-console.log`
and prints warnings and errors. It runs before A-Frame and the AR engine
load, so their messages are included. Styling codes (`%c`) are removed, and
the device is guessed from the browser's user agent (e.g. `iOS Safari`,
`Android Chrome`, `Mac Chrome`).

<!-- project-specific -->
## In this template

- Works in both previews: `npm run dev` (`index.html`) and
  `npm run dev:ar` (`ar.html`).
- A module running on the AN ALLE! platform (the host) is a build, so it
  doesn't send anything: there, only remote debugging (section 2) shows the
  console. Reproduce a problem in `dev:ar` first if you can.
<!-- /project-specific -->
