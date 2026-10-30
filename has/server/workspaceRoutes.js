const path = require('node:path');

const WORKSPACE_PAGES = Object.freeze(['home', 'profile', 'has-form', 'has-report', 'read-sign', 'briefing', 'schedule', 'admin']);

function registerWorkspaceRoutes(app, {directory = path.join(__dirname, '..', 'public')} = {}) {
  for (const name of WORKSPACE_PAGES) {
    const canonical = '/' + name;
    app.get(canonical + '.html', (req, res) => {
      res.redirect(301, canonical + new URL(req.originalUrl, 'http://workspace.local').search);
    });
    app.get(canonical, (req, res) => {
      if (req.path.endsWith('/')) return res.redirect(301, canonical + new URL(req.originalUrl, 'http://workspace.local').search);
      res.set('Cache-Control', 'no-store').sendFile(path.join(directory, name + '.html'));
    });
  }
  app.get(['/home.css', '/home.js', '/workspace-glass.css', '/workspace-shell.js', '/workspace-routes.js'], (req, res) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(directory, path.basename(req.path)));
  });
  app.get('/assets/:name', (req, res, next) => {
    if (!/^home-[a-z0-9-]+\.(?:webp|png|svg)$/.test(req.params.name)) return next();
    res.sendFile(path.join(directory, 'assets', req.params.name));
  });
}

module.exports = {WORKSPACE_PAGES, registerWorkspaceRoutes};
