// Inlines the built editor (dist/app) into one self-contained HTML file for a quick preview outside the extension.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dir = 'dist/app';
let html = readFileSync(`${dir}/editor.html`, 'utf8');
html = html.replace(/<link rel="icon"[^>]*>\s*/, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(`${dir}/${f}`, 'utf8')}</style>`);
const inlineAssets = (js) =>
  js.replace(/new URL\(`([^`]+\.woff2)`,import\.meta\.url\)\.href/g, (_, f) =>
    `\`data:font/woff2;base64,${readFileSync(`${dir}/assets/${f}`).toString('base64')}\``);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, f) =>
  `<script type="module">${inlineAssets(readFileSync(`${dir}/${f}`, 'utf8')).replace(/<\/script/g, '<\\/script')}</script>`);
mkdirSync('dist/preview', { recursive: true });
writeFileSync('dist/preview/collagewerk-preview.html', html);
console.log('dist/preview/collagewerk-preview.html', html.length, 'bytes');
