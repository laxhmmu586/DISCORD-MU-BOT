```js id="53g8z0"
module.exports = (client) => {

  client.on('messageCreate', async (message) => {

    try {

      // Ignore bots
      if (message.author.bot) return;

      const content =
        message.content.trim();

      // ===============================
      // HELP
      // ===============================

      if (
        content.toLowerCase() === 'help'
      ) {

        await message.reply(`
Available Commands:

FB 12345
BT 7811234567
        `);

        return;
      }

      // ===============================
      // FB Lookup
      // ===============================

      const fbMatch =
        content.match(
          /^FB\s*(\d+)$/i
        );

      if (fbMatch) {

        const fbNumber =
          fbMatch[1];

        await message.reply(
          `🔍 Searching FB: ${fbNumber}`
        );

        // ===================================
        // TODO:
        // FB lookup logic
        // ===================================

        return;
      }

      // ===============================
      // BT Lookup
      // ===============================

      const btMatch =
        content.match(
          /^BT\s*(\d+)$/i
        );

      if (btMatch) {

        const btNumber =
          btMatch[1];

        await message.reply(
          `🧳 Searching Bag Tag: ${btNumber}`
        );

        // ===================================
        // TODO:
        // BT lookup logic
        // ===================================

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
