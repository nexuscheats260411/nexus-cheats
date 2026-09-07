// src/ticketBot.ts
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";
import { access } from "node:fs/promises";
import path2 from "node:path";

// src/lib/logger.ts
import pino from "pino";
var isProduction = process.env.NODE_ENV === "production";
var logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']"
  ],
  ...isProduction ? {} : {
    transport: {
      target: "pino-pretty",
      options: { colorize: true }
    }
  }
});

// src/ticketStore.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
var defaultPath = path.resolve(
  process.cwd(),
  "data/tickets.json"
);
var dataPath = process.env.TICKET_DATA_PATH ?? defaultPath;
var tickets = [];
var loaded = false;
var writeQueue = Promise.resolve();
async function ensureLoaded() {
  if (loaded) return;
  try {
    const file = await readFile(dataPath, "utf8");
    const parsed = JSON.parse(file);
    tickets = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code !== "ENOENT") throw error;
    tickets = [];
  }
  loaded = true;
}
function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(dataPath), { recursive: true });
    await writeFile(dataPath, JSON.stringify(tickets, null, 2), "utf8");
  });
  return writeQueue;
}
async function findOpenTicket(guildId, userId) {
  await ensureLoaded();
  return tickets.find(
    (ticket) => ticket.guildId === guildId && ticket.userId === userId && ticket.status === "open"
  );
}
async function createTicket(record) {
  await ensureLoaded();
  tickets.push(record);
  await persist();
  return record;
}
async function updateTicket(guildId, channelId, patch) {
  await ensureLoaded();
  const ticket = tickets.find(
    (entry) => entry.guildId === guildId && entry.channelId === channelId
  );
  if (!ticket) return void 0;
  Object.assign(ticket, patch);
  await persist();
  return ticket;
}
async function closeTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, {
    status: "closed",
    closedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/ticketBot.ts
var ticketTypes = {
  suporte: {
    label: "Suporte",
    emoji: "\u{1F6E0}\uFE0F",
    description: "Preciso de suporte"
  },
  duvidas: {
    label: "Dúvidas",
    emoji: "\u2753",
    description: "Tenho uma dúvida"
  },
  licenca: {
    label: "Dúvida com licença",
    emoji: "\u{1F511}",
    description: "Dúvidas relacionadas à licença"
  }
};
var botToken = process.env.DISCORD_BOT_TOKEN;
var configuredGuildId = process.env.DISCORD_GUILD_ID;
var ticketCategoryId = process.env.DISCORD_TICKET_CATEGORY_ID;
var supportRoleId = process.env.DISCORD_SUPPORT_ROLE_ID;
var panelImageUrl = process.env.DISCORD_PANEL_IMAGE_URL;
var configuredPanelImagePath = process.env.DISCORD_PANEL_IMAGE_PATH;
var logChannelId = process.env.DISCORD_TICKET_LOG_CHANNEL_ID;
function resolvePanelImagePath() {
  if (!configuredPanelImagePath) return void 0;
  if (path2.isAbsolute(configuredPanelImagePath)) {
    return configuredPanelImagePath;
  }
  const candidates = [
    path2.resolve(process.cwd(), configuredPanelImagePath),
    path2.resolve(process.cwd(), "../../", configuredPanelImagePath)
  ];
  return candidates[1] ?? candidates[0];
}
var panelImagePath = resolvePanelImagePath();
var client = new Client({
  intents: [GatewayIntentBits.Guilds]
});
var commandData = [
  {
    name: "painel-ticket",
    description: "Publica o painel de abertura de tickets neste canal.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  }
];
function isTicketType(value) {
  return value in ticketTypes;
}
function panelEmbed(imageAttachmentName) {
  const embed = new EmbedBuilder().setColor(5793266).setTitle("\u{1F3AB} \u2022 Atendimento").setDescription(
    [
      "Após solicitar um atendimento, aguarde até que um membro da nossa equipe responda à sua solicitação.",
      "",
      "\u2022 \u{1F512} Atendimento privado: as informações compartilhadas no ticket serão acessíveis somente ao cliente e aos membros autorizados da equipe.",
      "",
      "\u2022 \u{1F6E1}\uFE0F Segurança e privacidade: não compartilhe informações pessoais ou dados sensíveis desnecessários durante o atendimento.",
      "",
      "\u2022 \u{1F550} Horário de atendimento: nossa equipe estará disponível conforme os horários informados anteriormente. Fora desse período, sua solicitação permanerá aguardando até que um membro da equipe esteja disponível.",
      "",
      "\u2022 \u26A1 Atendimento organizado: escolha corretamente a categoria do seu problema para que possamos direcionar sua solicitação ao setor responsável.",
      "",
      "Clique nos botões abaixo para iniciar ou continuar seu atendimento."
    ].join("\n")
  ).setFooter({ text: "Central de atendimento" });
  if (imageAttachmentName) {
    embed.setImage(`attachment://${imageAttachmentName}`);
  } else if (panelImageUrl) {
    embed.setImage(panelImageUrl);
  }
  return embed;
}
function panelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("ticket_select").setPlaceholder("\u27A1\uFE0F Clique aqui para ver as opções").addOptions(
        new StringSelectMenuOptionBuilder().setValue("suporte").setLabel(ticketTypes.suporte.label).setDescription(ticketTypes.suporte.description).setEmoji(ticketTypes.suporte.emoji),
        new StringSelectMenuOptionBuilder().setValue("duvidas").setLabel(ticketTypes.duvidas.label).setDescription(ticketTypes.duvidas.description).setEmoji(ticketTypes.duvidas.emoji),
        new StringSelectMenuOptionBuilder().setValue("licenca").setLabel(ticketTypes.licenca.label).setDescription(ticketTypes.licenca.description).setEmoji(ticketTypes.licenca.emoji)
      )
    )
  ];
}
function ticketComponents(claimedBy) {
  const claimButton = new ButtonBuilder().setCustomId("ticket_claim").setLabel(claimedBy ? "Ticket assumido" : "Assumir Ticket").setEmoji("\u{1F464}").setStyle(ButtonStyle.Primary).setDisabled(Boolean(claimedBy));
  return [
    new ActionRowBuilder().addComponents(
      claimButton,
      new ButtonBuilder().setCustomId("ticket_notify").setLabel("Notificar Equipe").setEmoji("\u{1F514}").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket_close").setLabel("Fechar Ticket").setEmoji("\u{1F512}").setStyle(ButtonStyle.Danger)
    )
  ];
}
function ticketRedirectComponents(channelUrl) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Ir para o ticket").setEmoji("\u{1F3AB}").setStyle(ButtonStyle.Link).setURL(channelUrl)
    )
  ];
}
function ticketCreatedEmbed(label) {
  return new EmbedBuilder().setColor(5763719).setTitle("\u2705 Atendimento criado").setDescription(
    [
      "Seu ticket foi aberto com sucesso e já está pronto para atendimento.",
      "",
      "Clique no botão abaixo para ir diretamente ao seu canal privado."
    ].join("\n")
  ).addFields(
    { name: "\u{1F4CC} Categoria", value: label, inline: true },
    { name: "\u{1F550} Status", value: "Aguardando a equipe", inline: true }
  ).setFooter({ text: "Central de Atendimento \u2022 Não abra mais de um ticket" });
}
function canManageTicket(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  if (!supportRoleId || !interaction.guild) return false;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  return Boolean(member?.roles.cache.has(supportRoleId));
}
function channelName(type) {
  const slug = type === "suporte" ? "suporte-tecnico" : type;
  return `\u{1F3AB}\u30FB${slug}`;
}
async function createTicketChannel(guild, userId, type) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];
  try {
    return await guild.channels.create({
      name: channelName(type),
      type: ChannelType.GuildText,
      parent: ticketCategoryId || void 0,
      permissionOverwrites: overwrites,
      topic: `Ticket de ${ticketTypes[type].label} \u2022 ${userId}`
    });
  } catch (error) {
    logger.warn({ err: error }, "Could not use emoji ticket channel name");
    return guild.channels.create({
      name: `ticket-${type}-${userId.slice(-4)}`,
      type: ChannelType.GuildText,
      parent: ticketCategoryId || void 0,
      permissionOverwrites: overwrites,
      topic: `Ticket de ${ticketTypes[type].label} \u2022 ${userId}`
    });
  }
}
async function sendTicketPanel(channel) {
  if (channel.isDMBased()) return false;
  let imageAttachmentName;
  let files;
  if (panelImagePath) {
    try {
      await access(panelImagePath);
      imageAttachmentName = path2.basename(panelImagePath);
      files = [new AttachmentBuilder(panelImagePath)];
    } catch (error) {
      logger.warn({ err: error, panelImagePath }, "Panel image is unavailable");
    }
  }
  await channel.send({
    embeds: [panelEmbed(imageAttachmentName)],
    components: panelComponents(),
    files
  });
  return true;
}
async function removePreviousPanels(channel) {
  if (!("messages" in channel) || !client.user) return;
  const messages = await channel.messages.fetch({ limit: 50 });
  const previousTitles = /* @__PURE__ */ new Set(["\u{1F3AB} Painel de abertura", "\u{1F3AB} \u2022 Atendimento"]);
  await Promise.all(
    messages.filter(
      (message) => message.author.id === client.user?.id && previousTitles.has(message.embeds[0]?.title ?? "")
    ).map((message) => message.delete().catch(() => void 0))
  );
}
async function registerCommands() {
  if (!client.user) return;
  const rest = new REST({ version: "10" }).setToken(botToken);
  const route = configuredGuildId ? Routes.applicationGuildCommands(client.user.id, configuredGuildId) : Routes.applicationCommands(client.user.id);
  await rest.put(route, { body: commandData });
  logger.info(
    { guildId: configuredGuildId ?? "global" },
    "Discord slash commands registered"
  );
}
async function handlePanelCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guild || !interaction.channel) {
    await interaction.editReply({
      content: "Este comando só pode ser usado dentro de um servidor."
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({
      content: "Apenas administradores podem publicar o painel."
    });
    return;
  }
  if (!interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
    await interaction.editReply({
      content: "Use o comando em um canal de texto do servidor."
    });
    return;
  }
  await removePreviousPanels(interaction.channel);
  const posted = await sendTicketPanel(interaction.channel);
  if (!posted) {
    await interaction.editReply({
      content: "Este canal não aceita mensagens do painel."
    });
    return;
  }
  await interaction.deleteReply();
}
async function handleOpenTicket(interaction, type) {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });
  const current = await findOpenTicket(interaction.guild.id, interaction.user.id);
  if (current) {
    const channel2 = interaction.guild.channels.cache.get(current.channelId);
    if (channel2) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setColor(16705372).setTitle("\u2139\uFE0F Você já possui um atendimento aberto").setDescription(
            "Para evitar atendimentos duplicados, continue sua solicitação no ticket atual."
          ).setFooter({ text: "Central de Atendimento" })
        ],
        components: ticketRedirectComponents(channel2.url)
      });
      return;
    }
    await closeTicket(interaction.guild.id, current.channelId);
  }
  const channel = await createTicketChannel(
    interaction.guild,
    interaction.user.id,
    type
  );
  const record = await createTicket({
    userId: interaction.user.id,
    guildId: interaction.guild.id,
    channelId: channel.id,
    type,
    label: ticketTypes[type].label,
    status: "open",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const embed = new EmbedBuilder().setColor(7161304).setAuthor({
    name: "Central de Atendimento",
    iconURL: client.user?.displayAvatarURL()
  }).setTitle(`\u{1F3AB} \u2022 ${record.label}`).setDescription(
    [
      `Olá, <@${record.userId}>! Seu atendimento foi iniciado com sucesso.`,
      "",
      "Um membro da nossa equipe responderá assim que estiver disponível. Enquanto isso, envie abaixo todas as informações necessárias para entendermos sua solicitação."
    ].join("\n")
  ).addFields(
    {
      name: "\u{1F4CC} Categoria do atendimento",
      value: `\`${record.label}\``,
      inline: true
    },
    {
      name: "\u{1F550} Status",
      value: "Aguardando atendimento",
      inline: true
    },
    {
      name: "\u{1F4DD} Para agilizar sua solicitação",
      value: "Explique o problema com detalhes e, se necessário, envie prints ou comprovantes. Não envie senhas, tokens ou dados pessoais desnecessários."
    },
    {
      name: "\u{1F512} Atendimento privado",
      value: "Este canal é visível somente para você e para a equipe autorizada. Use os botões abaixo para controlar o atendimento."
    }
  ).setFooter({ text: "Obrigado por aguardar \u2022 Central de Atendimento" }).setTimestamp();
  await channel.send({
    content: `\u{1F3AB} <@${record.userId}>, seu ticket foi criado. A equipe será avisada quando necessário.`,
    embeds: [embed],
    components: ticketComponents(),
    allowedMentions: { users: [record.userId] }
  });
  await interaction.editReply({
    embeds: [ticketCreatedEmbed(record.label)],
    components: ticketRedirectComponents(channel.url)
  });
}
async function handleClaim(interaction) {
  if (!interaction.guild || !canManageTicket(interaction)) {
    await interaction.reply({
      content: "Apenas a equipe autorizada pode assumir tickets.",
      ephemeral: true
    });
    return;
  }
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const ticket = await updateTicket(interaction.guild.id, channel.id, {
    claimedBy: interaction.user.id
  });
  if (!ticket) {
    await interaction.reply({
      content: "Não encontrei este ticket na lista de tickets abertos.",
      ephemeral: true
    });
    return;
  }
  await interaction.update({
    components: ticketComponents(interaction.user.id)
  });
  await channel.send(
    `\u{1F464} <@${interaction.user.id}> assumiu este ticket e continuará o atendimento.`
  );
}
async function handleNotify(interaction) {
  if (!interaction.guild || !canManageTicket(interaction)) {
    await interaction.reply({
      content: "Apenas a equipe autorizada pode notificar a equipe.",
      ephemeral: true
    });
    return;
  }
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const mention = supportRoleId ? `<@&${supportRoleId}>` : "@here";
  await interaction.reply({
    content: `${mention} atendimento solicitado neste ticket por <@${interaction.user.id}>.`,
    allowedMentions: supportRoleId ? { roles: [supportRoleId] } : { parse: ["everyone"] }
  });
}
async function handleClose(interaction) {
  if (!interaction.guild) return;
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const storedTicket = await updateTicket(interaction.guild.id, channel.id, {});
  const isOwner = storedTicket?.userId === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
  const isStaff = canManageTicket(interaction);
  if (!isOwner && !isAdmin && !isStaff) {
    await interaction.reply({
      content: "Apenas o autor do ticket ou a equipe autorizada pode fechá-lo.",
      ephemeral: true
    });
    return;
  }
  if (!storedTicket) {
    await interaction.reply({
      content: "Este canal não está registrado como um ticket ativo.",
      ephemeral: true
    });
    return;
  }
  await closeTicket(interaction.guild.id, channel.id);
  if (logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(logChannelId);
    if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
      await logChannel.send(
        `\u{1F512} Ticket <#${channel.id}> fechado por <@${interaction.user.id}>.`
      );
    }
  }
  await interaction.reply({
    content: "\u{1F512} Ticket encerrado. Este canal será excluído em 5 segundos. Você poderá abrir um novo ticket pelo painel."
  });
  setTimeout(() => {
    void channel.delete("Ticket fechado pelo usuário ou pela equipe").catch((error) => {
      logger.warn({ err: error, channelId: channel.id }, "Could not delete closed ticket channel");
    });
  }, 5e3);
}
async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "painel-ticket") {
      await handlePanelCommand(interaction);
    }
    return;
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== "ticket_select") return;
    const value2 = interaction.values[0];
    if (value2 && isTicketType(value2)) {
      await handleOpenTicket(interaction, value2);
    }
    return;
  }
  if (!interaction.isButton()) return;
  const [action, value] = interaction.customId.split(":");
  try {
    if (action === "ticket_open" && value && isTicketType(value)) {
      await handleOpenTicket(interaction, value);
    } else if (action === "ticket_claim") {
      await handleClaim(interaction);
    } else if (action === "ticket_notify") {
      await handleNotify(interaction);
    } else if (action === "ticket_close") {
      await handleClose(interaction);
    }
  } catch (error) {
    logger.error({ err: error }, "Ticket interaction failed");
    const response = {
      content: "Não consegui concluir essa ação. Tente novamente em instantes.",
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => void 0);
    } else {
      await interaction.reply(response).catch(() => void 0);
    }
  }
}
async function startTicketBot() {
  if (!botToken) {
    logger.warn(
      "DISCORD_BOT_TOKEN is not configured; Discord ticket bot is disabled"
    );
    return;
  }
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord ticket bot online");
    await registerCommands();
  });
  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction);
  });
  client.on(Events.Error, (error) => {
    logger.error({ err: error }, "Discord client error");
  });
  await client.login(botToken);
}

startTicketBot().catch((error) => {
  console.error("Discord ticket bot failed to start:", error);
  process.exitCode = 1;
});