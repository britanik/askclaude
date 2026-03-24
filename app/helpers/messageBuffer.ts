/**
 * Message Buffer - объединяет разбитые Telegram сообщения в одно.
 *
 * Когда пользователь отправляет длинный текст, Telegram разбивает его на несколько.
 * Также объединяет фото + последующий текст (вопрос к картинке) в один запрос.
 * Буфер собирает все части с дебаунсом и отдаёт объединённый результат.
 *
 * Также поддерживает "abort" — если новое сообщение приходит во время API-запроса,
 * текущий запрос помечается как aborted (ответ не отправляется пользователю, но usage логируется).
 */

export interface BufferResult {
  text: string
  images: string[]
}

interface BufferEntry {
  texts: string[]
  images: string[]
  timer: ReturnType<typeof setTimeout> | null
  resolve: ((result: BufferResult) => void) | null
  processing: boolean  // API-запрос отправлен
  aborted: boolean     // запрос помечен как отменённый
}

const buffers = new Map<number, BufferEntry>()

const DEBOUNCE_MS = +(process.env.MESSAGE_BUFFER_DELAY_MS || 700)

/**
 * Добавить сообщение в буфер.
 * Первое сообщение возвращает Promise<string> (объединённый текст после дебаунса).
 * Последующие возвращают null — вызывающий код должен сделать return.
 */
export function bufferMessage(chatId: number, text: string, images: string[] = []): Promise<BufferResult> | null {
  const existing = buffers.get(chatId)

  if (existing && !existing.processing) {
    // Ещё не обрабатывается — добавляем текст/картинки и сбрасываем таймер
    if (text) existing.texts.push(text)
    existing.images.push(...images)

    if (existing.timer) {
      clearTimeout(existing.timer)
    }
    existing.timer = setTimeout(() => flushBuffer(chatId), DEBOUNCE_MS)

    // Follower-сообщение — вызывающий код делает return
    return null
  }

  // Первое сообщение или новое сообщение после abort (processing=true)
  return new Promise<BufferResult>((resolve) => {
    const entry: BufferEntry = {
      texts: text ? [text] : [],
      images: [...images],
      timer: setTimeout(() => flushBuffer(chatId), DEBOUNCE_MS),
      resolve,
      processing: false,
      aborted: false,
    }
    buffers.set(chatId, entry)
  })
}

function flushBuffer(chatId: number) {
  const entry = buffers.get(chatId)
  if (!entry) return

  const result: BufferResult = {
    text: entry.texts.join('\n'),
    images: entry.images,
  }
  entry.timer = null

  if (entry.resolve) {
    entry.resolve(result)
    entry.resolve = null
  }
}

/**
 * Если есть активный API-запрос для пользователя — пометить как aborted.
 * Возвращает true если был abort.
 */
export function abortIfSequence(chatId: number): boolean {
  const entry = buffers.get(chatId)
  if (entry && entry.processing) {
    entry.aborted = true
    console.log(`[Buffer] Aborted sequence for chatId ${chatId}`)
    return true
  }
  return false
}

/**
 * Проверить, помечен ли текущий запрос как aborted.
 */
export function isAborted(chatId: number): boolean {
  const entry = buffers.get(chatId)
  return entry?.aborted || false
}

/**
 * Отметить что API-запрос отправлен.
 */
export function markProcessing(chatId: number): void {
  const entry = buffers.get(chatId)
  if (entry) {
    entry.processing = true
  }
}

/**
 * Очистка буфера после завершения цикла.
 */
export function clearBuffer(chatId: number): void {
  const entry = buffers.get(chatId)
  if (entry) {
    if (entry.timer) clearTimeout(entry.timer)
    buffers.delete(chatId)
  }
}
