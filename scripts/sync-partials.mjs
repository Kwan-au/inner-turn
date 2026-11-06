// Writes shared partials into the pages that host them.
// listing-quote: / embeds the same listing-quote-v2 form as /quote. Prices
// come from the published card on pricing.html.
// file-trust: the FILE dispatch offer on marketing pages. Edit the partial,
// not the copies. Runs in the Netlify build; `--check` fails on drift.
// gtm: container GTM-P9RTS8RN. Head snippet goes immediately after <head>,
// noscript immediately after <body>. Public marketing pages only. The
// <!-- gtm:body --> line in partials/gtm.html splits the two snippets.
// No direct gtag. App, login, and desk pages are not hosts.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const FILE_TRUST_HOSTS = [
  "index.html",
  "cleaners.html",
  "pricing.html",
  "areas.html",
  "richmond.html",
  "south-yarra.html",
  "southbank.html",
  "docklands.html",
  "east-melbourne.html",
  "fitzroy.html",
  "collingwood.html",
  "st-kilda.html",
  "how-it-works.html",
  "lot-pack.html",
  "photo-pack.html",
  "trust.html",
  "events.html",
  "same-day.html",
  "quote.html",
  "policies.html",
  "terms.html",
  "privacy.html"
];
const GTM_HOSTS = [
  ...FILE_TRUST_HOSTS,
  "thanks.html",
  "404.html"
];
const PARTS = [
  { name: "listing-quote", partial: "partials/listing-quote.html", hosts: ["index.html"] },
  { name: "file-trust", partial: "partials/file-trust.html", hosts: FILE_TRUST_HOSTS }
];
const check = process.argv.includes("--check");

function markerPair(name, partial) {
  return {
    start: `<!-- ${name}:start (generated from ${partial} — edit the partial) -->`,
    end: `<!-- ${name}:end -->`
  };
}

function afterOpenTag(html, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>`, "i").exec(html);
  if (!match) return -1;
  let at = match.index + match[0].length;
  if (html[at] === "\r") at += 1;
  if (html[at] === "\n") at += 1;
  return at;
}

function upsertBlock(html, name, partial, body, locate) {
  const { start, end } = markerPair(name, partial);
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a >= 0 && b > a) return html.slice(0, a + start.length) + "\n" + body + "\n" + html.slice(b);
  if (a >= 0 || b >= 0) throw new Error(`${name} markers are unbalanced`);
  const at = locate(html);
  if (at < 0) throw new Error(`no <${name.endsWith("body") ? "body" : "head"}> for ${name}`);
  return html.slice(0, at) + `${start}\n${body}\n${end}\n` + html.slice(at);
}

const card = {};
for (const m of (await read("pricing.html")).matchAll(/<li>(\d)-bed \$(\d+) · same-day \+\$(\d+)<\/li>/g)) {
  card[m[1]] = { price: m[2], same: m[3] };
}

let drift = false;
for (const part of PARTS) {
  const START = `<!-- ${part.name}:start (generated from ${part.partial} — edit the partial) -->`;
  const END = `<!-- ${part.name}:end -->`;
  const body = (await read(part.partial)).trimEnd().replace(/\{\{(price|same):(\d)\}\}/g, (_, key, beds) => {
    const value = card[beds]?.[key];
    if (!value) throw new Error(`pricing.html has no ${beds}-bed ${key}`);
    return value;
  });
  for (const file of part.hosts) {
    const html = await read(file);
    const a = html.indexOf(START);
    const b = html.indexOf(END);
    if (a < 0 || b < a) throw new Error(`${file} is missing the ${part.name} markers`);
    const next = html.slice(0, a + START.length) + "\n" + body + "\n" + html.slice(b);
    if (next === html) continue;
    drift = true;
    if (!check) await writeFile(new URL(file, root), next);
    console.log(`${check ? "out of date" : "synced"}: ${file}`);
  }
}
const gtmPartial = "partials/gtm.html";
const gtmRaw = (await read(gtmPartial)).trim();
const gtmSplit = gtmRaw.indexOf("<!-- gtm:body -->");
if (gtmSplit < 0) throw new Error(`${gtmPartial} is missing <!-- gtm:body -->`);
const gtmHead = gtmRaw.slice(0, gtmSplit).trim();
const gtmBody = gtmRaw.slice(gtmSplit + "<!-- gtm:body -->".length).trim();
if (!gtmHead.includes("GTM-P9RTS8RN") || !gtmBody.includes("GTM-P9RTS8RN")) {
  throw new Error(`${gtmPartial} is missing the container id`);
}
for (const file of GTM_HOSTS) {
  const html = await read(file);
  const next = upsertBlock(
    upsertBlock(html, "gtm-head", gtmPartial, gtmHead, (doc) => afterOpenTag(doc, "head")),
    "gtm-body",
    gtmPartial,
    gtmBody,
    (doc) => afterOpenTag(doc, "body")
  );
  if (next === html) continue;
  drift = true;
  if (!check) await writeFile(new URL(file, root), next);
  console.log(`${check ? "out of date" : "synced"}: ${file} (gtm)`);
}
if (check && drift) process.exit(1);
