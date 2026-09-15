// Gemini 伴读控制栏：补齐上一句、下一句、单句循环和安卓播放进度同步。
(() => {
  "use strict";
  let controller = null;

  window.setupAudioDock = function setupAudioDock(sentencesList, options = {}) {
    if (controller) controller.destroy();

    const playBtn = document.getElementById("btnToggleSpeech");
    const playIcon = document.getElementById("playIcon");
    const prevBtn = document.getElementById("btnPrevSentence");
    const nextBtn = document.getElementById("btnNextSentence");
    const repeatBtn = document.getElementById("btnRepeatSentence");
    const progressText = document.getElementById("speechProgress");
    const progressFill = document.getElementById("speechProgressFill");
    const rateSelect = document.getElementById("speechRateSelect");
    const reciteCard = document.getElementById("reciteCard");
    if (!playBtn || !window.SpeechManager) return null;

    const sentences = Array.from(sentencesList || []).map(String).filter(Boolean);
    let currentIndex = Math.max(0, Math.min(sentences.length - 1, Number(options.startIndex) || 0));
    let repeatOne = false;

    function renderProgress(index = currentIndex) {
      currentIndex = Math.max(0, Math.min(Math.max(0, sentences.length - 1), index));
      progressText.textContent = sentences.length ? `第 ${currentIndex + 1} / ${sentences.length} 句` : "暂无内容";
      progressFill.style.width = sentences.length ? `${(currentIndex + 1) / sentences.length * 100}%` : "0%";
      prevBtn.disabled = currentIndex <= 0;
      nextBtn.disabled = currentIndex >= sentences.length - 1;
      if (options.onSentenceChange) options.onSentenceChange(currentIndex);
    }

    function finish() {
      playIcon.textContent = "▶";
      playBtn.classList.remove("is-playing");
      reciteCard && reciteCard.classList.remove("is-speaking");
    }

    function playFrom(index) {
      if (!sentences.length) return;
      currentIndex = Math.max(0, Math.min(sentences.length - 1, index));
      const offset = currentIndex;
      const queue = repeatOne ? [sentences[currentIndex]] : sentences.slice(currentIndex);
      playIcon.textContent = "⏸";
      playBtn.classList.add("is-playing");
      SpeechManager.playSentenceSequence(queue, relativeIndex => {
        if (relativeIndex < 0) {
          reciteCard && reciteCard.classList.remove("is-speaking");
          return;
        }
        const absoluteIndex = repeatOne ? offset : offset + relativeIndex;
        renderProgress(absoluteIndex);
        reciteCard && reciteCard.classList.add("is-speaking");
      }, () => {
        finish();
        if (repeatOne && controller) playFrom(currentIndex);
      });
    }

    playBtn.onclick = () => {
      if (SpeechManager.isPlaying) {
        SpeechManager.stop();
        finish();
      } else {
        playFrom(currentIndex);
      }
    };
    prevBtn.onclick = () => {
      SpeechManager.stop(); finish(); renderProgress(currentIndex - 1);
    };
    nextBtn.onclick = () => {
      SpeechManager.stop(); finish(); renderProgress(currentIndex + 1);
    };
    repeatBtn.onclick = () => {
      repeatOne = !repeatOne;
      repeatBtn.classList.toggle("active", repeatOne);
      repeatBtn.setAttribute("aria-pressed", String(repeatOne));
      if (SpeechManager.isPlaying) {
        SpeechManager.stop();
        playFrom(currentIndex);
      }
    };
    rateSelect.onchange = event => {
      SpeechManager.rate = Number(event.target.value) || 0.8;
      if (options.onRateChange) options.onRateChange(SpeechManager.rate);
    };
    SpeechManager.rate = Number(options.rate) || Number(rateSelect.value) || 0.8;
    rateSelect.value = String(SpeechManager.rate);

    controller = {
      setIndex(index) { renderProgress(index); },
      destroy() {
        SpeechManager.stop();
        finish();
        playBtn.onclick = prevBtn.onclick = nextBtn.onclick = repeatBtn.onclick = rateSelect.onchange = null;
        if (controller === this) controller = null;
      }
    };
    window.AudioDockController = controller;
    renderProgress(currentIndex);
    return controller;
  };
})();
