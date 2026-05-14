```js
module.exports = (client) => {

  client.on('messageCreate', async (message) => {

    try {

      // ===============================
      // Ignore Bots
      // ===============================

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
FF MU620500126907
BT 7811234567
        `);

        return;
      }

      // ===============================
      // Match Commands
      // ===============================

      // FB12345
      // FB 12345
      const fbMatch =
        content.match(
          /^FB\s*(\d+)$/i
        );

      // FF MU620500126907
      // FF/MU620500126907
      const ffMatch =
        content.match(
          /^FF[\/\s]*([A-Z]{2}\d+)$/i
        );

      // BT1234567
      // BT 1234567
      const btMatch =
        content.match(
          /^BT\s*(\d+)$/i
        );

      // ===============================
      // FB Lookup
      // ===============================

      if (fbMatch) {

        const fbNumber =
          fbMatch[1];

        await message.reply(
          `🔍 Searching FB: ${fbNumber}`
        );

        // ===================================
        // TODO:
        // Put FB lookup logic here
        // ===================================

        return;
      }

      // ===============================
      // FF Lookup
      // ===============================

      if (ffMatch) {

        const ffNumber =
          ffMatch[1].toUpperCase();

        // Convert to system format
        const ffCommand =
          `FF/${ffNumber}`;

        await message.reply(
          `🛫 Searching Frequent Flyer: ${ffCommand}`
        );

        // ===================================
        // TODO:
        // Put FF lookup logic here
        // Example:
        // FF/MU620500126907
        // ===================================

        return;
      }

      // ===============================
      // BT Lookup
      // ===============================

      if (btMatch) {

        const btNumber =
          btMatch[1];

        await message.reply(
          `🧳 Searching Bag Tag: ${btNumber}`
        );

        // ===================================
        // TODO:
        // Put Bag Tag lookup logic here
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
