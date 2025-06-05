const {
  Client, Collection, GatewayIntentBits,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder
} = require('discord.js');
const { loadSlash } = require('./handlers/slashHandler.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.slashCommands = new Collection();

client.on("interactionCreate", async (interaction) => {
  // --- FLUJOS DEL COMANDO /item ---
  if (interaction.isStringSelectMenu()) {
    const [prefix, accion, etapa] = interaction.customId.split('-');

    // 1) /item registrar → seleccionar categoría → abrir modal
    if (prefix === 'item' && accion === 'registrar' && etapa === 'categoria') {
      const categoria = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`item-registrar-modal-${categoria}`)
        .setTitle(`Registrar ítem en ${categoria}`);

      // Campos comunes para todas las categorías
      const compRows = [
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nombre')
            .setLabel('Nombre del ítem')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dados')
            .setLabel('Dados a lanzar (ej: 1d10 o 1d10 m7)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('descripcion')
            .setLabel('Descripción')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      ];

      // Si es arma o arma de fuego, añadimos bonos
      if (categoria === 'armas' || categoria === 'armas_fuego') {
        compRows.push(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bonoDanio')
              .setLabel('Bonos daño C/M/L (ej: 5,0,-2)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        compRows.push(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bonoPrecision')
              .setLabel('Bonos pres. C/M/L (ej: 2,0,-1)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('ej: 2,0,-1')
              .setRequired(true)
          )
        );
      }

      modal.addComponents(compRows);
      return interaction.showModal(modal);
    }

    // 2) /item eliminar → categoría → menú ítems
    if (prefix === 'item' && accion === 'eliminar' && etapa === 'categoria') {
      const categoria = interaction.values[0];
      const ruta = path.join(__dirname, 'data', `${categoria}.json`);
      if (!fs.existsSync(ruta)) fs.writeFileSync(ruta, '{}');
      const db = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');

      const opciones = Object.keys(db)
        .slice(0, 25)
        .map(name => ({ label: name, value: name }));
      if (!opciones.length) {
        return interaction.update({
          content: `❌ No hay ítems en **${categoria}**.`,
          components: [],
          ephemeral: true
        });
      }

      const selectItem = new StringSelectMenuBuilder()
        .setCustomId(`item-eliminar-item-${categoria}`)
        .setPlaceholder(`Selecciona ítem de ${categoria}`)
        .addOptions(opciones);

      return interaction.update({
        content: `🗑️ Eliminar ítem de **${categoria}**:`,
        components: [new ActionRowBuilder().addComponents(selectItem)],
        ephemeral: true
      });
    }

    // 3) /item eliminar → ítem → borrar
    if (prefix === 'item' && accion === 'eliminar'
        && interaction.customId.startsWith('item-eliminar-item-')) {
      const categoria = interaction.customId.split('item-eliminar-item-')[1];
      const nombre   = interaction.values[0];
      const ruta     = path.join(__dirname, 'data', `${categoria}.json`);
      const db       = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');

      if (!db[nombre]) {
        return interaction.update({
          content: `❌ Ítem **${nombre}** no existe.`,
          components: [],
          ephemeral: true
        });
      }

      delete db[nombre];
      fs.writeFileSync(ruta, JSON.stringify(db, null, 2));
      return interaction.update({
        content: `🗑️ Ítem **${nombre}** eliminado de **${categoria}**.`,
        components: [],
        ephemeral: true
      });
    }
  }

  // --- ModalSubmit para /item registrar ---
  if (interaction.isModalSubmit()
      && interaction.customId.startsWith('item-registrar-modal-')) {
    const categoria = interaction.customId.split('item-registrar-modal-')[1];
    const nombre    = interaction.fields.getTextInputValue('nombre');
    const dados     = interaction.fields.getTextInputValue('dados');
    const desc      = interaction.fields.getTextInputValue('descripcion');

    const ruta = path.join(__dirname, 'data', `${categoria}.json`);
    if (!fs.existsSync(ruta)) fs.writeFileSync(ruta, '{}');
    const db = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');

    if (db[nombre]) {
      return interaction.reply({
        content: `❌ "${nombre}" ya existe en **${categoria}**.`,
        ephemeral: true
      });
    }

    // Construir el objeto a guardar: todas las categorías incluyen dados + descripción
    let itemObj;
    if (categoria === 'municiones') {
      // El primer dígito de 'dados' es la categoría de la munición
      const cat = dados.trim().split(' ')[0];
      itemObj = { Categoria: cat, descripcion: desc };
    } else {
      itemObj = { dados, descripcion: desc };
    }

    // Para armas y armas de fuego, parsear bonos
    if (categoria === 'armas' || categoria === 'armas_fuego') {
      const bonosD = interaction.fields
        .getTextInputValue('bonoDanio')
        .split(',').map(x => parseInt(x.trim(), 10));
      const bonosP = interaction.fields
        .getTextInputValue('bonoPrecision')
        .split(',').map(x => parseInt(x.trim(), 10));

      if (
        bonosD.length !== 3 ||
        bonosP.length !== 3 ||
        bonosD.some(isNaN) ||
        bonosP.some(isNaN)
      ) {
        return interaction.reply({
          content: '❌ Formato de bonos inválido. Debe ser tres números separados por comas.',
          ephemeral: true
        });
      }

      itemObj.bonos = {
        danio: {
          corta: bonosD[0],
          media: bonosD[1],
          larga: bonosD[2]
        },
        precision: {
          corta: bonosP[0],
          media: bonosP[1],
          larga: bonosP[2]
        }
      };
    }

    db[nombre] = itemObj;
    fs.writeFileSync(ruta, JSON.stringify(db, null, 2));

    return interaction.reply({
      content: `✅ Ítem **${nombre}** registrado en **${categoria}**.`,
      ephemeral: true
    });
  }

  // --- Resto del flujo (eliminar item de jugador, slash commands, autocomplete) ---
  if (interaction.isCommand()) {
    const cmd = client.slashCommands.get(interaction.commandName);
    if (!cmd) return;
    // --- Restricción de comandos solo para Dungeon Master ---
    if (DM_ONLY_COMMANDS.includes(interaction.commandName)) {
      if (!isDungeonMaster(interaction)) {
        return interaction.reply({
          content: '⛔ Solo los usuarios con el rol **Dungeon Master** pueden usar este comando.',
          ephemeral: true
        });
      }
    }
    const args = [];
    for (const opt of interaction.options.data) {
      if (opt.type === 1) {
        if (opt.name) args.push(opt.name);
        opt.options.forEach(x => x.value && args.push(x.value));
      } else if (opt.value) {
        args.push(opt.value);
      }
    }
    try { await cmd.execute(client, interaction, args); }
    catch (err) { console.error('Error ejecutando comando:', err); }
  }

  if (interaction.isAutocomplete()) {
    const cmd = client.slashCommands.get(interaction.commandName);
    if (cmd?.autocomplete) {
      try { await cmd.autocomplete(client, interaction); }
      catch (err) { console.error('Error en autocomplete:', err); }
    }
  }
});

client.once("ready", async () => {
  try {
    await loadSlash(client);
    console.log("✅ Bot listo:", client.user.tag);
  } catch (err) {
    console.error("❌ Error al cargar comandos:", err);
  }
});

(async () => {
  try { await client.login(process.env.TOKEN); }
  catch (err) { console.error("❌ Error al iniciar sesión:", err); }
})();

// Utilidad para verificar si el usuario tiene el rol Dungeon Master
function isDungeonMaster(interaction) {
  // Solo funciona en guilds
  if (!interaction.guild) return false;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  if (!member) return false;
  return member.roles.cache.some(r => r.name === "Dungeon Master");
}

const DM_ONLY_COMMANDS = [
  'daritem',
  'dm_registrar_usuario',
  'dm_eliminar_usuario',
  'dmochila',
  'item',
  'quitaritems'
];
