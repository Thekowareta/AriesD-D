const { readdirSync, statSync } = require('fs');
const path = require('path');

module.exports = {
    async loadSlash(client) {
        const slashPath = path.join(__dirname, '..', 'slashcommands');
        for (const category of readdirSync(slashPath)) {
            const categoryPath = path.join(slashPath, category);
            // Verificamos si es carpeta
            if (!statSync(categoryPath).isDirectory()) continue;

            for (const file of readdirSync(categoryPath)) {
                const filePath = path.join(categoryPath, file);
                // Solo cargamos archivos JS
                if (!file.endsWith('.js')) continue;

                const commandExport = require(filePath);
                // Soporta export default array o objeto único
                const commands = Array.isArray(commandExport) ? commandExport : [commandExport];
                for (const command of commands) {
                    if (!command?.data?.name) continue; // ignora si no tiene nombre
                    client.slashCommands.set(command.data.name, command);
                }
            }
        }

        await client.application?.commands.set(
            client.slashCommands.map(cmd => cmd.data)
        );
    },
};
