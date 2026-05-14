module.exports = (client) => {

client.on('messageCreate', async (message) => {

```
try {

  // Ignore bots
  if (message.author.bot) return;

  // Clean input
  const content = message.content.trim();

  console.log('INPUT:', content);

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
  // Supports:
  // FB032
  // FB 032
  // ===============================

  const fbMatch = content.match(
    /^FB\s*([0-9A-Z]+)$/i
  );

  if (fbMatch) {

    const fbNumber =
      fbMatch[1];

    console.log(
      'FB MATCH:',
      fbNumber
    );

    await message.reply(
      'Searching FB: ' +
      fbNumber
    );

    return;
  }

  // ===============================
  // BT Lookup
  // Supports:
  // BT7811234567
  // BT 7811234567
  // ===============================

  const btMatch = content.match(
    /^BT\s*(\d+)$/i
  );

  if (btMatch) {

    const btNumber =
      btMatch[1];

    console.log(
      'BT MATCH:',
      btNumber
    );

    await message.reply(
      'Searching Bag Tag: ' +
      btNumber
    );

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

    // Detect passenger start
    // Example:
    // 12. 1WEI/WEI

    const paxMatch = line.match(
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

    // Append lines

    if (currentPassenger) {

      currentPassenger.lines.push(
        line
      );

      // FF belongs only
      // to this passenger

      const ffMatch = line.match(
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

  // Debug output

  if (
    passengers.length > 0
  ) {

    console.log(
      'Passenger Blocks:',
      JSON.stringify(
        passengers,
        null,
        2
      )
    );

  }

} catch (err) {

  console.error(
    'Lookup Error:',
    err
  );

}
```

});

};
