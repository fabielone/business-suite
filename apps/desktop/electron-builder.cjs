const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { mode } = JSON.parse(readFileSync(join(__dirname, 'dist', 'build-info.json'), 'utf8'));
if (mode !== 'setup' && mode !== 'demo') throw new Error('Build the desktop app before packaging.');
module.exports = {
  appId: mode === 'demo' ? 'org.fabiel.businesssuite.demo' : 'org.fabiel.businesssuite',
  productName: mode === 'demo' ? 'Business Suite Demo' : 'Business Suite',
  asar: true,
  files: ['dist/**/*', 'package.json'],
  directories: { output: 'artifacts/' + mode },
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  forceCodeSigning: false,
  publish: null,
  mac: {
    target: ['dmg', 'zip'],
    identity: null,
    hardenedRuntime: false,
    notarize: false,
    category: 'public.app-category.business',
  },
  win: { target: ['nsis'], signAndEditExecutable: false },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
};
