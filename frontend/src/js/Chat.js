import emojis from './emojis';
import parseEmojis from './parseEmojis';

export default class Chat {
  constructor(root) {
    this.root = root;
    this.messages = [];
    this.ws = null;
    this.offset = 0;
    this.limit = 10;
    this.total = 0;
    this.isLoading = false;
    this.searchTimer = null;
    this.pinnedId = null;
  }

  init() {
    this.drawElements();
    this.renderEmojiPanel();
    this.listeners();
    this.loadMessages();
    this.connectWebSocket();
  }

  drawElements() {
    this.root.innerHTML = `
      <div class="chat">
        <div class="chat__header">
          <span class="chat__title">Chat</span>
          <input type="text" class="chat__search" placeholder="Поиск...">
        </div>
        <div class="chat__pinned hidden"></div>
        <div class="chat__messages"></div>
        <div class="chat__input-wrapper">
          <button class="chat__attach" title="Прикрепить файл">📎</button>
          <button class="chat__location" title="Отправить геолокацию">📍</button>
          <button class="chat__emoji" title="Смайлики">😀</button>
          <input type="text" class="chat__input" placeholder="Введите сообщение...">
          <button class="chat__send">Отправить</button>
          <input type="file" class="chat__file-input" hidden>
          <div class="emoji-panel hidden"></div>
        </div>
      </div>
    `;

    this.messagesEl = this.root.querySelector('.chat__messages');
    this.pinnedEl = this.root.querySelector('.chat__pinned');
    this.input = this.root.querySelector('.chat__input');
    this.sendBtn = this.root.querySelector('.chat__send');
    this.attachBtn = this.root.querySelector('.chat__attach');
    this.locationBtn = this.root.querySelector('.chat__location');
    this.emojiBtn = this.root.querySelector('.chat__emoji');
    this.emojiPanel = this.root.querySelector('.emoji-panel');
    this.fileInput = this.root.querySelector('.chat__file-input');
    this.searchInput = this.root.querySelector('.chat__search');
  }

