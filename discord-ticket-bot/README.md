# Discord Ticket Bot

Bot de tickets privados com painel por categorias, controle de um ticket ativo por usuário, atendimento pela equipe e exclusão do canal ao fechar.

## Como hospedar

1. Instale Node.js 18 ou superior.
2. Instale as dependências com `npm install` ou `pnpm install`.
3. Copie `.env.example` para `.env` ou configure essas variáveis no painel do seu host.
4. Preencha `DISCORD_BOT_TOKEN` com o token do bot usando o sistema de Secrets do seu host.
5. Inicie com `npm start`.
6. No servidor Discord, um administrador usa `/painel-ticket` no canal onde deseja publicar o painel.

## Permissões do bot

O bot precisa de:

- Ver canais
- Enviar mensagens
- Incorporar links
- Gerenciar canais
- Gerenciar permissões
- Usar comandos de aplicativo

O ID da categoria já está preenchido em `DISCORD_TICKET_CATEGORY_ID`. Altere esse valor se quiser usar outra categoria.

## Recursos

- Menu com Suporte, Dúvidas e Dúvida com licença.
- Canais privados dentro da categoria configurada.
- Botão para ir diretamente ao ticket depois da abertura.
- Assumir Ticket, Notificar Equipe e Fechar Ticket.
- Fechar Ticket exclui o canal após 5 segundos.
- Tickets persistidos em `data/tickets.json`.