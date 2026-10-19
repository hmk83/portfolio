(function () {
    const SUPABASE_URL = 'https://raszgwjmaqhcomudadlt.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhc3pnd2ptYXFoY29tdWRhZGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjE5MjEsImV4cCI6MjA5NDg5NzkyMX0.eFxQw0J_EwOxiuxdYNhS8GlmZ4ss8opTLTqjTx6-iKQ';
    const ACTIVE_PLAY_LOG_KEY = 'jueun_web_learning_active_log';
    const AUTH_STORAGE_KEY = 'sb-raszgwjmaqhcomudadlt-auth-token';
    const UPDATE_INTERVAL_MS = 30000;
    const AUTO_SCORE_SCAN_MS = 1500;
    const AUTO_SCORE_SCAN_LIMIT = 80;
    const DEFAULT_GAME_SCORE_BASELINE = 1000;
    const SCORE_SELECTORS = [
        '[data-jueun-score]',
        '[data-result-score]',
        '[data-final-score]',
        '#final-score',
        '#result-score',
        '#score-text'
    ].join(',');
    const RESULT_CONTEXT_SELECTORS = [
        '[data-jueun-result]',
        '[data-result]',
        '#result-screen',
        '#result-overlay',
        '#result-modal',
        '#game-over',
        '#result-stage-score',
        '.result-screen',
        '.result-overlay',
        '.result-modal',
        '.result-panel',
        '.final-score-panel',
        '.game-over'
    ].join(',');

    const state = {
        scoreRecordedKeys: new Set(),
        scoreScanCount: 0
    };

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (_error) {
            return null;
        }
    }

    function activeLog() {
        const log = readJson(ACTIVE_PLAY_LOG_KEY);
        if (!log?.id || !log?.startedAt) return null;
        return log;
    }

    function writeActiveLog(nextLog) {
        if (!nextLog?.id) return;
        localStorage.setItem(ACTIVE_PLAY_LOG_KEY, JSON.stringify(nextLog));
    }

    function accessToken() {
        const stored = readJson(AUTH_STORAGE_KEY);
        return stored?.access_token || stored?.currentSession?.access_token || '';
    }

    function durationSeconds(startedAt) {
        const started = new Date(startedAt).getTime();
        if (!Number.isFinite(started)) return 0;
        return Math.max(0, Math.round((Date.now() - started) / 1000));
    }

    function normalizeScore(value) {
        if (typeof value === 'number') return Math.max(0, Math.round(value));
        const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
    }

    function clampPercent(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
    }

    function normalizeRankingScore(rawScore, options = {}) {
        const explicit = clampPercent(options.normalizedScore);
        if (explicit !== null) return explicit;

        const maxScore = Number(options.scoreMax || options.maxScore || 0);
        if (Number.isFinite(maxScore) && maxScore > 0) {
            return clampPercent((rawScore / maxScore) * 100);
        }

        if (rawScore <= 100) return clampPercent(rawScore);

        const baseline = Number(options.scoreBaseline || DEFAULT_GAME_SCORE_BASELINE);
        const safeBaseline = Number.isFinite(baseline) && baseline > 0 ? baseline : DEFAULT_GAME_SCORE_BASELINE;
        return clampPercent(100 * (1 - Math.exp(-rawScore / safeBaseline)));
    }

    function formatScore(value) {
        return Number(value || 0).toLocaleString('ko-KR');
    }

    function safeMetadata(value) {
        if (!value || typeof value !== 'object') return {};
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_error) {
            return {};
        }
    }

    function updatePlayLog(useKeepalive = false, extraBody = {}) {
        const log = activeLog();
        const token = accessToken();
        if (!log || !token) return;
        const now = new Date().toISOString();
        const body = JSON.stringify({
            ended_at: now,
            last_seen_at: now,
            duration_seconds: durationSeconds(log.startedAt),
            ...extraBody
        });
        const url = `${SUPABASE_URL}/rest/v1/web_learning_play_logs?id=eq.${encodeURIComponent(log.id)}`;
        return fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body,
            keepalive: useKeepalive
        }).catch(() => {});
    }

    async function recordScore(options = {}) {
        const log = activeLog();
        const token = accessToken();
        const score = normalizeScore(options.score);
        if (!log || !token || score === null) return false;
        const normalizedScore = normalizeRankingScore(score, options);
        const scoreType = options.scoreType || options.score_type || (score <= 100 ? 'percent' : 'points');
        const scoreMax = Number(options.scoreMax || options.score_max || 0) || null;
        const recordKey = `${log.id}:${options.attemptId || score}:${options.scoreLabel || ''}`;
        if (state.scoreRecordedKeys.has(recordKey)) return true;
        state.scoreRecordedKeys.add(recordKey);

        const now = new Date().toISOString();
        const scoreLabel = options.scoreLabel || `${formatScore(score)}점`;
        const metadata = {
            source: options.source || 'manual',
            contentId: log.contentId || log.content_id || '',
            contentTitle: log.contentTitle || log.content_title || '',
            ...safeMetadata(options.metadata)
        };

        await updatePlayLog(false, {
            score,
            raw_score: score,
            normalized_score: normalizedScore,
            score_max: scoreMax,
            score_type: scoreType,
            score_label: scoreLabel,
            score_recorded_at: now,
            completed_at: options.completedAt || now,
            completion_metadata: metadata
        });

        writeActiveLog({
            ...log,
            score,
            rawScore: score,
            normalizedScore,
            scoreMax,
            scoreType,
            scoreLabel,
            scoreRecordedAt: now,
            completedAt: options.completedAt || now
        });
        window.dispatchEvent(new CustomEvent('jueun:web-learning-score-recorded', {
            detail: { score, scoreLabel, playLogId: log.id, metadata }
        }));
        return true;
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function resultContextFor(element) {
        return element.closest(RESULT_CONTEXT_SELECTORS);
    }

    function textLooksFinal(text) {
        return /최종|결과|완료|성공|게임\s*오버|끝났|점수/.test(String(text || ''));
    }

    function findAutoScore() {
        const candidates = Array.from(document.querySelectorAll(SCORE_SELECTORS));
        for (const element of candidates) {
            if (!isVisible(element)) continue;
            const score = normalizeScore(element.dataset.jueunScore || element.dataset.resultScore || element.dataset.finalScore || element.textContent);
            if (score === null) continue;
            const context = resultContextFor(element);
            const contextVisible = context && isVisible(context) && textLooksFinal(context.textContent);
            const bodyFinal = !context && textLooksFinal(document.body?.textContent || '') && /final-score|result-score|score-text/.test(element.id || '');
            if (contextVisible || bodyFinal) {
                return {
                    score,
                    scoreLabel: element.dataset.scoreLabel || `${formatScore(score)}점`,
                    selector: element.id ? `#${element.id}` : element.tagName.toLowerCase()
                };
            }
        }
        return null;
    }

    function scanAutoScore() {
        if (!activeLog()) return;
        state.scoreScanCount += 1;
        const detected = findAutoScore();
        if (detected) {
            recordScore({
                score: detected.score,
                scoreLabel: detected.scoreLabel,
                source: 'auto-dom',
                metadata: { selector: detected.selector }
            });
        }
        if (state.scoreScanCount >= AUTO_SCORE_SCAN_LIMIT) {
            window.clearInterval(scoreScanTimer);
        }
    }

    if (!activeLog()) return;
    window.JueunPlayTracker = {
        update: () => updatePlayLog(false),
        complete: (options = {}) => recordScore(options),
        recordScore,
        getActiveLog: activeLog
    };
    updatePlayLog(false);
    window.setInterval(() => updatePlayLog(false), UPDATE_INTERVAL_MS);
    window.addEventListener('pagehide', () => updatePlayLog(true));
    window.addEventListener('beforeunload', () => updatePlayLog(true));
    const scoreScanTimer = window.setInterval(scanAutoScore, AUTO_SCORE_SCAN_MS);
    const observer = new MutationObserver(scanAutoScore);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'data-jueun-score', 'data-result-score', 'data-final-score']
    });
    window.addEventListener('pagehide', () => observer.disconnect());
})();
