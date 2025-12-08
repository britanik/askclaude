import axios from 'axios';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IUser } from '../interfaces/users';
import Image from '../models/images';
import { withChatAction } from '../helpers/chatAction';
import { sendMessage } from '../templates/sendMessage';
import { logLimitHit } from './tokens';
import { generateImage as generateImageService, generateImageWithProvider } from '../services/imagegen';
import { logApiError } from '../helpers/errorLogger';

// Function to save image locally
export async function saveImageLocally(imageBuffer: Buffer): Promise<string> {
  // Create images directory if it doesn't exist
  const imagesDir = path.join(__dirname, '../images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  // Generate a unique filename
  const filename = `${Date.now()}_${uuidv4()}.jpg`;
  const filepath = path.join(imagesDir, filename);
  
  // Write the file
  return new Promise((resolve, reject) => {
    fs.writeFile(filepath, imageBuffer, (err) => {
      if (err) reject(err);
      else resolve(filepath);
    });
  });
}

// Function to check content with OpenAI Moderation API
export async function moderateContent(prompt: string): Promise<{flagged: boolean, categories: any}> {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/moderations',
      {
        input: prompt
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    // Return the moderation result
    return {
      flagged: response.data.results[0].flagged,
      categories: response.data.results[0].categories
    };
  } catch (error) {
    console.error('Error calling moderation API:', error);
    // Default to flagged: false when API call fails
    return {
      flagged: false,
      categories: {}
    };
  }
}

/**
 * Main image generation function for /image command
 * Uses the new imagegen service abstraction
 */
export async function generateImage(prompt: string, user: IUser, bot: TelegramBot): Promise<void> {
  try {
    // Check image limit
    const imageUsage = await getPeriodImageUsage(user);
    const imageLimit = await getPeriodImageLimit(user);
    
    if (imageUsage >= imageLimit) {
      await logLimitHit(user, 'daily_image', imageUsage, imageLimit);
      await sendMessage({
        text: `⚠️ Вы достигли лимита генерации изображений (${imageUsage}/${imageLimit} в день). Попробуйте завтра.`,
        user,
        bot
      });
      return;
    }

    // Generate image using the service (handles moderation internally)
    const imageResponse = await withChatAction(
      bot,
      user.chatId,
      'upload_photo',
      () => generateImageService({ prompt })
    );

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageResponse.base64, 'base64');
    
    // Save image locally
    const localPath = await saveImageLocally(imageBuffer);
    console.log(`Image saved locally at: ${localPath}`);

    // Create "Retry" button
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: '' }) }]
    ];

    // Send image to user
    const sentPhoto = await bot.sendPhoto(user.chatId, imageBuffer, {
      caption: `🎨 ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}`,
      reply_markup: { inline_keyboard: buttons }
    });

    // Get telegram file ID
    const telegramFileId = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;

    // Save to database
    const imageDoc = await new Image({
      user: user._id,
      prompt: prompt,
      imageUrl: imageResponse.originalUrl,
      telegramFileId: telegramFileId,
      localPath: localPath,
      provider: imageResponse.provider,
      openaiResponseId: imageResponse.responseId
    }).save();

    // Update button with image ID
    const updatedButtons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: imageDoc._id }) }]
    ];

    await bot.editMessageReplyMarkup(
      { inline_keyboard: updatedButtons },
      { chat_id: user.chatId, message_id: sentPhoto.message_id }
    );

  } catch (error) {
    console.error('Error in generateImage:', error);
    await logApiError('imagegen', error, 'Image generation failed');
    await sendMessage({ 
      text: 'Sorry, there was an error generating the image. Please try again later.', 
      user, 
      bot 
    });
  }
}

