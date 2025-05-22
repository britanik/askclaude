// app/helpers/chatAction.ts
import TelegramBot from 'node-telegram-bot-api';

// Use the actual ChatAction type from the library
type ChatAction = 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'find_location' | 'record_video_note' | 'upload_video_note';

export class ChatActionManager {
  private isActive: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private bot: TelegramBot,
    private chatId: number,
    private action: ChatAction = 'typing'
  ) {}

  /**
   * Start sending chat action repeatedly
   */
  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Send initial action immediately
    this.sendAction();
    
    // Repeat every 4 seconds (Telegram chat actions last ~5 seconds)
    this.intervalId = setInterval(() => {
      if (this.isActive) {
        this.sendAction();
      }
    }, 4000);
  }

  /**
   * Stop sending chat action
   */
  stop(): void {
    this.isActive = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Send the chat action once
   */
  private sendAction(): void {
    this.bot.sendChatAction(this.chatId, this.action).catch(err => {
      console.error("Error sending chat action:", err);
    });
  }
}

/**
 * Convenience function to create and manage a chat action for an async operation
 */
export async function withChatAction<T>(
  bot: TelegramBot,
  chatId: number,
  action: ChatAction,
  asyncOperation: () => Promise<T>
): Promise<T> {
  const manager = new ChatActionManager(bot, chatId, action);
  
  try {
    manager.start();
    const result = await asyncOperation();
    return result;
  } finally {
    manager.stop();
  }
}