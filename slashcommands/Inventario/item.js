const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Registrar o eliminar un ítem del sistema global.')
    .addStringOption(opt =>
      opt.setName('accion')
        .setDescription('Registrar o eliminar ítems')
        .setRequired(true)
        .addChoices(
          { name: 'Registrar', value: 'registrar' },
          { name: 'Eliminar',  value: 'eliminar' }
        )
    ),

  async execute(client, interaction) {
    const accion = interaction.options.getString('accion');

    // Menú de categorías, incluido "Municiones"
    const categorias = [
      { label: 'Armas cuerpo a cuerpo', value: 'armas' },
      { label: 'Armas de fuego',         value: 'armas_fuego' },
      { label: 'Bonificadores',           value: 'bonificadores' },
      { label: 'Misceláneos',             value: 'miscelaneos' },
      { label: 'Viales',                  value: 'viales' },
      { label: 'Municiones',              value: 'municiones' }
    ];

    const select = new StringSelectMenuBuilder()
      .setCustomId(`item-${accion}-categoria`)
      .setPlaceholder('Selecciona la categoría')
      .addOptions(categorias);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: `📦 **${accion === 'registrar' ? 'Registrar' : 'Eliminar'} ítem**: elige categoría`,
      components: [row],
      ephemeral: true
    });
  }
};

