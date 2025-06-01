let allMessages = []
let idMap = {}
let participantName = ''

const pageSize = 200
let currentPage = 0
let totalPages = 1

const loadBtn = document.getElementById('loadBtn')
const fileInput = document.getElementById('fileInput')
const chatTitle = document.getElementById('chatTitle')
const contentArea = document.getElementById('contentArea')
const scrollArea = document.getElementById('scrollArea')

;(function init() {
    loadBtn.addEventListener('click', () => {
        fileInput.click()
    })
    fileInput.addEventListener('change', onFileSelected)
})()

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
                alert('Error parsing JSON: ' + msg.error)
                worker.terminate()
                return
            }
            const data = msg.payload
            worker.terminate()
            processLoadedData(data)
        }

        worker.onerror = function (err) {
            alert('Worker error: ' + err.message)
            worker.terminate()
        }
    } catch (err) {
        alert('Failed to read file: ' + err)
    }
}

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
        alert('No messages found in JSON.')
        return
    }

    const chatName = chatObject.name || data.name || 'Telegram Chat'
    chatTitle.textContent = chatName
    participantName = chatName

    allMessages = chatObject.messages || []

    allMessages.forEach(msg => {
        if (msg.id != null) idMap[msg.id] = msg
    })

    totalPages = Math.ceil(allMessages.length / pageSize)
    currentPage = 0
    renderCurrentPage()
}

function renderCurrentPage() {
    contentArea.innerHTML = ''

    const startIndex = currentPage * pageSize
    const endIndex = Math.min(startIndex + pageSize, allMessages.length)

    const frag = document.createDocumentFragment()
    let lastDateKey = null

    for (let i = startIndex; i < endIndex; i++) {
        const msg = allMessages[i]
        const msgDateKey = getDateKey(msg.date)
        if (msgDateKey && msgDateKey !== lastDateKey) {
            const sep = document.createElement('div')
            sep.className = 'date-separator'
            sep.textContent = `─── ${formatFullDate(msg.date)} ───`
            frag.appendChild(sep)
            lastDateKey = msgDateKey
        }

        const wrapper = document.createElement('div')
        wrapper.innerHTML = renderMessageHTML(msg)
        frag.appendChild(wrapper.firstElementChild)
    }

    contentArea.appendChild(frag)

    const navDiv = document.createElement('div')
    navDiv.className = 'flex justify-center items-center gap-4 py-4 flex-wrap'

    const prevBtn = document.createElement('button')
    prevBtn.textContent = '← Previous Page'
    prevBtn.className =
        'px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600'
    prevBtn.disabled = currentPage === 0
    prevBtn.onclick = () => {
        if (currentPage > 0) {
            currentPage--
            renderCurrentPage()
        }
    }

    const infoSpan = document.createElement('span')
    infoSpan.textContent = `Page ${currentPage + 1} of ${totalPages}`
    infoSpan.className = 'text-gray-400 italic'

    const nextBtn = document.createElement('button')
    nextBtn.textContent = 'Next Page →'
    nextBtn.className =
        'px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600'
    nextBtn.disabled = currentPage >= totalPages - 1
    nextBtn.onclick = () => {
        if (currentPage < totalPages - 1) {
            currentPage++
            renderCurrentPage()
        }
    }

    navDiv.appendChild(prevBtn)
    navDiv.appendChild(infoSpan)
    navDiv.appendChild(nextBtn)
    contentArea.appendChild(navDiv)
}

function getDateKey(isoString) {
    if (!isoString) return null
    const d = new Date(isoString)
    if (isNaN(d)) return null
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${year}-${month}-${day}`
}

function formatFullDate(isoString) {
    const d = new Date(isoString)
    if (isNaN(d)) return ''
    return d.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    })
}

function renderMessageHTML(msg) {
    if (msg.type === 'service' && msg.action === 'phone_call') {
        return renderPhoneCallHTML(msg)
    }

    let cls = ''
    if (msg.type === 'service') {
        cls = 'msg-service'
    } else if (msg.from === participantName) {
        cls = 'msg-other'
    } else {
        cls = 'msg-self'
    }

    const authorRaw = msg.from || msg.actor || ''
    const author = escapeHtml(authorRaw)

    const dateObj = new Date(msg.date || '')
    const dateStrRaw = isNaN(dateObj)
        ? ''
        : dateObj.toLocaleDateString('en-US', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
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

    let bodyHTML = `<div class="message-body">`

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

    if (msg.media_type === 'voice_message' && msg.file) {
        const src = escapeHtml(msg.file)
        bodyHTML += `
      <audio
        controls
        src="${src}"
        class="mt-2 w-full max-w-xs"
      ></audio>`
    }

    if (msg.media_type === 'video_message' && msg.file) {
        const src = escapeHtml(msg.file)
        bodyHTML += `
      <video
        controls
        src="${src}"
        class="rounded-md border border-line-light mt-2 w-full max-w-xs"
      ></video>`
    }

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

    let footerHTML = ''
    const hasReactions =
        Array.isArray(msg.reactions) && msg.reactions.length > 0
    const hasReply = msg.reply_to_message_id != null

    if (hasReactions || hasReply) {
        footerHTML = `<div class="message-footer">`

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
                replySnippet = '(original)'
            }

            footerHTML += `
        <button
          class="reply-btn"
          onclick="scrollToReply(${msg.reply_to_message_id})"
        >
          Reply to ${replySnippet}
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

function renderPhoneCallHTML(msg) {
    const actorRaw = msg.actor || ''
    const actor = escapeHtml(actorRaw)

    const dateObj = new Date(msg.date || '')
    const dateStrRaw = isNaN(dateObj)
        ? ''
        : dateObj.toLocaleDateString('en-US', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
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

    const isSelf = msg.actor === participantName
    const cls = isSelf ? 'msg-call-other' : 'msg-call-self'

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

function scrollToReply(parentMsgId) {
    const el = document.getElementById('msg-' + parentMsgId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('highlight')
    setTimeout(() => {
        el.classList.remove('highlight')
    }, 3000)
}
