document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // CORE ELEMENTS & STATE
    // ============================================
    const gradeSelect = document.getElementById('grade-select');
    const weekSelect = document.getElementById('week-select');
    const wordListContainer = document.getElementById('word-list');
    const activityBar = document.getElementById('activity-bar');

    let currentGradeData = null;
    let currentWords = [];
    let isAudioPlaying = false;

    // TTS
    let ttsVoices = [];
    let ttsSupported = 'speechSynthesis' in window;

    function loadTtsVoices() {
        if (!ttsSupported) return;
        ttsVoices = speechSynthesis.getVoices();
    }

    if (ttsSupported) {
        loadTtsVoices();
        speechSynthesis.onvoiceschanged = loadTtsVoices;
    }

    function getPreferredVoice() {
        if (ttsVoices.length === 0) ttsVoices = speechSynthesis.getVoices();
        return ttsVoices.find(v => v.lang === 'en-US' && v.name.includes('Google'))
            || ttsVoices.find(v => v.lang === 'en-US')
            || ttsVoices.find(v => v.lang.startsWith('en'))
            || ttsVoices[0] || null;
    }

    function speak(text, rate = 0.75) {
        return new Promise((resolve) => {
            if (!ttsSupported) { resolve(); return; }
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = rate;
            utterance.pitch = 1.0;
            const voice = getPreferredVoice();
            if (voice) utterance.voice = voice;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            const timeout = setTimeout(() => resolve(), 10000);
            utterance.onend = () => { clearTimeout(timeout); resolve(); };
            speechSynthesis.speak(utterance);
        });
    }

    function stopSpeaking() {
        if (ttsSupported) speechSynthesis.cancel();
    }

    // ============================================
    // DATA LOADING
    // ============================================
    async function handleGradeChange() {
        const selectedGrade = gradeSelect.value;
        weekSelect.innerHTML = '<option value="">--請選擇--</option>';
        wordListContainer.innerHTML = '';
        activityBar.style.display = 'none';

        if (!selectedGrade) {
            displayMessage("請先選擇年級。");
            weekSelect.disabled = true;
            return;
        }

        weekSelect.disabled = true;
        displayMessage("正在載入年級資料...");

        try {
            const response = await fetch(`./document/grade${selectedGrade}.json`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentGradeData = await response.json();
            populateWeekSelect();
            displayMessage("請選擇週次來顯示單字。");
            weekSelect.disabled = false;
        } catch (error) {
            console.error("無法載入單字資料:", error);
            displayMessage(`錯誤：無法載入 ${selectedGrade} 年級的資料。`);
        }
    }

    function populateWeekSelect() {
        if (!currentGradeData || !currentGradeData.weeks) return;
        currentGradeData.weeks.forEach(weekInfo => {
            const option = document.createElement('option');
            option.value = weekInfo.week;
            option.textContent = `第 ${weekInfo.week} 週`;
            weekSelect.appendChild(option);
        });
    }

    function displayWordsForWeek() {
        const selectedGrade = gradeSelect.value;
        const selectedWeek = weekSelect.value;
        wordListContainer.innerHTML = '';
        activityBar.style.display = 'none';

        if (!selectedGrade || !selectedWeek) return;

        const weekData = currentGradeData.weeks.find(w => w.week.toString() === selectedWeek);
        if (!weekData || weekData.content.length === 0) {
            displayMessage("這個組合沒有找到任何單字。");
            return;
        }

        currentWords = weekData.content;

        currentWords.forEach(word => {
            const card = createWordCard(word);
            wordListContainer.appendChild(card);
        });

        activityBar.style.display = 'flex';
    }

    function createWordCard(word) {
        const card = document.createElement('div');
        card.className = 'word-card';
        card.innerHTML = `
            <div class="word-info">
                <h2 class="english">${word.word}</h2>
                <p class="phonetic">${word.phonetic || ''}</p>
                <p class="details"><span class="pos">${word.pos || ''}</span> ${word.chinese || ''}</p>
                <p class="sentence">${word.sentence || ''}</p>
            </div>
            <button class="play-audio-btn" data-word="${word.word}" data-sentence="${word.sentence || ''}" aria-label="播放 ${word.word} 發音">&#9658;</button>
        `;
        const playBtn = card.querySelector('.play-audio-btn');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playAudio(word.word, word.sentence);
        });
        return card;
    }

    function displayMessage(message) {
        wordListContainer.innerHTML = `<p class="message">${message}</p>`;
    }

    async function playAudio(word, sentence) {
        if (isAudioPlaying) return;
        isAudioPlaying = true;
        if (ttsSupported && word) {
            await speak(word, 0.7);
            if (sentence) {
                await new Promise(r => setTimeout(r, 300));
                await speak(sentence, 0.75);
            }
        }
        isAudioPlaying = false;
    }

    // ============================================
    // MODAL MANAGEMENT
    // ============================================
    function openModal(id) {
        const modal = document.getElementById(id);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
        }
    });

    // ============================================
    // ACTIVITY: QUIZ
    // ============================================
    const quizState = { questions: [], current: 0, correct: 0, wrong: 0, answered: false };

    function startQuiz() {
        if (!currentWords || currentWords.length === 0) {
            displayMessage("沒有可用的單字，請先選擇年級與週次。");
            closeModal('quiz-modal');
            return;
        }
        const shuffled = [...currentWords].sort(() => Math.random() - 0.5);
        const count = Math.min(5, shuffled.length);
        quizState.questions = shuffled.slice(0, count).map(word => {
            const others = currentWords.filter(w => w.word !== word.word);
            const options = [word, ...others.sort(() => Math.random() - 0.5).slice(0, 3)]
                .sort(() => Math.random() - 0.5);
            return { word: word.word, correct: word.chinese, options: options.map(w => w.chinese) };
        });
        quizState.current = 0;
        quizState.correct = 0;
        quizState.wrong = 0;
        quizState.answered = false;

        document.getElementById('quiz-results').style.display = 'none';
        document.querySelector('.quiz-header').style.display = 'block';
        document.querySelector('.quiz-question').style.display = 'block';
        document.getElementById('quiz-options').style.display = 'flex';
        document.getElementById('quiz-feedback').style.display = 'none';
        document.querySelector('.quiz-actions').style.display = 'block';

        renderQuizQuestion();
        openModal('quiz-modal');
    }

    function renderQuizQuestion() {
        const q = quizState.questions[quizState.current];
        quizState.answered = false;

        document.getElementById('quiz-progress-fill').style.width = `${(quizState.current / quizState.questions.length) * 100}%`;
        document.getElementById('quiz-progress-text').textContent = `第 ${quizState.current + 1} 題 / 共 ${quizState.questions.length} 題`;
        document.getElementById('quiz-question-word').textContent = q.word;

        const optionsEl = document.getElementById('quiz-options');
        optionsEl.innerHTML = q.options.map((opt, i) => `
            <button class="quiz-option" data-index="${i}" data-correct="${opt === q.correct}">
                ${String.fromCharCode(65 + i)}. ${opt}
            </button>
        `).join('');

        const feedback = document.getElementById('quiz-feedback');
        feedback.className = 'quiz-feedback';
        feedback.textContent = '';

        const nextBtn = document.getElementById('quiz-next-btn');
        nextBtn.disabled = true;
        nextBtn.textContent = quizState.current === quizState.questions.length - 1 ? '查看結果' : '下一題';

        optionsEl.querySelectorAll('.quiz-option').forEach(btn => {
            btn.addEventListener('click', () => handleQuizAnswer(btn));
        });
    }

    function handleQuizAnswer(btn) {
        if (quizState.answered) return;
        quizState.answered = true;

        const q = quizState.questions[quizState.current];
        const isCorrect = btn.dataset.correct === 'true';

        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.disabled = true;
            if (opt.dataset.correct === 'true') opt.classList.add('correct');
        });

        const feedback = document.getElementById('quiz-feedback');
        if (isCorrect) {
            btn.classList.add('correct');
            quizState.correct++;
            feedback.className = 'quiz-feedback visible correct';
            feedback.textContent = '正確！';
        } else {
            btn.classList.add('incorrect');
            quizState.wrong++;
            feedback.className = 'quiz-feedback visible incorrect';
            feedback.textContent = `錯誤。正確答案是：${q.correct}`;
        }

        document.getElementById('quiz-next-btn').disabled = false;
    }

    function nextQuizQuestion() {
        quizState.current++;
        if (quizState.current >= quizState.questions.length) {
            showQuizResults();
        } else {
            renderQuizQuestion();
        }
    }

    // 【核心】showQuizResults - 顯示測驗結果
    function showQuizResults() {
        // 隱介面
        document.querySelector('.quiz-header').style.display = 'none';
        document.querySelector('.quiz-question').style.display = 'none';
        document.getElementById('quiz-options').style.display = 'none';
        document.getElementById('quiz-feedback').style.display = 'none';
        document.querySelector('.quiz-actions').style.display = 'none';

        const results = document.getElementById('quiz-results');
        results.style.display = 'block';

        const total = quizState.questions.length;
        const pct = Math.round((quizState.correct / total) * 100);
        document.getElementById('quiz-score').textContent = `${pct}%`;
        document.getElementById('quiz-correct').textContent = quizState.correct;
        document.getElementById('quiz-wrong').textContent = quizState.wrong;
        
        // 儲存分數到 IndexedDB
        const selectedGrade = gradeSelect.value || '未知';
        const selectedWeek = weekSelect.value || '未知';
        saveScore(selectedGrade, selectedWeek, pct, quizState.correct, quizState.wrong).then(() => {
            // 分數已儲存 (靜默成功)
        }).catch(err => {
            console.error('分數儲存失敗:', err);
        });
    }

    document.getElementById('quiz-next-btn')?.addEventListener('click', nextQuizQuestion);
    document.getElementById('quiz-retry-btn')?.addEventListener('click', startQuiz);

    // ============================================
    // ACTIVITY: MATCHING GAME
    // ============================================

    // ============================================
    // ACTIVITY: ACTIVITY BUTTONS
    // ============================================
    document.querySelectorAll('.activity-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const activity = btn.dataset.activity;
            switch (activity) {
                case 'quiz': startQuiz(); break;
                case 'matching': startMatching(); break;
                case 'spelling': startSpelling(); break;
                case 'race': startRace(); break;
                case 'search': startWordSearch(); break;
                case 'memory': startMemory(); break;
                case 'dictation': startDictation(); break;
            }
        });
    });

    // ============================================
    // INITIALIZE
    // ============================================
    gradeSelect.addEventListener('change', handleGradeChange);
    weekSelect.addEventListener('change', displayWordsForWeek);

    // 點擊「查看歷史分數」按鈕
    document.getElementById('view-history-btn')?.addEventListener('click', () => {
        getScores().then(scores => {
            const historyList = document.getElementById('score-history-list');
            const modal = document.getElementById('score-history-modal');
            
            if (scores.length === 0) {
                historyList.innerHTML = '<p class="message">尚未有測驗紀錄</p>';
                openModal('score-history-modal');
                return;
            }
            
            // 建立歷史列表 HTML
            let html = '';
            scores.forEach((score, index) => {
                const date = new Date(score.date).toLocaleDateString('zh-TW');
                html += `
                    <div style="padding: 8px 12px; border-bottom: 1px solid var(--glass-border); transition: all 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>第 ${score.week} 週 - ${score.grade}年級</span>
                            <span style="color: var(--text-secondary); font-size: 0.8rem;">${date}</span>
                        </div>
                        <div style="flex: 1; margin-left: 12px; font-size: 1.2rem; text-align: right;">
                            ${score.percentage}%
                        </div>
                    </div>
                `;
            });
            
            historyList.innerHTML = html;
            openModal('score-history-modal');
        }).catch(err => {
            console.error('讀取歷史分數失敗:', err);
            alert('讀取歷史分數時發生錯誤');
        });
    }
});

