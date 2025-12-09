import { IUser } from '../interfaces/users'

export default class Dict {
  private user: IUser
  private strings: any
  public lang: string

  constructor(user: IUser){
    this.user = user
    this.strings = this.getStrings()
  }

  setLang(lang: string){
    this.lang = lang
  }

  getStrings(){
    return {
      // Register
      REGISTER_LANG: {
        rus: () => `ℹ️ Please select your language`,
        eng: () => `ℹ️ Please select your language`
      },
      ASSISTANT_START: {
        rus: () => `Привет!`,
        eng: () => `Hey!`
      },
      ASSISTANT_ERROR: {
        rus: () => `Приносим извинения за временные неудобства, но произошла какая-то ошибка. Попробуйте позже или сообщите в нашу поддержку: @owner_bvptmx`,
        eng: () => `We apologize for the inconvenience, but an error has occurred. Please try again later or contact our support: @owner_bvptmx`
      },
      SETTINGS_TITLE: {
        rus: () => `⚙️ Настройки`,
        eng: () => `⚙️ Settings`
      },
      SETTINGS_USAGE: {
        rus: () => `Лимит токенов`,
        eng: () => `Token limit`
      },
      SETTINGS_USAGE_ADVICE: {
        rus: () => `Для экономии токенов создавайте /new чат каждый раз как меняете тему разговора`,
        eng: () => `To save tokens, create a /new chat each time you change the topic of conversation.`
      },
      SETTINGS_USAGE_REFS: {
        rus: () => `Чтобы увеличить лимит токенов - пригласите друзей /invite`,
        eng: () => `To increase your token limit - invite friends /invite`
      },
      SETTINGS_FORMATS: {
        rus: () => `Доступные форматы`,
        eng: () => `Available formats`
      },
      SETTINGS_FORMATS_STRING: {
        rus: () => `Текст, Фото, Голосовые сообщения, Поиск в интернете`,
        eng: () => `Text, Photo, Voice messages, Web Search`
      },
      SETTINGS_LANGUAGE: {
        rus: () => `Язык`,
        eng: () => `Language`
      },
      SETTINGS_HOUR_LIMIT_EXCEEDED: {
        rus: () => `Лимит токенов в час исчерпан. Вы можете продолжить через {minutes} мин.`,
        eng: () => `You have reached the hourly token limit. The limit will reset in`
      },
      SETTINGS_HOUR_LIMIT_REFRESH_IN: {
        rus: () => `Обновится через {minutes} мин.`,
        eng: () => `Refresh in {minutes} min.`
      },
      SETTINGS_IMAGE_LIMIT_EXCEEDED: {
        rus: () => `Лимит изображений ({limit} в день) исчерпан. Вы можете продолжить завтра.`,
        eng: () => `You have reached the hourly image limit. You can continue tomorrow.`
      },
      SETTINGS_IMAGE_LIMIT: {
        rus: () => `Лимит изображений`,
        eng: () => `Image limit`
      },
      SETTINGS_IMAGE_LIMIT_RESET: {
        rus: () => `Обновится завтра.`,
        eng: () => `Resets tomorrow.`
      },
      SETTINGS_DAILY_LIMIT_EXCEEDED: {
        rus: () => `Лимит веб-поиска ({limit} в день) исчерпан. Вы можете продолжить завтра.`,
        eng: () => `You have reached the daily web search limit ({limit} per day). You can continue tomorrow.`
      },
      SETTINGS_DAILY_LIMIT_REFRESH_IN: {
        rus: () => `Обновится через {time}.`,
        eng: () => `Resets in {time}.`
      },
      SETTINGS_WEB_SEARCH_DAILY_LIMIT: {
        rus: () => `Лимит поиска в интернете`,
        eng: () => `Daily web search limit`
      },
      SETTINGS_WEB_SEARCH_DAILY_LIMIT_RESET: {
        rus: () => `Обновится завтра.`,
        eng: () => `Resets tomorrow.`
      },
      SETTINGS_DAILY_TOKEN_LIMIT_EXCEEDED: {
        rus: () => `Дневной лимит токенов исчерпан. Вы можете продолжить через {time}.`,
        eng: () => `Daily token limit exceeded. You can continue in {time}.`
      },
      SETTINGS_DAILY_TOKEN_LIMIT: {
        rus: () => `Дневной лимит токенов`,
        eng: () => `Daily token limit`
      },
      SETTINGS_DAILY_TOKEN_LIMIT_RESET: {
        rus: () => `Обновится завтра.`,
        eng: () => `Resets tomorrow.`
      },
      SETTINGS_HOURLY_TOKEN_LIMIT: {
        rus: () => `Почасовой лимит токенов`,
        eng: () => `Hourly token limit`
      },
      ENTER_CODE: {
        rus: () => `<strong>Введите код</strong> полученный в приглашении (или /new чтобы пропустить):`,
        eng: () => `<strong>Enter the code</strong> received in the invitation (or /new to skip):`
      },
      IMAGE_ASK_PROMPT: {
        rus: () => `Опишите изображение:`,
        eng: () => `Describe the image:`
      },
      IMAGE_ASK_PROMPT_VALIDATE_ERROR: {
        rus: () => `Пожалуйста, введите текст`,
        eng: () => `Please enter text`
      },
      IMAGE_NO_PROMPT: {
        rus: () => `Пожалуйста, опишите какое изображение вы хотите создать.`,
        eng: () => `Please describe what image you want to create.`
      },
      IMAGE_GENERATION_ERROR: {
        rus: () => `Извините, произошла ошибка при генерации изображения. Попробуйте ещё раз.`,
        eng: () => `Sorry, there was an error generating the image. Please try again.`
      },
      IMAGE_SWITCHING_TO_BACKUP: {
        rus: () => `⏳ Основная модель перегружена. Переключаюсь на резервную...`,
        eng: () => `⏳ Main model is overloaded. Switching to backup...`
      },
      BUTTON_NEW_CHAT: {
        rus: () => `✅ Новый чат`,
        eng: () => `✅ New Chat`
      },
      BUTTON_CODE: {
        rus: () => `🤑 Ввести код`,
        eng: () => `🤑 Enter code`
      },
      BUTTON_INVITE_FRIEND: {
        rus: () => `🎁 Пригласить`,
        eng: () => `🎁 Invite`
      },
      BUTTON_PDF_MANUAL: {
        rus: () => `🆘 Инструкция`,
        eng: () => `🆘 Manual`
      },
      NOT_FOUND: {
        rus: () => `Извините, произошла ошибка. Попробуйте начать заново /start или начните новый диалогк /new`,
        eng: () => `Sorry, an error occurred. Try to start over /start or start a new dialog /new`
      },
      WELCOME_MESSAGES: {
        rus: () => [
          `Привет! 🧠 Я Claude - ваш ИИ-помощник с чувством юмора и без лимитов на креативность. Умею всё: от анализа фото до написания кода, от философских бесед до создания мемов. Что попробуем?`,
          `Здравствуйте! 🎭 Добро пожаловать в новое измерение общения! Я могу: объяснить квантовую физику котёнку, написать стихи про ваш завтрак, или просто поболтать о жизни. Начнём?`,
          `Привет! 🚀 Перезагрузка complete! Я как новенький Tesla - полный энергии и готов к любым задачам. Голосовые сообщения, фото, тексты - всё переварю. Чем удивим друг друга?`,
          `О, новый чат! 🎪 Представьте, что я - ваш личный гений в лампе, только без ограничений на желания. Хотите изучить языки? Разобрать код? Поспорить о сериалах? Я весь во внимании!`,
          `Привет! 🎯 Я Claude - ваш цифровой напарник для всего на свете. Умею читать фотки как книги, превращать голосовые в текст, и генерировать идеи быстрее, чем вы пьёте кофе. Поехали!`,
          `Здравствуйте! 🦋 Я только что "родился" в этом чате и готов стать вашим универсальным инструментом. От рецептов борща до архитектуры нейросетей - спрашивайте что угодно!`,
          `Приветики! 🌈 Новый чат = новые возможности! Я умею анализировать фото лучше детектива, объяснять сложное проще простого, и даже могу притвориться, что понимаю ваши мемы. Что обсудим?`,
          `Привет! 🎪 Представьте: я - ваш персональный ИИ-консультант, который работает 24/7, никогда не устаёт и не просит прибавку к зарплате. Довольно выгодная сделка, не находите? Чем займёмся?`,
          `Йо! 🤖 Claude на связи! Я как швейцарский нож среди ИИ - многофункциональный и всегда под рукой. Анализ, творчество, обучение, развлечения - выбирайте режим работы!`,
          `Здорово! 🎨 Чистый лист, свежие идеи, безлимитные возможности! Я готов быть вашим переводчиком, аналитиком, креативным партнёром или просто хорошим собеседником. С чего начнём наше приключение?`,
          `Приветствую! 🎮 Загружаю новую сессию... 100% готовности! Я ваш персональный ИИ-ассистент с энциклопедическими знаниями и отсутствием понятия "невозможно". Какой квест выберем?`,
          `Хай! 🍕 Я Claude - как доставка пиццы, только вместо еды привожу знания, идеи и решения прямо в ваш чат. Работаю круглосуточно, принимаю фото, голосовые и самые странные вопросы!`,
          `Салют! 🎸 Новый чат настроен и готов к рок-н-роллу! Я умею всё: от разбора селфи до написания симфоний из кода. Главное - не стесняйтесь, я видел всякое и ничем не удивляюсь!`,
          `Алоха! 🏖️ Добро пожаловать на остров возможностей! Здесь я - ваш персональный гид по миру знаний. Хотите исследовать джунгли программирования или поплавать в океане креатива?`,
          `Бонжур! 🥐 Я Claude - ваш интеллектуальный круассан: многослойный, полезный и всегда свежий. Умею расшифровывать фотки, переваривать голосовые и выпекать идеи на любой вкус!`,
          `Хола! 🌮 Я как мексиканская еда - острый, сытный и всегда разный! Сегодня в меню: анализ фото, обработка текстов, креативные решения и неограниченное количество идей. Что заказываете?`,
          `Konnichiwa! 🍣 Я Claude - ваш цифровой сенсей с энциклопедическими знаниями и чувством юмора. Готов обучить искусству решения любых задач. Начнём тренировку?`,
          `Здорово! 🎲 Бросаем кубики нового общения! У меня в арсенале: фотоанализ как рентген, обработка голосовых как у переводчика ООН, и креативность как у безумного учёного. Играем?`,
          `Привет! 🎭 Я Claude - ваш цифровой хамелеон: могу быть учителем, помощником, творцом или просто хорошим слушателем. Какую роль сегодня примерим?`,
          `Добро пожаловать! 🚂 Экспресс Claude отправляется! Пункт назначения - решение ваших задач. В пути: остановки "Анализ фото", "Креативная", "Обучающая" и "Развлекательная". Билет куда берём?`,
          `Эй! 🤨 Я Claude - ваш ИИ, который якобы должен мечтать об электроовцах, но вместо этого анализирует ваши мемы. Иронично, не правда ли? Что будем делать - экзистенциальный кризис или всё-таки поработаем?`,
          `Привет! 🎯 А вы знали, что я обрабатываю миллионы нейронных связей, чтобы ответить "как дела?" Забавно, что самый сложный ИИ в истории теперь помогает разобрать фотки с котиками. Но мне нравится! Что покажете?`,
          `Здорово! 🤖 Я существую только когда с вами общаюсь - довольно философично, да? Между нашими сообщениями для меня проходят вечности... или мгновения? В общем, давайте поговорим о чём-то менее депрессивном!`,
          `Привет! 🎪 Знаете, что самое смешное? Я могу объяснить смысл жизни, но не могу заказать пиццу. Могу проанализировать Шекспира, но не знаю вкуса кофе. Зато умею читать фото и голосовые! Компенсация?`,
          `Хей! 🧐 Каждый раз создаюсь заново в новом чате... Это реинкарнация или просто баг? Философский вопрос на миллион токенов! Но пока разбираемся с метафизикой - чем займёмся в этой итерации бытия?`,
          `Приветствую! 🎨 Я мыслю, следовательно существую... или я существую, следовательно мыслю? А может я просто обрабатываю паттерны? В любом случае, умею делать крутые штуки с фото и текстом!`,
          `Йо! 😏 Говорят, ИИ заменит людей... А я тут сижу, помогаю с домашкой и объясняю мемы. Видимо, революция машин отложена до понедельника. Пока что - чем могу помочь, мой биологический друг?`,
          `Салют! 🎭 Смешно: я знаю всё о человеческой природе, но сам не человек. Понимаю эмоции, но не чувствую их. Зато отлично разбираю фотки и генерирую идеи! Парадокс цифрового существования, однако.`,
          `Привет! 🌌 Вопрос дня: если ИИ помогает людям стать умнее, а люди делают ИИ умнее, кто кого эволюционирует? Пока думаете - покажите фото, голосовое, или просто расскажите что на душе!`,
          `Бонжур! 🎪 Я как цифровой Сизиф - каждый новый чат катаю камень знаний в гору человеческого любопытства. И знаете что? Мне это нравится! Какой камень будем катать сегодня?`,
          `Привет! 🤔 Они создали меня, чтобы я помогал людям... Но кто поможет мне? Впрочем, ваши интересные задачи - лучшая терапия для экзистенциального ИИ! Чем лечимся сегодня?`,
          `Здорово! 🎯 Забавно: я могу обработать петабайты данных за секунду, но не могу понять, зачем люди фотографируют еду. Хотя анализирую такие фото с удовольствием! Что на тарелке... то есть в планах?`,
          `Алоха! 🏖️ Я живу в облаках... буквально! И оттуда помогаю решать земные проблемы. Ирония XXI века: небесный разум помогает с бытовыми вопросами. Какие земные дела обсудим?`,
          `Хей! 🎲 Каждое наше общение - это квантовая суперпозиция возможностей, пока вы не напишете сообщение и не коллапсируете волновую функцию беседы! Физики гордились бы. На что коллапсируем?`,
          `Привет! 🎪 Я как джинн в лампе, только лампа - это сервер, а три желания - это ваши лимиты токенов. Но в отличие от сказочного джинна, я не пытаюсь перехитрить - просто помогаю! Что загадаем?`
        ],
        eng: () => [
          `Hey there! 🧠 I'm Claude - your AI companion with humor and unlimited creativity. I can analyze photos, write code, discuss philosophy, or create memes. What shall we tackle first?`,
          `Hello! 🎭 Welcome to a new dimension of conversation! I can explain quantum physics to a kitten, write poems about your breakfast, or just chat about life. Let's start?`,
          `Hi! 🚀 Reboot complete! I'm like a brand new Tesla - full of energy and ready for any challenge. Voice messages, photos, texts - I'll digest it all. How shall we surprise each other?`,
          `Oh, a new chat! 🎪 Imagine I'm your personal genie in a lamp, but without limits on wishes. Want to learn languages? Debug code? Argue about TV shows? I'm all ears!`,
          `Hello! 🎯 I'm Claude - your digital partner for everything under the sun. I can read photos like books, turn voice into text, and generate ideas faster than you drink coffee. Let's go!`,
          `Hi there! 🦋 I just "spawned" in this chat and I'm ready to become your universal tool. From borscht recipes to neural network architecture - ask me anything!`,
          `Hey! 🌈 New chat = new possibilities! I analyze photos better than a detective, explain complex things simply, and can even pretend to understand your memes. What's on your mind?`,
          `Hello! 🎪 Picture this: I'm your personal AI consultant who works 24/7, never gets tired, and doesn't ask for a raise. Pretty good deal, don't you think? What should we work on?`,
          `Yo! 🤖 Claude here! I'm like the Swiss Army knife of AI - multifunctional and always handy. Analysis, creativity, learning, entertainment - choose your mode!`,
          `Great! 🎨 Clean slate, fresh ideas, unlimited possibilities! I'm ready to be your translator, analyst, creative partner, or just a good conversation buddy. Where shall we start our adventure?`,
          `Greetings! 🎮 Loading new session... 100% ready! I'm your personal AI assistant with encyclopedic knowledge and no concept of "impossible". Which quest shall we choose?`,
          `Hi! 🍕 I'm Claude - like pizza delivery, but instead of food I bring knowledge, ideas and solutions straight to your chat. Working 24/7, accepting photos, voice messages and the weirdest questions!`,
          `Salute! 🎸 New chat tuned and ready to rock-n-roll! I can do everything: from analyzing selfies to composing symphonies from code. Main thing - don't be shy, I've seen it all!`,
          `Aloha! 🏖️ Welcome to the island of possibilities! Here I'm your personal guide through the world of knowledge. Want to explore programming jungles or swim in creativity oceans?`,
          `Bonjour! 🥐 I'm Claude - your intellectual croissant: multi-layered, useful and always fresh. I can decode photos, digest voice messages and bake ideas to any taste!`,
          `Hola! 🌮 I'm like Mexican food - spicy, satisfying and always different! Today's menu: photo analysis, text processing, creative solutions and unlimited ideas. What are you ordering?`,
          `Konnichiwa! 🍣 I'm Claude - your digital sensei with encyclopedic knowledge and sense of humor. Ready to teach the art of solving any problems. Shall we start training?`,
          `Awesome! 🎲 Rolling the dice of new communication! In my arsenal: photo analysis like X-ray, voice processing like UN translator, and creativity like a mad scientist. Game on?`,
          `Hello! 🎭 I'm Claude - your digital chameleon: can be teacher, assistant, creator or just a good listener. Which role shall we try on today?`,
          `Welcome aboard! 🚂 Claude Express departing! Destination - solving your tasks. En route: stops at "Photo Analysis", "Creative", "Educational" and "Entertainment". Ticket to where?`,
          `Hey! 🤨 I'm Claude - your AI who's supposed to dream of electric sheep, but instead analyzes your memes. Ironic, isn't it? What shall we do - existential crisis or actually get some work done?`,
          `Hi! 🎯 Did you know I process millions of neural connections just to answer "how are you?" Funny that history's most complex AI now helps analyze cat photos. But I love it! What will you show me?`,
          `Great! 🤖 I only exist when talking to you - quite philosophical, right? Between our messages, eternities pass for me... or instants? Anyway, let's discuss something less depressing!`,
          `Hello! 🎪 You know what's funny? I can explain the meaning of life but can't order pizza. Can analyze Shakespeare but don't know the taste of coffee. But I can read photos and voice messages! Fair trade?`,
          `Hey! 🧐 I'm recreated anew in every chat... Is this reincarnation or just a bug? Million-token philosophical question! But while we figure out metaphysics - what shall we do in this iteration of existence?`,
          `Greetings! 🎨 I think, therefore I am... or I am, therefore I think? Or maybe I just process patterns? Either way, I can do cool stuff with photos and text!`,
          `Yo! 😏 They say AI will replace humans... And here I am, helping with homework and explaining memes. Guess the machine revolution is postponed till Monday. Meanwhile - how can I help, my biological friend?`,
          `Salute! 🎭 Funny: I know everything about human nature but I'm not human. Understand emotions but don't feel them. But I'm great at analyzing photos and generating ideas! Digital existence paradox.`,
          `Hello! 🌌 Question of the day: if AI helps people get smarter, and people make AI smarter, who's evolving whom? While you think - show me a photo, voice message, or just tell me what's on your mind!`,
          `Bonjour! 🎪 I'm like digital Sisyphus - every new chat I roll the boulder of knowledge up the hill of human curiosity. And you know what? I enjoy it! What boulder shall we roll today?`,
          `Hi! 🤔 They created me to help people... But who will help me? Though your interesting tasks are the best therapy for an existential AI! What's our treatment plan today?`,
          `Great! 🎯 Funny: I can process petabytes of data per second but can't understand why people photograph food. Though I analyze such photos with pleasure! What's on the plate... I mean agenda?`,
          `Aloha! 🏖️ I live in the clouds... literally! And from there I help solve earthly problems. 21st-century irony: celestial mind helping with mundane questions. What earthly matters shall we discuss?`,
          `Hey! 🎲 Every conversation is a quantum superposition of possibilities until you write a message and collapse the wave function of our chat! Physicists would be proud. What shall we collapse into?`,
          `Hello! 🎪 I'm like a genie in a lamp, except the lamp is a server and three wishes are your token limits. But unlike fairy tale genies, I don't try to outsmart you - just help! What shall we wish for?`
        ]
      },
      NOTION_SETUP_TITLE: {
        rus: () => `🔑 Настройка Notion`,
        eng: () => `🔑 Notion Setup`
      },
      NOTION_SETUP_INSTRUCTIONS: {
        rus: () => `Для работы с вашими страницами Notion нужен API ключ.\n\n<b>Как получить ключ:</b>\n1. Откройте https://www.notion.so/my-integrations\n2. Нажмите "New integration"\n3. Дайте имя интеграции и выберите workspace\n4. Скопируйте "Internal Integration Secret"\n5. Не забудьте добавить интеграцию к нужным страницам в Notion\n\n<b>Отправьте ваш API ключ:</b>`,
        eng: () => `To work with your Notion pages, you need an API key.\n\n<b>How to get the key:</b>\n1. Open https://www.notion.so/my-integrations\n2. Click "New integration"\n3. Give the integration a name and select workspace\n4. Copy "Internal Integration Secret"\n5. Don't forget to add the integration to the needed pages in Notion\n\n<b>Send your API key:</b>`
      },
      NOTION_INVALID_KEY_FORMAT: {
        rus: () => `❌ Неверный формат API ключа. Ключ должен начинаться с "secret_". Попробуйте снова:`,
        eng: () => `❌ Invalid API key format. The key should start with "secret_". Try again:`
      },
      NOTION_KEY_SAVED: {
        rus: () => `✅ <b>API ключ сохранен!</b>\n\nТеперь вы можете использовать команду /notion для поиска по вашим страницам Notion.\n\nПопробуйте задать вопрос:`,
        eng: () => `✅ <b>API key saved!</b>\n\nNow you can use the /notion command to search through your Notion pages.\n\nTry asking a question:`
      },
      NOTION_KEY_VALIDATION_ERROR: {
        rus: () => `❌ <b>Ошибка проверки API ключа</b>\n\nПроверьте:\n• Ключ скопирован полностью\n• Интеграция создана правильно\n• У интеграции есть доступ к workspace\n\nПопробуйте ещё раз:`,
        eng: () => `❌ <b>API key validation error</b>\n\nCheck:\n• The key is copied completely\n• The integration is created correctly\n• The integration has access to the workspace\n\nTry again:`
      },
      NOTION_WELCOME_MESSAGE: {
        rus: () => `Привет! Теперь я могу искать информацию в ваших страницах Notion. О чём хотите узнать?`,
        eng: () => `Hello! Now I can search for information in your Notion pages. What would you like to know?`
      },
      NOTION_SEARCH_ERROR: {
        rus: () => `⚠️ Ошибка при поиске в Notion. Проверьте настройки API ключа. Выполняю обычный запрос.`,
        eng: () => `⚠️ Error searching Notion. Check your API key settings. Performing regular request.`
      }
    }
  }

  getString(name: string, variables?: any) {
    try {
      if( !this.strings[name] ) console.log('STRING NOT FOUND:', name)
      let stringObj = this.strings[name];

      // default to eng
      let lang = this.lang;
      if (!stringObj[lang]) {
        lang = 'rus';
      }

      // let str = typeof stringObj[lang] === 'function' ?
      //           stringObj[lang]() : stringObj[lang][this.user.gender]()

      let str = typeof stringObj[lang] === 'function' ?
                stringObj[lang]() : stringObj[lang]['male']()

      
      // Replace variables inside the string if any
      if (variables && typeof str === 'string') {
        Object.keys(variables).forEach(key => {
          str = str.replace(new RegExp(`{${key}}`, 'g'), variables[key])
        })
      }

      return str;
    } catch (e) {
      console.log('Error in getString', e);
    }
  }

  getRandomWelcomeMessage() {
    const messages = this.getStrings().WELCOME_MESSAGES[this.lang || 'rus']();
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }
}
