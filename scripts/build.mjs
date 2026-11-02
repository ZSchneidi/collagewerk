// Builds the shared app once, then writes one unpacked extension per browser into dist/chrome and dist/firefox.
import { build } from 'vite';
import { cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
await build({ logLevel: 'warn' });

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
const common = {
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version: pkg.version,
  icons,
  action: { default_title: '__MSG_actionTitle__', default_icon: icons },
  permissions: ['storage', 'unlimitedStorage'],
};

const targets = {
  chrome: { ...common, background: { service_worker: 'background.js' }, minimum_chrome_version: '116' },
  firefox: {
    ...common,
    background: { scripts: ['background.js'] },
    // put the button straight into the toolbar instead of the extensions (puzzle) menu
    action: { ...common.action, default_area: 'navbar' },
    browser_specific_settings: { gecko: { id: 'collagewerk@zschneidi', strict_min_version: '115.0', data_collection_permissions: { required: ['none'] } } },
  },
};

for (const [name, manifest] of Object.entries(targets)) {
  const out = `dist/${name}`;
  rmSync(out, { recursive: true, force: true });
  cpSync('dist/app', out, { recursive: true });
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`built ${out}`);
}
