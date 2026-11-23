// Brief-to-quote assistant (story #23): turns a business's own words into the
// guided brief and suggests a pack. The business reviews and edits everything
// before sending; Jiwar's admin still quotes custom work.
import { z } from 'zod';

export const PACK_CODES = ['website', 'whatsapp-bot', 'ai-assistant'];

const schema = z.object({
  title: z.string().describe('A short project name, 3 to 8 words'),
  goals: z.string().describe('What the project should achieve, in one or two sentences'),
  features: z.string().describe('The pages or features, as a comma-separated list'),
  packCode: z.enum([...PACK_CODES, 'custom']).describe('The best pack, or custom if none fits'),
  reason: z.string().describe('One sentence explaining the suggestion'),
});

// Offline rules for the mock provider, in English and Arabic.
const RULES = [
  {
    pack: 'whatsapp-bot',
    words: ['whatsapp', 'واتساب', 'order', 'orders', 'طلب', 'طلبات', 'menu', 'منيو', 'delivery', 'توصيل'],
  },
  {
    pack: 'ai-assistant',
    words: ['ai', 'ذكاء', 'reply', 'replies', 'رد', 'ردود', 'messages', 'رسائل', 'chatbot', 'assistant'],
  },
  {
    pack: 'website',
    words: ['website', 'site', 'موقع', 'page', 'صفحة', 'landing', 'gallery', 'معرض', 'portfolio'],
  },
];

// English keywords must be whole words ("ai" must not match "maintain"); Arabic
// ones may carry prefixes and suffixes (الموقع, موقعي), so they match inside words.
const mentions = (words, text) => (w) => (/^[a-z]+$/.test(w) ? words.includes(w) : text.includes(w));

function mock({ description }) {
  const text = description.toLowerCase();
  const words = text.match(/\p{L}+/gu) ?? [];
  const scored = RULES.map((r) => ({ ...r, found: r.words.filter(mentions(words, text)) })).map((r) => ({
    ...r,
    hits: r.found.length,
  }));
  const best = scored.sort((a, b) => b.hits - a.hits)[0];
  const packCode = best.hits > 0 ? best.pack : 'custom';
  const firstSentence = description.split(/(?<=[.!?؟])\s+/)[0].trim();
  return {
    title: description
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
      .replace(/[.,!?؟]+$/, ''),
    goals: firstSentence,
    features: '',
    packCode,
    reason:
      packCode === 'custom'
        ? 'None of the fixed packs clearly matches, so an admin will quote it.'
        : `Your description mentions ${best.found.slice(0, 2).join(' and ')}.`,
  };
}

export const briefTask = {
  name: 'brief-to-quote-v1',
  schema,
  system:
    'You help small businesses in Jordan describe a software project for Jiwar, whose trainees build websites, ' +
    'WhatsApp order bots and AI reply assistants. Turn the description into a clear brief. ' +
    'Write the brief in the language the business used. Suggest a pack only when it really fits; otherwise answer custom. ' +
    'Never invent prices, deadlines or facts the business did not give.',
  prompt: ({ description, packs }) =>
    [
      'Packs:',
      ...packs.map((p) => `- ${p.code}: ${p.name}. ${p.summary} (${p.priceJd} JD, ${p.deliveryDays} days)`),
      '',
      'Business description:',
      description,
    ].join('\n'),
  mock,
};

export const briefInput = z.object({ description: z.string().trim().min(15).max(2000) });
