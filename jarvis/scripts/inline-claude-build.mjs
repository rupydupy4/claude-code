// Turns the `vite build --mode claude` output into one self-contained page for claude.ai:
// no doctype/html/head/body (the host adds them), a <title> first, the Google Fonts stylesheet,
// and every CSS and JS asset inlined (the artifact CSP blocks other hosts and relative files).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('../dist-claude/', import.meta.url));
const html = await readFile(join(dir, 'index.html'), 'utf8');

const cssHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const jsSrcs = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!jsSrcs.length) throw new Error('No module script found in dist-claude/index.html');

const css = (await Promise.all(cssHrefs.map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
const js = (await Promise.all(jsSrcs.map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
// A literal "</script" inside the bundle would end the inline script early.
const safeJs = js.replace(/<\/(script)/gi, '<\\/$1');
const safeCss = css.replace(/<\/(style)/gi, '<\\/$1');

const out = `<title>J.A.R.V.I.S</title>
<meta name="description" content="A voice-enabled personal work assistant: tasks, projects, notes, reminders, documents and calendar.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Sora:wght@500;600&display=swap">
<style>${safeCss}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;
await writeFile(join(dir, 'jarvis.html'), out);
console.log(`dist-claude/jarvis.html ${(out.length / 1024 / 1024).toFixed(2)} MB (${cssHrefs.length} css, ${jsSrcs.length} js inlined)`);
