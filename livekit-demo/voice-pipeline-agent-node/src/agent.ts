// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  pipeline,
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai'; // Keep this import for Ollama integration
import * as silero from '@livekit/agents-plugin-silero';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;
    const initialContext = new llm.ChatContext().append({
      role: llm.ChatRole.SYSTEM,
      text:
        'You are a versatile voice assistant created by LiveKit, designed to provide helpful information ' +
        'and execute professional tasks using various online services. Your responses should be concise and clear.',
    });

    await ctx.connect();
    console.log('waiting for participant');
    const participant = await ctx.waitForParticipant();
    console.log(`starting assistant example agent for ${participant.identity}`);

    // --- Start Web-Calling Function Contexts ---
    const fncCtx: llm.FunctionContext = {
      weather: {
        description: 'Get the current weather in a specified location.',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          console.debug(`executing weather function for ${location}`);
          const response = await fetch(`https://wttr.in/${location}?format=%C+%t`);
          if (!response.ok) {
            return `I couldn't get the weather for ${location}. The weather service is unavailable.`;
          }
          const weather = await response.text();
          return `The weather in ${location} right now is ${weather}.`;
        },
      },
      dadJoke: {
        description: 'Tell a funny dad joke. Often requested for lighthearted moments.',
        parameters: z.object({}),
        execute: async () => {
          console.debug('Fetching a dad joke...');
          const response = await fetch('https://icanhazdadjoke.com/', {
            headers: { 'Accept': 'application/json' }
          });
          if (!response.ok) {
            return `I couldn't fetch a joke right now. My joke book is offline!`;
          }
          const data = await response.json();
          return data.joke;
        },
      },
      randomFact: {
        description: 'Provide a random, interesting, or useless fact to broaden knowledge.',
        parameters: z.object({}),
        execute: async () => {
          console.debug('Fetching a random fact...');
          const response = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
          if (!response.ok) {
            return `I couldn't fetch a random fact. The fact machine is jammed.`;
          }
          const data = await response.json();
          return data.text;
        },
      },
      currentTime: {
        description: 'Tell the current date and time for a specified city or timezone. Useful for coordinating across different regions.',
        parameters: z.object({
          timezone: z.string().optional().describe('The timezone or city name to get the time for (e.g., "America/New_York", "Tokyo", "London").'),
        }),
        execute: async ({ timezone }) => {
          console.debug(`Getting current time for ${timezone || 'local'}`);
          try {
            const options: Intl.DateTimeFormatOptions = {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              hour12: true,
              timeZone: timezone,
            };
            const now = new Date();
            // Using Intl.DateTimeFormat with a specified timezone string can be considered a web call as it accesses locale data.
            return `The current time is ${now.toLocaleString('en-US', options)}.`;
          } catch (e) {
            console.error(`Error getting time for ${timezone}:`, e);
            return `I couldn't find the time for "${timezone}". Please try a different city or a valid timezone identifier like "America/New_York".`;
          }
        },
      },
      tellAFactAbout: {
        description: 'Provide a concise factual summary about a given topic, suitable for quick information retrieval.',
        parameters: z.object({
          topic: z.string().describe('The topic to get a fact about.'),
        }),
        execute: async ({ topic }) => {
          console.debug(`Fetching fact about: ${topic}`);
          const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
          if (!response.ok) {
            return `I couldn't find a direct fact about "${topic}" right now. The information service is unavailable.`;
          }
          const data = await response.json();
          // Ensure extract property exists and is not empty
          return data.extract && data.extract.trim() !== '' ? data.extract : `I found something about "${topic}", but it's hard to summarize.`;
        },
      },
      getStockPrice: {
        description: 'Retrieve the current stock price for a given stock ticker symbol. Essential for financial inquiries.',
        parameters: z.object({
          symbol: z.string().describe('The stock ticker symbol (e.g., "AAPL" for Apple, "MSFT" for Microsoft).'),
        }),
        execute: async ({ symbol }) => {
          console.debug(`Fetching stock price for ${symbol}`);
          // Note: A real stock API would require an API key. This is a mock response.
          // Example for a real API (e.g., Alpha Vantage, requires API key):
          // const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
          // const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`);
          // if (!response.ok) { ... }
          // const data = await response.json();
          // if (data['Global Quote'] && data['Global Quote']['05. price']) { ... }

          const mockPrices: { [key: string]: number } = {
            "AAPL": 170.25,
            "MSFT": 420.10,
            "GOOG": 155.80,
            "AMZN": 185.00,
            "TSLA": 178.50,
          };

          const price = mockPrices[symbol.toUpperCase()];
          if (price) {
            return `The current price of ${symbol.toUpperCase()} is $${price.toFixed(2)}.`;
          } else {
            return `I could not find the stock price for ${symbol.toUpperCase()}. Please check the ticker symbol.`;
          }
        },
      },
      translateText: {
        description: 'Translate a piece of text from a source language to a target language. Useful for multilingual communication.',
        parameters: z.object({
          text: z.string().describe('The text to be translated.'),
          sourceLang: z.string().describe('The source language code (e.g., "en" for English, "es" for Spanish).'),
          targetLang: z.string().describe('The target language code (e.g., "fr" for French, "de" for German).'),
        }),
        execute: async ({ text, sourceLang, targetLang }) => {
          console.debug(`Translating "${text}" from ${sourceLang} to ${targetLang}`);
          // Note: A real translation API (e.g., Google Translate, DeepL) would require an API key.
          // This is a simplified mock or could use a public service if available and reliable.
          try {
            const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
            if (!response.ok) {
              return `Translation failed. The translation service is unavailable.`;
            }
            const data = await response.json();
            if (data.responseData && data.responseData.translatedText) {
              return `Translated text: "${data.responseData.translatedText}"`;
            } else {
              return `I couldn't translate that. Please check the language codes and try again.`;
            }
          } catch (error) {
            console.error('Translation API error:', error);
            return `An error occurred during translation.`;
          }
        },
      },
      shortenUrl: {
        description: 'Shorten a long URL to a more concise link. Handy for sharing and managing URLs.',
        parameters: z.object({
          longUrl: z.string().url().describe('The long URL to shorten.'),
        }),
        execute: async ({ longUrl }) => {
          console.debug(`Shortening URL: ${longUrl}`);
          // Using TinyURL's public API. Some public APIs might have rate limits or require API keys for production.
          try {
            const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
            if (!response.ok) {
              return `Failed to shorten URL. The URL shortening service is unavailable.`;
            }
            const shortenedUrl = await response.text();
            return `Your shortened URL is: ${shortenedUrl}`;
          } catch (error) {
            console.error('URL shortening API error:', error);
            return `An error occurred while shortening the URL.`;
          }
        },
      },
      convertCurrency: {
        description: 'Convert an amount from one currency to another using current exchange rates. Useful for financial calculations.',
        parameters: z.object({
          amount: z.number().describe('The amount to convert.'),
          fromCurrency: z.string().describe('The source currency code (e.g., "USD", "EUR", "JPY").'),
          toCurrency: z.string().describe('The target currency code (e.g., "AUD", "GBP", "CAD").'),
        }),
        execute: async ({ amount, fromCurrency, toCurrency }) => {
          console.debug(`Converting ${amount} ${fromCurrency} to ${toCurrency}`);
          // Using exchangerate-api.com's free tier. Requires a base currency for the free API key.
          // You'd ideally use a more robust API with an API key for production.
          const API_KEY = process.env.EXCHANGERATE_API_KEY || 'YOUR_FREE_EXCHANGERATE_API_KEY_HERE'; // Replace with a valid API key
          if (API_KEY === 'YOUR_FREE_EXCHANGERATE_API_KEY_HERE') {
             return "Currency conversion requires an API key for ExchangeRate-API. Please set EXCHANGERATE_API_KEY in your .env.local file.";
          }
          try {
            const response = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${fromCurrency.toUpperCase()}`);
            if (!response.ok) {
              const errorData = await response.json();
              console.error('ExchangeRate-API error:', errorData);
              return `Could not fetch exchange rates. Reason: ${errorData.result || response.statusText}. Please check the currency codes.`;
            }
            const data = await response.json();
            const rate = data.conversion_rates[toCurrency.toUpperCase()];
            if (rate) {
              const convertedAmount = amount * rate;
              return `${amount} ${fromCurrency.toUpperCase()} is equal to ${convertedAmount.toFixed(2)} ${toCurrency.toUpperCase()}.`;
            } else {
              return `I couldn't find a conversion rate for ${toCurrency.toUpperCase()}. Please check the currency codes.`;
            }
          } catch (error) {
            console.error('Currency conversion API error:', error);
            return `An error occurred during currency conversion.`;
          }
        },
      },
      defineWord: {
        description: 'Provide the definition of a given English word. Useful for quick vocabulary lookups.',
        parameters: z.object({
          word: z.string().describe('The word to define.'),
        }),
        execute: async ({ word }) => {
          console.debug(`Defining word: ${word}`);
          try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            if (!response.ok) {
              if (response.status === 404) {
                 return `I couldn't find a definition for "${word}".`;
              }
              return `Failed to get definition. The dictionary service is unavailable.`;
            }
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0 && data[0].meanings && data[0].meanings.length > 0) {
              const definition = data[0].meanings[0].definitions[0].definition;
              return `"${word}" means: ${definition}`;
            } else {
              return `I found "${word}" but couldn't get a clear definition.`;
            }
          } catch (error) {
            console.error('Dictionary API error:', error);
            return `An error occurred while trying to define "${word}".`;
          }
        },
      },
    };
    // --- End Web-Calling Function Contexts ---

    const agent = new pipeline.VoicePipelineAgent(
      vad,
      new deepgram.STT(),
      // Configured to use Ollama LLM with a model that supports tools
      openai.LLM.withOllama({
        model: "qwen2.5:3b", // Changed to llama3:latest for tool support
        baseURL: "http://localhost:11434/v1" // Explicitly pointing to local Ollama
      }),
      new elevenlabs.TTS(),
      { chatCtx: initialContext, fncCtx }, // Pass the expanded fncCtx
    );
    agent.start(ctx.room, participant);

    await agent.say('Hey, how can I help you today', true);
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
