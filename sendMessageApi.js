// Shared text/embed API with optional inline PDF attachments.
function createSendMessageHandler({ client, etabAdvisory,
  removeBoardingLinesFromDiscordEmbedText, removeBoardingLinesFromDiscordEmbeds }) {
  return async (req, res) => {
    try {
      const body = req.body || {};
      const { channelId, message, file } = body;
      if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
      if (etabAdvisory.isLegacyEtabRequest(body,
        process.env.ETAB_ADVISORY_ENABLED === 'true',
        process.env.ETAB_DISCORD_CHANNEL_ID || '1252026975720046655')) {
        return res.json({ success: true, skipped: true,
          reason: 'ETAB advisories are managed by MUFC' });
      }
      const options = {
        content: removeBoardingLinesFromDiscordEmbedText(message) || ''
      };
      if (body.embeds) {
        options.embeds = removeBoardingLinesFromDiscordEmbeds(body.embeds);
      }
      if (file !== undefined) {
        const maxBytes = 8 * 1024 * 1024;
        if (!file || typeof file.name !== 'string' ||
            !/\.pdf$/i.test(file.name) || /[\\/\r\n\x00-\x1f]/.test(file.name) ||
            file.name.length > 200 || file.contentType !== 'application/pdf' ||
            typeof file.base64 !== 'string' || !file.base64.length) {
          return res.status(400).json({ error: 'Invalid PDF attachment' });
        }
        if (file.base64.length > 4 * Math.ceil(maxBytes / 3)) {
          return res.status(413).json({ error: 'PDF exceeds 8 MiB limit' });
        }
        const bytes = Buffer.from(file.base64, 'base64');
        // Buffer 的 Base64 解码较宽松，用回编码验证，拒绝损坏内容。
        if (bytes.toString('base64') !== file.base64 ||
            bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
          return res.status(400).json({ error: 'Invalid PDF bytes or Base64' });
        }
        if (bytes.length > maxBytes) {
          return res.status(413).json({ error: 'PDF exceeds 8 MiB limit' });
        }
        options.files = [{ attachment: bytes, name: file.name }];
      }
      if (!options.content && !options.embeds?.length && !options.files?.length) {
        return res.status(400).json({ error: 'Message is empty' });
      }
      const channel = await client.channels.fetch(String(channelId));
      if (!channel || typeof channel.send !== 'function') {
        return res.status(404).json({ error: 'Channel not found or not sendable' });
      }
      const sent = await channel.send(options);
      const attachmentCount = sent.attachments?.size || 0;
      if (file && attachmentCount !== 1) {
        return res.status(502).json({ error: 'Discord did not confirm PDF attachment',
          messageId: sent.id });
      }
      return res.json({ success: true, messageId: sent.id, attachmentCount });
    } catch (error) {
      console.error('Send failed:', error);
      return res.status(500).json({ error: 'Send failed' });
    }
  };
}

module.exports = { createSendMessageHandler };
