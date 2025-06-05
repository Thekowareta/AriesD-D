const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const INVENTARIO = path.join(__dirname, '../../data/inventarios.json');

// Utilidades para leer y escribir JSON
function readInventarios() {
  if (!fs.existsSync(INVENTARIO)) fs.writeFileSync(INVENTARIO, '{}');
  return JSON.parse(fs.readFileSync(INVENTARIO, 'utf8') || '{}');
}
function writeInventarios(data) {
  fs.writeFileSync(INVENTARIO, JSON.stringify(data, null, 2));
}

// Base de datos general
const DB = (tipo) => {
  const file = path.join(__dirname, '../../data', `${tipo}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
};

// Tirada de dados
function rollDice(diceStr) {
  const [main, iePart] = diceStr.split(' ie').map(s => s.trim());
  const [count, sides] = main.split('d').map(Number);
  const explodeThreshold = iePart ? Number(iePart) : null;

  const rolls = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    let r;
    do {
      r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      total += r;
    } while (explodeThreshold !== null && r >= explodeThreshold);
  }
  return { rolls, total };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ataque')
    .setDescription('Realiza un ataque usando tu inventario.'),

  async execute(client, interaction) {
    const inventarios = readInventarios();
    const inv = inventarios[interaction.user.id];
    if (!inv) {
      return interaction.reply({ content: '❌ No estás registrado.', ephemeral: true });
    }

    const armasMelee = inv.armas || [];
    // Leer armas_fuego como objeto y obtener nombres
    const armasFuegoDB = DB('armas_fuego');
    const municionesDB = DB('municiones');
    const armasFuegoNombres = Object.keys(armasFuegoDB);

    // Obtener las categorías de munición que el usuario tiene (y cantidad > 0)
    const municionesUsuario = inv.municiones || {};
    const categoriasMunUsuario = Object.entries(municionesUsuario)
      .filter(([nombre, cantidad]) => cantidad > 0 && municionesDB[nombre])
      .map(([nombre]) => municionesDB[nombre].Categoria);

    // Filtrar armas de fuego que el usuario puede usar (tiene munición de la categoría)
    const armasFuegoDisponibles = armasFuegoNombres.filter(nombreArma => {
      const armaInfo = armasFuegoDB[nombreArma];
      if (!armaInfo || !armaInfo.dados) return false;
      // El primer dígito de dados es la categoría
      const cat = (armaInfo.dados.trim().split(' ')[0] || '').toString();
      return categoriasMunUsuario.includes(cat);
    });

    // Solo mostrar armas de fuego si el usuario tiene munición de la categoría correspondiente
    const armasDisponibles = [...armasMelee, ...armasFuegoDisponibles].map(a => typeof a === 'string' ? a.trim() : '').filter(a => a.length > 0);

    if (!armasDisponibles.length) {
      return interaction.reply({ content: '❌ No tienes armas disponibles.', ephemeral: true });
    }

    const selectArma = new StringSelectMenuBuilder()
      .setCustomId('ataque-arma')
      .setPlaceholder('Selecciona tu arma')
      .addOptions(
        armasDisponibles.map(a => ({
          label: a.slice(0, 100),
          value: a.slice(0, 100)
        }))
      );

    await interaction.reply({
      content: '🔪 Elige tu arma:',
      components: [new ActionRowBuilder().addComponents(selectArma)],
      ephemeral: true,
    });
    const msg = await interaction.fetchReply();

    const colecArma = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId === 'ataque-arma',
      max: 1, time: 30000,
    });

    colecArma.on('collect', async ia => {
      await ia.deferUpdate();
      const arma = ia.values[0];
      const armaInfo = DB('armas')[arma] || armasFuegoDB[arma] || {};
      let diceBase = '', maxShots = 1, balasUsar = 0, municionNombre = null, categoriaArma = null;

      // Si es arma de fuego
      if (armasFuegoDisponibles.includes(arma)) {
        // Formato: "A XdY mZ"
        const m = (armaInfo.dados || '').match(/^(\d)\s+(\d+)d(\d+)\s+m(\d+)$/);
        if (m) {
          categoriaArma = m[1];
          const dadosCount = parseInt(m[2], 10);
          const dadosSides = parseInt(m[3], 10);
          diceBase = { count: dadosCount, sides: dadosSides };
          maxShots = parseInt(m[4], 10);
        } else {
          // fallback
          categoriaArma = (armaInfo.dados || '').trim().split(' ')[0];
          diceBase = { count: 1, sides: 4 };
          maxShots = 1;
        }

        // Buscar TODAS las municiones compatibles (de la categoría)
        const municionesCompatibles = Object.entries(municionesUsuario).filter(([nombre, cantidad]) => {
          const info = municionesDB[nombre];
          return info?.Categoria === categoriaArma && cantidad > 0;
        });

        if (!municionesCompatibles.length) {
          return interaction.followUp({ content: '❌ No tienes munición compatible.', ephemeral: true });
        }

        // Si hay más de una munición compatible, preguntar cuál usar
        let municionNombre, balasDisp;
        if (municionesCompatibles.length === 1) {
          [municionNombre, balasDisp] = municionesCompatibles[0];
        } else {
          const selectMun = new StringSelectMenuBuilder()
            .setCustomId('ataque-municion')
            .setPlaceholder('Selecciona munición')
            .addOptions(
              municionesCompatibles.map(([nombre, cantidad]) => ({
                label: `${nombre} (${cantidad})`,
                value: nombre
              }))
            );
          const msgMun = await interaction.followUp({
            content: '¿Qué munición quieres usar?',
            components: [new ActionRowBuilder().addComponents(selectMun)],
            ephemeral: true,
          });

          await new Promise(resolve => {
            const colMun = msgMun.createMessageComponentCollector({
              filter: m => m.user.id === interaction.user.id && m.customId === 'ataque-municion',
              max: 1, time: 30000,
            });
            colMun.on('collect', async msel => {
              await msel.deferUpdate();
              municionNombre = msel.values[0];
              balasDisp = municionesUsuario[municionNombre];
              resolve();
            });
            colMun.on('end', collected => {
              if (!collected.size) resolve();
            });
          });

          if (!municionNombre) {
            return interaction.followUp({ content: '⏱️ Tiempo agotado.', ephemeral: true });
          }
        }

        // Categoría 2: usuario elige cuántos dados lanzar (máximo: mZ o balas disponibles)
        if (categoriaArma === "2") {
          const maxDados = Math.min(maxShots, balasDisp);
          const selectDados = new StringSelectMenuBuilder()
            .setCustomId('ataque-cant-dados')
            .setPlaceholder('¿Cuántos dados lanzar?')
            .addOptions(
              Array.from({ length: maxDados }, (_, i) => ({
                label: `${i + 1}`,
                value: `${i + 1}`
              }))
            );
          const msgDados = await interaction.followUp({
            content: `¿Cuántos dados lanzar? (Disponibles: ${balasDisp}, Máximo: ${maxDados})`,
            components: [new ActionRowBuilder().addComponents(selectDados)],
            ephemeral: true,
          });

          await new Promise(resolve => {
            const colDados = msgDados.createMessageComponentCollector({
              filter: d => d.user.id === interaction.user.id && d.customId === 'ataque-cant-dados',
              max: 1, time: 30000,
            });
            colDados.on('collect', async dsel => {
              await dsel.deferUpdate();
              balasUsar = parseInt(dsel.values[0], 10);
              resolve();
            });
            colDados.on('end', collected => {
              if (!collected.size) {
                interaction.followUp({ content: '⏱️ Tiempo agotado.', ephemeral: true });
                resolve();
              }
            });
          });

          if (!balasUsar || balasUsar < 1 || balasUsar > maxDados) {
            return interaction.followUp({ content: '❌ Número de dados inválido.', ephemeral: true });
          }

          // Descontar munición
          inv.municiones[municionNombre] -= balasUsar;
          if (inv.municiones[municionNombre] <= 0) delete inv.municiones[municionNombre];
          inventarios[interaction.user.id] = inv;
          writeInventarios(inventarios);

        // Categoría 1 o 3: lanzar todos los dados base y gastar 1 munición (ignorar mZ)
        } else if (categoriaArma === "1" || categoriaArma === "3") {
          balasUsar = diceBase.count;
          inv.municiones[municionNombre] -= 1;
          if (inv.municiones[municionNombre] <= 0) delete inv.municiones[municionNombre];
          inventarios[interaction.user.id] = inv;
          writeInventarios(inventarios);
        } else {
          // fallback
          balasUsar = diceBase.count;
        }
      } else {
        // Arma melee
        const m = (armaInfo.dados || '').match(/^(\d+)d(\d+)$/);
        if (m) {
          diceBase = { count: parseInt(m[1], 10), sides: parseInt(m[2], 10) };
        } else {
          diceBase = { count: 1, sides: 4 };
        }
        balasUsar = diceBase.count;
      }

      // Lanzar dados de daño
      let rollsArray = [];
      if (armasFuegoDisponibles.includes(arma)) {
        for (let i = 0; i < balasUsar; i++) {
          let r = Math.floor(Math.random() * diceBase.sides) + 1;
          rollsArray.push(r);
        }
      } else {
        for (let i = 0; i < diceBase.count; i++) {
          let r = Math.floor(Math.random() * diceBase.sides) + 1;
          rollsArray.push(r);
        }
      }
      const damageBase = rollsArray.reduce((a, b) => a + b, 0);

      // Menú de distancia
      const distancias = ['Corta', 'Media', 'Larga']
        .map(d => d.trim())
        .filter(d => d.length > 0);

      const selectDist = new StringSelectMenuBuilder()
        .setCustomId('ataque-dist')
        .setPlaceholder('Selecciona distancia')
        .addOptions(
          distancias.map(d => ({
            label: d.slice(0, 100),
            value: d.slice(0, 100)
          }))
        );

      const msgDist = await interaction.followUp({
        content: '📏 Elige la distancia:',
        components: [new ActionRowBuilder().addComponents(selectDist)],
        ephemeral: true,
      });

      const colecDist = msgDist.createMessageComponentCollector({
        filter: d => d.user.id === interaction.user.id && d.customId === 'ataque-dist',
        max: 1, time: 30000,
      });

      colecDist.on('collect', async id => {
        await id.deferUpdate();
        const distancia = id.values[0];
        const bonusPrecision = armaInfo.bonos?.precision?.[distancia.toLowerCase()] ?? 0;
        const bonusDanio = armaInfo.bonos?.danio?.[distancia.toLowerCase()] ?? 0;

        const { total: precRoll } = rollDice('1d20');

        // Bonificador opcional
        let bonoName = null, dadosBono = '', rollB = [], bonoTotal = 0;
        const bonifs = (inv.bonificadores || [])
          .map(b => typeof b === 'string' ? b.trim() : '')
          .filter(b => b.length > 0);

        // Agregar opción "Ninguno"
        const bonifOptions = [
          { label: 'Ninguno', value: '__ninguno__' },
          ...bonifs.map(b => ({
            label: b.slice(0, 100),
            value: b.slice(0, 100)
          }))
        ];

        if (bonifOptions.length > 0) {
          const selectB = new StringSelectMenuBuilder()
            .setCustomId('ataque-bono')
            .setPlaceholder('Selecciona bonificador (opcional)')
            .addOptions(bonifOptions);

          const msgB = await interaction.followUp({
            content: '✨ Elige bonificador:',
            components: [new ActionRowBuilder().addComponents(selectB)],
            ephemeral: true,
          });

          await new Promise(resolve => {
            const colB = msgB.createMessageComponentCollector({
              filter: b => b.user.id === interaction.user.id && b.customId === 'ataque-bono',
              max: 1, time: 30000,
            });
            colB.on('collect', async b => {
              await b.deferUpdate();
              if (b.values[0] !== '__ninguno__') {
                bonoName = b.values[0];
                dadosBono = DB('bonificadores')[bonoName].dados;
                ({ rolls: rollB, total: bonoTotal } = rollDice(dadosBono));
              }
              resolve();
            });
            colB.on('end', () => resolve());
          });
        }

        // Vial opcional
        let vialName = null, dadosVial = '', rollV = [], vialTotal = 0;
        const viales = inv.viales
          ? Object.entries(inv.viales)
              .filter(([n]) => typeof n === 'string' && n.trim().length > 0)
          : [];

        // Agregar opción "Ninguno"
        const vialOptions = [
          { label: 'Ninguno', value: '__ninguno__' },
          ...viales.map(([n]) => ({
            label: n.slice(0, 100),
            value: n.slice(0, 100)
          }))
        ];

        if (vialOptions.length > 0) {
          const selectV = new StringSelectMenuBuilder()
            .setCustomId('ataque-vial')
            .setPlaceholder('Selecciona vial (opcional)')
            .addOptions(vialOptions);

          const msgV = await interaction.followUp({
            content: '🧪 Elige vial:',
            components: [new ActionRowBuilder().addComponents(selectV)],
            ephemeral: true,
          });

          await new Promise(resolve => {
            const colV = msgV.createMessageComponentCollector({
              filter: v => v.user.id === interaction.user.id && v.customId === 'ataque-vial',
              max: 1, time: 30000,
            });
            colV.on('collect', async v => {
              await v.deferUpdate();
              if (v.values[0] !== '__ninguno__') {
                vialName = v.values[0];
                dadosVial = DB('viales')[vialName].dados;
                ({ rolls: rollV, total: vialTotal } = rollDice(dadosVial));
                inv.viales[vialName]--;
                if (inv.viales[vialName] <= 0) delete inv.viales[vialName];
                inventarios[interaction.user.id] = inv;
                writeInventarios(inventarios);
              }
              resolve();
            });
            colV.on('end', collected => {
              if (!collected.size) resolve();
            });
          });
        }

        // Construcción del mensaje final
        const lines = [];
        lines.push(`**${arma}**: [${diceBase.count}d${diceBase.sides}] = ${damageBase}`);
        if (balasUsar) lines.push(`[${municionNombre}: ${balasUsar}]`);
        if (bonoName) lines.push(`${bonoName}: [${dadosBono}] = ${bonoTotal}`);
        if (vialName) lines.push(`${vialName}: [${dadosVial}] = ${vialTotal}`);
        lines.push(`Daño de Distancia: ${distancia} → ${bonusDanio >= 0 ? '+' : ''}${bonusDanio}`);
        lines.push(`Precisión de Distancia: ${bonusPrecision >= 0 ? '+' : ''}${bonusPrecision}`);
        lines.push("### RESULTADOS FINALES:");
        lines.push(`PRECISIÓN: [1d20] = ${precRoll} + ${bonusPrecision >= 0 ? '' : ''}${bonusPrecision} = ${precRoll + bonusPrecision}`);

        // Suma de daño final: aplicar bono de distancia
        let totalFinal = 0;
        if (armasFuegoDisponibles.includes(arma) && categoriaArma === "2") {
          // Bonos de daño por distancia por dado
          const rollsConBonos = rollsArray.map(r => r + bonusDanio);
          lines.push(`Tiradas: [${rollsArray.join(', ')}] + (${bonusDanio}) a cada dado`);
          lines.push(`Tiradas con bonos: [${rollsConBonos.join(', ')}]`);
          totalFinal = rollsConBonos.reduce((a, b) => a + b, 0) + bonoTotal + vialTotal;
        } else if (armasFuegoDisponibles.includes(arma) && categoriaArma === "1") {
          // Bonos de daño por distancia al total
          lines.push(`Tiradas: [${rollsArray.join(', ')}]`);
          lines.push(`Daño base: ${damageBase} + (${bonusDanio})`);
          totalFinal = damageBase + bonusDanio + bonoTotal + vialTotal;
        } else {
          // melee
          lines.push(`Tiradas: [${rollsArray.join(', ')}]`);
          lines.push(`Daño base: ${damageBase} + (${bonusDanio})`);
          totalFinal = damageBase + bonusDanio + bonoTotal + vialTotal;
        }
        lines.push(`DAÑO FINAL:  ${totalFinal}`);

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle(`⚔️ Ataque de ${interaction.user.username}`)
          .setDescription(lines.join('\n'));

        return interaction.followUp({ embeds: [embed], ephemeral: false });
      });

      colecDist.on('end', c => {
        if (!c.size) interaction.followUp({ content: '⏱️ Tiempo agotado.', ephemeral: true });
      });
    });

    colecArma.on('end', c => {
      if (!c.size) interaction.followUp({ content: '⏱️ Tiempo agotado.', ephemeral: true });
    });
  },
};