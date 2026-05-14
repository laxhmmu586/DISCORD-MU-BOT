module.exports = (client) => {

  client.on('messageCreate', async (message) => {

    try {

      // ===============================
      // Ignore Bot
      // ===============================

      if (message.author.bot) return;

      const content =
        message.content.trim();

      // ===============================
      // Match Commands
      // ===============================

      // FB 12345
      const fbMatch =
        content.match(/^FB\s*(\d+)$/i);

      // FF 123456789
      const ffMatch =
        content.match(/^FF\s*(\d+)$/i);

      // BT 1234567
      const btMatch =
        content.match(/^BT\s*(\d+)$/i);

      // ===============================
      // FB Lookup
      // ===============================

      if (fbMatch) {

        const fbNumber =
          fbMatch[1];

        await message.reply(
          `🔍 Searching FB: ${fbNumber}`
        );

        // TODO:
        // FB 查询逻辑

        return;
      }

      // ===============================
      // FF Lookup
      // ===============================

      if (ffMatch) {

        const ffNumber =
          ffMatch[1];

        await message.reply(
          `🛫 Searching Frequent Flyer: ${ffNumber}`
        );

        // TODO:
        // 会员号查询逻辑

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

        // TODO:
        // 行李牌查询逻辑

        return;
      }

    } catch (err) {

      console.error(err);

    }

  });

};