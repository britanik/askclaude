import axios from 'axios';
import { IUser } from '../interfaces/users';
import { sendMessage } from '../templates/sendMessage';
import TelegramBot from 'node-telegram-bot-api';

export async function generateImage(user: IUser, bot: TelegramBot): Promise<void> {
  try {
    // Show "Processing" status
    await bot.sendChatAction(user.chatId, "upload_photo");
    
    // Hardcoded prompt for MVP
    const prompt = 'Nature landscape with mountains and a river';
    
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
    
    console.log(response.data, 'response.data');
    
    // Extract image URL from response
    const imageUrl = response.data.url;
    
    // Download the image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    
    // Send image to user
    await bot.sendPhoto(user.chatId, imageBuffer, {
      caption: `Generated image for prompt"`
    });
    
  } catch (error) {
    console.error('Error generating image:', error);
    await sendMessage({
      text: 'Sorry, there was an error generating the image. Please try again later.',
      user,
      bot
    });
  }
}