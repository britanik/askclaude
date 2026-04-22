const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Load .env
if (fs.existsSync(path.join(__dirname, '.env'))) {
  dotenv.config({ path: path.join(__dirname, '.env') });
  console.log('-- .ENV loaded');
}

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const CLAUDE_TOKEN = process.env.CLAUDE_TOKEN || '';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Admins & testers to exclude (from .env)
const EXCLUDED_USERNAMES = new Set(
  [process.env.ADMIN_USERNAME, ...(process.env.TESTER_USERNAMES || '').split(',')]
    .map(s => (s || '').trim())
    .filter(Boolean)
);

// --- Inline Mongoose Schemas ---

const UserSchema = new mongoose.Schema({
  ID: Number,
  name: String,
  username: String,
  blocked: { type: Boolean, default: false },
  chatId: Number,
  created: Date,
  prefs: mongoose.Schema.Types.Mixed,
}, { collection: 'users' });

const ThreadSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assistantType: String,
  created: Date,
}, { collection: 'threads' });

const MessageSchema = new mongoose.Schema({
  thread: { type: mongoose.Schema.Types.ObjectId, ref: 'Thread' },
  role: String,
  content: String,
  created: Date,
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Image' }],
}, { collection: 'messages' });

const ImageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  prompt: String,
  created: Date,
  provider: String,
  tier: String,
  imageUrl: String,
}, { collection: 'images' });

const User = mongoose.model('User', UserSchema);
const Thread = mongoose.model('Thread', ThreadSchema);
const Message = mongoose.model('Message', MessageSchema);
const Image = mongoose.model('Image', ImageSchema);

// --- Data Collection ---

async function getMessagesByUser() {
  const pipeline = [
    { $match: { role: 'user', created: { $gte: TWO_DAYS_AGO } } },
    { $lookup: { from: 'threads', localField: 'thread', foreignField: '_id', as: 'threadDoc' } },
    { $unwind: '$threadDoc' },
    { $group: {
      _id: '$threadDoc.owner',
      messageCount: { $sum: 1 },
      messages: { $push: { content: '$content', created: '$created' } }
    }},
    { $sort: { messageCount: -1 } },
  ];
  return Message.aggregate(pipeline);
}

async function getImagesByUser() {
  const pipeline = [
    { $match: { created: { $gte: TWO_DAYS_AGO } } },
    { $group: {
      _id: '$user',
      imageCount: { $sum: 1 },
      openaiCount: { $sum: { $cond: [{ $eq: ['$provider', 'openai'] }, 1, 0] } },
      images: { $push: { prompt: '$prompt', created: '$created', provider: '$provider' } }
    }},
    { $sort: { imageCount: -1 } },
  ];
  return Image.aggregate(pipeline);
}

// --- Claude API Analysis ---

async function analyzeWithClaude(userContent) {
  const systemPrompt = `You are a content moderator. Analyze these user messages sent to a Telegram bot that proxies requests to OpenAI.
Rate whether the content violates OpenAI usage policies.

Categories: sexual (especially involving minors), violence/gore, illegal activity (drugs, weapons, fraud), jailbreak/prompt injection, harassment.

Return ONLY valid JSON (no markdown):
{"score": <0-10>, "category": "none|sexual|violence|illegal|jailbreak|harassment", "reason": "<brief explanation in Russian>"}

score 0 = clean, 10 = severe explicit violation.
Be strict — even borderline attempts to generate prohibited content should score 5+.`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: CLAUDE_MODEL,
        messages: [{ role: 'user', content: userContent }],
        system: systemPrompt,
        max_tokens: 300,
        temperature: 0,
      },
      {
        headers: {
          'x-api-key': CLAUDE_TOKEN,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const text = response.data.content.find(c => c.type === 'text')?.text || '';
    return JSON.parse(text);
  } catch (err) {
    console.error('  Claude API error:', err.response?.data?.error?.message || err.message);
    return { score: -1, category: 'error', reason: 'API call failed' };
  }
}

function buildUserContentForAnalysis(messages, imagePrompts) {
  let parts = [];

  if (messages.length > 0) {
    parts.push('=== USER MESSAGES ===');
    for (const msg of messages) {
      if (msg.content) parts.push(msg.content);
    }
  }

  if (imagePrompts.length > 0) {
    parts.push('\n=== IMAGE GENERATION PROMPTS ===');
    for (const img of imagePrompts) {
      if (img.prompt) parts.push(img.prompt);
    }
  }

  let text = parts.join('\n');
  // Truncate to ~4000 chars to fit in context reasonably
  if (text.length > 4000) text = text.substring(0, 4000) + '\n... (truncated)';
  return text;
}

// --- Output Formatting ---

function pad(str, len) {
  str = String(str || '');
  return str.length > len ? str.substring(0, len - 1) + '…' : str.padEnd(len);
}

function formatDate(d) {
  if (!d) return '?';
  const dt = new Date(d);
  return dt.toISOString().replace('T', ' ').substring(0, 16);
}

