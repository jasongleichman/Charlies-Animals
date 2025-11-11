/**
 * scripts/build_images_from_wikimedia.cjs
 * Auto-finds images on Wikipedia/Wikimedia for every animal in docs/index.html,
 * downloads and converts them to WEBP in docs/assets/images,
 * and emits docs/images_map.json and docs/assets/manifest.json.
 *
 * Run locally:
 *   node scripts/build_images_from_wikimedia.cjs
 *
 * Run in CI (GitHub Actions): see workflow below.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const vm = require("vm");
const sharp = require("sharp"); // prebuilt binary in GitHub Hosted runners

const INDEX = "docs/index.html";
const OUT_DIR = "docs/assets";
const IMG_DIR = path.join(OUT_DIR, "images");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const MAP_JSON = "docs/images_map.json";
const RATE_MS = 1500; // gentle rate limit to be nice to Wikimedia

// --- helpers
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
async function ensureDir(p) { await fsp.mkdir(p, { recursive: true }); }
async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// --- extract animal names from index.html
async function readAnimals() {
  const html = await fsp.readFile(INDEX, "utf8");
  const m = html.match(/const\s+ANIMAL_DATABASE\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error("ANIMAL_DATABASE not found in docs/index.html");
  const ctx = {}; vm.createContext(ctx);
  const arr = vm.runInContext("(" + m[1] + ")", ctx);
  const names = [];
  const seen = new Set();
  for (const a of arr) {
    const n = a?.name && String(a.name).trim();
    if (n && !seen.has(n)) { names.push(n); seen.add(n); }
  }
  return names;
}

// --- Wikimedia helpers
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "charlies-animals/1.0 (GitHub Actions)" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
function wikiTitle(name) {
  return encodeURIComponent(name.replace(/\s+/g, "_"));
}
async function getBestImageURL(name) {
  // Try page summary first (usually has originalimage or thumbnail)
  const t = wikiTitle(name);
  try {
    const sum = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${t}`);
    const src = sum?.originalimage?.source || sum?.thumbnail?.source;
    if (src) return src;
  } catch(_) {}

  // Fallback: search for best page, then summary on that page
  try {
    const q = await fetchJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`);
    const hit = q?.query?.search?.[0]?.title;
    if (hit) {
      const s2 = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle(hit)}`);
      const src2 = s2?.originalimage?.source || s2?.thumbnail?.source;
      if (src2) return src2;
    }
  } catch(_) {}

  return null;
}

async function downloadToWebp(url, destWebp) {
  const r = await fetch(url, { headers: { "User-Agent": "charlies-animals/1.0 (GitHub Actions)" } });
  if (!r.ok) throw new Error(`download ${r.status} ${r.statusText}`);
  const buf = Buffer.from(await r.arrayBuffer());

  // Convert to webp; if conversion fails, just write original bytes with .webp
  try {
    const webp = await sharp(buf).webp({ quality: 85 }).toBuffer();
    await fsp.writeFile(destWebp, webp);
  } catch (e) {
    await fsp.writeFile(destWebp, buf);
  }
}

async function readManifest(p) {
  try { return JSON.parse(await fsp.readFile(p, "utf8")); }
  catch { return { images: {}, audio: {}, audioKeys: {} }; }
}

async function main() {
  await ensureDir(IMG_DIR);

  const names = await readAnimals();
  console.log(`Found ${names.length} animals in ${INDEX}`);

  // Load existing manifest/map so runs are resumable
  const manifest = await readManifest(MANIFEST_PATH);
  const imagesMap = (() => {
    try { return JSON.parse(fs.readFileSync(MAP_JSON, "utf8")); }
    catch { return {}; }
  })();

  for (const name of names) {
    const slug = slugify(name);
    const file = path.join(IMG_DIR, `${slug}.webp`);
    const rel = `./assets/images/${slug}.webp`;

    if (fs.existsSync(file)) {
      manifest.images[slug] = rel;
      imagesMap[name] = rel;
      console.log("✅ exists:", name);
      continue;
    }

    const url = await getBestImageURL(name);
    if (!url) {
      console.log("🚫 no-image:", name);
      continue;
    }

    try {
      await downloadToWebp(url, file);
      manifest.images[slug] = rel;
      imagesMap[name] = rel;
      console.log("🖼️ saved:", name);
    } catch (e) {
      console.log("❌ save-failed:", name, e.message);
    }

    await sleep(RATE_MS);
  }

  await fsp.writeFile(MAP_JSON, JSON.stringify(imagesMap, null, 2), "utf8");
  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log("📄 wrote:", MAP_JSON);
  console.log("📄 wrote:", MANIFEST_PATH);
}

main().catch(err => { console.error(err); process.exit(1); });
