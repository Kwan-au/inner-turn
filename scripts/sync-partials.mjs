// Writes shared partials into the pages that host them.
// listing-quote: / embeds the same listing-quote-v2 form as /quote. Prices
// come from the published card on pricing.html.
// file-trust: the FILE dispatch offer on marketing pages. Edit the partial,
// not the copies. Runs in the Netlify build; `--check` fails on drift.
// ga4: Google tag (gtag.js) measurement ID G-TCDGFB05Z7. Public marketing
// pages only. Edit the partial, not the copies. No Google Ads tag.
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
  "photo-pack.html",
  "trust.html",
  "events.html",
  "same-day.html",
  "quote.html",
  "policies.html",
  "terms.html",
  "privacy.html"
];
const GA4_HOSTS = [
  ...FILE_TRUST_HOSTS,
  "thanks.html",
  "404.html"
];
const PARTS = [
  { name: "listing-quote", partial: "partials/listing-quote.html", hosts: ["index.html"] },
  { name: "file-trust", partial: "partials/file-trust.html", hosts: FILE_TRUST_HOSTS },
  { name: "ga4", partial: "partials/ga4.html", hosts: GA4_HOSTS }
];
const check = process.argv.includes("--check");

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
if (check && drift) process.exit(1);
