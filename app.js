// app.js

// ====================== Глобальные переменные ======================
let allMessages = [] // Массив всех сообщений
let idMap = {} // Словарь { message_id: сообщение } для реплаев
let myUserId = null // ID «своего» пользователя

// HTML-элементы
const loadBtn = document.getElementById('loadBtn')
const fileInput = document.getElementById('fileInput')
const chatTitle = document.getElementById('chatTitle')
const contentArea = document.getElementById('contentArea')
const scrollArea = document.getElementById('scrollArea')

// ====================== Инициализация слушателей ======================
;(function init() {
    // 1) При клике на кнопку «Загрузить» вызываем скрытый fileInput
    loadBtn.addEventListener('click', () => {
        fileInput.click()
    })

    // 2) Когда пользователь выбрал файл
    fileInput.addEventListener('change', onFileSelected)
})()

// ====================== Обработка выбора файла ======================
async function onFileSelected(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
        // 1) Читаем файл как ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()

        // 2) Парсим JSON в Web Worker
        const worker = new Worker('worker.js')
        worker.postMessage(arrayBuffer, [arrayBuffer])

        worker.onmessage = function (e) {
            const msg = e.data
            if (!msg.success) {
                alert('Ошибка при парсинге JSON: ' + msg.error)
                worker.terminate()
                return
            }
            const data = msg.payload
            worker.terminate()
            processLoadedData(data)
        }

        worker.onerror = function (err) {
            alert('Ошибка воркера: ' + err.message)
            worker.terminate()
        }
    } catch (err) {
        alert('Не удалось прочитать файл: ' + err)
    }
}

// ====================== Обработка распарсенного JSON ======================
function processLoadedData(data) {
    // 1) Определяем объект чата
    let chatObject = null
    if (data.messages && Array.isArray(data.messages)) {
        // Один чат
        chatObject = data
    } else if (
        data.chats &&
        Array.isArray(data.chats.list) &&
        data.chats.list.length > 0
    ) {
        // Несколько чатов — берём первый
        chatObject = data.chats.list[0]
    } else {
        alert('Не найдены сообщения в JSON.')
        return
    }

    // 2) Устанавливаем название чата в шапке
    const chatName = chatObject.name || data.name || 'Чат Telegram'
    chatTitle.textContent = chatName

    // 3) Сохраняем массив всех сообщений
    allMessages = chatObject.messages || []

    // 4) Определяем ID «своего» (data.user.id или первый message.from_id)
    if (chatObject.user && chatObject.user.id) {
        myUserId = chatObject.user.id
    } else if (allMessages.length) {
        myUserId = allMessages[0].from_id
    }

    // 5) Заполняем словарь idMap для реплаев
    allMessages.forEach(msg => {
        if (msg.id != null) idMap[msg.id] = msg
    })

    // 6) Рендерим все сообщения в DOM
    renderAllMessages()
}

// ====================== Рендер всех сообщений (без виртуализации) ======================
function renderAllMessages() {
    // Очищаем предыдущие
    contentArea.innerHTML = ''

    // Используем DocumentFragment для скорости
    const frag = document.createDocumentFragment()

    allMessages.forEach(msg => {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = renderMessageHTML(msg)
        // Получаем созданный элемент (первый дочерний)
        const el = wrapper.firstElementChild
        frag.appendChild(el)
    })

    contentArea.appendChild(frag)
}

