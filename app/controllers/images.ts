import axios from 'axios';
import { IUser } from '../interfaces/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';
import Image from '../models/images';
import { InlineKeyboardButton } from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ImageProvider } from '../interfaces/image';

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

// Common function to handle image generation process
export async function handleImageGeneration(
  prompt: string, 
  user: IUser, 
  bot: TelegramBot, 
  generationFunction: (prompt: string) => Promise<Buffer | string>,
  provider: ImageProvider
): Promise<void> {
  // Create a flag to track when to stop sending typing status
  let isGenerating = true;
  
  // Start a "typing" indicator that repeats every 4 seconds
  const typingInterval = setInterval(() => {
    if (isGenerating) {
      bot.sendChatAction(user.chatId, "upload_photo").catch(err => {
        console.error("Error sending chat action:", err);
      });
    } else {
      clearInterval(typingInterval);
    }
  }, 4000); // Refresh every 4 seconds
  
  // Send initial typing status immediately
  await bot.sendChatAction(user.chatId, "upload_photo");
  
  try {
    // Generate the image using the provided generation function
    const imageResult = await generationFunction(prompt);
    
    // Stop the typing status
    isGenerating = false;
    clearInterval(typingInterval);
    
    let imageBuffer: Buffer;
    let imageUrl: string | null = null;
    
    // Check if the result is a Buffer or a URL string
    if (typeof imageResult === 'string') {
      // It's a URL, download the image
      imageUrl = imageResult;
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(imageResponse.data, 'binary');
    } else {
      // It's already a Buffer
      imageBuffer = imageResult;
    }
    
    // Save image locally
    const localPath = await saveImageLocally(imageBuffer);
    console.log(`Image saved locally at: ${localPath}`);
    
    // Create "Retry" button
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: '' }) }]
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
    
    // Save to database with provider information
    const imageDoc = await new Image({
      user: user._id,
      prompt: prompt,
      imageUrl: imageUrl,
      telegramFileId: telegramFileId,
      localPath: localPath,
      provider: provider
    }).save();
    
    // Update the button data with the image document ID
    const updatedButtons: InlineKeyboardButton[][] = [
      [{ text: '🔄 Заново', callback_data: JSON.stringify({ a: 'imageRetry', id: imageDoc._id }) }]
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
    // Stop the typing status if there's an error
    isGenerating = false;
    clearInterval(typingInterval);
    
    // console.error('Error generating image:', error);
    await sendMessage({
      text: 'Sorry, there was an error generating the image. Please try again later.',
      user,
      bot
    });
  }
}

// OpenAI image generation function
export async function generateOpenAIImage(prompt: string, user: IUser, bot: TelegramBot): Promise<void> {
  console.log('generateOpenAIImage')
  const generateImage = async (prompt: string): Promise<string> => {
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: "dall-e-3",
        style: 'vivid', // vivid or natural
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        timeout: 120000
      }
    );
    
    // Extract image URL from response
    return response.data.data[0].url;
  };
  
  await handleImageGeneration(prompt, user, bot, generateImage, 'openai');
}

// GetImg image generation function
export async function generateGetImgImage(prompt: string, user: IUser, bot: TelegramBot): Promise<void> {
  console.log('generateGetImgImage')
  const generateImage = async (prompt: string): Promise<string> => {
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
    return response.data.url;
  };
  
  await handleImageGeneration(prompt, user, bot, generateImage, 'getimg');
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
    console.log(`Regenerating image with prompt: "${imageDoc.prompt}" for user ${user.username || user.chatId}, using provider: ${imageDoc.provider}`);
    
    // Use the stored provider to determine which API to use
    switch (imageDoc.provider) {
      case 'openai':
        await generateOpenAIImage(imageDoc.prompt, user, bot);
        break;
      case 'getimg':
        await generateGetImgImage(imageDoc.prompt, user, bot);
        break;
      default:
        // If provider is unknown (for backward compatibility)
        // Default to OpenAI
        console.log(`Provider unknown for image ${imageId}, defaulting to OpenAI`);
        await generateOpenAIImage(imageDoc.prompt, user, bot);
    }
    
  } catch (error) {
    console.error('Error regenerating image:', error);
    await sendMessage({
      text: 'Sorry, there was an error regenerating the image. Please try again later.',
      user,
      bot
    });
  }
}