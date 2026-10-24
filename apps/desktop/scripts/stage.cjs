const { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { resolve, join, basename } = require('node:path');
const mode = process.argv[2];
if (mode !== 'demo' && mode !== 'setup')
  throw new Error('Choose setup or demo when staging desktop files.');
const root = resolve(__dirname, '..');
const source = resolve(root, '../web', mode === 'demo' ? 'dist-desktop-demo' : 'dist-desktop');
if (!existsSync(join(source, 'index.html')))
  throw new Error('Build the matching desktop renderer first: ' + source);
const target = join(root, 'dist', 'renderer');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, {
  recursive: true,
  filter: (path) => !path.endsWith('.map') && basename(path) !== 'sw.js',
});
writeFileSync(join(root, 'dist', 'build-info.json'), JSON.stringify({ mode }) + '\n');
console.log('Desktop staged: ' + mode + '. No renderer server is required.');
