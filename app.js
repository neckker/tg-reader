// app.js

// ====================== Глобальные переменные ======================
let allMessages = [] // Массив всех сообщений из JSON
let idMap = {} // Словарь { message_id: сообщение } для переходов «Ответ на …»
let myUserId = null // ID «своего» пользователя

// Пагинация
const pageSize = 200 // Сколько сообщений показываем на одной «странице»
let currentPage = 0 // Номер текущей страницы (0-based)
let totalPages = 1 // Общее число страниц (будет пересчитано после загрузки)

// HTML-элементы
const loadBtn = document.getElementById('loadBtn')
const fileInput = document.getElementById('fileInput')
const chatTitle = document.getElementById('chatTitle')
const contentArea = document.getElementById('contentArea')
const scrollArea = document.getElementById('scrollArea')

// ====================== Инициализация слушателей ======================
;(function init() {
    // При клике на «Загрузить» открываем <input type="file">
    loadBtn.addEventListener('click', () => {
        fileInput.click()
    })
    // Когда файл выбран — читаем его
    fileInput.addEventListener('change', onFileSelected)
})()

// ====================== Обработка выбора файла ======================
async function onFileSelected(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
        const arrayBuffer = await file.arrayBuffer()
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
    let chatObject = null
    if (data.messages && Array.isArray(data.messages)) {
        chatObject = data
    } else if (
        data.chats &&
        Array.isArray(data.chats.list) &&
        data.chats.list.length > 0
    ) {
        chatObject = data.chats.list[0]
    } else {
        alert('Не найдены сообщения в JSON.')
        return
    }

    // Устанавливаем название чата
    const chatName = chatObject.name || data.name || 'Чат Telegram'
    chatTitle.textContent = chatName

    // Сохраняем массив сообщений
    allMessages = chatObject.messages || []

    // Определяем свой userId (если есть data.user.id) или берём первый from_id
    if (chatObject.user && chatObject.user.id) {
        myUserId = chatObject.user.id
    } else if (allMessages.length) {
        myUserId = allMessages[0].from_id
    }

    // Заполняем idMap для переходов «Ответ на…»
    allMessages.forEach(msg => {
        if (msg.id != null) idMap[msg.id] = msg
    })

    // Считаем, сколько всего страниц
    totalPages = Math.ceil(allMessages.length / pageSize)
    currentPage = 0 // сбрасываем на первую страницу

    // Рендерим текущую страницу
    renderCurrentPage()
}

// ====================== Рендер текущей «страницы» (200 сообщений) ======================
function renderCurrentPage() {
    // 1) Очищаем предыдущий контент
    contentArea.innerHTML = ''

    // 2) Считаем границы «среза» массива
    const startIndex = currentPage * pageSize
    const endIndex = Math.min(startIndex + pageSize, allMessages.length)

    // 3) Формируем DocumentFragment для вставки
    const frag = document.createDocumentFragment()

    for (let i = startIndex; i < endIndex; i++) {
        const msg = allMessages[i]
        const wrapper = document.createElement('div')
        wrapper.innerHTML = renderMessageHTML(msg)
        frag.appendChild(wrapper.firstElementChild)
    }

    contentArea.appendChild(frag)

    // 4) Внизу добавляем навигационные кнопки «Previous» / «Next»
    const navDiv = document.createElement('div')
    navDiv.className = 'flex justify-center items-center gap-4 py-4'
    navDiv.style.flexWrap = 'wrap'

    // Кнопка «Previous Page»
    const prevBtn = document.createElement('button')
    prevBtn.textContent = '← Previous Page'
    prevBtn.className = `
    px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 
    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500
  `
    prevBtn.disabled = currentPage === 0
    prevBtn.onclick = () => {
        if (currentPage > 0) {
            currentPage--
            renderCurrentPage()
            scrollToTop()
        }
    }

    // Кнопка «Next Page»
    const nextBtn = document.createElement('button')
    nextBtn.textContent = 'Next Page →'
    nextBtn.className = `
    px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 
    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500
  `
    nextBtn.disabled = currentPage >= totalPages - 1
    nextBtn.onclick = () => {
        if (currentPage < totalPages - 1) {
            currentPage++
            renderCurrentPage()
            scrollToTop()
        }
    }

    // Текст «Страница X из Y»
    const infoSpan = document.createElement('span')
    infoSpan.textContent = `Page ${currentPage + 1} of ${totalPages}`
    infoSpan.className = 'text-gray-400 italic'

    navDiv.appendChild(prevBtn)
    navDiv.appendChild(infoSpan)
    navDiv.appendChild(nextBtn)

    contentArea.appendChild(navDiv)
}

// Вспомогательная функция: при переключении страницы скроллить наверх
function scrollToTop() {
    scrollArea.scrollTop = 0
}

