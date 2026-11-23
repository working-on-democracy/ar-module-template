// Vite plugin for the dev servers (`npm run dev` and `npm run dev:ar`): every
// browser that opens a preview page (phone, tablet, computer) sends its console
// output to the dev server, which prints warnings and errors in the terminal
// and writes everything to dev-console.log in the project folder. On a phone
// there's no console to look at; this way it can be read on the computer, and
// an AI agent can read the file directly ("read dev-console.log").
// Guide: cross-feature-reference-docs/DEBUGGING-ON-THE-PHONE-GUIDE.md.
//
// Only in the dev servers: no build (dist-platform/, dist-ar/) contains any
// of this. The file starts empty with every server start and is ignored by
// Git (*.log in .gitignore).
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "/__dev-console";
const MAX_BODY = 64 * 1024; // bytes per request
const MAX_FILE = 5 * 1024 * 1024; // stop writing after 5 MB

// Runs in the browser, before anything else on the page (so it also catches
// errors while 8frame and the engine load). Wraps console.log/info/warn/error
// and records uncaught errors; sends them in small batches.
const CLIENT = `(() => {
  const endpoint = ${JSON.stringify(ENDPOINT)};
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iOS"
    : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\\//.test(ua) ? "Edge"
    : /CriOS|Chrome\\//.test(ua) ? "Chrome" : /FxiOS|Firefox\\//.test(ua) ? "Firefox" : /Safari\\//.test(ua) ? "Safari" : "Browser";
  const device = os + " " + browser;
  let queue = [];
  let timer = 0;
  const flush = () => {
    timer = 0;
    if (!queue.length) return;
    const body = JSON.stringify({ device, entries: queue });
    queue = [];
    fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => {});
  };
  const show = (v) => {
    if (v instanceof Error) return v.stack || String(v);
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };
  const push = (level, parts) => {
    if (queue.length >= 200) return; // a flood (e.g. logging every frame) is cut
    // console.log("%cstyled", "color: red"): drop the %c markers and their CSS.
    if (typeof parts[0] === "string" && parts[0].includes("%c")) {
      const styles = parts[0].split("%c").length - 1;
      parts = [parts[0].replace(/%c/g, ""), ...parts.slice(1 + styles)];
    }
    const text = parts.map(show).join(" ").slice(0, 4000);
    queue.push({ t: Date.now(), level, text });
    if (!timer) timer = setTimeout(flush, 300);
  };
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => { push(level, args); original(...args); };
  }
  addEventListener("error", (e) => push("error", ["Uncaught " + (e.error ? show(e.error) : e.message) + (e.filename ? " (" + e.filename + ":" + e.lineno + ")" : "")]));
  addEventListener("unhandledrejection", (e) => push("error", ["Unhandled promise rejection: " + show(e.reason)]));
  addEventListener("pagehide", flush);
  push("info", ["--- page loaded: " + location.href + " (" + ua + ")"]);
})();`;

const COLORS: Record<string, string> = { error: "\x1b[31m", warn: "\x1b[33m" };

export function devConsoleRelay(fileName = "dev-console.log") {
  let file = "";
  let written = 0;
  return {
    name: "dev-console-relay",
    apply: "serve" as const,
    configResolved(config: any) {
      file = resolve(config.root, fileName);
    },
    configureServer(server: any) {
      writeFileSync(file, "");
      written = 0;
      server.middlewares.use(ENDPOINT, (req: any, res: any) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk;
          if (body.length > MAX_BODY) req.destroy();
        });
        req.on("end", () => {
          res.statusCode = 204;
          res.end();
          let data: any;
          try {
            data = JSON.parse(body);
          } catch {
            return;
          }
          const device = String(data.device ?? "?").slice(0, 40);
          for (const entry of Array.isArray(data.entries) ? data.entries : []) {
            const level = ["log", "info", "warn", "error"].includes(entry.level) ? entry.level : "log";
            const time = new Date(Number(entry.t) || Date.now()).toTimeString().slice(0, 8);
            const line = `${time} [${device}] ${level.toUpperCase()} ${String(entry.text ?? "")}`;
            if (written < MAX_FILE) {
              appendFileSync(file, line + "\n");
              written += line.length + 1;
              if (written >= MAX_FILE) appendFileSync(file, "--- dev-console.log is full (5 MB); restart npm run dev ---\n");
            }
            // Only warnings and errors in the terminal; everything is in the file.
            if (COLORS[level]) console.log(`  ${COLORS[level]}[${device}] ${level}\x1b[0m ${String(entry.text ?? "")}`);
          }
        });
      });
    },
    transformIndexHtml() {
      return [{ tag: "script", children: CLIENT, injectTo: "head-prepend" as const }];
    }
  };
}
