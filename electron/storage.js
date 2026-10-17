// Pure Node file logic (no Electron imports) so it can be tested anywhere.
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const BAD = /[\\\/:*?"<>|\u0000-\u001f]/g;
const clean = (s, max = 90) => String(s || '').replace(BAD, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, max) || 'بی‌نام';
const pad = n => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`; };

function create(root) {
  const dirs = { root, backups: path.join(root, 'بکاپ'), media: path.join(root, 'عکس و فیلم'), data: path.join(root, 'اطلاعات') };
  const ensure = () => Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));
  const inside = (base, rel) => { const b = path.resolve(base), r = path.resolve(b, rel); return (r === b || r.startsWith(b + path.sep)) ? r : null; };
  const atomic = (file, data) => { const t = file + '.tmp'; fs.writeFileSync(t, data); fs.renameSync(t, file); };
  const prune = (prefix, keep) => {
    const l = fs.readdirSync(dirs.backups).filter(n => n.startsWith(prefix) && n.endsWith('.json'))
      .map(n => ({ n, t: fs.statSync(path.join(dirs.backups, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    l.slice(keep).forEach(x => fs.rmSync(path.join(dirs.backups, x.n), { force: true }));
  };
  let lastAuto = 0;
  return {
    dirs, ensure, clean,
    info: () => ({ ...dirs }),
    folder(kind, sub) { ensure(); const base = dirs[kind] || dirs.root; const p = sub ? inside(base, clean(sub)) : base; if (!p) return base; fs.mkdirSync(p, { recursive: true }); return p; },
    writeState: json => { ensure(); atomic(path.join(dirs.data, 'workshop-data.json'), json); return true; },
    readState: () => { try { return fs.readFileSync(path.join(dirs.data, 'workshop-data.json'), 'utf8'); } catch { return null; } },
    backup(name, json) { ensure(); const n = clean(name, 120).replace(/\.json$/i, '') + '.json'; atomic(path.join(dirs.backups, n), json); prune('factorplus-', 40); prune('backup-auto-', 48); return n; },
    autoBackup(json, force) {
      if (!force && Date.now() - lastAuto < 30 * 60 * 1000) return false;
      if (!force && !lastAuto) { // first call after start: respect the newest existing auto backup
        try { const t = Math.max(0, ...fs.readdirSync(dirs.backups).filter(n => n.startsWith('backup-auto-')).map(n => fs.statSync(path.join(dirs.backups, n)).mtimeMs)); if (Date.now() - t < 30 * 60 * 1000) { lastAuto = t; return false; } } catch {}
      }
      lastAuto = Date.now(); this.backup('backup-auto-' + stamp(), json); return true;
    },
    listBackups() { ensure(); return fs.readdirSync(dirs.backups).filter(n => n.endsWith('.json')).map(n => { const s = fs.statSync(path.join(dirs.backups, n)); return { name: n, size: s.size, mtime: s.mtimeMs }; }).sort((a, b) => b.mtime - a.mtime).slice(0, 100); },
    readBackup(name) { const p = inside(dirs.backups, path.basename(String(name))); if (!p) throw new Error('bad name'); return fs.readFileSync(p, 'utf8'); },
    saveMedia(folder, name, buf) {
      ensure(); const dir = this.folder('media', folder); const ext = path.extname(clean(name)) || '', base = path.basename(clean(name), ext) || 'file';
      let n = base + ext, i = 2; while (fs.existsSync(path.join(dir, n))) n = `${base} (${i++})${ext}`;
      fs.writeFileSync(path.join(dir, n), Buffer.from(buf)); return { name: n, rel: clean(folder) + '/' + n };
    },
    mediaPath: rel => inside(dirs.media, String(rel).split('/').map(x => clean(x)).join(path.sep)),
    mediaUrl(rel) { const p = this.mediaPath(rel); return p && fs.existsSync(p) ? pathToFileURL(p).href : ''; },
    deleteMedia(rel) { const p = this.mediaPath(rel); if (p && fs.existsSync(p)) fs.rmSync(p, { force: true }); return true; },
  };
}
module.exports = { create, clean, stamp };
