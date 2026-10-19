/**
 * PlayLab System Core & UI Components (Lightweight Version)
 * v1.2.0 (GNB & TTS Only)
 * * 포함 기능:
 * 1. Global State Management (Lang Only)
 * 2. Google TTS Engine (with Browser Fallback)
 * 3. Web Components (GNB, Modal)
 * * 제거됨:
 * - MIDI Handler
 * - AudioContext
 * - Intro Component
 */

const GOOGLE_API_KEY = 'AIzaSyAE0nnpOYZRfLkfM09O3NQjpWnN1kUqR3E';

// --- 1. Core Logic Class ---
class PlayLabCore {
    constructor() {
        this.lang = 'ko'; // Default Language
        this.ttsAudio = null;

        // [Simplified] Common I18N Data (GNB & Modal Only)
        this.COMMON_I18N = {
            ko: {
                langName: 'English', // Button shows target language
                restart: '처음으로',
                exit: '종료',
                exitConfirmTitle: '정말 종료할까요?',
                yes: '네',
                no: '아니요',
                close: '닫기',
            },
            en: {
                langName: '한국어',
                restart: 'Restart',
                exit: 'Exit',
                exitConfirmTitle: 'Really Exit?',
                yes: 'Yes',
                no: 'No',
                close: 'Close',
            },
        };

        // Initialize i18nData with Common Data IMMEDIATELY
        this.i18nData = JSON.parse(JSON.stringify(this.COMMON_I18N));

        // Event Bus for Custom Events
        this.eventTarget = new EventTarget();
    }

    init(gameI18n = {}) {
        // Merge Game Specific Data
        this.i18nData = this.mergeDeep(this.i18nData, gameI18n);

        this.renderLucide();

        // Force UI Update after initialization
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('playlab-lang-change', { detail: { lang: this.lang } }));
        }, 0);
    }

    // --- TTS Logic ---
    stopTTS() {
        if (this.ttsAudio) {
            this.ttsAudio.pause();
            this.ttsAudio = null;
        }
        window.speechSynthesis.cancel();
    }

    async speak(textKey, isRawText = false) {
        this.stopTTS();

        let text = isRawText ? textKey : this.getText(textKey);
        if (!text) return;

        // Strip HTML
        text = text.replace(/<[^>]*>/g, '');

        const langCode = this.lang === 'ko' ? 'ko-KR' : 'en-US';
        const voiceName = this.lang === 'ko' ? 'ko-KR-Standard-A' : 'en-US-Standard-E';

        try {
            const response = await fetch(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        input: { text: text },
                        voice: { languageCode: langCode, name: voiceName },
                        audioConfig: { audioEncoding: 'MP3' },
                    }),
                },
            );

            if (!response.ok) throw new Error('TTS API Error');

            const data = await response.json();
            const audioBlob = await fetch(`data:audio/mp3;base64,${data.audioContent}`).then((r) => r.blob());
            this.ttsAudio = new Audio(URL.createObjectURL(audioBlob));
            this.ttsAudio.play();
        } catch (e) {
            console.warn('Google TTS failed, fallback to browser.', e);
            this.fallbackSpeak(text);
        }
    }

    fallbackSpeak(text) {
        const ut = new SpeechSynthesisUtterance(text);
        ut.lang = this.lang === 'ko' ? 'ko-KR' : 'en-US';
        window.speechSynthesis.speak(ut);
    }

    // --- Utils ---
    toggleLang() {
        this.lang = this.lang === 'ko' ? 'en' : 'ko';
        this.stopTTS();
        window.dispatchEvent(new CustomEvent('playlab-lang-change', { detail: { lang: this.lang } }));
        this.speak(this.lang === 'ko' ? '한국어' : 'English', true);
    }

    getText(key) {
        return this.i18nData[this.lang]?.[key] || key;
    }

    mergeDeep(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        return this.mergeDeep(target, ...sources);
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    renderLucide() {
        if (window.lucide) window.lucide.createIcons();
    }
}

// Singleton Instance
window.playLab = new PlayLabCore();

// --- 2. Web Components ---

