(function () {
    const SUPABASE_URL = 'https://raszgwjmaqhcomudadlt.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhc3pnd2ptYXFoY29tdWRhZGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjE5MjEsImV4cCI6MjA5NDg5NzkyMX0.eFxQw0J_EwOxiuxdYNhS8GlmZ4ss8opTLTqjTx6-iKQ';
    const LEARNER_KEY = 'jueun_web_learning_learner';
    const ACTIVE_PLAY_LOG_KEY = 'jueun_web_learning_active_log';
    const AUTH_STORAGE_KEY = 'sb-raszgwjmaqhcomudadlt-auth-token';
    const SHELL_ID = 'jueun-game-shell';
    const STYLE_ID = 'jueun-game-shell-style';
    const HIDDEN_CLASS = 'jueun-game-shell-hidden';

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (_error) {
            return null;
        }
    }

    function accessToken() {
        const stored = readJson(AUTH_STORAGE_KEY);
        return stored?.access_token || stored?.currentSession?.access_token || '';
    }

    function activeLog() {
        return readJson(ACTIVE_PLAY_LOG_KEY);
    }

    function isStudentLearner(learner) {
        return Boolean(learner && learner.mode !== 'trial' && (learner.studentId || learner.id) && learner.name);
    }

    function learnerFromLog(log) {
        const studentId = log?.studentId || log?.student_id || '';
        const studentName = log?.studentName || log?.student_name || '';
        const learnerMode = log?.learnerMode || log?.learner_mode || '';
        if ((learnerMode === 'student' || studentId) && studentName) {
            return {
                name: studentName,
                gender: log?.studentGender || log?.student_gender || '',
                mode: 'student'
            };
        }
        return null;
    }

    function learnerLabelFromLocal() {
        const learner = readJson(LEARNER_KEY);
        if (isStudentLearner(learner)) return learner.name || '학생';
        const fromLog = learnerFromLog(activeLog());
        if (fromLog) return fromLog.name;
        return '';
    }

    function gameTitle() {
        const log = activeLog();
        return String(log?.contentTitle || log?.content_title || document.title || '웹학습 게임').trim();
    }

    function projectRootUrl() {
        const currentScript = document.currentScript?.src || '';
        if (currentScript.includes('/js/web-learning-game-shell.js')) {
            return currentScript.replace(/\/js\/web-learning-game-shell\.js(?:\?.*)?$/, '/');
        }
        const marker = '/game/';
        if (window.location.href.includes(marker)) {
            return window.location.href.slice(0, window.location.href.indexOf(marker) + 1);
        }
        return './';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root{--gnb-height:56px!important;--header-height:56px!important;--jueun-game-shell-height:56px}
            .${HIDDEN_CLASS}{display:none!important}
            #${SHELL_ID}{position:relative;z-index:10050;display:flex;flex:0 0 var(--jueun-game-shell-height);width:100%;height:var(--jueun-game-shell-height);min-height:var(--jueun-game-shell-height);align-items:center;justify-content:space-between;gap:14px;padding:0 14px;box-sizing:border-box;background:linear-gradient(135deg,#7c3aed 0%,#2563eb 100%);color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.2);font-family:'Jua','Apple SD Gothic Neo','Malgun Gothic',sans-serif}
            #${SHELL_ID} *{box-sizing:border-box}
            .jueun-game-shell-info{display:flex;align-items:center;gap:10px;min-width:0}
            .jueun-game-shell-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:11px;background:rgba(255,255,255,.18);font-size:17px;font-weight:900;line-height:1}
            .jueun-game-shell-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
            .jueun-game-shell-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:900;line-height:1.12;letter-spacing:0}
            .jueun-game-shell-learner{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:800;color:rgba(255,255,255,.78);line-height:1.1}
            .jueun-game-shell-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
            .jueun-game-shell-btn{height:34px;border:1px solid rgba(255,255,255,.26);border-radius:999px;padding:0 13px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:900;font-family:inherit;white-space:nowrap;cursor:pointer;box-shadow:0 6px 14px rgba(15,23,42,.14)}
            .jueun-game-shell-btn:hover{background:rgba(255,255,255,.22)}
            .jueun-game-shell-btn.is-exit{background:rgba(15,23,42,.5);border-color:rgba(15,23,42,.12)}
            .jueun-game-shell-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.58);font-family:'Jua','Apple SD Gothic Neo','Malgun Gothic',sans-serif}
            .jueun-game-shell-dialog{width:min(360px,100%);border-radius:22px;background:#fff;padding:24px 20px;color:#111827;text-align:center;box-shadow:0 26px 80px rgba(15,23,42,.26)}
            .jueun-game-shell-dialog h2{margin:0;font-size:21px;font-weight:900;letter-spacing:0}
            .jueun-game-shell-dialog p{margin:10px 0 0;color:#64748b;font-size:14px;font-weight:800;line-height:1.55}
            .jueun-game-shell-dialog-actions{display:flex;gap:10px;margin-top:20px}
            .jueun-game-shell-dialog-actions button{flex:1;height:44px;border:0;border-radius:16px;font-family:inherit;font-size:14px;font-weight:900;cursor:pointer}
            .jueun-game-shell-cancel{background:#e5e7eb;color:#334155}
            .jueun-game-shell-confirm{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff}
            @media (max-width:560px){#${SHELL_ID}{height:52px;min-height:52px;--jueun-game-shell-height:52px;padding:0 10px}.jueun-game-shell-icon{display:none}.jueun-game-shell-title{font-size:14px}.jueun-game-shell-learner{font-size:11px}.jueun-game-shell-btn{height:32px;padding:0 10px}}
        `;
        document.head.appendChild(style);
    }

    function hideLegacyGnb() {
        document.querySelectorAll('#gnb, .kakao-header, .game-header, .app-header, body > header, body > nav').forEach((element) => {
            if (element.id === SHELL_ID || element.closest(`#${SHELL_ID}`)) return;
            element.classList.add(HIDDEN_CLASS);
            element.setAttribute('aria-hidden', 'true');
        });
    }

    function normalizeLegacyOffsets(shell) {
        const shellHeight = shell.getBoundingClientRect().height || 56;
        const children = Array.from(document.body.children).filter((element) => {
            if (element.id === SHELL_ID || element.id === STYLE_ID || element.id === 'jueun-game-shell-modal') return false;
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'LINK') return false;
            if (element.classList.contains(HIDDEN_CLASS)) return false;
            return true;
        });

        children.slice(0, 3).forEach((element) => {
            const style = window.getComputedStyle(element);
            const marginTop = parseFloat(style.marginTop || '0');
            if (marginTop >= shellHeight * 0.6 && marginTop <= shellHeight * 1.8) {
                element.style.marginTop = '0px';
                element.dataset.jueunGameShellOffsetFixed = 'true';
            }
        });
    }

    function showConfirm({ title, message, confirmText, onConfirm }) {
        document.getElementById('jueun-game-shell-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'jueun-game-shell-modal';
        modal.className = 'jueun-game-shell-modal';
        modal.innerHTML = `
            <section class="jueun-game-shell-dialog" role="dialog" aria-modal="true">
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(message)}</p>
                <div class="jueun-game-shell-dialog-actions">
                    <button type="button" class="jueun-game-shell-cancel">취소</button>
                    <button type="button" class="jueun-game-shell-confirm">${escapeHtml(confirmText)}</button>
                </div>
            </section>
        `;
        modal.querySelector('.jueun-game-shell-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.remove();
        });
        modal.querySelector('.jueun-game-shell-confirm').addEventListener('click', () => {
            modal.remove();
            onConfirm();
        });
        document.body.appendChild(modal);
    }

    function goIntro() {
        showConfirm({
            title: '처음으로 돌아갈까요?',
            message: '현재 게임을 멈추고 인트로 화면으로 돌아갑니다.',
            confirmText: '처음으로',
            onConfirm: () => window.location.reload()
        });
    }

    function exitGame() {
        showConfirm({
            title: '학습을 종료할까요?',
            message: '이전 웹학습 화면으로 돌아갑니다.',
            confirmText: '종료',
            onConfirm: () => {
                if (window.history.length > 1) {
                    window.history.back();
                    return;
                }
                window.location.href = new URL('game-study.html', projectRootUrl()).toString();
            }
        });
    }

    async function fetchLearnerFromPlayLog() {
        const log = activeLog();
        const token = accessToken();
        const id = log?.id || '';
        if (!id || !token) return '';
        const query = new URLSearchParams();
        query.set('select', 'student_id,student_name,student_gender,learner_mode');
        query.set('id', `eq.${id}`);
        query.set('limit', '1');
        const response = await fetch(`${SUPABASE_URL}/rest/v1/web_learning_play_logs?${query.toString()}`, {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`
            }
        });
        const rows = response.ok ? await response.json() : [];
        return learnerFromLog(rows?.[0])?.name || '';
    }

    async function updateLearnerLabel(shell) {
        const label = shell.querySelector('[data-game-shell-learner]');
        if (!label) return;
        const localName = learnerLabelFromLocal();
        label.textContent = localName || '게스트';
        if (localName) return;
        try {
            const remoteName = await fetchLearnerFromPlayLog();
            if (remoteName) label.textContent = remoteName;
        } catch (_error) {
            label.textContent = '게스트';
        }
    }

    function mountShell() {
        ensureStyle();
        hideLegacyGnb();
        document.getElementById(SHELL_ID)?.remove();

        const shell = document.createElement('header');
        shell.id = SHELL_ID;
        shell.setAttribute('role', 'banner');
        shell.innerHTML = `
            <div class="jueun-game-shell-info">
                <span class="jueun-game-shell-icon" aria-hidden="true">♪</span>
                <div class="jueun-game-shell-copy">
                    <strong class="jueun-game-shell-title">${escapeHtml(gameTitle())}</strong>
                    <span class="jueun-game-shell-learner" data-game-shell-learner>게스트</span>
                </div>
            </div>
            <div class="jueun-game-shell-actions">
                <button type="button" class="jueun-game-shell-btn" data-game-shell-home>처음으로</button>
                <button type="button" class="jueun-game-shell-btn is-exit" data-game-shell-exit>종료</button>
            </div>
        `;
        shell.querySelector('[data-game-shell-home]').addEventListener('click', goIntro);
        shell.querySelector('[data-game-shell-exit]').addEventListener('click', exitGame);
        document.body.insertBefore(shell, document.body.firstChild);
        updateLearnerLabel(shell);
        normalizeLegacyOffsets(shell);
        window.addEventListener('load', () => normalizeLegacyOffsets(shell), { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountShell);
    } else {
        mountShell();
    }
})();