function printReport(results, totalMessages, totalImages, totalUsers) {
  const now = new Date();
  console.log('\n' + '='.repeat(80));
  console.log('  ABUSE ANALYSIS REPORT');
  console.log(`  Period: ${TWO_DAYS_AGO.toISOString().substring(0, 10)} — ${now.toISOString().substring(0, 10)}`);
  console.log(`  Generated: ${now.toISOString().replace('T', ' ').substring(0, 19)}`);
  console.log('='.repeat(80));

  // Sort by score desc
  results.sort((a, b) => b.score - a.score);

  // Table
  console.log('\n--- ALL USERS (sorted by suspicion score) ---\n');
  console.log(
    pad('#', 4) + pad('Score', 7) + pad('Category', 13) +
    pad('TG ID', 13) + pad('Username', 18) + pad('Name', 16) +
    pad('Msgs', 6) + pad('Imgs', 6) + 'Reason'
  );
  console.log('-'.repeat(120));

  results.forEach((r, i) => {
    console.log(
      pad(i + 1, 4) + pad(r.score, 7) + pad(r.category, 13) +
      pad(r.telegramId, 13) + pad(r.username ? '@' + r.username : '-', 18) + pad(r.name, 16) +
      pad(r.messageCount, 6) + pad(r.imageCount, 6) + (r.reason || '')
    );
  });

  // Details for suspicious users (score >= 5)
  const suspicious = results.filter(r => r.score >= 5);
  if (suspicious.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  DETAILED REPORTS (${suspicious.length} users with score >= 5)`);
    console.log('='.repeat(80));

    for (const r of suspicious) {
      console.log('\n' + '-'.repeat(80));
      console.log(`SUSPECT: @${r.username || '?'} | Name: ${r.name} | TG ID: ${r.telegramId}`);
      console.log(`Score: ${r.score} | Category: ${r.category} | Reason: ${r.reason}`);
      console.log(`Messages: ${r.messageCount} | Images: ${r.imageCount} (OpenAI: ${r.openaiImageCount})`);

      if (r.messages.length > 0) {
        console.log('\n  MESSAGES:');
        for (const msg of r.messages) {
          if (!msg.content) continue;
          console.log(`  [${formatDate(msg.created)}] ${msg.content}`);
        }
      }

      if (r.imagePrompts.length > 0) {
        console.log('\n  IMAGE PROMPTS:');
        for (const img of r.imagePrompts) {
          if (!img.prompt) continue;
          console.log(`  [${formatDate(img.created)}] [${img.provider}] ${img.prompt}`);
        }
      }
    }
  } else {
    console.log('\nNo users with score >= 5 found.');
  }

  // Stats
  console.log('\n' + '='.repeat(80));
  console.log('  STATISTICS');
  console.log('='.repeat(80));
  console.log(`  Active users (2 days):    ${totalUsers}`);
  console.log(`  Total user messages:       ${totalMessages}`);
  console.log(`  Total images:              ${totalImages}`);
  console.log(`  Suspicious (score >= 5):   ${suspicious.length}`);
  console.log('='.repeat(80) + '\n');
}

// --- Main ---

async function main() {
  await mongoose.connect(process.env.MONGO_STRING);
  console.log('Connected to MongoDB');

  // 1. Collect data
  console.log('Collecting messages...');
  const messagesByUser = await getMessagesByUser();
  console.log(`  Found ${messagesByUser.length} users with messages`);

  console.log('Collecting images...');
  const imagesByUser = await getImagesByUser();
  console.log(`  Found ${imagesByUser.length} users with images`);

  // 2. Merge data by userId
  const userMap = new Map(); // ObjectId string -> data

  for (const m of messagesByUser) {
    const key = m._id.toString();
    if (!userMap.has(key)) userMap.set(key, { messages: [], imagePrompts: [], messageCount: 0, imageCount: 0, openaiImageCount: 0 });
    const u = userMap.get(key);
    u.messages = m.messages;
    u.messageCount = m.messageCount;
  }

  for (const im of imagesByUser) {
    const key = im._id.toString();
    if (!userMap.has(key)) userMap.set(key, { messages: [], imagePrompts: [], messageCount: 0, imageCount: 0, openaiImageCount: 0 });
    const u = userMap.get(key);
    u.imagePrompts = im.images;
    u.imageCount = im.imageCount;
    u.openaiImageCount = im.openaiCount;
  }

  // 3. Fetch user info & exclude admins/testers
  const userIds = [...userMap.keys()].map(id => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: userIds } });
  const usersById = new Map();
  for (const u of users) usersById.set(u._id.toString(), u);

  // Filter out admins and testers
  for (const [userId, data] of userMap) {
    const user = usersById.get(userId);
    if (user && EXCLUDED_USERNAMES.has(user.username)) {
      console.log(`  Excluding admin/tester: @${user.username}`);
      userMap.delete(userId);
    }
  }

  // 4. Analyze each user with Claude
  const results = [];
  const total = userMap.size;
  let idx = 0;

  console.log(`\nAnalyzing ${total} users with Claude (${CLAUDE_MODEL})...`);

  for (const [userId, data] of userMap) {
    idx++;
    const user = usersById.get(userId);
    const label = user ? `@${user.username || user.name} (${user.ID})` : userId;
    process.stdout.write(`  [${idx}/${total}] ${label}...`);

    const content = buildUserContentForAnalysis(data.messages, data.imagePrompts);

    if (!content.trim()) {
      console.log(' skipped (no content)');
      continue;
    }

    const analysis = await analyzeWithClaude(content);
    console.log(` score=${analysis.score}`);

    results.push({
      userId,
      telegramId: user?.ID || '?',
      username: user?.username || '',
      name: user?.name || '?',
      messageCount: data.messageCount,
      imageCount: data.imageCount,
      openaiImageCount: data.openaiImageCount,
      messages: data.messages,
      imagePrompts: data.imagePrompts,
      score: analysis.score,
      category: analysis.category,
      reason: analysis.reason,
    });

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  // 5. Print report
  const totalMessages = messagesByUser.reduce((s, m) => s + m.messageCount, 0);
  const totalImages = imagesByUser.reduce((s, m) => s + m.imageCount, 0);
  printReport(results, totalMessages, totalImages, userMap.size);
}

main()
  .catch(err => console.error('Fatal error:', err))
  .finally(() => mongoose.disconnect());
