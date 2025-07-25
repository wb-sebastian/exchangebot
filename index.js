const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is awake!');
});

app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});

require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const token = process.env.DISCORD_TOKEN;
const DEV_ID = process.env.DEV_ID;

const serverDefaultCurrency = new Map(); // guildId -> currency
const supportedCurrencies = new Set();
const currencyAliases = {
  USD: ['bucks'],
  MXN: ['pesos']
};

const WIDTH = 800;
const HEIGHT = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: WIDTH, height: HEIGHT });

async function fetchSupportedCurrencies() {
  try {
    const res = await axios.get('https://api.frankfurter.app/currencies');
    Object.keys(res.data).forEach(code => supportedCurrencies.add(code.toUpperCase()));
  } catch (err) {
    console.error("Failed to fetch supported currencies", err);
  }
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isSuperAdmin(userId) {
  return userId === DEV_ID;
}

function detectCurrencyMentions(text) {
  const matches = [];
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const currency = words[i].toUpperCase();
    const value = parseFloat(words[i + 1]);
    
    // Check if the word is an alias for a currency
    if (currencyAliases[currency]) {
      matches.push({ currency, value });
    } else if (supportedCurrencies.has(currency) && !isNaN(value)) {
      matches.push({ currency, value });
    }
  }
  return matches;
}

async function fetchConversion(from, to, amount) {
  const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`;
  try {
    const res = await axios.get(url);
    return res.data.rates[to];
  } catch (error) {
    console.error("Error fetching conversion rate:", error);
    throw error;
  }
}

async function fetchHistoricalData(currency, range) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start;
  switch (range) {
    case 'd': now.setDate(now.getDate() - 1); break;
    case 'w': now.setDate(now.getDate() - 7); break;
    case 'm': now.setMonth(now.getMonth() - 1); break;
    case 'y': now.setFullYear(now.getFullYear() - 1); break;
    case 'at': now.setFullYear(now.getFullYear() - 5); break;
    default: now.setMonth(now.getMonth() - 1);
  }
  start = now.toISOString().split('T')[0];

  const url = `https://api.frankfurter.app/${start}..${end}?from=${currency}&to=USD`;
  try {
    const res = await axios.get(url);
    return res.data.rates;
  } catch (error) {
    console.error("Error fetching historical data:", error);
    throw error;
  }
}

async function generateChart(data, currency) {
  const labels = Object.keys(data);
  const values = labels.map(date => data[date]['USD']);

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${currency}/USD`,
        data: values,
        borderColor: 'red',
        tension: 0.2
      }]
    },
    options: {
      scales: {
        y: { beginAtZero: false }
      }
    }
  };

  return chartJSNodeCanvas.renderToBuffer({ type: 'line', data: config.data, options: config.options });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const prefix = '.';
  const content = message.content.trim();
  const args = content.slice(prefix.length).split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!supportedCurrencies.size) await fetchSupportedCurrencies();

  // Admin-only: Set default server currency
  if (command === 'servercurrency') {
    if (isSuperAdmin(message.author.id) || isAdmin(message.member)) {
      const newCur = args[0]?.toUpperCase();
      if (!supportedCurrencies.has(newCur)) return message.reply("Invalid currency code.");
      serverDefaultCurrency.set(message.guild.id, newCur);
      return message.reply(`Set default currency to ${newCur}`);
    } else {
      return message.reply("You don't have permission to do that.");
    }
  }

  if (command === 'ex') {
    const from = args[0]?.toUpperCase();
    const to = args[1]?.toUpperCase();
    const amount = parseFloat(args[2]) || 1;
    if (!supportedCurrencies.has(from) || !supportedCurrencies.has(to)) {
      return message.reply("Invalid currency code.");
    }
    try {
      const result = await fetchConversion(from, to, amount);
      const msg = `${amount} ${from} = ${result.toFixed(2)} ${to}`;
      return message.reply(msg);
    } catch (err) {
      return message.reply("Conversion failed. Please try again.");
    }
  }

  if (command === 'rate') {
    const currency = args[0]?.toUpperCase();
    const range = args[1] || 'm';
    if (!supportedCurrencies.has(currency)) return message.reply("Invalid currency.");

    try {
      const data = await fetchHistoricalData(currency, range);
      const buffer = await generateChart(data, currency);
      return message.reply({ files: [{ attachment: buffer, name: `${currency}_rate.png` }] });
    } catch (e) {
      console.error(e);
      return message.reply("Couldn't generate chart.");
    }
  }

  // Auto-detect currency mentions
  const found = detectCurrencyMentions(content);
  const defCur = serverDefaultCurrency.get(message.guildId);
  if (found.length && defCur) {
    for (const { currency, value } of found) {
      if (currency === defCur) continue;
      try {
        const result = await fetchConversion(currency, defCur, value);
        message.reply(`${value} ${currency} = ${result.toFixed(2)} ${defCur}`);
      } catch (e) {
        console.error(e);
      }
    }
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(token);
