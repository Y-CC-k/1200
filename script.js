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

    function showQuizResults() {
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
    }

    document.getElementById('quiz-next-btn')?.addEventListener('click', nextQuizQuestion);
    document.getElementById('quiz-retry-btn')?.addEventListener('click', startQuiz);

    // ============================================
    // ACTIVITY: MATCHING GAME
    // ============================================
    const matchingState = { pairs: [], selected: null, matched: 0, total: 0 };

    function startMatching() {
        const words = currentWords.slice(0, Math.min(6, currentWords.length));
        const pairs = [];
        words.forEach(w => {
            pairs.push({ id: w.word + '_en', text: w.word, pairId: w.word, type: 'en' });
            pairs.push({ id: w.word + '_cn', text: w.chinese, pairId: w.word, type: 'cn' });
        });
        matchingState.pairs = pairs.sort(() => Math.random() - 0.5);
        matchingState.selected = null;
        matchingState.matched = 0;
        matchingState.total = words.length;

        renderMatchingGame();
        openModal('matching-modal');
    }

    function renderMatchingGame() {
        const game = document.getElementById('matching-game');
        game.innerHTML = matchingState.pairs.map(card => `
            <div class="matching-card ${card.matched ? 'matched' : ''}" 
                 data-id="${card.id}" data-pair="${card.pairId}" data-type="${card.type}"
                 role="button" tabindex="0" aria-label="${card.text}">
                ${card.matched ? card.text : '?'}
            </div>
        `).join('');

        updateMatchingProgress();

        game.querySelectorAll('.matching-card:not(.matched)').forEach(card => {
            card.addEventListener('click', () => handleMatchingClick(card));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMatchingClick(card);
                }
            });
        });
    }

    function handleMatchingClick(card) {
        if (card.classList.contains('matched')) return;

        if (!matchingState.selected) {
            matchingState.selected = card;
            card.classList.add('selected');
        } else {
            const first = matchingState.selected;
            const second = card;

            if (first.dataset.pair === second.dataset.pair && first.dataset.type !== second.dataset.type) {
                // Match!
                first.classList.remove('selected');
                first.classList.add('matched');
                first.textContent = first.dataset.type === 'en' ? 
                    currentWords.find(w => w.word === first.dataset.pair)?.word :
                    currentWords.find(w => w.word === first.dataset.pair)?.chinese;
                
                second.classList.add('matched');
                second.textContent = second.dataset.type === 'en' ? 
                    currentWords.find(w => w.word === second.dataset.pair)?.word :
                    currentWords.find(w => w.word === second.dataset.pair)?.chinese;

                matchingState.matched++;
                matchingState.selected = null;
                updateMatchingProgress();

                if (matchingState.matched === matchingState.total) {
                    setTimeout(() => {
                        alert(`恭喜！完成所有配對！`);
                    }, 300);
                }
            } else {
                // No match
                first.classList.remove('selected');
                second.classList.add('selected');
                setTimeout(() => second.classList.remove('selected'), 500);
                matchingState.selected = null;
            }
        }
    }

    function updateMatchingProgress() {
        document.getElementById('matching-progress').textContent = `已配對: ${matchingState.matched} / ${matchingState.total}`;
    }

    // ============================================
    // ACTIVITY: SPELLING BEE
    // ============================================
    const spellingState = { words: [], current: 0, correct: 0 };

    function startSpelling() {
        spellingState.words = [...currentWords].sort(() => Math.random() - 0.5).slice(0, Math.min(5, currentWords.length));
        spellingState.current = 0;
        spellingState.correct = 0;

        renderSpellingQuestion();
        openModal('spelling-modal');
        document.getElementById('spelling-input').focus();
    }

    function renderSpellingQuestion() {
        const word = spellingState.words[spellingState.current];
        document.getElementById('spelling-hint').textContent = `${word.chinese} (${word.pos || ''})`;
        document.getElementById('spelling-input').value = '';
        document.getElementById('spelling-feedback').className = 'spelling-feedback';
        document.getElementById('spelling-feedback').textContent = '';
        document.getElementById('spelling-progress').textContent = `第 ${spellingState.current + 1} 題 / 共 ${spellingState.words.length} 題`;
    }

    function checkSpelling() {
        const word = spellingState.words[spellingState.current];
        const input = document.getElementById('spelling-input').value.trim().toLowerCase();
        const feedback = document.getElementById('spelling-feedback');

        if (input === word.word.toLowerCase()) {
            feedback.className = 'spelling-feedback visible correct';
            feedback.textContent = `正確！${word.word} - ${word.chinese}`;
            spellingState.correct++;
        } else {
            feedback.className = 'spelling-feedback visible incorrect';
            feedback.textContent = `錯誤。正確答案是：${word.word}`;
        }

        setTimeout(() => {
            spellingState.current++;
            if (spellingState.current >= spellingState.words.length) {
                alert(`測驗完成！答對 ${spellingState.correct} / ${spellingState.words.length} 題`);
                closeModal('spelling-modal');
            } else {
                renderSpellingQuestion();
                document.getElementById('spelling-input').focus();
            }
        }, 1500);
    }

    document.getElementById('spelling-submit')?.addEventListener('click', checkSpelling);
    document.getElementById('spelling-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkSpelling();
    });

    // ============================================
    // ACTIVITY: FLASHCARD RACE
    // ============================================
    const raceState = { words: [], current: 0, known: 0, unknown: 0, timeLeft: 30, timer: null, active: false };

    function startRace() {
        raceState.words = [...currentWords].sort(() => Math.random() - 0.5);
        raceState.current = 0;
        raceState.known = 0;
        raceState.unknown = 0;
        raceState.timeLeft = 30;
        raceState.active = true;

        document.getElementById('race-timer').textContent = '30';
        document.getElementById('race-timer').classList.remove('warning');
        renderRaceCard();
        openModal('race-modal');

        raceState.timer = setInterval(() => {
            raceState.timeLeft--;
            document.getElementById('race-timer').textContent = raceState.timeLeft;

            if (raceState.timeLeft <= 10) {
                document.getElementById('race-timer').classList.add('warning');
            }

            if (raceState.timeLeft <= 0) {
                endRace();
            }
        }, 1000);
    }

    function renderRaceCard() {
        const word = raceState.words[raceState.current];
        document.getElementById('race-word').textContent = word.word;
        document.getElementById('race-meaning').textContent = word.chinese;
        updateRaceScore();
    }

    function updateRaceScore() {
        document.getElementById('race-score').textContent = `${raceState.known} / ${raceState.current}`;
    }

    function handleRaceAction(know) {
        if (!raceState.active) return;

        if (know) raceState.known++;
        raceState.current++;

        if (raceState.current >= raceState.words.length) {
            raceState.current = 0;
            raceState.words = [...currentWords].sort(() => Math.random() - 0.5);
        }

        renderRaceCard();
    }

    function endRace() {
        raceState.active = false;
        clearInterval(raceState.timer);
        alert(`時間到！你認識 ${raceState.known} 個單字，不認識 ${raceState.unknown} 個。`);
        closeModal('race-modal');
    }

    document.getElementById('race-know')?.addEventListener('click', () => handleRaceAction(true));
    document.getElementById('race-dont-know')?.addEventListener('click', () => handleRaceAction(false));

    // ============================================
    // ACTIVITY: WORD SEARCH
    // ============================================
    function startWordSearch() {
        const words = currentWords.slice(0, Math.min(8, currentWords.length)).map(w => w.word.toUpperCase());
        const gridSize = 10;
        const grid = Array(gridSize * gridSize).fill('');

        // Place words horizontally and vertically
        const placed = [];
        words.forEach(word => {
            let placedWord = false;
            for (let attempt = 0; attempt < 100 && !placedWord; attempt++) {
                const horizontal = Math.random() > 0.5;
                const row = Math.floor(Math.random() * gridSize);
                const col = Math.floor(Math.random() * gridSize);

                if (horizontal && col + word.length <= gridSize) {
                    let canPlace = true;
                    for (let i = 0; i < word.length; i++) {
                        if (grid[row * gridSize + col + i] !== '' && grid[row * gridSize + col + i] !== word[i]) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (canPlace) {
                        for (let i = 0; i < word.length; i++) {
                            grid[row * gridSize + col + i] = word[i];
                        }
                        placed.push({ word, cells: Array.from({length: word.length}, (_, i) => row * gridSize + col + i) });
                        placedWord = true;
                    }
                } else if (!horizontal && row + word.length <= gridSize) {
                    let canPlace = true;
                    for (let i = 0; i < word.length; i++) {
                        if (grid[(row + i) * gridSize + col] !== '' && grid[(row + i) * gridSize + col] !== word[i]) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (canPlace) {
                        for (let i = 0; i < word.length; i++) {
                            grid[(row + i) * gridSize + col] = word[i];
                        }
                        placed.push({ word, cells: Array.from({length: word.length}, (_, i) => (row + i) * gridSize + col) });
                        placedWord = true;
                    }
                }
            }
        });

        // Fill empty cells with random letters
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === '') grid[i] = letters[Math.floor(Math.random() * letters.length)];
        }

        // Render grid
        const gridEl = document.getElementById('word-search-grid');
        gridEl.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
        gridEl.innerHTML = grid.map((letter, i) => `
            <div class="word-search-cell" data-index="${i}">${letter}</div>
        `).join('');

        // Render word list
        const listEl = document.getElementById('word-search-list');
        listEl.innerHTML = `<h3>找出這些單字：</h3><ul>${words.map(w => `<li data-word="${w}">${w}</li>`).join('')}</ul>`;

        // Selection logic
        let selectedCells = [];
        gridEl.querySelectorAll('.word-search-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                cell.classList.toggle('selected');
                const idx = parseInt(cell.dataset.index);
                if (selectedCells.includes(idx)) {
                    selectedCells = selectedCells.filter(i => i !== idx);
                } else {
                    selectedCells.push(idx);
                }
                checkWordSearch(placed);
            });
        });

        openModal('search-modal');
    }

    function checkWordSearch(placed) {
        const selectedLetters = Array.from(document.querySelectorAll('.word-search-cell.selected'))
            .map(c => c.textContent).join('');

        placed.forEach(p => {
            if (p.word === selectedLetters) {
                p.cells.forEach(idx => {
                    document.querySelector(`.word-search-cell[data-index="${idx}"]`).classList.add('found');
                    document.querySelector(`.word-search-cell[data-index="${idx}"]`).classList.remove('selected');
                });
                document.querySelector(`li[data-word="${p.word}"]`)?.classList.add('found');
            }
        });
    }

    // ============================================
    // ACTIVITY: MEMORY MATCH
    // ============================================
    const memoryState = { cards: [], flipped: [], matched: 0, moves: 0, total: 0 };

    function startMemory() {
        const words = currentWords.slice(0, Math.min(6, currentWords.length));
        const cards = [];
        words.forEach(w => {
            cards.push({ id: w.word + '_1', text: w.word, pairId: w.word });
            cards.push({ id: w.word + '_2', text: w.chinese, pairId: w.word });
        });
        memoryState.cards = cards.sort(() => Math.random() - 0.5);
        memoryState.flipped = [];
        memoryState.matched = 0;
        memoryState.moves = 0;
        memoryState.total = words.length;

        renderMemoryGrid();
        openModal('memory-modal');
    }

    function renderMemoryGrid() {
        const grid = document.getElementById('memory-grid');
        grid.innerHTML = memoryState.cards.map(card => `
            <div class="memory-card" data-id="${card.id}" data-pair="${card.pairId}" data-text="${card.text}"
                 role="button" tabindex="0" aria-label="Memory card">
                ?
            </div>
        `).join('');

        updateMemoryProgress();

        grid.querySelectorAll('.memory-card').forEach(card => {
            card.addEventListener('click', () => handleMemoryClick(card));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMemoryClick(card);
                }
            });
        });
    }

    function handleMemoryClick(card) {
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
        if (memoryState.flipped.length >= 2) return;

        card.classList.add('flipped');
        card.textContent = card.dataset.text;
        memoryState.flipped.push(card);

        if (memoryState.flipped.length === 2) {
            memoryState.moves++;
            updateMemoryProgress();

            const [first, second] = memoryState.flipped;
            if (first.dataset.pair === second.dataset.pair) {
                // Match
                first.classList.remove('flipped');
                second.classList.remove('flipped');
                first.classList.add('matched');
                second.classList.add('matched');
                memoryState.matched++;
                memoryState.flipped = [];

                if (memoryState.matched === memoryState.total) {
                    setTimeout(() => {
                        alert(`恭喜！用了 ${memoryState.moves} 步完成所有配對！`);
                    }, 300);
                }
            } else {
                // No match
                setTimeout(() => {
                    first.classList.remove('flipped');
                    second.classList.remove('flipped');
                    first.textContent = '?';
                    second.textContent = '?';
                    memoryState.flipped = [];
                }, 800);
            }
        }
    }

    function updateMemoryProgress() {
        document.getElementById('memory-progress').textContent = `步數: ${memoryState.moves}`;
    }

    // ============================================
    // ACTIVITY BUTTONS
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
            }
        });
    });

    // ============================================
    // INITIALIZE
    // ============================================
    gradeSelect.addEventListener('change', handleGradeChange);
    weekSelect.addEventListener('change', displayWordsForWeek);
});