// A. GNB Component <playlab-gnb title="..."></playlab-gnb>
class PlayLabGNB extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
        window.addEventListener('playlab-lang-change', () => this.updateText());
        // Listen for game start to show restart button (Optional, if app triggers it)
        window.addEventListener('playlab-game-start', () => {
            this.querySelector('#btn-restart').classList.remove('hidden');
        });
        window.addEventListener('playlab-reset', () => {
            this.querySelector('#btn-restart').classList.add('hidden');
        });
    }

    render() {
        // Use I18N title if available, otherwise attribute
        const titleKey = 'appTitle';
        const displayTitle =
            window.playLab.getText(titleKey) !== titleKey
                ? window.playLab.getText(titleKey)
                : this.getAttribute('title') || 'PlayLab';

        this.innerHTML = `
            <nav style="height: 60px; background-color: #FEE500; z-index: 10000;" class="fixed top-0 left-0 w-full flex items-center justify-between px-4 shadow-sm">
                <div class="flex items-center gap-2">
                    <i data-lucide="music" class="text-gray-800 w-6 h-6"></i>
                    <h1 class="text-xl md:text-2xl font-bold text-gray-800 break-keep" id="gnb-title">${displayTitle}</h1>
                </div>
                <div class="flex gap-2">
                    <button id="btn-lang" class="bg-white border-2 border-gray-800 rounded-full px-4 py-1.5 text-sm font-bold shadow-sm hover:bg-gray-100 active:scale-95 transition-transform">
                        ${window.playLab.getText('langName')}
                    </button>
                    <button id="btn-restart" class="hidden bg-gray-800 text-white rounded-full px-4 py-1.5 text-sm font-bold shadow-sm hover:bg-gray-700 active:scale-95 transition-transform">
                        ${window.playLab.getText('restart')}
                    </button>
                    <button id="btn-exit" class="bg-red-500 text-white rounded-full px-4 py-1.5 text-sm font-bold shadow-sm hover:bg-red-600 active:scale-95 transition-transform">
                        ${window.playLab.getText('exit')}
                    </button>
                </div>
            </nav>
            <!-- Exit Confirm Modal (Hidden) -->
            <playlab-modal id="modal-exit" type="confirm">
                <h3 class="text-3xl font-bold text-gray-800 mb-4" data-i18n="exitConfirmTitle"></h3>
            </playlab-modal>
        `;

        // Event Binding
        this.querySelector('#btn-lang').onclick = () => window.playLab.toggleLang();

        this.querySelector('#btn-restart').onclick = () => {
            window.playLab.stopTTS();
            window.dispatchEvent(new CustomEvent('playlab-reset'));
        };

        this.querySelector('#btn-exit').onclick = () => {
            const modal = this.querySelector('#modal-exit');
            modal.open(window.playLab.getText('exitConfirmTitle'), () => {
                // Yes Action
                if (window.history.length > 1) window.history.back();
                else window.close();
            });
        };

        window.playLab.renderLucide();
    }

    updateText() {
        this.querySelector('#gnb-title').innerText = window.playLab.getText('appTitle'); // App title from I18N
        this.querySelector('#btn-lang').innerText = window.playLab.getText('langName');
        this.querySelector('#btn-restart').innerText = window.playLab.getText('restart');
        this.querySelector('#btn-exit').innerText = window.playLab.getText('exit');
    }
}
customElements.define('playlab-gnb', PlayLabGNB);

// B. Modal Component <playlab-modal type="..."></playlab-modal>
class PlayLabModal extends HTMLElement {
    connectedCallback() {
        const type = this.getAttribute('type');
        this.className = 'hidden absolute inset-0 z-[100] bg-black/60 flex items-center justify-center p-4';

        let content = '';
        if (type === 'confirm') {
            content = `
                <div class="bg-white rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl">
                    <div class="modal-body mb-8"><slot></slot></div>
                    <div class="flex gap-4 justify-center">
                        <button id="btn-no" class="bg-gray-200 text-gray-700 px-8 py-3 rounded-xl text-xl font-bold active:scale-95">${window.playLab.getText('no')}</button>
                        <button id="btn-yes" class="bg-red-500 text-white px-8 py-3 rounded-xl text-xl font-bold active:scale-95">${window.playLab.getText('yes')}</button>
                    </div>
                </div>
            `;
        } else if (type === 'custom' || type === 'custom_content') {
            content = `
                <div class="bg-white rounded-[2rem] p-10 max-w-3xl w-full text-center shadow-2xl border-4 border-white/50 relative">
                     <button id="btn-close-x" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2">
                        <i data-lucide="x" class="w-8 h-8"></i>
                    </button>
                    <div class="modal-body"><slot></slot></div>
                </div>
            `;
        }

        this.innerHTML = content;

        if (this.querySelector('#btn-no')) this.querySelector('#btn-no').onclick = () => this.close();
        if (this.querySelector('#btn-close-x')) this.querySelector('#btn-close-x').onclick = () => this.close();

        window.playLab.renderLucide();
    }

    open(title, yesCallback, noUpdateText = false) {
        this.classList.remove('hidden');
        if (title && this.querySelector('h3')) this.querySelector('h3').innerText = title;

        if (yesCallback) {
            const yesBtn = this.querySelector('#btn-yes');
            if (yesBtn) {
                yesBtn.onclick = () => {
                    this.close();
                    yesCallback();
                };
            }
        }

        if (!noUpdateText) this.updateText();
    }

    close() {
        this.classList.add('hidden');
        window.playLab.stopTTS();
    }

    updateText() {
        if (this.querySelector('#btn-no')) this.querySelector('#btn-no').innerText = window.playLab.getText('no');
        if (this.querySelector('#btn-yes')) this.querySelector('#btn-yes').innerText = window.playLab.getText('yes');
    }
}
customElements.define('playlab-modal', PlayLabModal);