// Function to get an image either from local storage or by Telegram file ID
export async function getStoredImage(imageId: string): Promise<{ buffer?: Buffer, telegramFileId?: string, error?: string }> {
  try {
    // Find the image document
    const imageDoc = await Image.findById(imageId);
    
    if (!imageDoc) {
      return { error: 'Image not found' };
    }
    
    // Try to get the image from local storage first
    if (imageDoc.localPath && fs.existsSync(imageDoc.localPath)) {
      const buffer = fs.readFileSync(imageDoc.localPath);
      return { buffer };
    }
    
    // If local file doesn't exist but we have a Telegram file ID
    if (imageDoc.telegramFileId) {
      return { telegramFileId: imageDoc.telegramFileId };
    }
    
    // If we only have the URL, download it again
    if (imageDoc.imageUrl) {
      const response = await axios.get(imageDoc.imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');
      
      // Save it locally for future use
      const localPath = await saveImageLocally(buffer);
      
      // Update the document with the local path
      imageDoc.localPath = localPath;
      await imageDoc.save();
      
      return { buffer };
    }
    
    return { error: 'No image source available' };
  } catch (error) {
    console.error('Error retrieving stored image:', error);
    return { error: 'Failed to retrieve image' };
  }
}

/**
 * Regenerate image using the stored prompt
 * Supports multi-turn by passing previousResponseId
 */
export async function regenerateImage(imageId: string, user: IUser, bot: TelegramBot): Promise<void> {
  try {
    // Find the image document
    const imageDoc = await Image.findById(imageId);
    
    if (!imageDoc) {
      await sendMessage({
        text: 'Sorry, could not find the image to regenerate. Please try a new image generation.',
        user,
        bot
      });
      return;
    }
    
    // Make sure this user owns the image
    if (imageDoc.user.toString() !== user._id.toString()) {
      await sendMessage({
        text: 'Sorry, you do not have permission to regenerate this image.',
        user,
        bot
      });
      return;
    }
    
    console.log(`Regenerating image with prompt: "${imageDoc.prompt}" for user ${user.username || user.chatId}`);
    
    // Generate new image using the service
    // Note: We don't pass previousResponseId here because "Retry" means fresh generation
    // For multi-turn editing, use the image assistant flow
    const imageResponse = await withChatAction(
      bot,
      user.chatId,
      'upload_photo',
      () => generateImageService({ prompt: imageDoc.prompt })
    );

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageResponse.base64, 'base64');
    
    // Save image locally
    const localPath = await saveImageLocally(imageBuffer);

    // Create buttons
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: '' }) }]
    ];

    // Send image to user
    const sentPhoto = await bot.sendPhoto(user.chatId, imageBuffer, {
      caption: `🎨 ${imageDoc.prompt.slice(0, 200)}${imageDoc.prompt.length > 200 ? '...' : ''}`,
      reply_markup: { inline_keyboard: buttons }
    });

    // Get telegram file ID
    const telegramFileId = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;

    // Save new image to database
    const newImageDoc = await new Image({
      user: user._id,
      prompt: imageDoc.prompt,
      imageUrl: imageResponse.originalUrl,
      telegramFileId: telegramFileId,
      localPath: localPath,
      provider: imageResponse.provider,
      openaiResponseId: imageResponse.responseId
    }).save();

    // Update button with new image ID
    const updatedButtons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: newImageDoc._id }) }]
    ];

    await bot.editMessageReplyMarkup(
      { inline_keyboard: updatedButtons },
      { chat_id: user.chatId, message_id: sentPhoto.message_id }
    );
    
  } catch (error) {
    console.error('Error regenerating image:', error);
    await logApiError('imagegen', error, 'Image regeneration failed');
    await sendMessage({
      text: 'Sorry, there was an error regenerating the image. Please try again later.',
      user,
      bot
    });
  }
}

export async function isImageLimit(user: IUser) {
  try {
    const usage: number = await getPeriodImageUsage(user);
    const periodLimit: number = await getPeriodImageLimit(user);
        
    if (usage >= periodLimit) {
      await logLimitHit(user, 'daily_image', usage, periodLimit);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking token limit:', error);
    return false;
  }
}

// Keep these functions - they should be imported from tokens.ts or defined elsewhere
// Adding stubs here if they're defined in this file
export async function getPeriodImageUsage(user: IUser): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  return await Image.countDocuments({
    user: user._id,
    created: { $gte: startOfDay }
  });
}

export async function getPeriodImageLimit(user: IUser): Promise<number> {
  // Return from env or default
  return +(process.env.DAILY_IMAGE_LIMIT || 10);
}