const SENDER = 'laxhmxh@hallmark-aviation.com';
const CHANNEL_ID = '1563411695936864447';

function matches(headers) {
  const header = name => String(headers.find(h => h.name.toLowerCase() === name)?.value || '');
  const from = header('from').trim().toLowerCase();
  return (from === SENDER || from.match(/<([^<>]+)>\s*$/)?.[1] === SENDER)
    && /\bLDM\b/i.test(header('subject')) && /\bCPM\b/i.test(header('subject'));
}

function stripFooter(text) {
  // The operational SI lines precede the sender signature and legal footer.
  return text.split(/(?:^|\n)[ \t]*(?:Regards\s*\/\s*LAXOPS\s*\/\s*RA\b|Important\s+Note:\s*This email is confidential\b)/i, 1)[0].trim();
}

async function bodyText(payload, readAttachment) {
  const plain = [], html = [];
  async function walk(part) {
    if (!part || part.filename) return;
    if (['text/plain', 'text/html'].includes(part.mimeType)) {
      const data = part.body?.data || (part.body?.attachmentId ? await readAttachment(part.body.attachmentId) : '');
      const text = Buffer.from(data || '', 'base64url').toString('utf8');
      (part.mimeType === 'text/plain' ? plain : html).push(text);
    }
    for (const child of part.parts || []) await walk(child);
  }
  await walk(payload);
  if (plain.length) return stripFooter(plain.join('\n').replace(/\r/g, ''));
  return stripFooter(html.join('\n').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:div|p|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&').trim());
}

function chunks(text) {
  const result = [];
  while (text.length) {
    let end = Math.min(1900, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline > end / 2) end = newline + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    result.push(text.slice(0, end));
    text = text.slice(end);
  }
  return result;
}

function createService({ db, getClient, channel, now = Date.now }) {
  db.exec('CREATE TABLE IF NOT EXISTS ldm_cpm_mail_state (id TEXT PRIMARY KEY, progress INTEGER NOT NULL)');
  const read = db.prepare('SELECT progress FROM ldm_cpm_mail_state WHERE id = ?');
  const write = db.prepare('INSERT OR REPLACE INTO ldm_cpm_mail_state (id, progress) VALUES (?, ?)');
  if (!read.get('started')) write.run('started', now());
  let busy = false, timer;
  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const { gmail, userId } = await getClient();
      const api = gmail.users.messages;
      let pageToken;
      let latest;
      do {
        const list = await api.list({ userId, q: `from:${SENDER} subject:LDM subject:CPM after:${Math.floor(read.get('started').progress / 1000) - 1}`, maxResults: 100, pageToken }, { timeout: 30000 });
        for (const item of list.data.messages || []) {
          const { data: mail } = await api.get({ userId, id: item.id, format: 'full' }, { timeout: 30000 });
          if (Number(mail.internalDate) < read.get('started').progress || !matches(mail.payload?.headers || [])) continue;
          if (!latest || Number(mail.internalDate) > Number(latest.mail.internalDate)) latest = { item, mail };
        }
        pageToken = list.data.nextPageToken;
      } while (pageToken);
      if (latest) {
          const { item, mail } = latest;
          const key = `${userId}:${item.id}`;
          let progress = read.get(key)?.progress || 0;
          if (progress === -1) return;
          const text = await bodyText(mail.payload, async id => {
            const response = await api.attachments.get({ userId, messageId: item.id, id }, { timeout: 30000 });
            return response.data.data;
          });
          if (!text) throw new Error(`LDM CPM email ${item.id} has no readable body`);
          const subject = mail.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'LDM CPM';
          const messages = chunks(`${subject}\n\n${text}`);
          const target = await channel();
          for (; progress < messages.length; progress++) {
            await target.send({ content: messages[progress], allowedMentions: { parse: [] } });
            write.run(key, progress + 1);
          }
          write.run(key, -1);
      }
    } finally { busy = false; }
  }
  return {
    poll,
    start() {
      if (timer) return;
      const run = () => poll().catch(err => console.error('LDM CPM mail forwarding failed:', err));
      run();
      timer = setInterval(run, 60000);
      timer.unref?.();
    },
    stop() { clearInterval(timer); timer = null; }
  };
}

module.exports = { SENDER, CHANNEL_ID, matches, bodyText, chunks, createService };
