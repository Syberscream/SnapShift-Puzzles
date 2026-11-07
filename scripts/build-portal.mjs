// Build the game-portal edition: the game plus a bundled picture pack, as ZIP
// files ready to upload. See docs/game-portals.md.
//
//   npm run build:portal                 (pictures from the live site)
//   npm run build:portal -- --per 6      (6 pictures per category instead of 4)
//   SITE=http://127.0.0.1:8787 npm run build:portal
//
// Makes, in dist-portal/:
//   snapshift-crazygames-poki.zip   no outside links (their rules), SDK hooks on
//   snapshift-web.zip               for itch.io, Newgrounds, Armor Games, your own pages:
//                                   links back to snapshiftpuzzles.com

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist-portal');
const SITE = (process.env.SITE || 'https://snapshiftpuzzles.com').replace(/\/$/, '');
const perArg = process.argv.indexOf('--per');
const PER = perArg > 0 ? Number(process.argv[perArg + 1]) || 4 : 4;

console.log(`Building the game with Vite…`);
execSync('npx vite build --config vite.portal.config.ts', { cwd: root, stdio: 'inherit' });

console.log(`Fetching the picture pack from ${SITE} (${PER} per category)…`);
const pack = await (await fetch(`${SITE}/api/portal/pack?per=${PER}`)).json();
if (!pack.puzzles?.length) throw new Error('The site returned no pictures.');

const app = join(out, 'app');
mkdirSync(join(app, 'pics'), { recursive: true });
const ext = (u) => (u.match(/\.(webp|jpe?g|png)(?:\?|$)/i)?.[1] ?? 'jpg').toLowerCase();
const puzzles = [];
for (const p of pack.puzzles) {
  try {
    const files = {};
    for (const [kind, url] of [['image', p.image], ['thumb', p.thumb || p.image]]) {
      const res = await fetch(url.startsWith('http') ? url : SITE + url);
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const name = `pics/${p.slug}${kind === 'thumb' ? '-t' : ''}.${ext(url)}`;
      writeFileSync(join(app, name), Buffer.from(await res.arrayBuffer()));
      files[kind] = `./${name}`;
    }
    puzzles.push({ slug: p.slug, title: p.title, category: p.category, image: files.image, thumb: files.thumb });
    process.stdout.write('.');
  } catch (e) {
    console.warn(`\nSkipped ${p.slug}: ${e.message}`);
  }
}
console.log(`\n${puzzles.length} pictures bundled.`);

/** A ZIP file (deflate) of a folder, with no extra tools needed on Windows. */
function zipFolder(dir, file) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of walk(dir)) {
    const name = Buffer.from(relative(dir, f).split('\\').join('/'));
    const data = readFileSync(f);
    const packed = deflateRawSync(data, { level: 9 });
    const store = packed.length >= data.length;
    const body = store ? data : packed;
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt32LE(0x21000000, 10); // 1 Jan 1980, 00:00
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    locals.push(head, name, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(store ? 0 : 8, 10);
    cen.writeUInt32LE(0x21000000, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    centrals.push(cen, name);
    offset += head.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(file, Buffer.concat([...locals, cd, end]));
}

for (const [name, link] of [['snapshift-crazygames-poki', false], ['snapshift-web', true]]) {
  const dir = join(out, name);
  rmSync(dir, { recursive: true, force: true });
  cpSync(app, dir, { recursive: true });
  cpSync(join(root, 'portal', 'logo.png'), join(dir, 'logo.png'));
  cpSync(join(root, 'portal', 'icon.png'), join(dir, 'icon.png'));
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ puzzles, link, site: 'https://snapshiftpuzzles.com/?utm_source=portal' }));
  zipFolder(dir, join(out, `${name}.zip`));
  const mb = (statSync(join(out, `${name}.zip`)).size / 1048576).toFixed(1);
  console.log(`dist-portal/${name}.zip (${mb} MB)`);
}
console.log('Done. Try it locally: npm run preview:portal');
