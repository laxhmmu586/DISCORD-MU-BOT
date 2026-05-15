// ===============================
// Load ENV
// ===============================
require('dotenv').config();

// ===============================
// Discord.js
// ===============================
const {

  REST,

  Routes,

  SlashCommandBuilder

} = require('discord.js');

// ===============================
// ENV Check
// ===============================
if (!process.env.DISCORD_TOKEN) {

  console.error(
    '❌ DISCORD_TOKEN not found in .env'
  );

  process.exit(1);
}

if (!process.env.CLIENT_ID) {

  console.error(
    '❌ CLIENT_ID not found in .env'
  );

  process.exit(1);
}

// ===============================
// Slash Commands
// ===============================
const commands = [

  // =========================
  // /fb
  // =========================
  new SlashCommandBuilder()

    .setName('fb')

    .setDescription(
      'Search by BN'
    )

    .addStringOption(option =>

      option

        .setName('query')

        .setDescription(
          'Example: 174 or 174/11MAY'
        )

        .setRequired(true)
    ),

  // =========================
  // /rn
  // =========================
  new SlashCommandBuilder()

    .setName('rn')

    .setDescription(
      'Search by Name'
    )

    .addStringOption(option =>

      option

        .setName('query')

        .setDescription(
          'Example: CHEN/YUHUI'
        )

        .setRequired(true)
    ),

  // =========================
  // /fsn
  // =========================
  new SlashCommandBuilder()

    .setName('fsn')

    .setDescription(
      'Search by Seat'
    )

    .addStringOption(option =>

      option

        .setName('query')

        .setDescription(
          'Example: 32A'
        )

        .setRequired(true)
    ),

  // =========================
  // /etkd
  // =========================
  new SlashCommandBuilder()

    .setName('etkd')

    .setDescription(
      'Search by Ticket Number'
    )

    .addStringOption(option =>

      option

        .setName('query')

        .setDescription(
          'Example: 7815001919884'
        )

        .setRequired(true)
    ),

  // =========================
  // /ff
  // =========================
  new SlashCommandBuilder()

    .setName('ff')

    .setDescription(
      'Search by FF Number'
    )

    .addStringOption(option =>

      option

        .setName('query')

        .setDescription(
          'Example: MU123456789'
        )

        .setRequired(true)
    )

].map(command =>
  command.toJSON()
);

// ===============================
// REST
// ===============================
const rest =
  new REST({

    version: '10'

  }).setToken(

    process.env.DISCORD_TOKEN
  );

// ===============================
// Deploy Commands
// ===============================
(async () => {

  try {

    console.log(
      '🚀 Deploying slash commands...'
    );

    await rest.put(

      Routes.applicationCommands(

        process.env.CLIENT_ID
      ),

      {

        body: commands
      }
    );

    console.log(
      '✅ Slash commands deployed successfully.'
    );

  }

  catch (err) {

    console.error(
      '❌ Deploy Error:',
      err
    );
  }

})();