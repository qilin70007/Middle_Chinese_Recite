// Gemini 自然语音管理器：已适配安卓前台 TTS 服务与浏览器回退。
(() => {
  "use strict";
  const manager = {
    voices: { zh: null, en: null },
    currentToken: 0,
    isPlaying: false,
    rate: 0.8,
    nativeCallbacks: null,

    init() {
      if (!("speechSynthesis" in window)) return;
      const updateVoices = () => {
        const all = window.speechSynthesis.getVoices();
        if (!all.length) return;
        const pick = prefix => {
          const matched = all.filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
          return matched.find(v => /natural|neural|online/i.test(v.name))
            || matched.find(v => /google|enhanced/i.test(v.name))
            || matched[0] || null;
        };
        this.voices.zh = pick("zh");
        this.voices.en = pick("en");
      };
      window.speechSynthesis.onvoiceschanged = updateVoices;
      updateVoices();
    },

    sanitize(text) {
      if (!text) return "";
      return String(text)
        .replace(/[（(][^）)]*[）)]/g, "")
        .replace(/[——……—]/g, "，")
        .replace(/[；;、]/g, "，")
        .replace(/，+/g, "，")
        .trim();
    },

    detectLang(text) {
      return /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
    },

    stop() {
      this.currentToken++;
      this.isPlaying = false;
      if (window.Native && Native.stopPlayback) Native.stopPlayback();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (this.nativeCallbacks && this.nativeCallbacks.onHighlight) {
        this.nativeCallbacks.onHighlight(-1);
      }
      this.nativeCallbacks = null;
    },

    speakUtterance(text, lang) {
      return new Promise(resolve => {
        if (!text || !window.speechSynthesis) return resolve();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = lang === "zh-CN" ? this.rate : this.rate * 0.92;
        utterance.pitch = 1;
        utterance.voice = lang === "zh-CN" ? this.voices.zh : this.voices.en;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    },

    async playSentenceSequence(sentences, onHighlight, onComplete) {
      this.stop();
      const clean = sentences.map(text => this.sanitize(text)).filter(Boolean);
      if (!clean.length) {
        if (onComplete) onComplete();
        return;
      }
      this.isPlaying = true;

      if (window.Native && Native.startPlayback) {
        this.nativeCallbacks = { onHighlight, onComplete };
        Native.startPlayback(JSON.stringify(clean), Number(this.rate), 600, 1);
        return;
      }

      const token = ++this.currentToken;
      for (let index = 0; index < clean.length; index++) {
        if (token !== this.currentToken) return;
        if (onHighlight) onHighlight(index);
        await this.speakUtterance(clean[index], this.detectLang(clean[index]));
        if (token !== this.currentToken) return;
        const pause = /[。！？!?]$/.test(clean[index]) ? 600 : 350;
        await new Promise(resolve => setTimeout(resolve, pause));
      }
      if (token === this.currentToken) {
        this.isPlaying = false;
        if (onHighlight) onHighlight(-1);
        if (onComplete) onComplete();
      }
    },

    handleNativeProgress(detail) {
      if (!this.nativeCallbacks) return;
      const callbacks = this.nativeCallbacks;
      if (detail.done) {
        this.isPlaying = false;
        if (callbacks.onHighlight) callbacks.onHighlight(-1);
        this.nativeCallbacks = null;
        if (callbacks.onComplete) callbacks.onComplete();
      } else if (detail.index >= 0 && callbacks.onHighlight) {
        callbacks.onHighlight(detail.index);
      }
    }
  };

  window.addEventListener("nativeSpeechProgress", event => manager.handleNativeProgress(event.detail || {}));
  window.SpeechManager = manager;
  manager.init();
})();
