const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const INVENTARIO = path.join(__dirname, '../../data/inventarios.json');

function readInventarios() {
  if (!fs.existsSync(INVENTARIO)) fs.writeFileSync(INVENTARIO, '{}');
  return JSON.parse(fs.readFileSync(INVENTARIO, 'utf8') || '{}');
}
function writeInventarios(data) {
  fs.writeFileSync(INVENTARIO, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daritem')
    .setDescription('Da un ítem a un usuario')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario al que dar el ítem')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('categoria')
        .setDescription('Categoría del ítem')
        .setRequired(true)
        .addChoices(
          { name: 'armas', value: 'armas' },
          { name: 'armas_fuego', value: 'armas_fuego' },
          { name: 'bonificadores', value: 'bonificadores' },
          { name: 'viales', value: 'viales' },
          { name: 'municiones', value: 'municiones' },
          { name: 'miscelaneos', value: 'miscelaneos' }
        )
    )
    .addStringOption(opt =>
      opt.setName('nombre')
        .setDescription('Nombre del ítem')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt.setName('cantidad')
        .setDescription('Cantidad a dar (por defecto 1)')
        .setRequired(false)
    ),

  async execute(client, interaction) {
    const usuario = interaction.options.getUser('usuario');
    const categoria = interaction.options.getString('categoria');
    const nombre = interaction.options.getString('nombre');
    const cantidad = interaction.options.getInteger('cantidad') || 1;

    const inventarios = readInventarios();
    if (!inventarios[usuario.id]) {
      inventarios[usuario.id] = {
        armas: [],
        armas_fuego: [],
        bonificadores: [],
        viales: {},
        municiones: {},
        miscelaneos: {}
      };
    }
    const inv = inventarios[usuario.id];

    if (categoria === 'municiones' || categoria === 'viales') {
      if (!inv[categoria]) inv[categoria] = {};
      inv[categoria][nombre] = (inv[categoria][nombre] || 0) + cantidad;
    } else if (Array.isArray(inv[categoria])) {
      if (!inv[categoria].includes(nombre)) inv[categoria].push(nombre);
    } else if (typeof inv[categoria] === 'object') {
      inv[categoria][nombre] = cantidad;
    } else {
      inv[categoria] = nombre;
    }

    writeInventarios(inventarios);

    await interaction.reply({
      content: `✅ Se ha dado **${nombre}** x${cantidad} a <@${usuario.id}> en la categoría **${categoria}**.`,
      ephemeral: true
    });
  },

  async autocomplete(client, interaction) {
    const categoria = interaction.options.getString('categoria');
    if (!categoria) return interaction.respond([]);

    const file = path.join(__dirname, '../../data', `${categoria}.json`);
    if (!fs.existsSync(file)) return interaction.respond([]);

    const data = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
    const items = Object.keys(data);

    const focused = interaction.options.getFocused();
    const filtered = items.filter(i => i.toLowerCase().includes(focused.toLowerCase()));

    await interaction.respond(
      filtered.slice(0, 25).map(i => ({ name: i, value: i }))
    );
  }
};