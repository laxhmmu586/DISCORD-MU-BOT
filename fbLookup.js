```js id="m85zqs"
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

        await message.reply(
          'Available Commands:\n\n' +
          'FB 032\n' +
          'BT 7811234567'
        );

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
      // Passenger Block Parser
      // ===============================

      const lines =
        content.split('\n');

      let passengers = [];

      let currentPassenger = null;

      for (const line of lines) {

        // ===================================
        // Detect Passenger Start
        // Example:
        // 12. 1WEI/WEI
        // ===================================

        const paxMatch =
          line.match(
            /^\d+\.\s+(\d[A-Z]+\/[A-Z]+)/i
          );

        if (paxMatch) {

          // Save previous passenger

          if (currentPassenger) {

            passengers.push(
              currentPassenger
            );

          }

          // Create new passenger

          currentPassenger = {

            name:
              paxMatch[1],

            ff: null,

            lines: [line]

          };

          continue;
        }

        // ===================================
        // Append lines
        // ===================================

        if (currentPassenger) {

          currentPassenger.lines.push(
            line
          );

          // ===================================
          // FF belongs ONLY to this passenger
          // ===================================

          const ffMatch =
            line.match(
              /FF\/([A-Z]{2})\s*(\d+)/i
            );

          if (ffMatch) {

            currentPassenger.ff = {

              airline:
                ffMatch[1]
                  .toUpperCase(),

              number:
                ffMatch[2]

            };

          }

        }

      }

      // Push last passenger

      if (currentPassenger) {

        passengers.push(
          currentPassenger
        );

      }

      // ===================================
      // Debug Output
      // ===================================

      if (
        passengers.length > 0
      ) {

        console.log(
          'Passenger Blocks:',
          passengers
        );

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
