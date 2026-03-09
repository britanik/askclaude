import axios from 'axios';
import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IUser } from '../interfaces/users';
import Image from '../models/images';
import Message from '../models/messages';
import { withChatAction } from '../helpers/chatAction';
import { sendMessage } from '../templates/sendMessage';
import { logLimitHit } from './tokens';
import { generateImageWithFallback, ImageGenerationResult, ImageTier } from '../services/image';
import { logApiError } from '../helpers/errorLogger';
import { IThread } from '../interfaces/threads';
import { IImage } from '../interfaces/image';
import { isPremium, isTester } from '../helpers/helpers';

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

export async function moderateContent(prompt: string): Promise<{flagged: boolean, categories: any, scores: any}> {
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
      scores: response.data.results[0].category_scores,
      categories: response.data.results[0].categories
    };
  } catch (error) {
    console.error('Error calling moderation API:', error);
    // Default to flagged: false when API call fails
    return {
      flagged: false,
      categories: {},
      scores: {}
    };
  }
}

export interface SendGeneratedImageParams {
  prompt: string;
  user?: IUser;
  bot: TelegramBot;
  result: ImageGenerationResult;
  tier: ImageTier;
  thread?: IThread;  // Optional: for assistant flow
}

export async function sendGeneratedImage(params: SendGeneratedImageParams): Promise<IImage> {
  const { prompt, user, bot, result, tier, thread } = params;
  const imageResponse = result.response;

  // Convert base64 to buffer
  const imageBuffer = Buffer.from(imageResponse.base64, 'base64');
  
  // Save image locally
  const localPath = await saveImageLocally(imageBuffer);
  console.log(`[Image] Saved locally at: ${localPath}`);

  // Create "Retry" button (with empty ID initially)
  // const buttons: InlineKeyboardButton[][] = [
  //   [{ text: '🔄 Повторить', callback_data: JSON.stringify({ a: 'imageRetry', id: '' }) }]
  // ];

  // Send image to user
  // const sentPhoto = await bot.sendPhoto(user.chatId, imageBuffer, { reply_markup: { inline_keyboard: buttons } });
  const sentPhoto = await bot.sendPhoto(user.chatId, imageBuffer);

  // Get telegram file ID
  const telegramFileId = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;

  // Save to database with tier
  const savedImage:IImage = await new Image({
    prompt: prompt,
    user,
    telegramFileId: telegramFileId,
    localPath: localPath,
    provider: imageResponse.provider,
    tier: tier,
    multiTurnData: imageResponse.multiTurnData,
  }).save();

  // Save image as a Message
  await new Message({
    thread: thread._id,
    role: 'assistant',
    images: [ savedImage ],
    telegramMessageId: sentPhoto.message_id
  }).save();

  // Update button with image ID
  // const updatedButtons: InlineKeyboardButton[][] = [
    // [{ text: '🔄 Повторить', callback_data: JSON.stringify({ a: 'imageRetry', id: savedImage._id }) }]
  // ];

  // await bot.editMessageReplyMarkup(
  //   { inline_keyboard: updatedButtons },
  //   { chat_id: user.chatId, message_id: sentPhoto.message_id }
  // );

  return savedImage;
}

