#!/usr/bin/env node
/**
 * Diff-only TTS builder using AWS Polly (CommonJS)
 * - Reads animal names from docs/index.html (ANIMAL_DATABASE names)
 * - Generates only missing files at docs/assets/tts/<slug>.mp3
 * - Throttles requests via --rate (ms) (default 7000)
 * - Voice from --voice (default Matthew)
 *
 * Usage:
 *  node scripts/build_tts_polly.cjs --db=docs/index.html --out=./docs/assets --rate=7000 --voice=Matthew
 */

const fs = require("fs");
const path = require("path");
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

// -------- CLI ARGS --------
function arg(key, def = null) {
  const hit = process.argv.find(a => a.startsWith(`--${key}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}
const DB_PATH   = arg("db", "docs/index.html");
const OUT_ROOT  = arg("out", "./docs/assets");
const RATE_MS   = parseInt(arg("rate", "7000"), 10) || 7000;
const VOICE_ID  = arg("voice", "Matthew"); // e.g., Matthew, Joanna, Salli, etc.

const TTS_DIR   = path.join(OUT_ROOT, "tts");
fs.mkdirSync(TTS_DIR, { recursive: true });

// -------- UTILS --------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toSlug = (s) => (s || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

// Extract animal names from ANIMAL_DATABASE in index.html
function readAnimalNamesFromIndex(dbFile) {
  const html = fs.readFileSync(dbFile, "utf8");
  // very tolerant scrape of: name: 'Fennec Fox' or name: "Fennec Fox"
  const names = [];
  const re = /name\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = m[1].trim();
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

// -------- AWS POLLY --------
const REGION = process.env.AWS_REGION || "us-east-1";
const polly = new PollyClient({ region: REGION });

async function synthesizeToFile(text, outFile) {
  const cmd = new SynthesizeSpeechCommand({
    OutputFormat: "mp3",
    Text: text,
    VoiceId: VOICE_ID,
    Engine: "standard",         // use "standard" to avoid neural-engine region errors
    LanguageCode: "en-US",      // clear American English
    SampleRate: "22050"
  });
  const { AudioStream } = await polly.send(cmd);
  const chunks = [];
  for await (const c of AudioStream) chunks.push(Buffer.from(c));
  fs.writeFileSync(outFile, Buffer.concat(chunks));
}

// -------- MAIN --------
(async () => {
  console.log("📦 Args:", { db: DB_PATH, out: OUT_ROOT, rate: RATE_MS, voice: VOICE_ID, region: REGION });

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  const names = readAnimalNamesFromIndex(DB_PATH);
  console.log(`Found ${names.length} animals in ${DB_PATH}`);

  let created = 0, skipped = 0, failed = 0;

  for (const name of names) {
    const slug = toSlug(name);
    const outFile = path.join(TTS_DIR, `${slug}.mp3`);
    if (fs.existsSync(outFile)) {
      console.log(`✅ exists: ${name}`);
      skipped++;
      continue;
    }

    // Build a short, clear, American-English pronunciation line
    const line = `${name}.`;

    try {
      console.log(`🎙  TTS: ${name} → ${outFile}`);
      await synthesizeToFile(line, outFile);
      created++;
      await sleep(RATE_MS);
    } catch (e) {
      failed++;
      console.error(`❌ TTS fail: ${name} :: ${e.message || e}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(0);
})();
