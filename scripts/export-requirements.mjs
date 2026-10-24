import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/export-requirements.mjs /absolute/vault/business-suite');
  process.exit(1);
}
const directory = resolve(source);
if (basename(directory) !== 'business-suite')
  throw new Error('Expected the project-specific business-suite notes folder.');
const target = new URL('../docs/requirements/', import.meta.url);
await mkdir(target, { recursive: true });
const files = (await readdir(directory)).filter((name) => name.endsWith('.md')).sort();
if (!files.includes('business-suite hub.md'))
  throw new Error('Project hub missing; refusing a partial/wrong-folder export.');
const stems = new Set(files.map((file) => file.slice(0, -3)));
const manifest = {
  exportedAt: new Date().toISOString(),
  sourceDirectory: directory,
  authority:
    'Obsidian source notes; this directory is a portable snapshot, not an independent specification.',
  files: [],
};
for (const file of files) {
  const original = await readFile(resolve(directory, file), 'utf8');
  const converted = original.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, destination, label) => {
      const [path, anchor] = destination.split('#');
      const stem = basename(path);
      if (!stems.has(stem)) return `${label ?? destination} (Obsidian reference)`;
      const fragment = anchor
        ? '#' +
          anchor
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s/g, '-')
        : '';
      return `[${label ?? stem}](<${stem}.md${fragment}>)`;
    },
  );
  await writeFile(new URL(encodeURIComponent(file), target), converted);
  manifest.files.push({ file, sha256: createHash('sha256').update(original).digest('hex') });
}
await writeFile(new URL('snapshot.json', target), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  new URL('README.md', target),
  "# Portable requirements snapshot\n\nRead [the project hub](<business-suite hub.md>). These notes were exported from the user's canonical Obsidian project folder. Edit the canonical source and re-export; do not maintain conflicting requirements here. `snapshot.json` records export time and source hashes. Outside-vault references are identified as Obsidian references. Implementation evidence is separately recorded in `../verification.md` and repository source.\n",
);
console.log(`Exported ${files.length} project notes to docs/requirements.`);
