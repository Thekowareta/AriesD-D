const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coin')
    .setDescription('Lanza una moneda y elige cara o cruz.'),
  async execute(client, interaction) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('coin-select')
      .setPlaceholder('Elige cara o cruz')
      .addOptions([
        { label: 'Cruz', value: '1' },
        { label: 'Cara', value: '2' }
      ]);
    await interaction.reply({
      content: 'Seleccione una opción:',
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true
    });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId === 'coin-select',
      max: 1, time: 30000
    });
    collector.on('collect', async i => {
      await i.deferUpdate();
      const userChoice = i.values[0];
      const result = Math.floor(Math.random() * 2) + 1;
      const userText = userChoice === '1' ? 'Cruz' : 'Cara';
      const resultText = result === 1 ? 'Cruz' : 'Cara';
      const color = userChoice === String(result) ? 0x2ecc40 : 0xe74c3c;
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Resultado de la moneda')
        .setDescription(`**Opción elegida:** ${userText}\n\nResultado: ${resultText}`);
      await msg.delete().catch(() => {});
      await interaction.followUp({ embeds: [embed], ephemeral: false });
    });
    collector.on('end', collected => {
      if (!collected.size) interaction.followUp({ content: 'Tiempo agotado.', ephemeral: true });
    });
  }
};
