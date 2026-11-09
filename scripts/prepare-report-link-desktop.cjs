'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function apply(source) {
  const reportUrl = 'https://has-station.com/has-report';
  const shellFile = path.join(source, 'web/workspace-shell.js');
  let shell = fs.readFileSync(shellFile, 'utf8');
  assert(shell.includes("['/has-report.html', 'Report'"), 'Review the desktop navigation baseline');
  shell = shell.replace("['/has-report.html', 'Report', 'report', 'data-report-access hidden']", `[ '${reportUrl}', 'Report', 'report', 'data-report-access target="_blank" rel="noopener noreferrer" hidden']`);
  shell = shell.replace(/^\s*\['\/has-form\.html', 'Request'.*\r?\n/m, '');
  shell = shell.replace("['/briefing.html','/schedule.html','/has-report.html'].includes", `['/briefing.html','/schedule.html','${reportUrl}'].includes`);
  shell = shell.replace("const current = location.pathname;", "const current = location.pathname.startsWith('/has-report') ? '/has-report.html' : location.pathname;");
  shell = shell.replace('href === current ?', "(href === current || (icon === 'report' && current === '/has-report.html')) ?");
  shell = shell.replace("const active = link.getAttribute('href') === current;", "const active = link.getAttribute('href') === current || (link.hasAttribute('data-report-access') && current === '/has-report.html');");
  fs.writeFileSync(shellFile, shell);

  function htmlFiles(root) {
    for (const item of fs.readdirSync(root, {withFileTypes:true})) {
      const file = path.join(root, item.name);
      if (item.isDirectory()) htmlFiles(file);
      else if (item.name.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        const next = html.replace(/<a href="\/has-form(?:\.html)?"[^>]*><svg><use href="#icon-file"\/><\/svg>(?:Form|Request)<\/a>/g, '')
          .replace(/<a href="\/has-report(?:\.html)?"([^>]*data-report-access[^>]*)>(?=<svg|<span class="art-icon)/g, `<a href="${reportUrl}" target="_blank" rel="noopener noreferrer"$1>`);
        if (next !== html) fs.writeFileSync(file, next);
      }
    }
  }
  htmlFiles(path.join(source, 'web'));
  const mainFile = path.join(source, 'src/main.js');
  let main = fs.readFileSync(mainFile, 'utf8');
  const handler = 'window.webContents.setWindowOpenHandler(({ url }) => {';
  assert(main.includes(handler), 'Desktop external navigation handler missing');
  main = main.replace(handler, handler + `\n      if(url === '${reportUrl}'){shell.openExternal(url);return {action:'deny'};}`);
  fs.writeFileSync(mainFile, main);
}
module.exports = {apply};
if (require.main === module) apply(path.resolve(process.argv[2]));
