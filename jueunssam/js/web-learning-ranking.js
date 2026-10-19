(function () {
    const SUPABASE_URL = 'https://raszgwjmaqhcomudadlt.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhc3pnd2ptYXFoY29tdWRhZGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjE5MjEsImV4cCI6MjA5NDg5NzkyMX0.eFxQw0J_EwOxiuxdYNhS8GlmZ4ss8opTLTqjTx6-iKQ';
    const RANK_TABLE = 'web_learning_rank_scores';
    const RANK_READ_VIEW = 'web_learning_current_rank_scores';
    const LEARNER_KEY = 'jueun_web_learning_learner';
    const ACTIVE_PLAY_LOG_KEY = 'jueun_web_learning_active_log';
    const AUTH_STORAGE_KEY = 'sb-raszgwjmaqhcomudadlt-auth-token';
    const RANKING_DISPLAY_LIMIT = 100;
    const MY_RANK_SCAN_LIMIT = 5000;
    const REQUEST_TIMEOUT_MS = 3500;
    const DEFAULT_GAME_SCORE_BASELINE = 1000;
    const AUTO_SCORE_SCAN_MS = 1200;
    const AUTO_SCORE_SCAN_LIMIT = 120;
    const RESULT_SCORE_SELECTORS = [
        '[data-jueun-score]',
        '[data-result-score]',
        '[data-final-score]',
        '#final-score',
        '#finalScore',
        '#final-score-display',
        '#result-score'
    ].join(',');
    const RESULT_CONTEXT_SELECTORS = [
        '[data-jueun-result]',
        '[data-result]',
        '#screen-result',
        '#modal-result',
        '#gameOverOverlay',
        '#game-over-ui',
        '#game-over-modal',
        '#game-over-screen',
        '#screen-gameover',
        '.game-over-overlay',
        '.result-screen',
        '.result-overlay',
        '.result-modal',
        '.result-panel',
        '.final-score-panel',
        '.game-over'
    ].join(',');

    const state = {
        completedKeys: new Set(),
        autoScoreScanCount: 0,
        autoCompleteTimer: 0,
        autoResultHandled: false,
        resultModalRequested: false,
        learningActive: false
    };

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

    function readLearner(log = null) {
        const learner = readJson(LEARNER_KEY);
        if (isStudentLearner(learner)) return learner;

        const logStudentId = log?.studentId || log?.student_id || '';
        const logStudentName = log?.studentName || log?.student_name || '';
        const logLearnerMode = log?.learnerMode || log?.learner_mode || '';
        if ((logLearnerMode === 'student' || logStudentId) && logStudentName) {
            return {
                mode: 'student',
                studentId: logStudentId,
                id: logStudentId,
                name: logStudentName,
                gender: log?.studentGender || log?.student_gender || ''
            };
        }

        return {
            mode: 'trial',
            studentId: '',
            id: '',
            name: '게스트',
            gender: ''
        };
    }

    function activeLog() {
        return readJson(ACTIVE_PLAY_LOG_KEY);
    }

    function isStudentLearner(learner) {
        return Boolean(learner && learner.mode !== 'trial' && (learner.studentId || learner.id) && learner.name);
    }

    function normalizeScore(value) {
        if (typeof value === 'number') return Math.max(0, Math.round(value));
        const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function resultContextFor(element) {
        return element?.closest?.(RESULT_CONTEXT_SELECTORS);
    }

    function textLooksFinal(value) {
        return /최종|결과|완료|성공|게임\s*오버|game\s*over|mission|complete|fantastic|score|점수/i.test(String(value || ''));
    }

    function findResultScore() {
        const candidates = Array.from(document.querySelectorAll(RESULT_SCORE_SELECTORS));
        for (const element of candidates) {
            if (!isVisible(element)) continue;
            const context = resultContextFor(element);
            if (!context || !isVisible(context) || !textLooksFinal(context.textContent)) continue;
            const score = normalizeScore(element.dataset.jueunScore || element.dataset.resultScore || element.dataset.finalScore || element.textContent);
            if (score <= 0 && !textLooksFinal(context.textContent)) continue;
            return {
                score,
                scoreLabel: element.dataset.scoreLabel || `${formatNumber(score)}점`,
                selector: element.id ? `#${element.id}` : element.tagName.toLowerCase()
            };
        }
        return null;
    }

    function clampPercent(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
    }

    function normalizeRankingScore(rawScore, options = {}) {
        if (options.normalizedScore !== undefined || options.normalized_score !== undefined) {
            return clampPercent(options.normalizedScore ?? options.normalized_score);
        }

        const scoreMax = Number(options.scoreMax || options.score_max || 0);
        if (Number.isFinite(scoreMax) && scoreMax > 0) {
            return clampPercent((rawScore / scoreMax) * 100);
        }

        if (rawScore <= 100) return clampPercent(rawScore);

        const baseline = Number(options.scoreBaseline || DEFAULT_GAME_SCORE_BASELINE);
        const safeBaseline = Number.isFinite(baseline) && baseline > 0 ? baseline : DEFAULT_GAME_SCORE_BASELINE;
        return clampPercent(100 * (1 - Math.exp(-rawScore / safeBaseline)));
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('ko-KR');
    }

    function contentIdentity(options = {}) {
        const log = activeLog();
        const pathname = window.location.pathname || '';
        const fallbackId = pathname.split('/').filter(Boolean).pop() || document.title || 'web-learning-game';
        return {
            contentId: String(log?.contentId || log?.content_id || options.contentId || fallbackId),
            contentTitle: String(log?.contentTitle || log?.content_title || options.gameTitle || document.title || '웹학습 게임'),
            playLogId: log?.id || ''
        };
    }

    function academyNameFromProfile(profile) {
        if (!profile) return '';
        if (profile.member_type === 'organization') {
            return profile.organization_name || profile.academy_name || '';
        }
        return profile.academy_name || profile.organization_name || '';
    }

    function localAcademyName() {
        const session = window.JueunMockAuth?.getSession?.() || {};
        if (session.memberType === 'organization') {
            return session.organizationName || session.organization_name || session.academyName || session.academy_name || '';
        }
        return session.academyName || session.academy_name || session.organizationName || session.organization_name || '';
    }

    function localAcademyRegion() {
        const session = window.JueunMockAuth?.getSession?.() || {};
        return session.academyRegion || session.academy_region || '미지역';
    }

    function localAcademyCity() {
        const session = window.JueunMockAuth?.getSession?.() || {};
        return session.academyCity || session.academy_city || '미등록';
    }

    function headers(token) {
        const bearer = token || SUPABASE_ANON_KEY;
        return {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json'
        };
    }

    async function fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function supabaseGet(path, token, options = {}) {
        const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
            method: 'GET',
            headers: {
                ...headers(token),
                ...(options.count ? { Prefer: 'count=exact' } : {})
            }
        });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;
        if (!response.ok) {
            throw new Error(payload?.message || `Supabase request failed: ${response.status}`);
        }
        return payload;
    }

    async function supabaseGetWithCount(path, token) {
        const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
            method: 'GET',
            headers: {
                ...headers(token),
                Prefer: 'count=exact'
            }
        });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : [];
        if (!response.ok) {
            throw new Error(payload?.message || `Supabase request failed: ${response.status}`);
        }
        return {
            rows: Array.isArray(payload) ? payload : [],
            totalCount: parseContentRangeTotal(response.headers.get('content-range'))
        };
    }

    async function supabasePost(path, body, token, options = {}) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
        if (options.onConflict) {
            url.searchParams.set('on_conflict', options.onConflict);
        }
        const prefer = ['return=representation'];
        if (options.ignoreDuplicates) {
            prefer.unshift('resolution=ignore-duplicates');
        } else if (options.onConflict) {
            prefer.unshift('resolution=merge-duplicates');
        }
        const response = await fetchWithTimeout(url.toString(), {
            method: 'POST',
            headers: {
                ...headers(token),
                Prefer: prefer.join(',')
            },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;
        if (!response.ok) {
            throw new Error(payload?.message || `Supabase request failed: ${response.status}`);
        }
        return Array.isArray(payload) ? payload[0] : payload;
    }

    async function fetchRankScoreByAttempt(attemptId, token) {
        if (!attemptId || !token) return null;
        const query = [
            RANK_READ_VIEW,
            '?select=id,member_profile_id,student_id,student_name,student_gender,academy_name,academy_region,academy_city,content_id,content_title,score,raw_score,normalized_score,score_label,played_at,attempt_id',
            `&attempt_id=eq.${encodeURIComponent(attemptId)}`,
            '&limit=1'
        ].join('');
        const rows = await supabaseGet(query, token);
        return rows?.[0] || null;
    }

    async function fetchProfile(memberProfileId, token) {
        if (!memberProfileId || !token) return null;
        const query = [
            'member_profiles',
            '?select=id,name,member_type,academy_name,organization_name,academy_region,academy_city',
            `&id=eq.${encodeURIComponent(memberProfileId)}`,
            '&limit=1'
        ].join('');
        const rows = await supabaseGet(query, token);
        return rows?.[0] || null;
    }

    async function fetchPlayLog(playLogId, token) {
        if (!playLogId || !token) return null;
        const query = [
            'web_learning_play_logs',
            '?select=id,member_profile_id,student_id,student_name,student_gender,learner_mode,academy_name,academy_region,academy_city',
            `&id=eq.${encodeURIComponent(playLogId)}`,
            '&limit=1'
        ].join('');
        const rows = await supabaseGet(query, token);
        return rows?.[0] || null;
    }

    function applyPlayLogLearner(context, playLog) {
        if (!context || !playLog) return;
        const studentId = playLog.student_id || '';
        const studentName = playLog.student_name || '';
        const learnerMode = playLog.learner_mode || '';
        if ((learnerMode === 'student' || studentId) && studentName) {
            context.studentId = studentId;
            context.studentName = studentName;
            context.studentGender = playLog.student_gender || context.studentGender || '';
            context.memberProfileId = playLog.member_profile_id || context.memberProfileId || '';
            context.academyName = playLog.academy_name || context.academyName || '';
            context.academyRegion = playLog.academy_region || context.academyRegion || '미지역';
            context.academyCity = playLog.academy_city || context.academyCity || '미등록';
            context.isGuest = false;
        }
    }

    async function hydrateLearnerFromPlayLog(context) {
        if (!context?.isGuest || !context.playLogId || !context.token) return;
        try {
            applyPlayLogLearner(context, await fetchPlayLog(context.playLogId, context.token));
        } catch (_error) {
            // Local learner data is enough for normal runs; this fallback is best-effort.
        }
    }

    function parseContentRangeTotal(value) {
        if (!value) return null;
        const total = String(value).split('/').pop();
        if (!total || total === '*') return null;
        const parsed = Number(total);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function rankingPath(params) {
        const search = new URLSearchParams();
        search.set('select', 'id,member_profile_id,student_id,student_name,student_gender,academy_name,academy_region,academy_city,content_id,content_title,score,raw_score,normalized_score,score_label,played_at');
        search.set('content_id', `eq.${params.contentId}`);
        search.set('order', 'normalized_score.desc,student_name.asc,played_at.asc');
        search.set('limit', String(params.limit || RANKING_DISPLAY_LIMIT));
        search.append('academy_name', 'not.is.null');
        search.append('academy_name', 'neq.');
        search.append('academy_name', 'neq.소속 정보 없음');
        if (params.academyName) search.set('academy_name', `eq.${params.academyName}`);
        return `${RANK_READ_VIEW}?${search.toString()}`;
    }

    function rankScore(row) {
        return Number(row?.normalized_score ?? row?.score ?? 0);
    }

    function rowsWithDisplayRank(rows) {
        let previousScore = null;
        let previousRank = null;
        let denseRank = 0;
        return (rows || []).map((row, index) => {
            const score = rankScore(row);
            let rank = '-';
            if (score > 0) {
                if (previousScore !== null && score === previousScore) {
                    rank = previousRank;
                } else {
                    rank = denseRank + 1;
                    denseRank = rank;
                    previousScore = score;
                    previousRank = rank;
                }
            }
            return { row, rank };
        });
    }

    async function fetchRows(scope, context) {
        return supabaseGetWithCount(rankingPath({
            contentId: context.contentId,
            academyName: scope === 'academy' ? context.academyName : '',
            limit: RANKING_DISPLAY_LIMIT
        }), context.token);
    }

    async function fetchMyRank(context, scope = 'all') {
        if (!context.insertedRow?.id) return null;
        const rows = await supabaseGet(rankingPath({
            contentId: context.contentId,
            academyName: scope === 'academy' ? context.academyName : '',
            limit: MY_RANK_SCAN_LIMIT
        }), context.token);
        const rankedRows = rowsWithDisplayRank(rows);
        const ranked = rankedRows.find((item) => item.row.id === context.insertedRow.id);
        return ranked ? { rank: ranked.rank, row: ranked.row } : null;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function initialFromName(name) {
        const trimmed = String(name || '게스트').trim();
        return trimmed ? Array.from(trimmed)[0] : '게';
    }

    function genderClass(gender) {
        return gender === 'female' ? 'is-female' : 'is-male';
    }

    function ensureStyle() {
        if (document.getElementById('jueun-ranking-style')) return;
        const style = document.createElement('style');
        style.id = 'jueun-ranking-style';
        style.textContent = `
            .jueun-rank-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.58);padding:20px;font-family:inherit}
            .jueun-rank-modal{width:min(520px,100%);max-height:86vh;overflow:hidden;border-radius:22px;background:#fff;box-shadow:0 26px 80px rgba(15,23,42,.28);color:#1f2937;display:flex;flex-direction:column}
            .jueun-rank-hero{padding:24px 22px 18px;background:linear-gradient(145deg,#7c3aed,#2563eb);color:#fff}
            .jueun-rank-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
            .jueun-rank-title{margin:0;font-size:24px;font-weight:900;letter-spacing:0;line-height:1.2}
            .jueun-rank-count{margin-top:10px;display:block;font-size:13px;font-weight:900;color:#fff;line-height:1.2}
            .jueun-rank-close{width:34px;height:34px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.12);font-size:22px;line-height:1;color:#fff;cursor:pointer}
            .jueun-rank-podium{display:grid;grid-template-columns:1fr 1.16fr 1fr;align-items:end;gap:8px;margin-top:20px}
            .jueun-rank-podium-item{min-width:0;text-align:center}
            .jueun-rank-podium-item:first-child{order:1}.jueun-rank-podium-item:nth-child(2){order:0}.jueun-rank-podium-item:nth-child(3){order:2}
            .jueun-rank-podium-avatar{position:relative;margin:0 auto 8px;width:58px;height:58px;border-radius:999px;display:grid;place-items:center;background:#e0f2fe;color:#0369a1;font-size:25px;font-weight:900;box-shadow:0 10px 22px rgba(15,23,42,.18)}
            .jueun-rank-podium-item:first-child .jueun-rank-podium-avatar{width:78px;height:78px;font-size:34px;background:#fef3c7;color:#b45309}
            .jueun-rank-medal{position:absolute;left:-4px;top:-5px;display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#f59e0b;color:#fff;font-size:14px;font-weight:900;border:2px solid rgba(255,255,255,.78)}
            .jueun-rank-podium-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:900}
            .jueun-rank-podium-score{display:inline-block;margin-top:5px;border-radius:999px;background:rgba(15,23,42,.34);padding:5px 9px;font-size:12px;font-weight:900}
            .jueun-rank-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e5e7eb;background:#fff}
            .jueun-rank-tab{height:48px;border:0;background:#fff;color:#64748b;font-size:14px;font-weight:900;cursor:pointer}
            .jueun-rank-tab.active{color:#111827;box-shadow:inset 0 -3px 0 #8b5cf6}
            .jueun-rank-tab:disabled{opacity:.45;cursor:not-allowed}
            .jueun-rank-body{overflow:auto;max-height:calc(86vh - 230px);background:#fff;flex:1 1 auto;min-height:0}
            .jueun-rank-list{margin:0;padding:8px 0;list-style:none}
            .jueun-rank-row{display:grid;grid-template-columns:34px 42px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #f1f5f9}
            .jueun-rank-row.is-mine{background:#eff6ff;border-top:1px solid #bfdbfe;border-bottom:1px solid #bfdbfe}
            .jueun-rank-row:last-child{border-bottom:0}
            .jueun-rank-ellipsis{display:flex;align-items:center;justify-content:center;padding:11px 18px;color:#94a3b8;font-size:22px;font-weight:900;letter-spacing:.12em;border-bottom:1px solid #f1f5f9}
            .jueun-rank-number{font-size:13px;font-weight:900;color:#cbd5e1;text-align:center}
            .jueun-rank-avatar{width:40px;height:40px;border-radius:999px;display:grid;place-items:center;color:#fff;font-size:17px;font-weight:900}
            .jueun-rank-avatar.is-female{background:#f472b6}
            .jueun-rank-avatar.is-male{background:#38bdf8}
            .jueun-rank-person{min-width:0}
            .jueun-rank-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:900;color:#374151}
            .jueun-rank-academy{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:11px;font-weight:800;color:#94a3b8}
            .jueun-rank-score{font-size:14px;font-weight:900;color:#334155;white-space:nowrap}
            .jueun-rank-empty{padding:28px 18px;text-align:center;color:#64748b;font-size:13px;font-weight:800}
            .jueun-rank-note{margin:10px 18px 16px;padding:11px 12px;border-radius:13px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800}
            .jueun-rank-my-score{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #e5e7eb;background:#f8fafc;padding:14px 18px}
            .jueun-rank-my-score small{display:block;margin-bottom:3px;color:#64748b;font-size:11px;font-weight:900;letter-spacing:.08em}
            .jueun-rank-my-score strong{display:block;font-size:16px;line-height:1.15;color:#111827}
            .jueun-rank-my-score span{display:block;margin-top:4px;font-size:12px;font-weight:800;color:#2563eb}
            .jueun-rank-action{border:0;border-radius:999px;background:#111827;color:#fff;font-size:13px;font-weight:900;padding:10px 13px;cursor:pointer;white-space:nowrap}
            .jueun-rank-extra{flex:0 0 auto;background:#fff}
            .jueun-rank-floating-button{position:fixed;right:22px;top:76px;z-index:99970;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:118px;height:44px;padding:0 18px;border:2px solid rgba(255,255,255,.82);border-radius:999px;background:linear-gradient(135deg,#f59e0b,#f97316 48%,#7c3aed);color:#fff;font-family:inherit;font-size:16px;font-weight:900;line-height:1;letter-spacing:0;box-shadow:0 12px 28px rgba(124,58,237,.32),0 0 0 4px rgba(245,158,11,.16);text-shadow:0 2px 0 rgba(88,28,135,.34);cursor:pointer;transform:translateZ(0);transition:transform .14s ease,filter .14s ease,box-shadow .14s ease}
            .jueun-rank-floating-button::before{content:'★';display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#fff;color:#f59e0b;font-size:14px;text-shadow:none;box-shadow:inset 0 -2px 0 rgba(15,23,42,.16)}
            .jueun-rank-floating-button:hover{transform:translateY(-2px);filter:saturate(1.1);box-shadow:0 16px 34px rgba(124,58,237,.36),0 0 0 4px rgba(245,158,11,.22)}
            .jueun-rank-floating-button:active{transform:translateY(1px) scale(.98)}
            @media (max-width:520px){.jueun-rank-backdrop{padding:10px}.jueun-rank-hero{padding:20px 16px 16px}.jueun-rank-body{max-height:calc(86vh - 218px)}.jueun-rank-row{grid-template-columns:28px 38px minmax(0,1fr) auto;padding-left:13px;padding-right:13px;gap:8px}.jueun-rank-avatar{width:36px;height:36px}.jueun-rank-score{font-size:13px}}
            @media (max-width:520px){.jueun-rank-floating-button{right:12px;top:68px;min-width:96px;height:38px;padding:0 13px;font-size:14px}.jueun-rank-floating-button::before{width:19px;height:19px;font-size:12px}}
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        ensureStyle();
        state.resultModalRequested = true;
        let modal = document.getElementById('jueun-ranking-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'jueun-ranking-modal';
        modal.className = 'jueun-rank-backdrop';
        modal.innerHTML = `
            <section class="jueun-rank-modal" role="dialog" aria-modal="true" aria-labelledby="jueun-rank-title">
                <div class="jueun-rank-hero">
                    <div class="jueun-rank-top">
                        <div>
                            <h2 class="jueun-rank-title" id="jueun-rank-title">랭킹</h2>
                            <div class="jueun-rank-count">총 0명 참여중</div>
                        </div>
                        <button type="button" class="jueun-rank-close" aria-label="닫기">x</button>
                    </div>
                    <div class="jueun-rank-podium"></div>
                </div>
                <div class="jueun-rank-tabs">
                    <button type="button" class="jueun-rank-tab active" data-scope="academy">학원내</button>
                    <button type="button" class="jueun-rank-tab" data-scope="all">전체</button>
                </div>
                <div class="jueun-rank-body">
                    <div class="jueun-rank-list-wrap"></div>
                </div>
                <div class="jueun-rank-extra"></div>
            </section>
        `;
        modal.querySelector('.jueun-rank-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
        return modal;
    }

    function scoreLabel(row) {
        return row.score_label || `${formatNumber(row.score)}점`;
    }

    function renderPodium(modal, rows) {
        const podium = modal.querySelector('.jueun-rank-podium');
        const topRows = (rows || []).slice(0, 3);
        podium.innerHTML = topRows.map((row, index) => `
            <div class="jueun-rank-podium-item">
                <div class="jueun-rank-podium-avatar">
                    <span class="jueun-rank-medal">${index + 1}</span>
                    ${escapeHtml(initialFromName(row.student_name))}
                </div>
                <div class="jueun-rank-podium-name">${escapeHtml(row.student_name || '게스트')}</div>
                <span class="jueun-rank-podium-score">${escapeHtml(scoreLabel(row))}</span>
            </div>
        `).join('');
    }

    function rowMarkup(row, rank, extraClass = '') {
        return `
            <li class="jueun-rank-row ${extraClass}">
                <span class="jueun-rank-number">${rank}</span>
                <span class="jueun-rank-avatar ${genderClass(row.student_gender)}">${escapeHtml(initialFromName(row.student_name))}</span>
                <span class="jueun-rank-person">
                    <span class="jueun-rank-name">${escapeHtml(row.student_name || '게스트')}</span>
                    <span class="jueun-rank-academy">${escapeHtml(row.academy_name || '소속 정보 없음')}</span>
                </span>
                <span class="jueun-rank-score">${escapeHtml(scoreLabel(row))}</span>
            </li>
        `;
    }

    function currentMyRank(context) {
        return context.myRanks?.[context.scope] || null;
    }

    function renderParticipantCount(modal, totalCount) {
        const count = Number.isFinite(Number(totalCount)) ? Number(totalCount) : 0;
        modal.querySelector('.jueun-rank-count').textContent = `총 ${formatNumber(count)}명 참여중`;
    }

    function renderRows(modal, rows, context) {
        const wrap = modal.querySelector('.jueun-rank-list-wrap');
        renderParticipantCount(modal, context?.totalCounts?.[context.scope] ?? rows.length);
        if (!rows.length) {
            wrap.innerHTML = '<div class="jueun-rank-empty">아직 등록된 랭킹이 없습니다.</div>';
            renderPodium(modal, []);
            return;
        }
        renderPodium(modal, rows);
        const myRank = context ? currentMyRank(context) : null;
        const shouldAppendMyRank = Boolean(
            myRank?.row
            && Number(myRank.rank) > RANKING_DISPLAY_LIMIT
            && !rows.some((row) => row.id === myRank.row.id)
        );
        wrap.innerHTML = `
            <ol class="jueun-rank-list">
                ${rowsWithDisplayRank(rows).map(({ row, rank }) => rowMarkup(row, rank)).join('')}
                ${shouldAppendMyRank ? `<li class="jueun-rank-ellipsis" aria-hidden="true">...</li>${rowMarkup(myRank.row, myRank.rank, 'is-mine')}` : ''}
            </ol>
        `;
    }

    function renderExtra(modal, context, errorText) {
        const extra = modal.querySelector('.jueun-rank-extra');
        const parts = [];
        if (context.showMyScore) {
            const learnerLabel = context.isGuest ? '게스트' : context.studentName;
            const myRank = currentMyRank(context);
            const scopeLabel = context.scope === 'academy' ? '학원내' : '전체';
            const rankText = myRank
                ? (myRank.rank === '-' ? `${scopeLabel} 순위 -` : `${scopeLabel} ${myRank.rank}위`)
                : (context.isGuest ? '학생 선택 시 랭킹에 참여할 수 있습니다.' : '내 등수를 계산 중이거나 랭킹 반영 전입니다.');
            parts.push(`
                <div class="jueun-rank-my-score">
                    <div>
                        <small>MY SCORE</small>
                        <strong>${escapeHtml(learnerLabel)} · ${escapeHtml(context.scoreLabel)}</strong>
                        <span>${escapeHtml(rankText)}</span>
                    </div>
                    <button type="button" class="jueun-rank-action" data-rank-action="retry">다시 도전</button>
                </div>
            `);
        }
        if (errorText) {
            parts.push(`<div class="jueun-rank-note">${escapeHtml(errorText)}</div>`);
        }
        extra.innerHTML = parts.join('');
        const retryButton = extra.querySelector('[data-rank-action="retry"]');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                modal.remove();
                if (typeof context.onRetry === 'function') context.onRetry();
            });
        }
    }

    function renderHeader(modal, context) {
        modal.querySelector('#jueun-rank-title').textContent = `${context.contentTitle} 랭킹`;
        renderParticipantCount(modal, context.totalCounts?.[context.scope] || 0);
    }

    function setTabs(modal, context) {
        modal.querySelectorAll('.jueun-rank-tab').forEach((button) => {
            const scope = button.dataset.scope;
            button.classList.toggle('active', scope === context.scope);
            button.onclick = async () => {
                if (scope === context.scope) return;
                context.scope = scope;
                modal.querySelectorAll('.jueun-rank-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.scope === scope));
                modal.querySelector('.jueun-rank-list-wrap').innerHTML = '<div class="jueun-rank-empty">랭킹을 불러오는 중입니다.</div>';
                try {
                    const result = await fetchRows(scope, context);
                    context.totalCounts[scope] = result.totalCount ?? result.rows.length;
                    renderRows(modal, result.rows, context);
                    renderExtra(modal, context, '');
                } catch (_error) {
                    renderRows(modal, [], context);
                    renderExtra(modal, context, '랭킹 데이터를 불러오지 못했습니다. DB 반영 여부를 확인해 주세요.');
                }
            };
        });
    }

    async function academyForContext(memberProfileId, token) {
        if (memberProfileId && token) {
            const profile = await fetchProfile(memberProfileId, token);
            return {
                academyName: academyNameFromProfile(profile),
                academyRegion: profile?.academy_region || '미지역',
                academyCity: profile?.academy_city || '미등록'
            };
        }
        return {
            academyName: localAcademyName() || '',
            academyRegion: localAcademyRegion(),
            academyCity: localAcademyCity()
        };
    }

    function baseContext(options = {}) {
        const identity = contentIdentity(options);
        const log = activeLog();
        const learner = readLearner(log);
        return {
            ...identity,
            token: accessToken(),
            memberProfileId: log?.memberProfileId || log?.member_profile_id || '',
            studentId: learner.studentId || learner.id || '',
            studentName: learner.name || learner.label || '게스트',
            studentGender: learner.gender || '',
            academyName: localAcademyName(),
            academyRegion: localAcademyRegion(),
            academyCity: localAcademyCity(),
            isGuest: !isStudentLearner(learner),
            scope: 'academy',
            showMyScore: false,
            totalCounts: {},
            myRanks: {}
        };
    }

    async function show(options = {}) {
        const context = baseContext(options);
        const modal = ensureModal();
        renderHeader(modal, context);
        modal.querySelector('.jueun-rank-list-wrap').innerHTML = '<div class="jueun-rank-empty">랭킹을 불러오는 중입니다.</div>';
        renderExtra(modal, context, '');
        let errorText = '';
        try {
            await hydrateLearnerFromPlayLog(context);
            Object.assign(context, await academyForContext(context.memberProfileId, context.token));
        } catch (_error) {
            errorText = '학원 정보를 불러오지 못해 전체 랭킹을 먼저 표시합니다.';
        }
        if (!context.academyName) context.scope = 'all';
        setTabs(modal, context);
        try {
            const result = await fetchRows(context.scope, context);
            context.totalCounts[context.scope] = result.totalCount ?? result.rows.length;
            renderRows(modal, result.rows, context);
        } catch (_error) {
            renderRows(modal, [], context);
            errorText = errorText || '랭킹 데이터를 불러오지 못했습니다. DB 반영 여부를 확인해 주세요.';
        }
        renderExtra(modal, context, errorText);
    }

    async function complete(options = {}) {
        const identity = contentIdentity(options);
        const stableCompletionKey = `${identity.playLogId || identity.contentId}:${normalizeScore(options.score)}:${options.scoreLabel || ''}`;
        const context = {
            ...baseContext(options),
            ...identity,
            score: normalizeScore(options.score),
            rawScore: normalizeScore(options.score),
            normalizedScore: 0,
            scoreMax: Number(options.scoreMax || options.score_max || 0) || null,
            scoreType: options.scoreType || options.score_type || '',
            scoreLabel: options.scoreLabel || `${formatNumber(options.score)}점`,
            onRetry: options.onRetry,
            silent: Boolean(options.silent),
            showMyScore: true
        };
        context.normalizedScore = normalizeRankingScore(context.rawScore, options);
        context.scoreType = context.scoreType || (context.rawScore <= 100 ? 'percent' : 'points');
        const completionKey = options.attemptId || stableCompletionKey;
        context.attemptId = completionKey;
        const wasCompleted = state.completedKeys.has(completionKey) || state.completedKeys.has(stableCompletionKey);
        if (wasCompleted && context.silent) return null;
        if (!wasCompleted) {
            state.completedKeys.add(completionKey);
            state.completedKeys.add(stableCompletionKey);
            window.JueunPlayTracker?.recordScore?.({
                score: context.score,
                rawScore: context.rawScore,
                normalizedScore: context.normalizedScore,
                scoreMax: context.scoreMax,
                scoreType: context.scoreType,
                scoreLabel: context.scoreLabel,
                attemptId: completionKey,
                source: 'ranking-complete',
                metadata: {
                    contentId: context.contentId,
                    contentTitle: context.contentTitle
                }
            });
        }

        let modal = null;
        if (!context.silent) {
            modal = ensureModal();
            renderHeader(modal, context);
            modal.querySelector('.jueun-rank-list-wrap').innerHTML = '<div class="jueun-rank-empty">랭킹을 불러오는 중입니다.</div>';
            renderExtra(modal, context, '');
        }

        let errorText = '';
        try {
            await hydrateLearnerFromPlayLog(context);
            Object.assign(context, await academyForContext(context.memberProfileId, context.token));
            if (!context.isGuest && context.memberProfileId && context.token && context.academyName) {
                if (wasCompleted) {
                    context.insertedRow = await fetchRankScoreByAttempt(context.attemptId, context.token);
                } else {
                    context.insertedRow = await supabasePost(RANK_TABLE, {
                        member_profile_id: context.memberProfileId,
                        student_id: context.studentId,
                        student_name: context.studentName,
                        student_gender: context.studentGender || null,
                        academy_name: context.academyName,
                        academy_region: context.academyRegion || '미지역',
                        academy_city: context.academyCity || '미등록',
                        content_id: context.contentId,
                        content_title: context.contentTitle,
                        score: context.score,
                        raw_score: context.rawScore,
                        normalized_score: context.normalizedScore,
                        score_max: context.scoreMax,
                        score_type: context.scoreType,
                        score_label: context.scoreLabel,
                        attempt_id: context.attemptId,
                        played_at: new Date().toISOString()
                    }, context.token, {
                        onConflict: 'attempt_id',
                        ignoreDuplicates: true
                    });
                    if (!context.insertedRow) {
                        context.insertedRow = await fetchRankScoreByAttempt(context.attemptId, context.token);
                    }
                }
                if (!context.silent) {
                    context.myRanks.all = await fetchMyRank(context, 'all');
                    if (context.academyName) {
                        context.myRanks.academy = await fetchMyRank(context, 'academy');
                    }
                }
            } else if (!context.isGuest && !context.academyName) {
                errorText = '학원 정보가 없어 점수를 랭킹에 저장하지 못했습니다.';
            } else if (!context.isGuest) {
                errorText = '로그인 정보가 없어 점수를 저장하지 못했습니다.';
                context.isGuest = true;
            }
        } catch (_error) {
            errorText = '점수 저장 또는 랭킹 조회 준비 중 오류가 발생했습니다. DB 반영 여부를 확인해 주세요.';
        }
        if (context.silent) return context.insertedRow || null;
        if (!context.academyName) context.scope = 'all';
        setTabs(modal, context);
        try {
            const result = await fetchRows(context.scope, context);
            context.totalCounts[context.scope] = result.totalCount ?? result.rows.length;
            renderRows(modal, result.rows, context);
        } catch (_error) {
            renderRows(modal, [], context);
            errorText = errorText || '랭킹 데이터를 불러오지 못했습니다. DB 반영 여부를 확인해 주세요.';
        }
        renderExtra(modal, context, errorText);
    }

    function resultOptionsForCompletion(options = {}) {
        const detected = options.score !== undefined ? {
            score: normalizeScore(options.score),
            scoreLabel: options.scoreLabel || `${formatNumber(options.score)}점`,
            selector: options.selector || 'manual'
        } : findResultScore();

        if (!detected) return null;

        return {
            ...options,
            score: detected.score,
            scoreLabel: options.scoreLabel || detected.scoreLabel,
            source: options.source || 'result-button',
            metadata: {
                selector: detected.selector,
                ...(options.metadata || {})
            },
            onRetry: options.onRetry || retryFromPage
        };
    }

    function completionKeysFor(options = {}) {
        const identity = contentIdentity(options);
        const stableCompletionKey = `${identity.playLogId || identity.contentId}:${normalizeScore(options.score)}:${options.scoreLabel || ''}`;
        return {
            explicit: options.attemptId || '',
            stable: stableCompletionKey
        };
    }

    function isAlreadyCompleted(options = {}) {
        const keys = completionKeysFor(options);
        return Boolean((keys.explicit && state.completedKeys.has(keys.explicit)) || state.completedKeys.has(keys.stable));
    }

    function openResultRanking(options = {}) {
        const resultOptions = resultOptionsForCompletion(options);
        if (!resultOptions) return show(options);
        if (isAlreadyCompleted(resultOptions)) return show(resultOptions);
        return complete(resultOptions);
    }

    window.JueunRanking = {
        show,
        complete,
        showResult: openResultRanking
    };

    if (!window.showRanking) {
        window.showRanking = function (options = {}) {
            return show(options);
        };
    }

    if (!window.showResultRanking) {
        window.showResultRanking = function (options = {}) {
            return openResultRanking(options);
        };
    }

    function buttonText(button) {
        return String(button?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isRankingButton(button) {
        return /랭킹|ranking/i.test(buttonText(button)) || /show(Result)?Ranking/.test(button.getAttribute('onclick') || '');
    }

    function floatingRankingButton() {
        return document.querySelector('.jueun-rank-floating-button');
    }

    function hasVisibleResultContext() {
        return Array.from(document.querySelectorAll(RESULT_CONTEXT_SELECTORS)).some(isVisible);
    }

    function syncFloatingRankingButton() {
        const button = floatingRankingButton();
        if (!button) return;
        const shouldHide = state.learningActive || hasVisibleResultContext() || Boolean(document.getElementById('jueun-ranking-modal'));
        button.hidden = shouldHide;
        button.style.display = shouldHide ? 'none' : 'inline-flex';
    }

    function restartAutoScoreScanner() {
        if (state.autoCompleteTimer) window.clearInterval(state.autoCompleteTimer);
        state.autoScoreScanCount = 0;
        state.autoCompleteTimer = window.setInterval(scanAutoComplete, AUTO_SCORE_SCAN_MS);
    }

    function markLearningStarted() {
        state.learningActive = true;
        state.autoResultHandled = false;
        state.resultModalRequested = false;
        restartAutoScoreScanner();
        syncFloatingRankingButton();
    }

    function isLearningStartControl(control) {
        if (!control || isRankingButton(control)) return false;
        const text = buttonText(control);
        if (!text) return false;
        if (/(게임\s*방법|방법|튜토리얼|랭킹|ranking|처음|홈으로|종료|닫기|확인)/i.test(text)) return false;
        return /(게임\s*시작|시작|플레이\s*시작|플레이|play|start|다시|한\s*번\s*더|retry|replay)/i.test(text);
    }

    function makeRankingButton(baseButton, label = '랭킹', mode = 'show') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = baseButton?.className || '';
        button.style.cssText = baseButton?.style?.cssText || '';
        button.dataset.jueunRankingButton = 'true';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            if (mode === 'result') {
                openResultRanking();
                return;
            }
            show();
        });
        return button;
    }

    function makeFloatingRankingButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '랭킹';
        button.className = 'jueun-rank-floating-button';
        button.dataset.jueunRankingButton = 'true';
        button.setAttribute('aria-label', '랭킹 보기');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            show();
        });
        return button;
    }

    function isExcludedLauncherArea(button) {
        return Boolean(button.closest([
            RESULT_CONTEXT_SELECTORS,
            '#modal-help',
            '#how-to-play-modal',
            '#modal-no-midi',
            '.jueun-rank-backdrop'
        ].join(',')));
    }

    function installIntroRankingButton() {
        if (document.querySelector('[data-jueun-ranking-button="true"]')) {
            syncFloatingRankingButton();
            return;
        }
        ensureStyle();
        document.body.appendChild(makeFloatingRankingButton());
        syncFloatingRankingButton();
    }

    function installResultRankingButtons() {
        document.querySelectorAll(RESULT_CONTEXT_SELECTORS).forEach((context) => {
            if (context.querySelector('[data-jueun-result-ranking-button="true"]')) return;
            if (Array.from(context.querySelectorAll('button')).some(isRankingButton)) return;
            const baseButton = Array.from(context.querySelectorAll('button')).find((button) => {
                return /(다시|한\s*번\s*더|retry|replay|처음|홈으로|완료|확인)/i.test(buttonText(button));
            });
            if (!baseButton) return;
            const rankButton = makeRankingButton(baseButton, '랭킹 확인', 'result');
            rankButton.dataset.jueunResultRankingButton = 'true';
            baseButton.parentElement?.insertBefore(rankButton, baseButton);
        });
    }

    function installRankingLaunchers() {
        installIntroRankingButton();
        installResultRankingButtons();
        syncFloatingRankingButton();
    }

    function retryFromPage() {
        const retryButton = Array.from(document.querySelectorAll(RESULT_CONTEXT_SELECTORS + ' button')).find((button) => {
            if (button.dataset.jueunResultRankingButton === 'true') return false;
            return /(다시|한\s*번\s*더|retry|replay)/i.test(buttonText(button));
        });
        if (retryButton) {
            retryButton.click();
            return;
        }
        window.location.reload();
    }

    function scanAutoComplete() {
        if (state.autoResultHandled) return;
        state.autoScoreScanCount += 1;
        const detected = findResultScore();
        if (detected) {
            state.learningActive = false;
            state.autoResultHandled = true;
            complete({
                score: detected.score,
                scoreLabel: detected.scoreLabel,
                source: 'auto-result',
                metadata: { selector: detected.selector },
                silent: state.resultModalRequested || Boolean(document.getElementById('jueun-ranking-modal')),
                onRetry: retryFromPage
            });
            window.clearInterval(state.autoCompleteTimer);
            state.autoCompleteTimer = 0;
            syncFloatingRankingButton();
        }
        if (state.autoScoreScanCount >= AUTO_SCORE_SCAN_LIMIT) {
            window.clearInterval(state.autoCompleteTimer);
            state.autoCompleteTimer = 0;
        }
    }

    function bootRankingAssist() {
        installRankingLaunchers();
        restartAutoScoreScanner();
        const observer = new MutationObserver(() => {
            installRankingLaunchers();
            scanAutoComplete();
            syncFloatingRankingButton();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'data-jueun-score', 'data-result-score', 'data-final-score']
        });
        window.addEventListener('pagehide', () => {
            observer.disconnect();
            window.clearInterval(state.autoCompleteTimer);
            state.autoCompleteTimer = 0;
        });
        window.addEventListener('jueun-web-learning-started', markLearningStarted);
        document.addEventListener('click', (event) => {
            const control = event.target?.closest?.('button,a,[role="button"]');
            if (isLearningStartControl(control)) markLearningStarted();
        }, true);
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const control = document.activeElement?.closest?.('button,a,[role="button"]');
            if (isLearningStartControl(control)) markLearningStarted();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootRankingAssist);
    } else {
        bootRankingAssist();
    }
})();
