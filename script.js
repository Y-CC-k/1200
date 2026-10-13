document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // CORE ELEMENTS & STATE
    // ============================================
    const gradeSelect = document.getElementById('grade-select');
    const weekSelect = document.getElementById('week-select');
    const wordListContainer = document.getElementById('word-list');

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
    // INITIALIZE
    // ============================================
    gradeSelect.addEventListener('change', handleGradeChange);
    weekSelect.addEventListener('change', displayWordsForWeek);
});
