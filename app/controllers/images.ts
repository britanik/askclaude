import axios from 'axios';
import { IUser } from '../interfaces/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';
import Image from '../models/images';
import { InlineKeyboardButton } from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Function to save image locally
async function saveImageLocally(imageBuffer: Buffer): Promise<string> {
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

export async function generateImage(prompt: string, user: IUser, bot: TelegramBot): Promise<void> {
  try {
    // Show "Processing" status
    await bot.sendChatAction(user.chatId, "upload_photo");
    
    // Send request to getimg.ai API
    const response = await axios.post(
      'https://api.getimg.ai/v1/essential/text-to-image',
      {
        style: 'photorealism',
        width: 1024,
        height: 1024,
        output_format: 'jpeg',
        response_format: 'url',
        prompt: prompt
      },
      {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': `Bearer ${process.env.GETIMG_API_KEY}`
        }
      }
    );
        
    // Extract image URL from response
    const imageUrl = response.data.url;
    
    // Download the image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    
    // Save image locally
    const localPath = await saveImageLocally(imageBuffer);
    console.log(`Image saved locally at: ${localPath}`);
    
    // Create "Retry" button
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Retry', callback_data: JSON.stringify({ a: 'imageRetry', id: '' }) }]
    ];
    
    // Send image to user
    const sentPhoto = await bot.sendPhoto(user.chatId, imageBuffer, {
      caption: `Generated image for prompt: "${prompt}"`,
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    
    // Store the image details including prompt in the database
    const telegramFileId = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;
    
    // Save to database
    const imageDoc = await new Image({
      user: user._id,
      prompt: prompt,
      imageUrl: imageUrl,
      telegramFileId: telegramFileId,
      localPath: localPath
    }).save();
    
    // Update the button data with the image document ID
    const updatedButtons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Retry', callback_data: JSON.stringify({ a: 'imageRetry', id: imageDoc._id }) }]
    ];
    
    // Update the message with the correct image ID in the button
    await bot.editMessageReplyMarkup(
      { inline_keyboard: updatedButtons },
      { 
        chat_id: user.chatId, 
        message_id: sentPhoto.message_id 
      }
    );
    
  } catch (error) {
    console.error('Error generating image:', error);
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
    
    // Log the regeneration attempt
    console.log(`Regenerating image with prompt: "${imageDoc.prompt}" for user ${user.username || user.chatId}`);
    
    // Regenerate using the same prompt
    await generateImage(imageDoc.prompt, user, bot);
    
  } catch (error) {
    console.error('Error regenerating image:', error);
    await sendMessage({
      text: 'Sorry, there was an error regenerating the image. Please try again later.',
      user,
      bot
    });
  }
}