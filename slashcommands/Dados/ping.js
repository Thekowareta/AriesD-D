const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Ping the bot"),

    async execute(client, interaction) {
        const Ping = Date.now() - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setDescription(`🏓 Ping -> ${Ping}ms`);

        await interaction.reply({ embeds: [embed] });
    }
};
