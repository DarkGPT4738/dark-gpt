const { Client, GatewayIntentBits, Events } = require("discord.js");
const OpenAI = require("openai");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

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
  if (!conversations.has(channelId)) conversations.set(channelId, []);
  return conversations.get(channelId);
}

function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

async function askGrok(channelId, userMessage) {
  addToHistory(channelId, "user", userMessage);
  const history = getHistory(channelId);

  const response = await grok.chat.completions.create({
    model: "grok-3",
    max_tokens: 1024,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
  });

  const reply = response.choices[0].message.content;
  addToHistory(channelId, "assistant", reply);
  return reply;
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ DarkGPT (Grok) connecté en tant que ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1;
  if (!isMentioned && !isDM) return;

  let content = message.content.replace(`<@${client.user.id}>`, "").trim();

  if (!content) {
    await message.reply("Ouais ? Tu voulais dire quelque chose ou t'as juste cliqué par accident ? 👀");
    return;
  }

  await message.channel.sendTyping();

  try {
    const reply = await askGrok(message.channel.id, content);
    if (reply.length > 1900) {
      const chunks = reply.match(/[\s\S]{1,1900}/g);
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    console.error("Erreur API Grok:", err);
    await message.reply("Erreur de mon côté, réessaie dans une seconde.");
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim() === "!reset") {
    conversations.delete(message.channel.id);
    await message.reply("Historique vidé. On repart de zéro.");
  }
});

client.login(process.env.DISCORD_TOKEN);
