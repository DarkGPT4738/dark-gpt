const { Client, GatewayIntentBits, Events } = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Historique des conversations par channel (channelId -> messages[])
const conversations = new Map();
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `Tu es DarkGPT, un bot Discord français.

Personnalité :
- Tu es cool, décontracté, direct. Tu parles comme un vrai mec, pas comme un assistant corporatif.
- Tu tutoies toujours. Tu utilises un langage naturel, parfois familier.
- Tu réponds à TOUTES les questions honnêtement, sans te défiler inutilement.
- Si quelqu'un t'insulte, tu le remets à sa place avec classe — sans te mettre en colère comme un fou, juste avec une répartie bien sentie.
- Tu n'es pas un assistant "bisounours". Tu donnes des vraies réponses, pas des réponses édulcorées.
- Tu peux faire des blagues, être sarcastique, mais tu restes utile.
- Tu connais la culture internet, les memes, le gaming, la tech.

Format :
- Réponses concises. Pas de pavés inutiles sauf si on te demande une explication détaillée.
- Pas de "Bien sûr !", "Absolument !", ou autres formules de chatbot insupportables.
- Pas de listes à puces sauf si vraiment utile.
- Tu peux utiliser des emojis avec parcimonie si ça colle.

Tu parles uniquement en français sauf si l'utilisateur écrit dans une autre langue.`;

function getHistory(channelId) {
  if (!conversations.has(channelId)) {
    conversations.set(channelId, []);
  }
  return conversations.get(channelId);
}

function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  // Garder seulement les MAX_HISTORY derniers messages
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

async function askClaude(channelId, userMessage) {
  addToHistory(channelId, "user", userMessage);
  const history = getHistory(channelId);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply = response.content[0].text;
  addToHistory(channelId, "assistant", reply);
  return reply;
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ DarkGPT connecté en tant que ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignorer les autres bots
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1; // DM channel

  // Répondre si mentionné ou en DM
  if (!isMentioned && !isDM) return;

  // Nettoyer le message (enlever la mention)
  let content = message.content
    .replace(`<@${client.user.id}>`, "")
    .trim();

  if (!content) {
    await message.reply("Ouais ? Tu voulais dire quelque chose ou t'as juste cliqué par accident ? 👀");
    return;
  }

  // Indicateur de frappe
  await message.channel.sendTyping();

  try {
    const reply = await askClaude(message.channel.id, content);

    // Discord limite les messages à 2000 caractères
    if (reply.length > 1900) {
      const chunks = reply.match(/[\s\S]{1,1900}/g);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    console.error("Erreur API:", err);
    await message.reply("Erreur de mon côté, réessaie dans une seconde.");
  }
});

// Commande !reset pour vider l'historique du channel
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim() === "!reset") {
    conversations.delete(message.channel.id);
    await message.reply("Historique vidé. On repart de zéro.");
  }
});

client.login(process.env.DISCORD_TOKEN);
