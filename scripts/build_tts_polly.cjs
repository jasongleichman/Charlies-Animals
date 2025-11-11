#!/usr/bin/env node
/**
 * Diff-only TTS builder for AWS Polly:
 * - Reads animal names from docs/index.html
 * - Loads ./docs/assets/tts_manifest.json (creates if missing)
 * - Target file per animal: ./docs/assets/tts/<slug>.mp3
 * - If manifest has slug AND file exists, skip
 * - Otherwise, synthesize (Polly) and write; update manifest
 *
 * Requires env:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION   (e.g. us-east-1)
 *
 * Options (via env or hardcoded below):
 *   VOICE_ID = "Matthew"  (standard voice that exists in all regions)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AWS from "aws-sdk";

const VOICE_ID = process.env.VOICE_ID || "Matthew";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..");
const DOCS = path.resolve(REPO_ROOT, "docs");
const ASSETS = path.resolve(DOCS, "assets");
const TTS_DIR = path.resolve(ASSETS, "tts");
const TTS_MANIFEST = path.resolve(ASSETS, "tts_manifest.json");
const INDEX_HTML = path.resolve(DOCS, "index.html");

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readIndexAnimals() {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const names = [];
  const re = /name\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(html))) names.push(m[1]);
  return Array.from(new Set(names));
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function ensureDirs() {
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
}

async function synthesizeText(text, outPath) {
  const polly = new AWS.Polly({ apiVersion: "2016-06-10" });
  const params = {
    OutputFormat: "mp3",
    Text: text,
    VoiceId: VOICE_ID, // "Matthew" is Standard and widely available
    Engine: "standard", // safer across regions
    LanguageCode: "en-US",
  };
  const data = await polly.synthesizeSpeech(params).promise();
  if (!data || !data.AudioStream) throw new Error("No AudioStream");
  fs.writeFileSync(outPath, Buffer.from(data.AudioStream));
}

async function main() {
  ensureDirs();

  const animals = readIndexAnimals();
  console.log(`Found ${animals.length} animals in docs/index.html`);

  const manifest = readJsonSafe(TTS_MANIFEST, { tts: {} });

  // Example text content – replace with your final sentence content if needed
  const linesFor = (name) => [
    `${name}.`,
    `This is the word ${name}.`,
  ].join(" ");

  const toCreate = [];
  for (const name of animals) {
    const slug = slugify(name);
    const relPath = `./assets/tts/${slug}.mp3`;
    const absPath = path.resolve(DOCS, relPath.replace("./", ""));
    const inManifest = !!manifest.tts[slug];
    const onDisk = fs.existsSync(absPath);
    if (inManifest && onDisk) {
      console.log(`🎧 exists: ${name}`);
    } else {
      console.log(`➕ missing: ${name}`);
      toCreate.push({ name, slug, relPath, absPath });
    }
  }

  if (toCreate.length === 0) {
    console.log("No new TTS needed. Exiting.");
    return;
  }

  let created = 0;
  for (const item of toCreate) {
    try {
      await synthesizeText(linesFor(item.name), item.absPath);
      manifest.tts[item.slug] = item.relPath;
      created++;
      // Back-off to be safe with API limits
      await new Promise((r) => setTimeout(r, 7000));
    } catch (e) {
      console.error(`❌ TTS fail: ${item.name} :: ${e.message}`);
    }
  }

  fs.writeFileSync(TTS_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`📄 updated: ${path.relative(REPO_ROOT, TTS_MANIFEST)} (added ${created})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
