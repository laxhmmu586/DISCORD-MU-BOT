```js id="0jgjbc"
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
MU620500126907

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

      // ===============================
      // FF Lookup
      // ===============================

      // Supports:
      //
      // FF MU620500126907
      // FF/MU620500126907
      // MU620500126907
      // MU 620500126907
      //
      // eTerm:
      // FF/MU 620500126907/S/*1 PSPT
      //
      // Full pasted records

      let ffResult = null;

      // ===================================
      // 1. eTerm Style Scan
      // ===================================

      const ffEtermMatch =
        content.match(
          /FF\/([A-Z]{2})\s*(\d+)/i
        );

      if (ffEtermMatch) {

        ffResult = {

          airline:
            ffEtermMatch[1]
              .toUpperCase(),

          number:
            ffEtermMatch[2]

        };

      }

      // ===================================
      // 2. Simple FF Input
      // ===================================

      if (!ffResult) {

        const ffSimpleMatch =
          content.match(
            /^(?:FF[\/\s]*)?([A-Z]{2})\s*(\d+)$/i
          );

        if (ffSimpleMatch) {

          ffResult = {

            airline:
              ffSimpleMatch[1]
                .toUpperCase(),

            number:
              ffSimpleMatch[2]

          };

        }

      }

      // ===================================
      // 3. Process FF
      // ===================================

      if (ffResult) {

        const ffCommand =
          `FF/${ffResult.airline}${ffResult.number}`;

        await message.reply(
          `🛫 Searching Frequent Flyer: ${ffCommand}`
        );

        // ===================================
        // TODO:
        // FF lookup logic
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
