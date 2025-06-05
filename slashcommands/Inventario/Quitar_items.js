const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const inventarioPath = path.join(__dirname, '../../data/inventarios.json');
const tiposValidos = ['armas', 'bonificadores', 'miscelaneos', 'viales'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quitaritems')
    .setDescription('Quitar items a un jugador')
    .addUserOption(opt =>
      opt.setName('jugador')
        .setDescription('Menciona al jugador')
        .setRequired(true)
    ),

  async execute(client, interaction) {
    const jugador = interaction.options.getUser('jugador');

    if (!fs.existsSync(inventarioPath)) fs.writeFileSync(inventarioPath, '{}');
    const data = JSON.parse(fs.readFileSync(inventarioPath, 'utf8') || '{}');

    if (!data[jugador.id]) {
      return interaction.reply({ content: `❌ ${jugador.username} no está registrado.`, ephemeral: true });
    }

    // 1) Crear opciones multi-select
    const opciones = [];
    for (const tipo of tiposValidos) {
      const seccion = data[jugador.id][tipo];
      if (!seccion) continue;

      if (tipo === 'miscelaneos' || tipo === 'viales') {
        for (const [item, cantidad] of Object.entries(seccion)) {
          opciones.push({
            label: `${item} ×${cantidad}`,
            description: `Tipo: ${tipo}`,
            value: `${tipo}::${item}`
          });
        }
      } else {
        seccion.forEach(item => {
          opciones.push({
            label: item,
            description: `Tipo: ${tipo}`,
            value: `${tipo}::${item}`
          });
        });
      }
    }

    if (opciones.length === 0) {
      return interaction.reply({ content: `❌ ${jugador.username} no tiene items para eliminar.`, ephemeral: true });
    }

    // 2) Enviar menú multi-select
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`multi-eliminaritem-${jugador.id}`)
      .setPlaceholder('Selecciona uno o más items a eliminar')
      .setMinValues(1)
      .setMaxValues(Math.min(25, opciones.length))
      .addOptions(opciones.slice(0, 25));
    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: `Selecciona qué item(s) de **${jugador.username}** quieres eliminar:`,
      components: [row],
      ephemeral: true
    });

    // 3) Collector de selección
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId === `multi-eliminaritem-${jugador.id}` && i.user.id === interaction.user.id,
      max: 1,
      time: 30_000
    });

    collector.on('collect', async i => {
      //await i.deferUpdate();
      const seleccionados = i.values; // ["tipo::item", ...]

      // Separar selecciones de viales
      const vialesSeleccionados = seleccionados.filter(v => v.startsWith('viales::'));

      // Si no hay viales, eliminar directo
      if (vialesSeleccionados.length === 0) {
        for (const val of seleccionados) {
          const [tipo, nombre] = val.split('::');
          if (tipo === 'miscelaneos' || tipo === 'viales') {
            if (data[jugador.id][tipo][nombre] > 1) {
              data[jugador.id][tipo][nombre]--;
            } else {
              delete data[jugador.id][tipo][nombre];
            }
          } else {
            data[jugador.id][tipo] = data[jugador.id][tipo].filter(x => x !== nombre);
          }
        }
        fs.writeFileSync(inventarioPath, JSON.stringify(data, null, 2));
        return interaction.followUp({ content: `✅ Se eliminaron los items seleccionados de **${jugador.username}**.`, ephemeral: true });
      }

      // Si hay viales, pedir cantidades
      const cantidades = {}; // { vialNombre: cantidad }

      // Función recursiva para mostrar modal por cada vial
      async function pedirCantidad(index, interactionComponent) {
        if (index >= vialesSeleccionados.length) {
          // Eliminar según cantidades y demás items
          for (const val of seleccionados) {
            const [tipo, nombre] = val.split('::');
            if (tipo === 'viales') {
              const cantAEliminar = cantidades[nombre] || 0;
              const cantActual = data[jugador.id].viales[nombre] || 0;
              if (cantAEliminar >= cantActual) {
                delete data[jugador.id].viales[nombre];
              } else if (cantAEliminar > 0) {
                data[jugador.id].viales[nombre] -= cantAEliminar;
              }
            } else if (tipo === 'miscelaneos') {
              if (data[jugador.id][tipo][nombre] > 1) {
                data[jugador.id][tipo][nombre]--;
              } else {
                delete data[jugador.id][tipo][nombre];
              }
            } else {
              data[jugador.id][tipo] = data[jugador.id][tipo].filter(x => x !== nombre);
            }
          }
          fs.writeFileSync(inventarioPath, JSON.stringify(data, null, 2));
          return interaction.followUp({ content: `✅ Se eliminaron los items seleccionados de **${jugador.username}**.`, ephemeral: true });
        }

        // Mostrar modal para vial actual
        const [_, vialNombre] = vialesSeleccionados[index].split('::');
        const maxCant = data[jugador.id].viales[vialNombre];

        const modal = new ModalBuilder()
          .setCustomId(`cantidad-vial-${vialNombre}-${jugador.id}`)
          .setTitle(`Cantidad a eliminar: ${vialNombre}`);
        const input = new TextInputBuilder()
          .setCustomId('cantidad')
          .setLabel(`Cantidad (1 a ${maxCant})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ingresa un número')
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));

        // Mostrar modal usando la interacción del collector
        await interactionComponent.showModal(modal);

        // Esperar submit del modal
        try {
          const modalSubmit = await interactionComponent.awaitModalSubmit({
            filter: mi =>
              mi.customId === `cantidad-vial-${vialNombre}-${jugador.id}` &&
              mi.user.id === interaction.user.id,
            time: 30000
          });

          await modalSubmit.deferUpdate();

          const cantidadText = modalSubmit.fields.getTextInputValue('cantidad');
          const cantidadNum = parseInt(cantidadText, 10);

          if (isNaN(cantidadNum) || cantidadNum < 1 || cantidadNum > maxCant) {
            await modalSubmit.followUp({ 
              content: `❌ Cantidad inválida. Ingresa un número entre 1 y ${maxCant}.`, 
              ephemeral: true 
            });
            return pedirCantidad(index, interactionComponent);
          }

          cantidades[vialNombre] = cantidadNum;
          await modalSubmit.followUp({ 
            content: `✅ ${vialNombre}: cantidad registrada ${cantidadNum}.`, 
            ephemeral: true 
          });

          return pedirCantidad(index + 1, interactionComponent);
        
        } catch {
          return interaction.followUp({ 
            content: `⏱️ Tiempo agotado para ingresar cantidad.`, 
            ephemeral: true 
          });
        }
          
      }

      // Iniciar petición de cantidad usando la misma interacción del collector
      pedirCantidad(0, i);
    });

    collector.on('end', collected => {
      if (!collected.size) {
        interaction.followUp({ content: '⏱️ No se seleccionó ningún ítem.', ephemeral: true });
      }
    });
  }
};
