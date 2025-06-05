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
    .setName('dm_')
    .setDescription('Registra o elimina usuarios en la base de datos')
    .addSubcommand(sub =>
      sub.setName('registrar_usuario')
        .setDescription('Registra un usuario en la base de datos')
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('Usuario a registrar')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('eliminar_usuario')
        .setDescription('Elimina un usuario de la base de datos')
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('Usuario a eliminar')
            .setRequired(true)
        )
    ),

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const inventarios = readInventarios();

    if (sub === 'registrar') {
      const usuario = interaction.options.getUser('usuario');
      if (inventarios[usuario.id]) {
        return interaction.reply({ content: '⚠️ Ese usuario ya está registrado.', ephemeral: true });
      }
      inventarios[usuario.id] = {
        armas: [],
        armas_fuego: [],
        bonificadores: [],
        viales: {},
        municiones: {},
        miscelaneos: {}
      };
      writeInventarios(inventarios);
      return interaction.reply({ content: `✅ Usuario <@${usuario.id}> registrado en la base de datos.`, ephemeral: true });
    }

    if (sub === 'eliminar') {
      const usuario = interaction.options.getUser('usuario');
      if (!inventarios[usuario.id]) {
        return interaction.reply({ content: '❌ Ese usuario no está registrado.', ephemeral: true });
      }
      delete inventarios[usuario.id];
      writeInventarios(inventarios);
      return interaction.reply({ content: `🗑️ Usuario <@${usuario.id}> eliminado de la base de datos.`, ephemeral: true });
    }
  }
};