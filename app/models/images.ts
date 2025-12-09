import * as mongoose from 'mongoose'
import moment from 'moment'

const Schema = mongoose.Schema

const ImageSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  prompt: { type: String, required: true },
  created: { type: Date, default: () => moment().utc() },
  imageUrl: { type: String },
  telegramFileId: { type: String },
  localPath: { type: String },
  provider: { type: String, enum: ['openai', 'getimg', 'gemini', 'unknown'], default: 'unknown' },
  openaiResponseId: { type: String }, // For multi-turn image editing (OpenAI Responses API)
  threadId: { type: Schema.Types.ObjectId, ref: 'Thread' } // Link to conversation thread (for image assistant)
})

// Add indexes for faster queries
ImageSchema.index({ user: 1, created: -1 })
ImageSchema.index({ threadId: 1 })

export default mongoose.model('Image', ImageSchema)