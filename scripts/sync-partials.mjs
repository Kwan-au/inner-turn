// Writes the quote partial into the pages that host it: / embeds the same 4-step
// listing-quote-v2 form as the standalone /quote page. Prices
// come from the published card on pricing.html. Runs in the Netlify build;
// `--check` fails on drift.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const PARTS = [
  { name: "listing-quote", partial: "partials/listing-quote.html", hosts: ["index.html"] }
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
