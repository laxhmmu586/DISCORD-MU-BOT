const fs = require('node:fs');
const path = require('node:path');
const { Resvg, initWasm } = require('./vendor/resvg-wasm');
let ready;
let font;
async function renderPng(svg) {
  // Share initialization across simultaneous cards and concurrent requests.
  ready ||= initWasm(fs.readFileSync(path.join(__dirname, 'vendor/resvg-wasm/index_bg.wasm')));
  await ready;
  font ||= fs.readFileSync(path.join(__dirname, 'vendor/fonts/NotoSans.ttf'));
  const renderer = new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: 'Noto Sans' } });
  let image;
  try {
    image = renderer.render();
    return Buffer.from(image.asPng());
  } finally {
    image?.free();
    renderer.free();
  }
}
module.exports = { renderPng };