// ====================== Построение HTML одного сообщения ======================
function renderMessageHTML(msg) {
    // Если сервисное «phone_call» — рендерим через отдельную функцию
    if (msg.type === 'service' && msg.action === 'phone_call') {
        return renderPhoneCallHTML(msg)
    }

    // Определяем, «свое» ли это сообщение
    let cls = ''
    if (msg.type === 'service') {
        cls = 'msg-service'
    } else if (myUserId && msg.from_id === myUserId) {
        cls = 'msg-self'
    } else {
        cls = 'msg-other'
    }

    // Шапка: автор и дата
    const authorRaw = msg.from || msg.actor || ''
    const author = escapeHtml(authorRaw)

    const dateObj = new Date(msg.date || '')
    const dateStrRaw = isNaN(dateObj)
        ? ''
        : dateObj.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })
    const dateStr = escapeHtml(dateStrRaw)

    let headerHTML = ''
    if (author || dateStrRaw) {
        headerHTML = `
      <div class="message-header">
        ${author ? `<span class="author">${author}</span>` : ''}
        ${dateStr ? `<span class="date">${dateStr}</span>` : ''}
        ${msg.edited ? `<span class="edited">(edited)</span>` : ''}
      </div>`
    }

    // Тело сообщения: текст + медиа
    let bodyHTML = `<div class="message-body">`

    // — Текст
    if (msg.text) {
        if (typeof msg.text === 'string') {
            bodyHTML += `<p>${escapeHtml(msg.text)}</p>`
        } else if (Array.isArray(msg.text)) {
            let combined = ''
            msg.text.forEach(part => {
                if (typeof part === 'string') {
                    combined += escapeHtml(part)
                } else if (part && typeof part.text === 'string') {
                    switch (part.type) {
                        case 'bold':
                            combined += `<b>${escapeHtml(part.text)}</b>`
                            break
                        case 'italic':
                            combined += `<i>${escapeHtml(part.text)}</i>`
                            break
                        case 'link':
                            const href = escapeHtml(part.href || '')
                            const linkText = escapeHtml(part.text)
                            combined += `<a href="${href}" target="_blank" class="underline text-accent">${linkText}</a>`
                            break
                        case 'strikethrough':
                            combined += `<s>${escapeHtml(part.text)}</s>`
                            break
                        default:
                            combined += escapeHtml(part.text)
                    }
                }
            })
            bodyHTML += `<p>${combined}</p>`
        }
    }

    // — Фото
    if (msg.photo) {
        const src = escapeHtml(msg.photo)
        bodyHTML += `
      <img
        src="${src}"
        alt="Photo"
        loading="lazy"
        class="rounded-md border border-line-light mt-2 max-w-xs"
      />`
    }

    // — Стикер
    if (msg.media_type === 'sticker' && msg.file) {
        const src = escapeHtml(msg.file)
        bodyHTML += `
      <img
        src="${src}"
        alt="Sticker"
        loading="lazy"
        class="rounded-md border border-line-light mt-2 max-w-xs"
      />`
    }

    // — Голосовое сообщение
    if (msg.media_type === 'voice_message' && msg.file) {
        const src = escapeHtml(msg.file)
        bodyHTML += `
      <audio
        controls
        src="${src}"
        class="mt-2 w-full max-w-xs"
      ></audio>`
    }

    // — Видео
    if (msg.media_type === 'video_message' && msg.file) {
        const src = escapeHtml(msg.file)
        bodyHTML += `
      <video
        controls
        src="${src}"
        class="rounded-md border border-line-light mt-2 w-full max-w-xs"
      ></video>`
    }

    // — Прочие вложения (PDF, документы и т.д.)
    if (
        msg.file &&
        !['sticker', 'voice_message', 'video_message'].includes(
            msg.media_type || ''
        )
    ) {
        const href = escapeHtml(msg.file)
        const fn = escapeHtml(msg.file_name || msg.file)
        bodyHTML += `
      <div class="mt-2">
        <a
          href="${href}"
          target="_blank"
          class="inline-flex items-center space-x-1 text-accent hover:underline"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none"
               viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 4v16m8-8H4" />
          </svg>
          <span>${fn}</span>
        </a>
      </div>`
    }

    bodyHTML += `</div>`

    // Футер: реакции + кнопка «Ответ на …»
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
                    const emoji = escapeHtml(r.emoji)
                    footerHTML += `
            <span class="reaction-bubble">
              ${emoji} ${r.count}
            </span>`
                }
            })
        }

        // Кнопка «Ответ на …»
        if (hasReply) {
            const parentMsg = idMap[msg.reply_to_message_id]
            let replySnippet = ''

            if (parentMsg) {
                const pAuthorRaw = parentMsg.from || parentMsg.actor || ''
                const pAuthor = escapeHtml(pAuthorRaw)
                const pTextRaw = getShortText(parentMsg)
                if (pTextRaw) {
                    const pTextEsc = escapeHtml(pTextRaw)
                    replySnippet = `${pAuthor}: “${pTextEsc}”`
                } else {
                    replySnippet = pAuthor
                }
            } else {
                replySnippet = '(оригинал)'
            }

            footerHTML += `
        <button
          class="reply-btn"
          onclick="scrollToReply(${msg.reply_to_message_id})"
        >
          Ответ на ${replySnippet}
        </button>`
        }

        footerHTML += `</div>`
    }

    return `
    <div id="msg-${msg.id}" class="${cls}">
      ${headerHTML}
      ${bodyHTML}
      ${footerHTML}
    </div>
  `
}