// ====================== Функция строит HTML одного сообщения ======================
function renderMessageHTML(msg) {
    // 1) Определяем класс контейнера
    let cls = ''
    if (msg.type === 'service') {
        cls = 'msg-service'
    } else if (myUserId && msg.from_id === myUserId) {
        // Наше сообщение
        cls = 'msg-self'
    } else {
        // Сообщение собеседника
        cls = 'msg-other'
    }

    // 2) Шапка: автор и дата
    let headerHTML = ''
    const author = msg.from || msg.actor || ''
    const dateObj = new Date(msg.date)
    const dateStr = isNaN(dateObj)
        ? ''
        : dateObj.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })

    if (author || dateStr) {
        headerHTML = `<div class="message-header">
      ${author ? `<span class="author">${escapeHtml(author)}</span>` : ''}
      ${dateStr ? `<span class="date">${dateStr}</span>` : ''}
      ${msg.edited ? `<span class="edited">(edited)</span>` : ''}
    </div>`
    }

    // 3) Тело: текст + медиа
    let bodyHTML = `<div class="message-body">`

    // 3.1) Текст
    if (msg.text) {
        if (typeof msg.text === 'string') {
            bodyHTML += `<p>${escapeHtml(msg.text)}</p>`
        } else if (Array.isArray(msg.text)) {
            let combined = ''
            msg.text.forEach(part => {
                if (typeof part === 'string') {
                    combined += escapeHtml(part)
                } else if (part.type === 'bold') {
                    combined += `<b>${escapeHtml(part.text)}</b>`
                } else if (part.type === 'italic') {
                    combined += `<i>${escapeHtml(part.text)}</i>`
                } else if (part.type === 'link') {
                    combined += `<a href="${escapeHtml(
                        part.href
                    )}" target="_blank" class="underline text-accent">${escapeHtml(
                        part.text
                    )}</a>`
                } else if (part.type === 'strikethrough') {
                    combined += `<s>${escapeHtml(part.text)}</s>`
                } else {
                    combined += escapeHtml(part.text)
                }
            })
            bodyHTML += `<p>${combined}</p>`
        }
    }

    // 3.2) Фото
    if (msg.photo) {
        bodyHTML += `
      <img
        src="${escapeHtml(msg.photo)}"
        alt="Photo"
        loading="lazy"
        class="rounded-md border border-line-light mt-2 max-w-xs"
      />`
    }

    // 3.3) Стикер
    if (msg.media_type === 'sticker' && msg.file) {
        bodyHTML += `
      <img
        src="${escapeHtml(msg.file)}"
        alt="Sticker"
        loading="lazy"
        class="rounded-md border border-line-light mt-2 max-w-xs"
      />`
    }

    // 3.4) Голосовое сообщение
    if (msg.media_type === 'voice_message' && msg.file) {
        bodyHTML += `
      <audio
        controls
        src="${escapeHtml(msg.file)}"
        class="mt-2 w-full max-w-xs"
      ></audio>`
    }

    // 3.5) Видео-сообщение
    if (msg.media_type === 'video_message' && msg.file) {
        bodyHTML += `
      <video
        controls
        src="${escapeHtml(msg.file)}"
        class="rounded-md border border-line-light mt-2 w-full max-w-xs"
      ></video>`
    }

    // 3.6) Прочие вложения
    if (
        msg.file &&
        !['sticker', 'voice_message', 'video_message'].includes(
            msg.media_type || ''
        )
    ) {
        const fn = msg.file_name || msg.file
        bodyHTML += `
      <div class="mt-2">
        <a
          href="${escapeHtml(msg.file)}"
          target="_blank"
          class="inline-flex items-center space-x-1 text-accent hover:underline"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none"
               viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 4v16m8-8H4" />
          </svg>
          <span>${escapeHtml(fn)}</span>
        </a>
      </div>`
    }

    bodyHTML += `</div>`

    // 4) Футер: реакции + кнопка «Ответ»
    let footerHTML = ''
    const hasReactions =
        Array.isArray(msg.reactions) && msg.reactions.length > 0
    const hasReply = msg.reply_to_message_id != null

    if (hasReactions || hasReply) {
        footerHTML = `<div class="message-footer">`

        // Реакции
        if (hasReactions) {
            msg.reactions.forEach(r => {
                if (
                    r.type === 'emoji' &&
                    r.emoji &&
                    typeof r.count === 'number'
                ) {
                    footerHTML += `
            <span class="reaction-bubble">
              ${escapeHtml(r.emoji)} ${r.count}
            </span>`
                }
            })
        }

        // Реплай: кнопка «Ответ на…»
        if (hasReply) {
            const parentMsg = idMap[msg.reply_to_message_id]
            let replySnippet = '(оригинал)'
            if (parentMsg) {
                const pAuthor = parentMsg.from || parentMsg.actor || ''
                const pText = getShortText(parentMsg)
                replySnippet = `${pAuthor}: “${pText}”`
            }
            footerHTML += `
        <button
          class="reply-btn"
          onclick="scrollToReply(${msg.reply_to_message_id})"
        >
          Ответ на ${escapeHtml(replySnippet)}
        </button>`
        }

        footerHTML += `</div>`
    }

    // 5) Собираем весь HTML
    return `<div id="msg-${msg.id}" class="${cls}">
      ${headerHTML}
      ${bodyHTML}
      ${footerHTML}
    </div>`
}

// ====================== Утилита: короткий текст для реплая ======================
function getShortText(msg) {
    let raw = ''
    if (msg.text) {
        if (typeof msg.text === 'string') {
            raw = msg.text
        } else if (Array.isArray(msg.text)) {
            raw = msg.text
                .map(p => (typeof p === 'string' ? p : p.text))
                .join('')
        }
    }
    raw = raw.trim()
    return raw.length > 40 ? raw.slice(0, 40) + '...' : raw
}

// ====================== Утилита: экранирование HTML ======================
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

// ====================== Переход к оригиналу (reply → parent) ======================
function scrollToReply(parentMsgId) {
    const el = document.getElementById('msg-' + parentMsgId)
    if (!el) return
    // Плавный скролл к нужному элементу
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Подсветка рамкой
    el.classList.add('highlight')
    setTimeout(() => {
        el.classList.remove('highlight')
    }, 1500)
}