// ============================================
// IndexedDB - 成績儲存系統
// ============================================
let db = null;

// 初始化 IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('QuizScoresDB', 1);
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('scores')) {
                const store = db.createObjectStore('scores', { keyPath: 'id', autoIncrement: true });
                store.createIndex('by_grade_week', 'grade_week', { unique: true });
                store.createIndex('by_date', 'date', { descending: true });
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            // 確保舊資料庫也有 index
            if (!db.objectStoreNames.contains('scores')) {
                initDB();
            }
            resolve();
        };
        
        request.onerror = (event) => {
            console.error('IndexedDB 初始化錯誤:', event.target.error);
            reject(event.target.error);
        };
    });
}

// 等待 DB 就緒 (懶加載)
async function $(selector) {
    return document.querySelector(selector);
}

// 儲存分數到 IndexedDB
async function saveScore(grade, week, pct, correct, wrong) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('scores', 'readwrite');
        const store = transaction.objectStore('scores');
        
        const scoreData = {
            grade: grade,
            week: week,
            percentage: pct,
            correct: correct,
            wrong: wrong,
            grade_week: `${grade}-${week}`,
            date: new Date().toISOString(),
            title: '每週測驗'
        };
        
        const request = add(scoreData);
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            console.error('儲存分數失敗:', event.target.error);
            reject(event.target.error);
        };
    });
}

// 讀取分數歷史 (可選過濾 grade-week)
async function getScores(filter = null) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('scores', 'readonly');
        const store = transaction.objectStore('scores');
        
        let request;
        if (filter) {
            request = store.index('by_grade_week').getAll(filter);
        } else {
            request = getAll(store);
        }
        
        request.onsuccess = (event) => {
            let scores = event.target.result;
            // 按日期排序，最新在前
            scores = scores.sort((a, b) => new Date(b.date) - new Date(a.date));
            resolve(scores);
        };
        
        request.onerror = (event) => {
            console.error('讀取分數失敗:', event.target.error);
            reject(event.target.error);
        };
    });
}

// 清除所有分數 (管理員用)
async function clearAllScores() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('scores', 'readwrite');
        const store = transaction.objectStore('scores');
        const request = store.clear();
        
        request.onsuccess = () => resolve('全部清除');
        request.onerror = (event) => reject('清除失敗: ' + event.target.error);
    });
}

// Helper: getAll for IndexedDB
function getAll(store) {
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}