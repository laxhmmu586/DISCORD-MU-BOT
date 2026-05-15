// ===============================
// Load .env
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
    '❌ DISCORD_TOKEN not found'
  );

  process.exit(1);
}

if (!process.env.CLIENT_ID) {

  console.error(
    '❌ CLIENT_ID not found'
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
      'Search Passenger by BN'
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
      'Search Passenger by Name'
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
      'Search Passenger by Seat'
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
      'Search Passenger by Ticket Number'
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
      'Search Passenger by FF Number'
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
// REST Client
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