import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { Buffer } from 'buffer';
// --------- helpers ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function parseArgs() {
  // allow: --db=docs/index.html --out=./docs/assets
  const args = { db: "docs/index.html", out: "./docs/assets" };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}
async function fetchBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return Buffer.from(await r.arrayBuffer());
}
// --- CENTRALIZED IMAGE URLS (VERIFIED & CORRECTED) ---
const WIKIMEDIA_SOURCES = {
  "Goliath Bird-Eater": "https://upload.wikimedia.org/wikipedia/commons/7/74/Goliath_birdeater.jpg",
  "Glass Lizard": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Eastern_Glass_Lizard.jpg",
  "Giant Weta": "https://upload.wikimedia.org/wikipedia/commons/7/73/Giant_weta_tucked_into_a_hole_in_a_tree_%28Tiritiri_Matangi%29.jpg",
  "Kiwi Bird": "https://upload.wikimedia.org/wikipedia/commons/5/5c/Kiwifugl.jpg",
  "Thorny Devil": "https://upload.wikimedia.org/wikipedia/commons/4/40/Thorny_Devil.jpg",
  "Leafcutter Ant": "https://upload.wikimedia.org/wikipedia/commons/8/81/Leafcutter_ant.jpg",
  "Gibbon": "https://upload.wikimedia.org/wikipedia/commons/c/c5/White-Handed_Gibbon_%28Hylobates_lar%29_%282854166549%29.jpg",
  "Tapir": "https://upload.wikimedia.org/wikipedia/commons/5/57/Bairds_Tapir.jpg",
  "Tawny Frogmouth": "https://upload.wikimedia.org/wikipedia/commons/c/cc/Tawny_Frogmouth_%28Podargus_strigoides%29_%282854232223%29.jpg",
  "Wanderer Butterfly": "https://upload.wikimedia.org/wikipedia/commons/3/30/Monarch_Butterfly.%28Danaus_plexippus%29_%2814256022010%29.jpg",
  "Cuttlefish": "https://upload.wikimedia.org/wikipedia/commons/9/91/Cuttlefish_%285381129320%29.jpg",
  "Rhinoceros": "https://upload.wikimedia.org/wikipedia/commons/c/c8/White_Rhinoceros_%289114161448%29.jpg",
  "African Bush Elephant": "https://upload.wikimedia.org/wikipedia/commons/3/37/African_Bush_Elephant.jpg",
  "Bison": "https://upload.wikimedia.org/wikipedia/commons/8/8d/American_bison_k5680-1.jpg",
  "Grizzly Bear": "https://upload.wikimedia.org/wikipedia/commons/9/93/Grizzly_bear_brown_bear.jpg",
  "Humpback Whale": "https://upload.wikimedia.org/wikipedia/commons/f/fb/Humpback_Whale_Underwater_%2837209287981%29.jpg",
  "Cheetah": "https://upload.wikimedia.org/wikipedia/commons/5/54/Cheetah.JPG",
  "Orangutan": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Orangutan_01.jpg",
  "Snow Leopard": "https://upload.wikimedia.org/wikipedia/commons/1/10/The_endangered_Snow_Leopard_%2813310647514%29.jpg",
  "Blue Jay": "https://upload.wikimedia.org/wikipedia/commons/0/03/Blue_Jay_%28210140531%29.jpeg",
  "Greenland Shark": "https://upload.wikimedia.org/wikipedia/commons/3/39/Greenland_shark_profile.jpg",
  "Koala": "https://upload.wikimedia.org/wikipedia/commons/2/21/Cutest_Koala.jpg",
  "Beluga Whale": "https://upload.wikimedia.org/wikipedia/commons/9/98/Beluga_whale.png",
  "Golden Poison Frog": "https://upload.wikimedia.org/wikipedia/commons/e/ed/Golden_Poison_Dart_Frog_1_%2814412444930%29.jpg",
  "Opossum": "https://upload.wikimedia.org/wikipedia/commons/2/27/Opossum_2.jpg",
  "Sloth": "https://upload.wikimedia.org/wikipedia/commons/3/3f/3_toed_sloth.jpg",
  "Sea Otter": "https://upload.wikimedia.org/wikipedia/commons/7/77/Sea_Otters.jpg",
  "Secretary Bird": "https://upload.wikimedia.org/wikipedia/commons/f/f4/Secretary_bird_%28Sagittarius_serpentarius%29_2.jpg",
  "Capuchin Monkey": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Capuchin_Monkey_%288454333789%29.jpg",
  "Bumblebee Bat": "https://upload.wikimedia.org/wikipedia/commons/5/5a/Craseonycteris_thonglongyai.png",
  "Armadillo": "https://upload.wikimedia.org/wikipedia/commons/b/b4/Nine-banded_Armadillo.jpg",
  "King Cobra": "https://upload.wikimedia.org/wikipedia/commons/a/a9/King-Cobra.jpg",
  "Wolverine": "https://upload.wikimedia.org/wikipedia/commons/c/c6/Wolverine.jpg",
  "Three-Banded Armadillo": "https://upload.wikimedia.org/wikipedia/commons/f/fb/Three_Banded_Armadillo.jpg",
  "Nine-Banded Armadillo": "https://upload.wikimedia.org/wikipedia/commons/b/b4/Nine-banded_Armadillo.jpg",
  "White-Faced Saki Monkey": "https://upload.wikimedia.org/wikipedia/commons/4/48/Male_White_Face_Saki_at_Chester_Zoo_%2815155867794%29.jpg",
  "Megalodon": "https://upload.wikimedia.org/wikipedia/commons/1/1f/Carcharodon_megalodon.jpg",
  "Tasmanian Tiger": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Tasmanian_tiger.jpg",
  "Dire Wolf": "https://upload.wikimedia.org/wikipedia/commons/8/80/Dire_Wolf.jpg",
  "Dodo": "https://upload.wikimedia.org/wikipedia/commons/e/e1/Dodo_1.JPG",
  "Passenger Pigeon": "https://upload.wikimedia.org/wikipedia/commons/3/34/Ectopistes_migratorius_%28passenger_pigeon%29_1.jpg",
  "Smilodon": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Smilodon.png",
  "Woolly Mammoth": "https://upload.wikimedia.org/wikipedia/commons/6/65/Woolly_mammoth.jpg",
  "Quagga": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Quagga_photo.jpg",
  "Great Auk": "https://upload.wikimedia.org/wikipedia/commons/e/e1/341_Great_Auk.jpg",
  "Steller's Sea Cow": "https://upload.wikimedia.org/wikipedia/commons/1/13/Steller%27s_Sea_Cow.jpg",
  "Irish Elk": "https://upload.wikimedia.org/wikipedia/commons/3/3b/Megaloceros_giganteus_Irish_elk_skeleton_%28Pleistocene%29_%2815443938885%29.jpg",
  "Moa": "https://upload.wikimedia.org/wikipedia/commons/2/28/Giant_moa.jpg",
  "Aurochs": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Aurochs_animal-bw.png",
  "Giant Ground Sloth": "https://upload.wikimedia.org/wikipedia/commons/2/21/WLA_hmns_Giant_ground_sloth.jpg",
  "Haast's Eagle": "https://upload.wikimedia.org/wikipedia/commons/b/be/Giant_Haasts_eagle.jpg",
  "Glyptodon": "https://upload.wikimedia.org/wikipedia/commons/a/a4/Glyptodon-1.jpg",
  "Cave Bear": "https://upload.wikimedia.org/wikipedia/commons/3/35/Ursus_spelaeus_cave_bear.jpg",
  "American Mastodon": "https://upload.wikimedia.org/wikipedia/commons/b/b9/WLA_hmns_American_Mastodon_Mammut_america_3.jpg",
  "Arthropleura": "https://upload.wikimedia.org/wikipedia/commons/2/2d/Arthropleura.png",
  "Titanoboa": "https://upload.wikimedia.org/wikipedia/commons/2/2d/Titanoboa_NT.jpg",
  "Spinosaurus": "https://upload.wikimedia.org/wikipedia/commons/8/89/Mounted_Spinosaurus.jpg",
  "Dunkleosteus": "https://upload.wikimedia.org/wikipedia/commons/e/e5/Dunkleosteus.png",
  "Meganeura": "https://upload.wikimedia.org/wikipedia/commons/8/81/Meganeura.png",
  "Hallucigenia": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Hallucigenia.jpg",
  "Anomalocaris": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Anomalocaris_BW.jpg",
  "Giant Armadillo": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Giant_armadillo.jpg"
};
// --------- main ----------
async function main() {
  const args = parseArgs();
  const repoRoot = path.resolve(__dirname, ".."); // scripts/.. -> repo root
  const outDir = path.resolve(repoRoot, args.out);
  const overwrite = args.overwrite === 'true' || args.overwrite === true;
  const imagesDir = path.join(outDir, "images");
  // ensure folders
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  // --- Parse data from app-data.js (robust parsing using VM) ---
  const dataPath = path.join(path.dirname(args.db), 'assets', 'app-data.js'); // Assuming docs/index.html -> docs/assets/app-data.js
  if (!fs.existsSync(dataPath)) throw new Error(`Data file not found at expected path: ${dataPath}`);
  const dataContent = fs.readFileSync(dataPath, "utf8");
  // Extract ANIMAL_DATABASE content by finding the raw array string
  const animalMatch = dataContent.match(/window\.ANIMAL_DATABASE\s*=\s*(\[[^]*?\]);/s);
  if (!animalMatch) throw new Error("Could not find window.ANIMAL_DATABASE in the script.");
  // Use vm to safely evaluate the array literal (replacing backticks with quotes where possible for compatibility)
  const animalListString = animalMatch[1]
      .replace(/`([^`]*)`/gs, (match, p1) => `'${p1.replace(/'/g, "\\'")}'`)
      .replace(/window\.(ANIMAL_DATABASE|sightWordsData|sentencesData|VIDEO_DATABASE)/g, '$1');
  const sandbox = { ANIMAL_DATABASE: [], Array, Object, String };
  vm.createContext(sandbox);
  // Execute the array assignment in the sandboxed context
  vm.runInContext('ANIMAL_DATABASE = ' + animalListString, sandbox);
  const animals = sandbox.ANIMAL_DATABASE;
  const names = new Set();
  animals.forEach(a => {
      if (a.name) names.add(a.name.trim());
  });
  const all = Array.from(names);
  console.log(`Found ${all.length} animals in ${path.basename(dataPath)}`);
  // build the images map for files that already exist
  const imagesMap = {};
  let existing = 0;
  let missing = 0;
  for (const name of all) {
    const slug = slugify(name);
    const rel = `images/${slug}.webp`;
    const abs = path.join(imagesDir, `${slug}.webp`);
    // 1. Check for local file
    if (fs.existsSync(abs)) {
      imagesMap[slug] = `./assets/${rel}`;
      console.log(`✅ exists: ${name}`);
      existing++;
      if (!overwrite) {
        continue; // Skip download if file exists and we are not overwriting
      }
    }
    // 2. Attempt to download remote image (using centralized map)
    const imageUrl = WIKIMEDIA_SOURCES[name] || null;
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
        try {
            const buf = await fetchBuffer(imageUrl);
            await fs.promises.writeFile(abs, buf);
            imagesMap[slug] = `./assets/${rel}`;
            console.log(`🖼️ downloaded: ${name}`);
            existing++;
        } catch (e) {
            // Log 404/Download Failure but do not halt the script
            console.log(`🚫 no-image (download failed): ${name} - ${e.message}`);
            missing++;
        }
    } else {
        console.log(`🚫 no-image (url missing in script): ${name}`);
        missing++;
    }
  }
  // write docs/images_map.json (for debugging/inspection)
  const imagesMapPath = path.resolve(repoRoot, "docs/images_map.json");
  fs.writeFileSync(imagesMapPath, JSON.stringify(imagesMap, null, 2), "utf-8");
  // write docs/assets/manifest.json used by the app
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ images: imagesMap }, null, 2), "utf-8");
  console.log(`📄 wrote: ${path.relative(repoRoot, imagesMapPath)}`);
  console.log(`📄 wrote: ${path.relative(repoRoot, manifestPath)}`);
  console.log(`Done. Existing: ${existing}, Missing: ${missing}`);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