// ====================== Рендер «звонка» ======================
function renderPhoneCallHTML(msg) {
    const actorRaw = msg.actor || ''
    const actor = escapeHtml(actorRaw)

    const dateObj = new Date(msg.date || '')
    const dateStrRaw = isNaN(dateObj)
        ? ''
        : dateObj.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })
    const dateStr = escapeHtml(dateStrRaw)

    let callText = ''
    let iconColor = ''
    if (msg.discard_reason === 'hangup' && msg.duration_seconds != null) {
        callText = `Incoming (${msg.duration_seconds} sec)`
        iconColor = 'bg-green-500'
    } else if (msg.discard_reason === 'missed') {
        callText = 'Cancelled'
        iconColor = 'bg-red-500'
    } else {
        callText = 'Call'
        iconColor = 'bg-gray-500'
    }
    const callTextEscaped = escapeHtml(callText)

    const isSelf = myUserId && msg.actor_id === myUserId
    const cls = isSelf ? 'msg-call-self' : 'msg-call-other'

    return `
    <div id="msg-${msg.id}" class="${cls}">
      <div class="p-2 rounded-full ${iconColor} text-white flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5 fill-current">
          <path d="M13,1a1,1,0,0,1,1-1A10.011,10.011,0,0,1,24,10a1,1,0,0,1-2,0,8.009,8.009,0,0,0-8-8A1,1,0,0,1,13,1Zm1,5a4,4,0,0,1,4,4,1,1,0,0,0,2,0,6.006,6.006,0,0,0-6-6,1,1,0,0,0,0,2Zm9.093,10.739a3.1,3.1,0,0,1,0,4.378l-.91,1.049c-8.19,7.841-28.12-12.084-20.4-20.3l1.15-1A3.081,3.081,0,0,1,7.26.906c.031.031,1.884,2.438,1.884,2.438a3.1,3.1,0,0,1-.007,4.282L7.979,9.082a12.781,12.781,0,0,0,6.931,6.945l1.465-1.165a3.1,3.1,0,0,1,4.281-.006S23.062,16.708,23.093,16.739Zm-1.376,1.454s-2.393-1.841-2.424-1.872a1.1,1.1,0,0,0-1.549,0c-.027.028-2.044,1.635-2.044,1.635a1,1,0,0,1-.979.152A15.009,15.009,0,0,1,5.9,9.3a1,1,0,0,1,.145-1S7.652,6.282,7.679,6.256a1.1,1.1,0,0,0,0-1.549c-.031-.03-1.872-2.425-1.872-2.425a1.1,1.1,0,0,0-1.51.039l-1.15,1C-2.495,10.105,14.776,26.418,20.721,20.8l.911-1.05A1.121,1.121,0,0,0,21.717,18.193Z"/>
        </svg>
      </div>
      <div class="flex flex-col items-start">
        <span class="font-semibold text-white">${actor}</span>
        <span class="text-sm text-gray-300">${callTextEscaped}</span>
      </div>
      <div class="ml-auto text-sm text-gray-400">${dateStr}</div>
    </div>
  `
}

// ====================== Утилита: короткий текст для реплая ======================
function getShortText(msg) {
    let raw = ''
    if (msg.text) {
        if (typeof msg.text === 'string') {
            raw = msg.text
        } else if (Array.isArray(msg.text)) {
            raw = msg.text
                .map(p => (typeof p === 'string' ? p : p.text || ''))
                .join('')
        }
    }
    raw = raw.trim()
    return raw.length > 40 ? raw.slice(0, 40) + '...' : raw
}

// ====================== Утилита: экранирование HTML ======================
function escapeHtml(str) {
    if (str === null || str === undefined) {
        return ''
    }
    str = String(str)
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
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('highlight')
    setTimeout(() => {
        el.classList.remove('highlight')
    }, 3000)
}
