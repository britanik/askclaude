import { Document, Types } from "mongoose"
import { IUser } from "./users"

export type ImageProvider = 'openai' | 'getimg' | 'gemini' | 'unknown';

// Provider-specific multi-turn data types
export interface OpenAIMultiTurnData {
  responseId: string;
}

export interface GeminiMultiTurnData {
  conversationHistory: any[]; // Gemini Content[] type
}

export type MultiTurnData = OpenAIMultiTurnData | GeminiMultiTurnData;

export interface IImage extends Document {
  user: IUser | Types.ObjectId
  prompt: string
  created: Date
  imageUrl?: string
  telegramFileId?: string
  localPath?: string
  provider: ImageProvider
  multiTurnData?: MultiTurnData // Provider-specific data for multi-turn editing
  threadId?: Types.ObjectId // Link to conversation thread
}