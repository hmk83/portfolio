(function () {
    const SCRIPT_SELECTOR = 'script[src*="web-learning-midi-status.js"]';
    const LEGACY_SELECTORS = [
        '#midi-status',
        '#midi-status-intro',
        '#intro-midi-status',
        '#midi-status-box',
        '#midi-status-text',
        '#intro-midi-text',
        '#status-bar',
        '#status-dot',
        '#status-text',
        '#game-midi-status',
        '#midi-status-mini',
        '#midi-state-text-mini',
        '#midi-summary',
        '#midi-intro-status',
        '#midi-intro-text',
        '#midi-connection-status',
        '.midi-status-box',
        '.midi-status-badge',
        '.midi-indicator',
        '.midi-dot',
        '.midi-summary',
        '.connect-box',
        '[id*="midi"][id*="status"]:not(#jueun-midi-status)',
        '[class*="midi"][class*="status"]:not(.jueun-midi-status)',
        '[class*="midi-indicator"]:not(.jueun-midi-status)',
        '[data-jueun-midi-legacy]'
    ].join(',');

    const state = {
        instrument: detectInstrument(),
        connected: false,
        initialized: false,
        learningStarted: false
    };

    function detectInstrument() {
        const script = document.currentScript || document.querySelector(SCRIPT_SELECTOR);
        const configured = script?.dataset?.instrument || '';
        if (/drum/i.test(configured)) return 'drum';
        if (/piano/i.test(configured)) return 'piano';
        const path = window.location.pathname || '';
        if (/\/drum\//i.test(path)) return 'drum';
        return 'piano';
    }

    function labelFor(connected) {
        if (state.instrument === 'drum') {
            return connected ? '드럼이 연결되었습니다.' : '드럼이 연결되지 않았습니다.';
        }
        return connected ? '피아노가 연결되었습니다.' : '피아노가 연결되지 않았습니다.';
    }

    function ensureStyle() {
        if (document.getElementById('jueun-midi-status-style')) return;
        const style = document.createElement('style');
        style.id = 'jueun-midi-status-style';
        style.textContent = `
            ${LEGACY_SELECTORS}{display:none!important}
            .jueun-midi-status{
                position:fixed;
                left:50%;
                bottom:22px;
                transform:translateX(-50%);
                z-index:99980;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:9px;
                min-width:230px;
                min-height:42px;
                padding:10px 18px;
                border-radius:999px;
                border:1px solid rgba(148,163,184,.42);
                background:rgba(15,23,42,.84);
                color:#e5e7eb;
                font-family:inherit;
                font-size:14px;
                font-weight:800;
                line-height:1;
                letter-spacing:0;
                box-shadow:0 12px 30px rgba(15,23,42,.22);
                backdrop-filter:blur(12px);
                -webkit-backdrop-filter:blur(12px);
                pointer-events:none;
                white-space:nowrap;
            }
            .jueun-midi-status::before{
                content:'';
                width:10px;
                height:10px;
                border-radius:50%;
                flex:0 0 auto;
                background:#ef4444;
                box-shadow:0 0 0 5px rgba(239,68,68,.14);
            }
            .jueun-midi-status.is-connected{
                border-color:rgba(34,197,94,.56);
                background:linear-gradient(135deg,rgba(16,185,129,.94),rgba(37,99,235,.94));
                color:#fff;
                box-shadow:0 14px 34px rgba(37,99,235,.24);
            }
            .jueun-midi-status.is-connected::before{
                background:#bbf7d0;
                box-shadow:0 0 0 5px rgba(187,247,208,.24);
            }
            .jueun-midi-status.is-hidden{display:none!important}
            @media (max-width:560px){
                .jueun-midi-status{
                    bottom:14px;
                    min-width:0;
                    max-width:calc(100vw - 28px);
                    padding:9px 14px;
                    font-size:13px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureBadge() {
        ensureStyle();
        let badge = document.getElementById('jueun-midi-status');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'jueun-midi-status';
            badge.className = 'jueun-midi-status';
            badge.setAttribute('role', 'status');
            badge.setAttribute('aria-live', 'polite');
            document.body.appendChild(badge);
        }
        return badge;
    }

    function cleanupLegacyStatus() {
        document.querySelectorAll(LEGACY_SELECTORS).forEach((element) => {
            if (element.id === 'jueun-midi-status') return;
            element.setAttribute('hidden', '');
            element.setAttribute('aria-hidden', 'true');
            element.dataset.jueunMidiDeleted = 'true';
        });
    }

    function hideBadge() {
        const badge = document.getElementById('jueun-midi-status');
        if (badge) {
            badge.classList.add('is-hidden');
            badge.setAttribute('aria-hidden', 'true');
        }
    }

    function showBadge() {
        const badge = ensureBadge();
        badge.classList.remove('is-hidden');
        badge.removeAttribute('aria-hidden');
        return badge;
    }

    function setStatus(connected) {
        state.connected = Boolean(connected);
        cleanupLegacyStatus();
        if (state.learningStarted) {
            hideBadge();
            return;
        }
        const badge = showBadge();
        badge.classList.toggle('is-connected', state.connected);
        badge.textContent = labelFor(state.connected);
    }

    function buttonText(target) {
        return String(target?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isLearningStartTarget(target) {
        const button = target?.closest?.('button,a,[role="button"],.btn,.start-button');
        if (!button) return false;
        if (button.closest?.('.jueun-rank-backdrop')) return false;
        const text = buttonText(button);
        const action = String(button.getAttribute?.('onclick') || '') + ' ' + String(button.id || '') + ' ' + String(button.className || '');
        if (/게임\s*방법|튜토리얼|랭킹|ranking|처음|종료|닫기|확인|다시|retry/i.test(text)) return false;
        return /(게임\s*시작|플레이|play|start|훈련하기|준비\s*완료|begin|checkMidiAndStart|startGame|beginPerformance|start-play|btn-start)/i.test(`${text} ${action}`);
    }

    function markLearningStarted() {
        if (state.learningStarted) return;
        state.learningStarted = true;
        hideBadge();
    }

    function bindLearningStartDetection() {
        document.addEventListener('click', (event) => {
            if (isLearningStartTarget(event.target)) {
                window.setTimeout(markLearningStarted, 80);
            }
        }, true);
        document.addEventListener('pointerdown', (event) => {
            if (isLearningStartTarget(event.target)) {
                window.setTimeout(markLearningStarted, 80);
            }
        }, true);
        window.addEventListener('jueun-web-learning-started', markLearningStarted);
    }

    function hasConnectedInput(midiAccess) {
        if (!midiAccess?.inputs) return false;
        for (const input of midiAccess.inputs.values()) {
            if (input.state === 'connected' || input.connection === 'open' || input.connection === 'pending' || !input.state) {
                return true;
            }
        }
        return false;
    }

    function bindMidiAccess(midiAccess) {
        const update = () => setStatus(hasConnectedInput(midiAccess));
        update();
        if (typeof midiAccess.addEventListener === 'function') {
            midiAccess.addEventListener('statechange', update);
        } else {
            const previous = midiAccess.onstatechange;
            midiAccess.onstatechange = function (event) {
                update();
                if (typeof previous === 'function') previous.call(this, event);
            };
        }
    }

    function requestStatus() {
        setStatus(false);
        if (!navigator.requestMIDIAccess) return;
        navigator.requestMIDIAccess().then(bindMidiAccess).catch(() => setStatus(false));
    }

    function boot() {
        if (state.initialized) return;
        state.initialized = true;
        cleanupLegacyStatus();
        requestStatus();
        bindLearningStartDetection();
        const observer = new MutationObserver(cleanupLegacyStatus);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    window.JueunMidiStatus = {
        set: setStatus,
        setConnected: setStatus,
        refresh: requestStatus,
        instrument: state.instrument
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
}());