export async function getStoredImage(imageId: string): Promise<{ buffer?: Buffer, telegramFileId?: string, error?: string }> {
  try {
    // Find the image document
    const imageDoc = await Image.findById(imageId);
    
    if (!imageDoc) {
      return { error: 'Изображение не найдено' };
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
    
    return { error: 'Источник изображения недоступен' };
  } catch (error) {
    console.error('Error retrieving stored image:', error);
    return { error: 'Не удалось загрузить изображение' };
  }
}

export async function regenerateImage(imageId: string, user: IUser, bot: TelegramBot): Promise<void> {
  try {
    // Find the image document
    const image:IImage = await Image.findById(imageId).populate('thread');
    
    if (!image) {
      await sendMessage({
        text: 'Не удалось найти изображение для повторной генерации. Пожалуйста, создайте новое изображение.',
        user,
        bot
      });
      return;
    }
    
    // Make sure this user owns the image
    if (image.user.toString() !== user._id.toString()) {
      await sendMessage({
        text: 'У вас нет прав для повторной генерации этого изображения.',
        user,
        bot
      });
      return;
    }
    
    // Check limits and get current tier
    if (await isImageLimit(user)) {
      await sendMessage({
        text: 'Достигнут дневной лимит генерации изображений. Попробуйте завтра.',
        user,
        bot
      });
      return;
    }
    
    const tier = await getCurrentTier(user);
    
    console.log(`Regenerating image with prompt: "${image.prompt}" for user ${user.username || user.chatId}, tier: ${tier}`);
    
    // Generate new image with fallback support
    const result = await withChatAction(
      bot,
      user.chatId,
      'upload_photo',
      async () => {
        const genResult = await generateImageWithFallback({ prompt: image.prompt, tier });
        
        if (genResult.usedFallback) {
          await sendMessage({
            text: '⏳ Основная модель перегружена. Переключаюсь на резервную...',
            user,
            bot
          });
        }
        
        return genResult;
      }
    );

    // Use actual tier (may have fallen back from top to normal)
    const actualTier = result.actualTier || tier;

    // Send image and save to DB (reuse helper)
    const savedImage = await sendGeneratedImage({ 
      prompt: image.prompt, 
      user, 
      bot, 
      result,
      tier: actualTier,
      thread: await getImageThread(image)
    });
    
  } catch (error) {
    console.error('Error regenerating image:', error);
    await logApiError('image', error, 'Image regeneration failed');
    await sendMessage({
      text: 'Произошла ошибка при повторной генерации изображения. Пожалуйста, попробуйте позже.',
      user,
      bot
    });
  }
}

export async function getTopTierLimit(user: IUser): Promise<number> {
  if (isTester(user)) {
    return +(process.env.IMAGE_LIMIT_DAILY_TOP_TESTER || process.env.IMAGE_LIMIT_DAILY_TOP || 5);
  }
  return await isPremium(user)
    ? +(process.env.IMAGE_LIMIT_DAILY_TOP_PREMIUM || process.env.IMAGE_LIMIT_DAILY_TOP || 5)
    : +(process.env.IMAGE_LIMIT_DAILY_TOP || 5);
}

export async function getTopTierUsage(user: IUser): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  return await Image.countDocuments({
    user: user._id,
    tier: 'top',
    created: { $gte: startOfDay }
  });
}

export async function getCurrentTier(user: IUser): Promise<ImageTier> {
  const topUsage = await getTopTierUsage(user);
  const topLimit = await getTopTierLimit(user);
  
  if (topUsage >= topLimit) {
    return 'normal';
  }
  
  return 'top';
}

export async function isImageLimit(user: IUser): Promise<boolean> {
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

export async function getPeriodImageUsage(user: IUser): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  return await Image.countDocuments({
    user: user._id,
    created: { $gte: startOfDay }
  });
}

export async function getPeriodImageLimit(user: IUser): Promise<number> {
  if (isTester(user)) {
    return +(process.env.IMAGE_LIMIT_DAILY_TOTAL_TESTER || process.env.IMAGE_LIMIT_DAILY_TOTAL || 15);
  }
  return await isPremium(user)
    ? +(process.env.IMAGE_LIMIT_DAILY_TOTAL_PREMIUM || process.env.IMAGE_LIMIT_DAILY_TOTAL || 15)
    : +(process.env.IMAGE_LIMIT_DAILY_TOTAL || 15);
}

export async function getImageThread(image: IImage): Promise<IThread | null> {
  const message = await Message.findOne({ images: image._id }).populate('thread');
  return message?.thread as IThread || null;
}