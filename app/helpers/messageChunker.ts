import TelegramBot from 'node-telegram-bot-api'
import { getOptions } from './helpers'

/**
 * Simple function to split text into chunks while preserving HTML tags
 */
export function splitTextIntoChunks(text: string, maxLength: number = 4000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    
    // If adding this character would exceed the limit
    if (currentChunk.length + 1 > maxLength) {
      // Try to find a good break point (space, newline, or end of HTML tag)
      let breakPoint = currentChunk.lastIndexOf('\n');
      if (breakPoint === -1) breakPoint = currentChunk.lastIndexOf(' ');
      if (breakPoint === -1) breakPoint = currentChunk.lastIndexOf('>');
      
      if (breakPoint > maxLength * 0.7) { // Only use break point if it's not too far back
        chunks.push(currentChunk.substring(0, breakPoint));
        currentChunk = currentChunk.substring(breakPoint + 1);
      } else {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    
    currentChunk += char;
    i++;
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Send a message in chunks if it's too long
 * Returns the last sent message or null if all failed
 */
export async function sendLongMessage(
  bot: TelegramBot,
  chatId: number,
  text: string,
  options: any
): Promise<TelegramBot.Message | null> {
  const chunks = splitTextIntoChunks(text);
  let lastSentMessage: TelegramBot.Message | null = null;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Only add buttons/options to the last chunk
    const chunkOptions = i === chunks.length - 1 ? options : getOptions({ 
      keyboard: options.reply_markup?.keyboard,
      placeholder: options.reply_markup?.input_field_placeholder 
    });
    
    try {
      lastSentMessage = await bot.sendMessage(chatId, chunk, chunkOptions);
      
      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (chunkError) {
      console.error(`Error sending chunk ${i + 1}:`, chunkError);
      // If individual chunk fails, try to continue with next chunks
    }
  }
  
  return lastSentMessage;
}