  listeners() {
    this.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.sendMessage();
      }
    });

    this.attachBtn.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files[0];
      if (file) {
        this.sendFile(file);
      }
      this.fileInput.value = '';
    });

    this.locationBtn.addEventListener('click', () => {
      this.sendLocation();
    });

    this.emojiBtn.addEventListener('click', () => {
      this.toggleEmojiPanel();
    });

    this.messagesEl.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    this.messagesEl.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) {
        this.sendFile(file);
      }
    });

    this.messagesEl.addEventListener('scroll', () => {
      if (this.messagesEl.scrollTop < 50) {
        this.loadMoreMessages();
      }
    });

    this.searchInput.addEventListener('input', () => {
      this.handleSearch();
    });
  }

  connectWebSocket() {
    this.ws = new WebSocket('ws://localhost:7070');

    this.ws.addEventListener('message', (event) => {
      this.handleServerEvent(event.data);
    });

    this.ws.addEventListener('close', () => {
      console.warn('WebSocket закрыт. Пробую переподключиться...');
      setTimeout(() => this.connectWebSocket(), 3000);
    });

    this.ws.addEventListener('error', () => {
      console.warn('WebSocket ошибка');
    });
  }

  handleServerEvent(data) {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'message') {
        this.messages.push(parsed.message);
        this.total += 1;
        this.renderMessages();
      }

      if (parsed.type === 'pin-changed') {
        this.pinnedId = parsed.pinnedId;
        this.renderPinned();
        this.renderMessages();
      }
    } catch (error) {
      console.error('Invalid WS message:', error);
    }
  }

  async loadMessages() {
    this.offset = 0;
    this.messages = [];

    try {
      const response = await fetch(
        `http://localhost:7070/api/messages?offset=0&limit=${this.limit}`,
      );
      const data = await response.json();

      this.messages = data.messages;
      this.offset = data.messages.length;
      this.total = data.total;
      this.pinnedId = data.pinnedId;

      this.renderMessages();
      this.renderPinned();
    } catch (error) {
      console.error('Не удалось загрузить сообщения:', error);
    }
  }

  async loadMoreMessages() {
    if (this.isLoading) return;
    if (this.offset >= this.total) return;

    this.isLoading = true;

    const prevScrollHeight = this.messagesEl.scrollHeight;
    const prevScrollTop = this.messagesEl.scrollTop;

    try {
      const response = await fetch(
        `http://localhost:7070/api/messages?offset=${this.offset}&limit=${this.limit}`,
      );
      const data = await response.json();

      this.messages = [...data.messages, ...this.messages];
      this.offset += data.messages.length;
      this.total = data.total;
      this.pinnedId = data.pinnedId;

      this.renderMessages();

      const newScrollHeight = this.messagesEl.scrollHeight;
      this.messagesEl.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
    } catch (error) {
      console.error('Не удалось подгрузить сообщения:', error);
    } finally {
      this.isLoading = false;
    }
  }

  handleSearch() {
    clearTimeout(this.searchTimer);

    this.searchTimer = setTimeout(() => {
      const query = this.searchInput.value.trim();

      if (!query) {
        this.renderMessages();
        return;
      }

      this.performSearch(query);
    }, 300);
  }

  async performSearch(query) {
    try {
      const response = await fetch(
        `http://localhost:7070/api/messages/search?q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();

      this.renderSearchResults(data.messages);
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  }

  renderSearchResults(messages) {
    this.messagesEl.innerHTML = '';

    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.classList.add('chat__empty');
      empty.textContent = 'Ничего не найдено';
      this.messagesEl.append(empty);
      return;
    }

    for (const message of messages) {
      const messageEl = document.createElement('div');
      messageEl.classList.add('message', 'message_search');

      messageEl.append(this.createMessageContent(message));

      this.messagesEl.append(messageEl);
    }
  }

  async sendMessage() {
    const content = this.input.value.trim();
    if (!content) return;

    this.input.value = '';

    try {
      await fetch('http://localhost:7070/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      console.error('Не удалось отправить сообщение:', error);
    }
  }

  async sendFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('http://localhost:7070/api/files', {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      console.error('Не удалось отправить файл:', error);
    }
  }

  sendLocation() {
    if (!navigator.geolocation) {
      alert('Геолокация недоступна в этом браузере');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const content = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        try {
          await fetch('http://localhost:7070/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'location', content }),
          });
        } catch (error) {
          console.error('Не удалось отправить геолокацию:', error);
        }
      },
      (error) => {
        console.error('Ошибка геолокации:', error);
        alert('Не удалось получить координаты. Разрешите доступ к геолокации.');
      },
    );
  }

  renderEmojiPanel() {
    this.emojiPanel.innerHTML = '';

    for (const [code, symbol] of Object.entries(emojis)) {
      const btn = document.createElement('button');
      btn.classList.add('emoji-panel__item');
      btn.type = 'button';
      btn.textContent = symbol;
      btn.title = `:${code}:`;
      btn.addEventListener('click', () => {
        this.insertEmoji(code);
      });
      this.emojiPanel.append(btn);
    }
  }

  toggleEmojiPanel() {
    this.emojiPanel.classList.toggle('hidden');
  }

  insertEmoji(code) {
    const cursorPos = this.input.selectionStart;
    const text = this.input.value;
    const emojiCode = `:${code}: `;

    this.input.value =
      text.slice(0, cursorPos) + emojiCode + text.slice(cursorPos);
    this.input.focus();
    this.input.selectionStart = this.input.selectionEnd = cursorPos + emojiCode.length;
  }

  async pinMessage(messageId) {
    try {
      await fetch(`http://localhost:7070/api/messages/${messageId}/pin`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Не удалось закрепить:', error);
    }
  }

  async unpinMessage() {
    try {
      await fetch(`http://localhost:7070/api/messages/${this.pinnedId}/unpin`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Не удалось открепить:', error);
    }
  }

  renderMessages() {
    this.messagesEl.innerHTML = '';

    for (const message of this.messages) {
      const messageEl = document.createElement('div');
      messageEl.classList.add('message');

      if (message.id === this.pinnedId) {
        messageEl.classList.add('message_pinned');
      }

      messageEl.append(this.createMessageContent(message));

      const pinBtn = document.createElement('button');
      pinBtn.classList.add('message__pin');
      pinBtn.title = message.id === this.pinnedId ? 'Открепить' : 'Закрепить';
      pinBtn.textContent = '📌';
      pinBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (message.id === this.pinnedId) {
          this.unpinMessage();
        } else {
          this.pinMessage(message.id);
        }
      });

      messageEl.append(pinBtn);
      this.messagesEl.append(messageEl);
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  renderPinned() {
    this.pinnedEl.innerHTML = '';

    if (!this.pinnedId) {
      this.pinnedEl.classList.add('hidden');
      return;
    }

    const message = this.messages.find((m) => m.id === this.pinnedId);

    if (!message) {
      this.pinnedEl.classList.add('hidden');
      return;
    }

    this.pinnedEl.classList.remove('hidden');

    const contentEl = document.createElement('div');
    contentEl.classList.add('pinned__content');
    contentEl.append(this.createMessageContent(message));

    const unpinBtn = document.createElement('button');
    unpinBtn.classList.add('pinned__unpin');
    unpinBtn.title = 'Открепить';
    unpinBtn.textContent = '✕';
    unpinBtn.addEventListener('click', () => {
      this.unpinMessage();
    });

    this.pinnedEl.append(contentEl, unpinBtn);
  }

  createMessageContent(message) {
    const container = document.createElement('div');

    if (message.type === 'text') {
      container.textContent = parseEmojis(message.content);
    }

    if (message.type === 'file') {
      container.append(this.createFileContent(message));
    }

    if (message.type === 'location') {
      container.append(this.createLocationContent(message));
    }

    return container;
  }

  createFileContent(message) {
    const { mime, url, name } = message.content;
    const fullUrl = `http://localhost:7070${url}`;
    const container = document.createElement('div');
    container.classList.add('file');

    if (mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.classList.add('file__image');
      img.src = fullUrl;
      img.alt = name;
      container.append(img);
    } else if (mime.startsWith('video/')) {
      const video = document.createElement('video');
      video.classList.add('file__video');
      video.controls = true;
      video.src = fullUrl;
      container.append(video);
    } else if (mime.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.classList.add('file__audio');
      audio.controls = true;
      audio.src = fullUrl;
      container.append(audio);
    } else {
      const downloadEl = document.createElement('div');
      downloadEl.classList.add('file__download');

      const nameEl = document.createElement('span');
      nameEl.classList.add('file__name');
      nameEl.textContent = `${name} `;

      const link = document.createElement('a');
      link.classList.add('file__link');
      link.href = `http://localhost:7070/api/files/${message.id}`;
      link.textContent = 'Скачать';

      downloadEl.append(nameEl, link);
      container.append(downloadEl);
    }

    return container;
  }

  createLocationContent(message) {
    const { latitude, longitude } = message.content;
    const link = document.createElement('a');
    link.classList.add('location__link');
    link.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `📍 Моя геолокация (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    return link;
  }
}