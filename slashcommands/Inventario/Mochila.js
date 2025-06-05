const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const inventarioPath = path.join(__dirname, '../../data/inventarios.json');

function leerDB(tipo) {
  const fichero = path.join(__dirname, `../../data/${tipo}.json`);
  if (!fs.existsSync(fichero)) return {};
  return JSON.parse(fs.readFileSync(fichero, 'utf8') || '{}');
}

// Helper para formatear cada categoría
function formatList(arr, db, isObj = false) {
  if (!arr || (Array.isArray(arr) && arr.length === 0) || (isObj && Object.keys(arr).length === 0)) {
    return '_(ninguno)_';
  }
  if (isObj) {
    return Object.entries(arr).map(([name, qty]) => {
      const info = db[name] || {};
      return `• **${name}** ×${qty} — (${info.dados || info.Categoria || '–'}) ${info.descripcion || ''}`;
    }).join('\n');
  } else {
    return arr.map(name => {
      const info = db[name] || {};
      return `• **${name}** (${info.dados || info.Categoria || '–'}) — ${info.descripcion || 'Sin descripción'}`;
    }).join('\n');
  }
}

function buildEmbed(usuario, inv) {
  // Cargar bases de datos
  const dbArmas = leerDB('armas');
  const dbArmasFuego = leerDB('armas_fuego');
  const dbBonifs = leerDB('bonificadores');
  const dbMisc = leerDB('miscelaneos');
  const dbViales = leerDB('viales');
  const dbMuniciones = leerDB('municiones');

  return new EmbedBuilder()
    .setColor(0x1E90FF)
    .setTitle(`🎒 Inventario de ${usuario.username}`)
    .addFields(
      { name: 'Armas Mele', value: formatList(inv.armas, dbArmas) },
      { name: 'Armas de Fuego', value: formatList(inv.armas_fuego, dbArmasFuego) },
      { name: 'Bonificadores', value: formatList(inv.bonificadores, dbBonifs) },
      { name: 'Misceláneos', value: formatList(inv.miscelaneos, dbMisc, true) },
      { name: 'Viales', value: formatList(inv.viales, dbViales, true) },
      { name: 'Municiones', value: formatList(inv.municiones, dbMuniciones, true) }
    )
    .setFooter({ text: 'Consulta detallada de recursos personales.' });
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('mochila')
      .setDescription('Muestra tu mochila personal.'),
    async execute(client, interaction) {
      if (!fs.existsSync(inventarioPath)) fs.writeFileSync(inventarioPath, '{}');
      const invs = JSON.parse(fs.readFileSync(inventarioPath, 'utf8') || '{}');
      const inv = invs[interaction.user.id];
      if (!inv) {
        return interaction.reply({ content: `❌ No tienes inventario registrado.`, ephemeral: true });
      }
      const embed = buildEmbed(interaction.user, inv);
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('dmochila')
      .setDescription('Muestra la mochila de otro jugador.')
      .addUserOption(opt =>
        opt.setName('usuario')
          .setDescription('Selecciona al usuario')
          .setRequired(true)
      ),
    async execute(client, interaction) {
      const usuario = interaction.options.getUser('usuario');
      if (!fs.existsSync(inventarioPath)) fs.writeFileSync(inventarioPath, '{}');
      const invs = JSON.parse(fs.readFileSync(inventarioPath, 'utf8') || '{}');
      const inv = invs[usuario.id];
      if (!inv) {
        return interaction.reply({ content: `❌ ${usuario.username} no tiene inventario registrado.`, ephemeral: true });
      }
      const embed = buildEmbed(usuario, inv);
      await interaction.reply({ embeds: [embed] });
    }
  }
];