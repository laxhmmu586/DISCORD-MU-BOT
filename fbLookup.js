```js
module.exports = (client) => {

  client.on('messageCreate', async (message) => {

    try {

      // Ignore bots
      if (message.author.bot) return;

      const content = message.content.trim();

      // ===============================
      // HELP
      // ===============================

      if (content.toLowerCase() === 'help') {

        await message.reply(
          'Available Commands:\n\n' +
          'FB 12345\n' +
          'BT 7811234567'
        );

        return;
      }

      // ===============================
      // FB Lookup
      // ===============================

      const fbMatch = content.match(
        /^FB\s*(\d+)$/i
      );

      if (fbMatch) {

        const fbNumber = fbMatch[1];

        await message.reply(
          `🔍 Searching FB: ${fbNumber}`
        );

        return;
      }

      // ===============================
      // BT Lookup
      // ===============================

      const btMatch = content.match(
        /^BT\s*(\d+)$/i
      );

      if (btMatch) {

        const btNumber = btMatch[1];

        await message.reply(
          `🧳 Searching Bag Tag: ${btNumber}`
        );

        return;
      }

    } catch (err) {

      console.error(
        'Lookup Error:',
        err
      );

    }

  });

};
```
