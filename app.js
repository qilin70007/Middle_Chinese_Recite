(() => {
  "use strict";
  const STORE_KEY = "middleChineseRecite.v1";
  const REVIEW_DAYS = [1, 2, 4, 7, 15, 30];
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  const localDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const addDays = (days) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return localDate(date);
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function splitSegments(text) {
    return String(text || "").replace(/\r/g, "").split(/\n+/)
      .flatMap(line => line.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [line])
      .map(line => line.trim()).filter(Boolean);
  }

  const sampleLessons = () => [{
    id: uid(), title: "七步诗", type: "古诗", author: "[三国] 曹植",
    content: "煮豆持作羹，漉菽以为汁。\n萁在釜下燃，豆在釜中泣。\n本自同根生，相煎何太急？",
    notes: "诗人用豆和豆萁本是同根生长的关系，比喻兄弟之间不应互相残害。记忆线索：煮豆—燃萁—同根—相煎。",
    createdAt: Date.now(), reviews: {}
  }, {
    id: uid(), title: "孟母断织", type: "文言文", author: "《韩诗外传》",
    content: "孟子少时，诵，其母方织。孟辍然中止，乃复进。其母知其諠也，呼而问之：“何为中止？”对曰：“有所失，复得。”其母引刀裂其织，以此诫之。自是之后，孟子不复諠矣。",
    notes: "孟子小时候背书中途停下，孟母割断正在织的布来告诫他：学习不能半途而废。记忆线索：诵读中止—母亲询问—引刀裂织—从此专心。",
    createdAt: Date.now(), reviews: {}
  }];

  function initialData() {
    return {
      version: 1,
      lessons: sampleLessons(),
      settings: { rate: 0.8, pause: 1, repeat: 2 }
    };
  }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (parsed && Array.isArray(parsed.lessons)) {
        parsed.settings = Object.assign({ rate: 0.8, pause: 1, repeat: 2 }, parsed.settings || {});
        parsed.lessons.forEach(lesson => {
          lesson.reviews = lesson.reviews || {};
          lesson.createdAt = lesson.createdAt || Date.now();
        });
        return parsed;
      }
    } catch (_) {}
    const fresh = initialData();
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  let data = loadData();
  let currentView = "home";
  let libraryFilter = "all";
  let practice = null;
  let toastTimer = null;

  function saveData() {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function segmentsOf(lesson) {
    return splitSegments(lesson.content);
  }

  function reviewOf(lesson, index) {
    if (!lesson.reviews[index]) {
      lesson.reviews[index] = {
        level: "new", interval: -1, nextReview: localDate(), difficult: false, attempts: 0
      };
    }
    return lesson.reviews[index];
  }

  function isDue(review) {
    return !review.nextReview || review.nextReview <= localDate();
  }

  function lessonStats(lesson) {
    const segments = segmentsOf(lesson);
    let mastered = 0, difficult = 0, due = 0;
    segments.forEach((_, index) => {
      const review = reviewOf(lesson, index);
      if (review.level === "mastered") mastered++;
      if (review.difficult) difficult++;
      if (isDue(review)) due++;
    });
    return { total: segments.length, mastered, difficult, due };
  }

  function allStats() {
    return data.lessons.reduce((sum, lesson) => {
      const item = lessonStats(lesson);
      sum.total += item.total;
      sum.mastered += item.mastered;
      sum.difficult += item.difficult;
      sum.due += item.due;
      return sum;
    }, { total: 0, mastered: 0, difficult: 0, due: 0 });
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").classList.remove("hidden");
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2200);
  }

  function showView(name) {
    currentView = name;
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    $({home:"homeView",review:"reviewView",settings:"settingsView"}[name] || "homeView").classList.add("active");
    $("bottomNav").classList.remove("hidden");
    document.querySelectorAll("#bottomNav button").forEach(button =>
      button.classList.toggle("active", button.dataset.nav === name));
    if (name === "home") renderHome();
    if (name === "review") renderReview();
    window.scrollTo(0, 0);
  }

  function lessonCard(lesson, scope = "all") {
    const stats = lessonStats(lesson);
    const percent = stats.total ? Math.round(stats.mastered / stats.total * 100) : 0;
    const subtitle = [lesson.author, `${stats.total} 句`, stats.difficult ? `${stats.difficult} 个重难点` : ""]
      .filter(Boolean).join(" · ");
    return `<article class="lesson-card">
      <div class="lesson-top">
        <div><h3>${esc(lesson.title)}</h3><p>${esc(subtitle)}</p></div>
        <span class="type-badge">${esc(lesson.type)}</span>
      </div>
      <div class="lesson-progress"><span style="width:${percent}%"></span></div>
      <div class="lesson-bottom">
        <span>${scope === "due" ? `今日到期 ${stats.due} 句` : `已掌握 ${percent}%`}</span>
        <button data-open-lesson="${esc(lesson.id)}" data-scope="${scope}">开始练习</button>
      </div>
    </article>`;
  }

  function renderHome() {
    const stats = allStats();
    $("dueCount").textContent = stats.due;
    $("difficultCount").textContent = stats.difficult;
    $("masterRate").textContent = stats.total ? Math.round(stats.mastered / stats.total * 100) + "%" : "0%";
    const hour = new Date().getHours();
    $("todayMessage").textContent = hour < 11 ? "早上好，先听一遍再开口背吧。" :
      hour < 18 ? "今天也完成一小轮，记得会更牢。" : "晚上适合轻复习，不必一次背太久。";
    $("dailyTitle").textContent = stats.due ? `今天有 ${stats.due} 句需要复习` : "今天的复习已完成";
    $("dailyHint").textContent = stats.due ? "先做最短的一轮，再练新篇目。" : "可以听一遍重难点，或录入学校的新作业。";
    $("startDailyBtn").textContent = stats.due ? "开始今日复习" : "查看重难点";

    let lessons = [...data.lessons];
    if (libraryFilter === "difficult") lessons = lessons.filter(x => lessonStats(x).difficult > 0);
    else if (libraryFilter !== "all") lessons = lessons.filter(x => x.type === libraryFilter);
    $("lessonList").innerHTML = lessons.length ? lessons.map(x => lessonCard(x, libraryFilter === "difficult" ? "difficult" : "all")).join("")
      : '<div class="empty">这里还没有篇目。点击右上角“＋”，把学校要求背诵的内容加进来。</div>';
  }

  function renderReview() {
    const stats = allStats();
    $("reviewSummary").innerHTML = stats.due
      ? `<strong>今天共 ${stats.due} 句</strong><p>答对后，复习间隔会逐步延长到 30 天。</p>`
      : "<strong>今天已完成</strong><p>做得不错。也可以主动复习重难点。</p>";
    const dueLessons = data.lessons.filter(x => lessonStats(x).due > 0);
    $("dueLessonList").innerHTML = dueLessons.length
      ? dueLessons.map(x => lessonCard(x, "due")).join("")
      : '<div class="empty">没有到期内容。新的复习会按 1、2、4、7、15、30 天出现。</div>';
  }

  function openEditor(lesson = null) {
    $("lessonForm").reset();
    $("lessonId").value = lesson ? lesson.id : "";
    $("editorHeading").textContent = lesson ? "编辑背诵篇目" : "新增背诵篇目";
    if (lesson) {
      $("lessonTitle").value = lesson.title;
      $("lessonType").value = lesson.type;
      $("lessonAuthor").value = lesson.author || "";
      $("lessonContent").value = lesson.content;
      $("lessonNotes").value = lesson.notes || "";
    }
    $("editorModal").classList.remove("hidden");
    setTimeout(() => $("lessonTitle").focus(), 80);
  }

  function closeEditor() {
    $("editorModal").classList.add("hidden");
  }

  function saveLesson(event) {
    event.preventDefault();
    const id = $("lessonId").value;
    const existing = data.lessons.find(x => x.id === id);
    const content = $("lessonContent").value.trim();
    if (!splitSegments(content).length) return toast("请录入背诵正文");
    const lesson = {
      id: id || uid(),
      title: $("lessonTitle").value.trim(),
      type: $("lessonType").value,
      author: $("lessonAuthor").value.trim(),
      content,
      notes: $("lessonNotes").value.trim(),
      createdAt: existing ? existing.createdAt : Date.now(),
      reviews: existing && existing.content === content ? existing.reviews : {}
    };
    if (existing) Object.assign(existing, lesson); else data.lessons.unshift(lesson);
    saveData();
    closeEditor();
    renderHome();
    toast(existing ? "篇目已更新" : "篇目已加入书架");
  }

  function scopeIndices(lesson, scope) {
    const segments = segmentsOf(lesson);
    let indices = segments.map((_, i) => i);
    if (scope === "due") indices = indices.filter(i => isDue(reviewOf(lesson, i)));
    if (scope === "difficult") indices = indices.filter(i => reviewOf(lesson, i).difficult);
    return indices.length ? indices : segments.map((_, i) => i);
  }

  function initAudioDock() {
    if (!practice || !window.setupAudioDock) return;
    const sentences = practice.indices.map(index => segmentsOf(practice.lesson)[index]);
    window.setupAudioDock(sentences, {
      startIndex: practice.position,
      rate: speechSettings().rate,
      onSentenceChange(index) {
        if (!practice || practice.position === index) return;
        practice.position = index;
        practice.revealed = false;
        renderPractice();
      },
      onRateChange(rate) {
        data.settings.rate = rate;
        $("speechRate").value = rate;
        $("rateOutput").textContent = Number(rate).toFixed(1) + "×";
        saveData();
      }
    });
  }

  function openPractice(lessonId, scope = "all") {
    const lesson = data.lessons.find(x => x.id === lessonId);
    if (!lesson) return;
    practice = { lesson, scope, indices: scopeIndices(lesson, scope), position: 0, mode: "read", revealed: false };
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    $("practiceView").classList.add("active");
    $("bottomNav").classList.add("hidden");
    renderPractice();
    initAudioDock();
    window.scrollTo(0, 0);
  }

  function cloze(text) {
    let seen = 0;
    return Array.from(text).map(char => {
      if (/[㐀-鿿]/.test(char)) {
        seen++;
        return seen > 2 && seen % 2 === 0 ? "＿" : char;
      }
      return char;
    }).join("");
  }

  function renderPractice() {
    if (!practice) return;
    const { lesson, indices, position, mode } = practice;
    const allSegments = segmentsOf(lesson);
    const actualIndex = indices[position];
    const segment = allSegments[actualIndex] || "";
    const review = reviewOf(lesson, actualIndex);
    $("practiceTitle").textContent = lesson.title;
    $("practiceMeta").textContent = [lesson.type, lesson.author].filter(Boolean).join(" · ");
    $("segmentIndex").textContent = `第 ${position + 1} / ${indices.length} 句`;
    $("practiceProgress").style.width = `${(position + 1) / indices.length * 100}%`;
    $("modeTabs").querySelectorAll("button").forEach(button =>
      button.classList.toggle("active", button.dataset.mode === mode));
    $("revealBtn").classList.toggle("hidden", mode !== "recite" || practice.revealed);
    if (mode === "read" || practice.revealed) $("segmentText").textContent = segment;
    else if (mode === "cloze") $("segmentText").textContent = cloze(segment);
    else $("segmentText").textContent = "＿＿＿＿＿＿＿＿";
    $("memoryHint").textContent = mode === "recite" && !practice.revealed
      ? `开头提示：${segment.replace(/[，。！？；、“”‘’]/g, "").slice(0, 2)}……`
      : review.level === "new" ? "先读准，再合上原文背。" :
        `当前状态：${{mastered:"已掌握",vague:"模糊",unfamiliar:"不熟"}[review.level] || "未学习"}`;
    $("prevBtn").disabled = position === 0;
    $("nextBtn").disabled = position === indices.length - 1;
    $("toggleDifficultBtn").textContent = review.difficult ? "★ 已是重难点" : "☆ 标为重难点";
    $("notesBox").classList.toggle("hidden", !lesson.notes);
    $("notesText").textContent = lesson.notes || "";
    if (window.AudioDockController) window.AudioDockController.setIndex(position);
  }

  function movePractice(delta) {
    if (!practice) return;
    practice.position = Math.max(0, Math.min(practice.indices.length - 1, practice.position + delta));
    practice.revealed = false;
    renderPractice();
  }

  function assess(level) {
    if (!practice) return;
    const index = practice.indices[practice.position];
    const review = reviewOf(practice.lesson, index);
    review.level = level;
    review.attempts = (review.attempts || 0) + 1;
    review.lastReview = localDate();
    if (level === "mastered") {
      review.interval = Math.min(REVIEW_DAYS.length - 1, (review.interval ?? -1) + 1);
      review.nextReview = addDays(REVIEW_DAYS[review.interval]);
    } else if (level === "vague") {
      review.difficult = true;
      review.interval = Math.max(0, (review.interval ?? 0) - 1);
      review.nextReview = addDays(1);
    } else {
      review.difficult = true;
      review.interval = 0;
      review.nextReview = addDays(1);
    }
    saveData();
    toast(level === "mastered" ? `${REVIEW_DAYS[review.interval]} 天后再复习` : "已加入明日复习");
    if (practice.position < practice.indices.length - 1) {
      setTimeout(() => movePractice(1), 260);
    } else {
      setTimeout(() => toast("这一轮完成了！"), 350);
      renderPractice();
    }
  }

  function speechSettings() {
    return data.settings || { rate: 0.8, pause: 1, repeat: 2 };
  }

  function startSpeech(lines, repeatOverride) {
    if (window.SpeechManager && SpeechManager.isPlaying) SpeechManager.stop();
    const clean = lines.map(x => String(x).trim()).filter(Boolean);
    if (!clean.length) return toast("没有可朗读的内容");
    const settings = speechSettings();
    if (window.Native && Native.startPlayback) {
      Native.startPlayback(JSON.stringify(clean), Number(settings.rate),
        Math.round(Number(settings.pause) * 1000), repeatOverride || Number(settings.repeat));
      return;
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      clean.forEach(line => {
        const utterance = new SpeechSynthesisUtterance(line);
        utterance.lang = "zh-CN";
        utterance.rate = Number(settings.rate);
        speechSynthesis.speak(utterance);
      });
      toast("已开始朗读");
    } else toast("当前设备没有可用的朗读引擎");
  }

  function playCurrent() {
    if (!practice) return;
    startSpeech([segmentsOf(practice.lesson)[practice.indices[practice.position]]], 1);
  }

  function playWhole(withExplanation = false) {
    if (!practice) return;
    const lesson = practice.lesson;
    const body = segmentsOf(lesson);
    if (!withExplanation) return startSpeech(body);
    const lines = [];
    if (lesson.notes) lines.push("先听讲解。", ...splitSegments(lesson.notes));
    lines.push("下面开始背诵正文。");
    const repeat = Number(speechSettings().repeat);
    body.forEach(line => { for (let i = 0; i < repeat; i++) lines.push(line); });
    startSpeech(lines, 1);
  }

  function stopSpeech() {
    if (window.SpeechManager && SpeechManager.isPlaying) SpeechManager.stop();
    else if (window.Native && Native.stopPlayback) Native.stopPlayback();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    toast("朗读已停止");
  }

  function closePractice() {
    if (window.AudioDockController) window.AudioDockController.destroy();
    stopSpeech();
    practice = null;
    showView(currentView === "settings" ? "settings" : currentView === "review" ? "review" : "home");
  }

  function updateSettings() {
    data.settings.rate = Number($("speechRate").value);
    data.settings.pause = Number($("speechPause").value);
    data.settings.repeat = Number($("speechRepeat").value);
    $("rateOutput").textContent = data.settings.rate.toFixed(1) + "×";
    $("pauseOutput").textContent = data.settings.pause.toFixed(1) + " 秒";
    if (window.SpeechManager) SpeechManager.rate = data.settings.rate;
    const dockRate = $("speechRateSelect");
    if (dockRate && Array.from(dockRate.options).some(option => Number(option.value) === data.settings.rate)) {
      dockRate.value = String(data.settings.rate);
    }
    saveData();
  }

  function populateSettings() {
    const settings = speechSettings();
    $("speechRate").value = settings.rate;
    $("speechPause").value = settings.pause;
    $("speechRepeat").value = settings.repeat;
    updateSettings();
  }

  function exportBackup() {
    const backup = JSON.stringify({
      app: "Middle_Chinese_Recite", exportedAt: new Date().toISOString(), data
    }, null, 2);
    const filename = `语文背诵备份_${localDate()}.json`;
    if (window.Native && Native.saveTextFile) Native.saveTextFile(filename, backup);
    else {
      const blob = new Blob([backup], {type:"application/json"});
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const restored = parsed.data || parsed;
        if (!restored || !Array.isArray(restored.lessons)) throw new Error("格式不正确");
        if (!confirm(`将导入 ${restored.lessons.length} 个篇目并覆盖当前数据，继续吗？`)) return;
        data = restored;
        data.settings = Object.assign({rate:.8,pause:1,repeat:2}, data.settings || {});
        saveData();
        populateSettings();
        renderHome();
        toast("备份恢复成功");
      } catch (error) {
        toast("无法导入：" + error.message);
      } finally {
        $("importInput").value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) return showView(nav.dataset.nav);
    const editor = event.target.closest('[data-action="open-editor"]');
    if (editor) return openEditor();
    const lessonButton = event.target.closest("[data-open-lesson]");
    if (lessonButton) return openPractice(lessonButton.dataset.openLesson, lessonButton.dataset.scope || "all");
    const filter = event.target.closest("[data-library-filter]");
    if (filter) {
      libraryFilter = filter.dataset.libraryFilter;
      document.querySelectorAll("[data-library-filter]").forEach(x => x.classList.toggle("active", x === filter));
      return renderHome();
    }
    const mode = event.target.closest("[data-mode]");
    if (mode && practice) {
      practice.mode = mode.dataset.mode; practice.revealed = false; return renderPractice();
    }
    const assessment = event.target.closest("[data-assess]");
    if (assessment) return assess(assessment.dataset.assess);
  });

  $("lessonForm").addEventListener("submit", saveLesson);
  $("closeEditorBtn").addEventListener("click", closeEditor);
  $("editorModal").addEventListener("click", event => { if (event.target === $("editorModal")) closeEditor(); });
  $("startDailyBtn").addEventListener("click", () => {
    const due = data.lessons.find(x => lessonStats(x).due > 0);
    const difficult = data.lessons.find(x => lessonStats(x).difficult > 0);
    if (due) openPractice(due.id, "due");
    else if (difficult) openPractice(difficult.id, "difficult");
    else toast("今天没有待复习内容");
  });
  $("closePracticeBtn").addEventListener("click", closePractice);
  $("editCurrentBtn").addEventListener("click", () => practice && openEditor(practice.lesson));
  $("prevBtn").addEventListener("click", () => movePractice(-1));
  $("nextBtn").addEventListener("click", () => movePractice(1));
  $("revealBtn").addEventListener("click", () => { if (practice) { practice.revealed = true; renderPractice(); }});
  $("reciteCard").addEventListener("click", event => {
    if (practice && practice.mode === "recite" && !practice.revealed && event.target !== $("revealBtn")) {
      practice.revealed = true; renderPractice();
    }
  });
  $("speakCurrentBtn").addEventListener("click", playCurrent);
  $("playAllBtn").addEventListener("click", () => playWhole(false));
  $("playExplainBtn").addEventListener("click", () => playWhole(true));
  $("stopPlayBtn").addEventListener("click", stopSpeech);
  $("toggleDifficultBtn").addEventListener("click", () => {
    if (!practice) return;
    const review = reviewOf(practice.lesson, practice.indices[practice.position]);
    review.difficult = !review.difficult;
    saveData(); renderPractice();
    toast(review.difficult ? "已标为重难点" : "已移出重难点");
  });
  $("deleteLessonBtn").addEventListener("click", () => {
    if (!practice || !confirm(`确定删除《${practice.lesson.title}》及其学习记录吗？`)) return;
    data.lessons = data.lessons.filter(x => x.id !== practice.lesson.id);
    saveData(); practice = null; showView("home"); toast("篇目已删除");
  });
  ["speechRate","speechPause","speechRepeat"].forEach(id => $(id).addEventListener("input", updateSettings));
  $("ttsSettingsBtn").addEventListener("click", () => {
    if (window.Native && Native.openTtsSettings) Native.openTtsSettings();
    else toast("请到系统设置中选择中文语音");
  });
  $("exportBtn").addEventListener("click", exportBackup);
  $("importInput").addEventListener("change", event => importBackup(event.target.files[0]));

  window.appBack = () => {
    if (!$("editorModal").classList.contains("hidden")) { closeEditor(); return true; }
    if (practice) { closePractice(); return true; }
    return false;
  };

  populateSettings();
  showView("home");
})();
