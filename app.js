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
      settings: { rate: 0.8, pause: 1, repeat: 2, voice: "network" }
    };
  }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
      if (parsed && Array.isArray(parsed.lessons)) {
        parsed.settings = Object.assign({ rate: 0.8, pause: 1, repeat: 2, voice: "network" }, parsed.settings || {});
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
  let sortMode = false;
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

  function lessonCard(lesson, scope = "all", orderIndex = -1) {
    const stats = lessonStats(lesson);
    const percent = stats.total ? Math.round(stats.mastered / stats.total * 100) : 0;
    const subtitle = [lesson.author, `${stats.total} 句`, stats.difficult ? `${stats.difficult} 个重难点` : ""]
      .filter(Boolean).join(" · ");
    const sorting = sortMode && scope === "all" && orderIndex >= 0;
    const bottom = sorting
      ? `<div class="lesson-sort-row">
          <strong>书架第 ${orderIndex + 1} 位</strong>
          <div class="lesson-sort-buttons">
            <button data-move-lesson="${esc(lesson.id)}" data-move-direction="-1" ${orderIndex === 0 ? "disabled" : ""}>↑ 上移</button>
            <button data-move-lesson="${esc(lesson.id)}" data-move-direction="1" ${orderIndex === data.lessons.length - 1 ? "disabled" : ""}>↓ 下移</button>
          </div>
        </div>`
      : `<div class="lesson-bottom">
          <span>${scope === "due" ? `今日到期 ${stats.due} 句` : `已掌握 ${percent}%`}</span>
          <button data-open-lesson="${esc(lesson.id)}" data-scope="${scope}">开始练习</button>
        </div>`;
    return `<article class="lesson-card">
      <div class="lesson-top">
        <div class="lesson-title-block"><h3>${esc(lesson.title)}</h3><p>${esc(subtitle)}</p></div>
        <div class="lesson-card-tools">
          <span class="type-badge">${esc(lesson.type)}</span>
          <button class="card-edit-btn" data-edit-lesson="${esc(lesson.id)}" aria-label="编辑${esc(lesson.title)}">编辑</button>
        </div>
      </div>
      <div class="lesson-progress"><span style="width:${percent}%"></span></div>
      ${bottom}
    </article>`;
  }

  function setSortMode(enabled) {
    sortMode = Boolean(enabled);
    if (sortMode) {
      libraryFilter = "all";
      document.querySelectorAll("[data-library-filter]").forEach(button =>
        button.classList.toggle("active", button.dataset.libraryFilter === "all"));
    }
    $("toggleSortBtn").textContent = sortMode ? "完成排序" : "排序";
    $("toggleSortBtn").classList.toggle("active", sortMode);
    $("toggleSortBtn").setAttribute("aria-pressed", String(sortMode));
    $("sortToolbar").classList.toggle("hidden", !sortMode);
    renderHome();
  }

  function moveLesson(lessonId, direction) {
    const index = data.lessons.findIndex(lesson => lesson.id === lessonId);
    const target = index + Number(direction);
    if (index < 0 || target < 0 || target >= data.lessons.length) return;
    [data.lessons[index], data.lessons[target]] = [data.lessons[target], data.lessons[index]];
    saveData();
    renderHome();
  }

  function lessonBatchOrder(lesson) {
    const stored = Number(lesson.batchOrder);
    if (Number.isFinite(stored)) return stored;
    const match = String(lesson.title || "").match(/^\s*(?:第\s*)?(\d+(?:\.\d+)?)\s*(?:[篇首课]|[.．、:：\-_])?/);
    return match ? Number(match[1]) : null;
  }

  function sortLessonsByBatchOrder() {
    const indexed = data.lessons.map((lesson, index) => ({ lesson, index, order: lessonBatchOrder(lesson) }));
    const numbered = indexed.filter(item => Number.isFinite(item.order)).length;
    if (numbered < 2) return toast("至少需要两篇带“排序”或标题编号的内容");
    indexed.sort((a, b) => {
      const aNumbered = Number.isFinite(a.order);
      const bNumbered = Number.isFinite(b.order);
      if (aNumbered && bNumbered) return a.order - b.order || a.index - b.index;
      if (aNumbered !== bNumbered) return aNumbered ? -1 : 1;
      return a.index - b.index;
    });
    data.lessons = indexed.map(item => item.lesson);
    saveData();
    renderHome();
    toast(`已按编号排列 ${numbered} 篇内容`);
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
    const scope = libraryFilter === "difficult" ? "difficult" : "all";
    $("lessonList").innerHTML = lessons.length
      ? lessons.map(x => lessonCard(x, scope, sortMode ? data.lessons.indexOf(x) : -1)).join("")
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

  function openBatchImporter() {
    $("batchModal").classList.remove("hidden");
    setTimeout(() => $("batchText").focus(), 80);
  }

  function closeBatchImporter() {
    $("batchModal").classList.add("hidden");
    $("batchFileInput").value = "";
  }

  function normalizeImportedLesson(item) {
    const title = String(item.title || item["标题"] || item["篇目"] || "").trim();
    const content = String(item.content || item["正文"] || item["原文"] || "").trim();
    if (!title || !splitSegments(content).length) return null;
    let type = String(item.type || item["类型"] || "其他").trim();
    if (!["古诗","文言文","现代文","其他"].includes(type)) type = "其他";
    const rawOrder = item.batchOrder ?? item.order ?? item.sortOrder ?? item["排序"] ?? item["序号"];
    const orderText = String(rawOrder ?? "").trim();
    const parsedOrder = orderText ? Number(orderText.replace(/[^0-9.+-]/g, "")) : NaN;
    const lesson = {
      id: uid(),
      title,
      type,
      author: String(item.author || item["作者"] || item["出处"] || "").trim(),
      content,
      notes: String(item.notes || item["译文"] || item["提示"] || item["译文/提示"] || item["备注"] || "").trim(),
      createdAt: Date.now(),
      reviews: {}
    };
    if (Number.isFinite(parsedOrder)) lesson.batchOrder = parsedOrder;
    else {
      const titleOrder = lessonBatchOrder(lesson);
      if (Number.isFinite(titleOrder)) lesson.batchOrder = titleOrder;
    }
    return lesson;
  }

  function parseBatchText(rawText) {
    const raw = String(rawText || "").replace(/\r/g, "").trim();
    if (!raw) throw new Error("请粘贴内容或选择文件");
    if (/^[\[{]/.test(raw)) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.lessons || (parsed.data && parsed.data.lessons);
      if (!Array.isArray(list)) throw new Error("JSON 中没有篇目数组");
      return list.map(normalizeImportedLesson).filter(Boolean);
    }
    return raw.split(/\n\s*={3,}\s*\n/g).map(block => {
      const fields = { title:"", type:"其他", author:"", order:"", content:[], notes:[] };
      let section = "";
      block.split("\n").forEach(originalLine => {
        const line = originalLine.trimEnd();
        let match;
        if ((match = line.match(/^\s*(?:排序|序号)\s*[:：]\s*(.*)$/))) {
          fields.order = match[1].trim(); section = ""; return;
        }
        if ((match = line.match(/^\s*(?:标题|篇目)\s*[:：]\s*(.*)$/))) {
          fields.title = match[1].trim(); section = ""; return;
        }
        if ((match = line.match(/^\s*类型\s*[:：]\s*(.*)$/))) {
          fields.type = match[1].trim() || "其他"; section = ""; return;
        }
        if ((match = line.match(/^\s*(?:作者|出处)\s*[:：]\s*(.*)$/))) {
          fields.author = match[1].trim(); section = ""; return;
        }
        if ((match = line.match(/^\s*(?:正文|原文)\s*[:：]\s*(.*)$/))) {
          section = "content"; if (match[1]) fields.content.push(match[1]); return;
        }
        if ((match = line.match(/^\s*(?:译文(?:\/提示)?|讲解|提示|备注)\s*[:：]\s*(.*)$/))) {
          section = "notes"; if (match[1]) fields.notes.push(match[1]); return;
        }
        if (section && line.trim()) fields[section].push(line.trim());
      });
      return normalizeImportedLesson({
        title:fields.title, type:fields.type, author:fields.author, order:fields.order,
        content:fields.content.join("\n"), notes:fields.notes.join("\n")
      });
    }).filter(Boolean);
  }

  function importBatchLessons() {
    let lessons;
    try {
      lessons = parseBatchText($("batchText").value);
      if (!lessons.length) throw new Error("没有识别到有效篇目，请检查标题和正文");
    } catch (error) {
      return toast("批量导入失败：" + error.message);
    }
    if (!confirm(`识别到 ${lessons.length} 篇内容，导入到书架吗？`)) return;
    const existing = new Set(data.lessons.map(item => item.title.trim() + "\n" + item.content.trim()));
    const accepted = lessons.filter(item => !existing.has(item.title.trim() + "\n" + item.content.trim()));
    accepted.sort((a, b) => {
      const aOrder = lessonBatchOrder(a);
      const bOrder = lessonBatchOrder(b);
      if (Number.isFinite(aOrder) && Number.isFinite(bOrder)) return aOrder - bOrder;
      if (Number.isFinite(aOrder) !== Number.isFinite(bOrder)) return Number.isFinite(aOrder) ? -1 : 1;
      return 0;
    });
    data.lessons.push(...accepted);
    saveData();
    closeBatchImporter();
    $("batchText").value = "";
    renderHome();
    toast(`已导入 ${accepted.length} 篇${accepted.length < lessons.length ? `，跳过 ${lessons.length - accepted.length} 篇重复内容` : ""}`);
  }

  function loadBatchFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("batchText").value = String(reader.result || "");
      toast("文件已读取，请确认后导入");
      $("batchFileInput").value = "";
    };
    reader.onerror = () => toast("无法读取所选文件");
    reader.readAsText(file, "utf-8");
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
    if (currentView === "review") renderReview();
    if (practice && practice.lesson.id === lesson.id) renderPractice();
    toast(existing ? "篇目已更新" : "篇目已加入书架");
  }

  function scopeIndices(lesson, scope) {
    const segments = segmentsOf(lesson);
    let indices = segments.map((_, i) => i);
    if (scope === "due") indices = indices.filter(i => isDue(reviewOf(lesson, i)));
    if (scope === "difficult") indices = indices.filter(i => reviewOf(lesson, i).difficult);
    return indices.length ? indices : segments.map((_, i) => i);
  }

  function openPractice(lessonId, scope = "all") {
    const lesson = data.lessons.find(x => x.id === lessonId);
    if (!lesson) return;
    practice = { lesson, scope, indices: scopeIndices(lesson, scope), position: 0, mode: "read", revealed: false };
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    $("practiceView").classList.add("active");
    $("bottomNav").classList.add("hidden");
    renderPractice();
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

  let fullTextFitTimer = null;

  function poetryDisplayLines(value) {
    const sourceLines = String(value || "").replace(/\r/g, "").split(/\n+/)
      .map(line => line.trim()).filter(Boolean);
    if (sourceLines.length > 1) return sourceLines;
    return sourceLines.flatMap(line =>
      line.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [line]);
  }

  function renderFullText(lesson) {
    const text = $("segmentText");
    if (lesson.type !== "古诗") {
      text.textContent = lesson.content;
      return;
    }
    const lines = poetryDisplayLines(lesson.content);
    text.innerHTML = lines.map(line =>
      `<span class="full-text-line">${esc(line)}</span>`).join("");
  }

  function fullTextRenderedLinesFit(text) {
    const lines = Array.from(text.querySelectorAll(".full-text-line"));
    if (!lines.length) return true;
    const availableWidth = Math.max(1, text.clientWidth - 12);
    return lines.every(line => line.scrollWidth <= availableWidth);
  }

  function fitFullText() {
    if (!practice || practice.mode !== "full" ||
        !window.matchMedia("(orientation: landscape)").matches) return;
    const text = $("segmentText");
    if (!text || text.clientWidth < 40 || text.clientHeight < 40) return;
    let low = 12;
    let high = 72;
    let best = low;
    for (let step = 0; step < 12; step++) {
      const size = (low + high) / 2;
      text.style.fontSize = size.toFixed(2) + "px";
      const fits = fullTextRenderedLinesFit(text) &&
        text.scrollHeight <= text.clientHeight + 1;
      if (fits) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }
    // 真机渲染再保留4%余量；古诗行本身禁止换行，因此文字和标点始终保持在同一行。
    text.style.fontSize = Math.max(12, best * 0.96).toFixed(1) + "px";
  }

  function scheduleFullTextFit() {
    clearTimeout(fullTextFitTimer);
    requestAnimationFrame(() => {
      fitFullText();
      fullTextFitTimer = setTimeout(fitFullText, 120);
    });
  }

  function exitFullTextMode() {
    if (!practice || practice.mode !== "full") return;
    practice.mode = "read";
    renderPractice();
  }

  function renderPractice() {
    if (!practice) return;
    const { lesson, indices, position, mode } = practice;
    const allSegments = segmentsOf(lesson);
    const actualIndex = indices[position];
    const segment = allSegments[actualIndex] || "";
    const review = reviewOf(lesson, actualIndex);
    const fullTextMode = mode === "full";
    $("practiceView").classList.toggle("full-text-mode", fullTextMode);
    $("practiceTitle").textContent = lesson.title;
    $("practiceMeta").textContent = [lesson.type, lesson.author].filter(Boolean).join(" · ");
    $("practiceView").classList.toggle("poetry-text", lesson.type === "古诗");
    $("segmentIndex").textContent = fullTextMode ? `全文 · 共 ${allSegments.length} 句` : `第 ${position + 1} / ${indices.length} 句`;
    $("practiceProgress").style.width = fullTextMode ? "100%" : `${(position + 1) / indices.length * 100}%`;
    $("modeTabs").querySelectorAll("button").forEach(button =>
      button.classList.toggle("active", button.dataset.mode === mode));
    $("revealBtn").classList.toggle("hidden", fullTextMode || mode !== "recite" || practice.revealed);
    if (fullTextMode) renderFullText(lesson);
    else if (mode === "read" || practice.revealed) $("segmentText").textContent = segment;
    else if (mode === "cloze") $("segmentText").textContent = cloze(segment);
    else $("segmentText").textContent = "＿＿＿＿＿＿＿＿";
    $("memoryHint").textContent = fullTextMode ? "可边看全文边播放，横屏显示空间更大。" :
      mode === "recite" && !practice.revealed
        ? `开头提示：${segment.replace(/[，。！？；、“”‘’]/g, "").slice(0, 2)}……`
        : review.level === "new" ? "先读准，再合上原文背。" :
          `当前状态：${{mastered:"已掌握",vague:"模糊",unfamiliar:"不熟"}[review.level] || "未学习"}`;
    $("prevBtn").disabled = fullTextMode || position === 0;
    $("nextBtn").disabled = fullTextMode || position === indices.length - 1;
    $("toggleDifficultBtn").textContent = review.difficult ? "★ 已是重难点" : "☆ 标为重难点";
    $("notesBox").classList.toggle("hidden", !lesson.notes);
    $("notesText").textContent = lesson.notes || "";
    renderAudioStatus();
    if (fullTextMode) {
      scheduleFullTextFit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFullTextFit);
    } else $("segmentText").style.fontSize = "";
  }

  function hasImportedAudio(lesson) {
    if (!lesson || !lesson.audioName || !(window.Native && Native.hasImportedAudio)) return false;
    try { return Boolean(Native.hasImportedAudio(lesson.id)); } catch (_) { return false; }
  }

  function renderAudioStatus() {
    if (!practice) return;
    const lesson = practice.lesson;
    const available = hasImportedAudio(lesson);
    $("audioStatus").textContent = available
      ? `已导入：${lesson.audioName}。播放全文时优先使用并持续循环。`
      : lesson.audioName
        ? "原 MP3 文件已丢失，请重新导入。"
        : "未导入 MP3，整篇播放时使用系统语音。";
    $("importAudioBtn").textContent = available ? "更换 MP3" : "导入 MP3";
    $("removeAudioBtn").classList.toggle("hidden", !available && !lesson.audioName);
  }

  window.onNativeAudioImported = (lessonId, fileName) => {
    const lesson = data.lessons.find(item => item.id === lessonId);
    if (!lesson) return;
    lesson.audioName = fileName || "已导入的音频.mp3";
    saveData();
    if (practice && practice.lesson.id === lessonId) renderAudioStatus();
    toast("MP3 已导入，整篇播放时将优先使用");
  };

  function importLessonAudio() {
    if (!practice) return;
    if (window.Native && Native.pickAudio) Native.pickAudio(practice.lesson.id);
    else toast("请在安卓 APP 中导入 MP3");
  }

  function removeLessonAudio() {
    if (!practice || !practice.lesson.audioName) return;
    if (!confirm("确定移除这篇内容的 MP3 吗？")) return;
    if (window.Native && Native.removeImportedAudio) Native.removeImportedAudio(practice.lesson.id);
    delete practice.lesson.audioName;
    saveData();
    renderAudioStatus();
    toast("MP3 已移除");
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
    return data.settings || { rate: 0.8, pause: 1, repeat: 2, voice: "network" };
  }

  const voiceDescriptions = {
    network: "优先使用手机朗读引擎提供的免费高品质网络中文音色；没有时自动回退到本地中文音色。",
    female: "优先选择手机中较自然的中文女声，适合课文和文言文跟读。",
    male: "优先选择设备中真实的中文男声；找不到时使用最高品质中文音色，不再强行压低音调。",
    yunjian: "优先使用设备中的云健/Yunjian男声；找不到时回退到高品质中文音色。整篇只按原文标点断句。",
    poetry: "优先选择高品质中文音色，整首一次朗读，只按原文标点自然断句。"
  };

  function normalizedVoice(value) {
    return ["network", "female", "male", "yunjian", "poetry"].includes(value) ? value : "network";
  }

  function pickBrowserVoice(style) {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices().filter(voice =>
      /^(zh|cmn)/i.test(voice.lang || "") || /chinese|中文|普通话/i.test(voice.name || ""));
    if (!voices.length) return null;
    const highQuality = /natural|neural|premium|wavenet|network/i;
    if (style === "network") {
      return voices.find(voice => voice.localService === false && highQuality.test(voice.name || ""))
        || voices.find(voice => voice.localService === false)
        || voices.find(voice => highQuality.test(voice.name || ""))
        || voices[0];
    }
    const maleStyle = style === "male" || style === "yunjian";
    const tokens = maleStyle
      ? (style === "yunjian" ? /yunjian|云健/i : /male|man|boy|yunxi|yunyang|yunjian|kangkang|gang|liang/i)
      : /female|woman|girl|xiaoxiao|xiaoyi|tingting|yaoyao|huihui|meimei|zhiyu/i;
    return voices.find(voice => tokens.test(voice.name || ""))
      || voices.find(voice => highQuality.test(voice.name || ""))
      || voices[0];
  }

  function naturalSpeechText(lines) {
    return lines.map((line, index) => {
      if (/[。！？!?；;，,、：:]$/.test(line)) return line;
      return line + (index === lines.length - 1 ? "。" : "，");
    }).join("");
  }

  function startSpeech(lines, repeatOverride, loopPlayback = false) {
    const clean = lines.map(x => String(x).trim()).filter(Boolean);
    if (!clean.length) return toast("没有可朗读的内容");
    const settings = speechSettings();
    const voice = normalizedVoice(settings.voice);
    const punctuationOnly = ["network", "yunjian", "poetry"].includes(voice);
    const speechLines = punctuationOnly ? [naturalSpeechText(clean)] : clean;
    if (window.Native && Native.startPlayback) {
      Native.startPlayback(JSON.stringify(speechLines), Number(settings.rate),
        punctuationOnly ? 0 : Math.round(Number(settings.pause) * 1000),
        punctuationOnly ? 1 : (repeatOverride || Number(settings.repeat)), voice, Boolean(loopPlayback));
      return;
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const selectedVoice = pickBrowserVoice(voice);
      speechLines.forEach(line => {
        const utterance = new SpeechSynthesisUtterance(line);
        utterance.lang = "zh-CN";
        utterance.voice = selectedVoice;
        utterance.rate = Number(settings.rate);
        utterance.pitch = 1;
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
    if (hasImportedAudio(lesson) && window.Native && Native.playImportedAudio) {
      try {
        if (Native.playImportedAudio(lesson.id, lesson.title)) {
          toast("正在循环播放已导入的 MP3");
          return;
        }
      } catch (_) {}
    }
    const body = segmentsOf(lesson);
    if (!withExplanation) return startSpeech(body, 1, true);
    const lines = [];
    if (lesson.notes) lines.push("先听讲解。", ...splitSegments(lesson.notes));
    lines.push("下面开始背诵正文。");
    const repeat = Number(speechSettings().repeat);
    body.forEach(line => { for (let i = 0; i < repeat; i++) lines.push(line); });
    startSpeech(lines, 1, true);
  }

  function stopSpeech() {
    if (window.Native && Native.stopPlayback) Native.stopPlayback();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    toast("朗读已停止");
  }

  function closePractice() {
    stopSpeech();
    practice = null;
    showView(currentView === "settings" ? "settings" : currentView === "review" ? "review" : "home");
  }

  function updateSettings() {
    data.settings.rate = Number($("speechRate").value);
    data.settings.pause = Number($("speechPause").value);
    data.settings.repeat = Number($("speechRepeat").value);
    data.settings.voice = normalizedVoice($("speechVoice").value);
    $("rateOutput").textContent = data.settings.rate.toFixed(1) + "×";
    const punctuationOnly = ["network", "yunjian", "poetry"].includes(data.settings.voice);
    $("speechPause").disabled = punctuationOnly;
    $("pauseOutput").textContent = punctuationOnly ? "按标点" : data.settings.pause.toFixed(1) + " 秒";
    $("voiceHint").textContent = voiceDescriptions[data.settings.voice];
    saveData();
  }

  function populateSettings() {
    const settings = speechSettings();
    $("speechRate").value = settings.rate;
    $("speechPause").value = settings.pause;
    $("speechRepeat").value = settings.repeat;
    $("speechVoice").value = normalizedVoice(settings.voice);
    updateSettings();
  }

  function previewVoice() {
    const voice = normalizedVoice($("speechVoice").value);
    const samples = {
      network: "明月松间照，清泉石上流。竹喧归浣女，莲动下渔舟。",
      female: "让我们开始今天的背诵。先听清楚，再跟着读一遍。",
      male: "让我们开始今天的背诵。放慢一点，读准每一个字。",
      yunjian: "山不在高，有仙则名。水不在深，有龙则灵。",
      poetry: "明月松间照，清泉石上流。"
    };
    updateSettings();
    startSpeech([samples[voice]], 1);
  }

  function backupPayload() {
    return JSON.stringify({
      app: "Middle_Chinese_Recite", formatVersion: 2,
      exportedAt: new Date().toISOString(), data
    }, null, 2);
  }

  function exportBackup() {
    const backup = backupPayload();
    if (window.Native && Native.exportBackup) {
      Native.exportBackup(`语文背诵完整备份_${localDate()}.zip`, backup);
      return;
    }
    const blob = new Blob([backup], {type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `语文背诵备份_${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function normalizeRestoredData(parsed) {
    const restored = parsed && (parsed.data || parsed);
    if (!restored || !Array.isArray(restored.lessons)) throw new Error("格式不正确");
    restored.settings = Object.assign({rate:.8,pause:1,repeat:2,voice:"network"}, restored.settings || {});
    restored.lessons.forEach(lesson => {
      lesson.reviews = lesson.reviews || {};
      lesson.createdAt = lesson.createdAt || Date.now();
    });
    return restored;
  }

  function applyBackupJson(jsonText, audioCount = 0, archiveReady = false) {
    try {
      const restored = normalizeRestoredData(JSON.parse(jsonText));
      const audioNotice = audioCount ? `，并恢复 ${audioCount} 个 MP3` : "";
      if (!confirm(`将恢复 ${restored.lessons.length} 个篇目${audioNotice}，并覆盖当前学习数据，继续吗？`)) {
        if (archiveReady && window.Native && Native.cancelPendingBackup) Native.cancelPendingBackup();
        return;
      }
      let restoredAudio = 0;
      if (archiveReady && window.Native && Native.applyPendingBackup) {
        restoredAudio = Number(Native.applyPendingBackup()) || 0;
        if (restoredAudio < 0) throw new Error("MP3 恢复失败");
      }
      data = restored;
      saveData();
      populateSettings();
      renderHome();
      toast(restoredAudio ? `备份恢复成功，已恢复 ${restoredAudio} 个 MP3` : "备份恢复成功");
    } catch (error) {
      if (archiveReady && window.Native && Native.cancelPendingBackup) Native.cancelPendingBackup();
      toast("无法导入：" + error.message);
    } finally {
      $("importInput").value = "";
    }
  }

  window.onNativeBackupReady = (jsonText, audioCount, archiveReady) => {
    applyBackupJson(jsonText, Number(audioCount) || 0, Boolean(archiveReady));
  };

  function chooseBackup() {
    if (window.Native && Native.pickBackup) Native.pickBackup();
    else $("importInput").click();
  }

  function importBackup(file) {
    if (!file) return;
    if (/\.(zip|mcrbackup)$/i.test(file.name || "")) {
      $("importInput").value = "";
      return toast("ZIP 完整备份请在安卓 APP 中恢复");
    }
    const reader = new FileReader();
    reader.onload = () => applyBackupJson(String(reader.result || ""));
    reader.onerror = () => toast("无法读取备份文件");
    reader.readAsText(file, "utf-8");
  }

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) return showView(nav.dataset.nav);
    const editor = event.target.closest('[data-action="open-editor"]');
    if (editor) return openEditor();
    const lessonEditor = event.target.closest("[data-edit-lesson]");
    if (lessonEditor) {
      const lesson = data.lessons.find(item => item.id === lessonEditor.dataset.editLesson);
      return lesson && openEditor(lesson);
    }
    const moveButton = event.target.closest("[data-move-lesson]");
    if (moveButton) return moveLesson(moveButton.dataset.moveLesson, moveButton.dataset.moveDirection);
    const lessonButton = event.target.closest("[data-open-lesson]");
    if (lessonButton) return openPractice(lessonButton.dataset.openLesson, lessonButton.dataset.scope || "all");
    const filter = event.target.closest("[data-library-filter]");
    if (filter) {
      if (sortMode) setSortMode(false);
      libraryFilter = filter.dataset.libraryFilter;
      document.querySelectorAll("[data-library-filter]").forEach(x => x.classList.toggle("active", x === filter));
      return renderHome();
    }
    const mode = event.target.closest("[data-mode]");
    if (mode && practice) {
      if (mode.dataset.mode === "full" &&
          !window.matchMedia("(orientation: landscape)").matches) {
        return toast("请先将手机横屏，再进入全文模式");
      }
      practice.mode = mode.dataset.mode; practice.revealed = false; return renderPractice();
    }
    const assessment = event.target.closest("[data-assess]");
    if (assessment) return assess(assessment.dataset.assess);
  });

  $("lessonForm").addEventListener("submit", saveLesson);
  $("closeEditorBtn").addEventListener("click", closeEditor);
  $("editorModal").addEventListener("click", event => { if (event.target === $("editorModal")) closeEditor(); });
  $("openBatchBtn").addEventListener("click", openBatchImporter);
  $("toggleSortBtn").addEventListener("click", () => setSortMode(!sortMode));
  $("sortByBatchBtn").addEventListener("click", sortLessonsByBatchOrder);
  $("closeBatchBtn").addEventListener("click", closeBatchImporter);
  $("batchModal").addEventListener("click", event => { if (event.target === $("batchModal")) closeBatchImporter(); });
  $("batchImportBtn").addEventListener("click", importBatchLessons);
  $("batchFileInput").addEventListener("change", event => loadBatchFile(event.target.files[0]));
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
  $("fullTextPlayBtn").addEventListener("click", () => playWhole(false));
  $("fullTextStopBtn").addEventListener("click", stopSpeech);
  $("fullTextExitBtn").addEventListener("click", exitFullTextMode);
  $("importAudioBtn").addEventListener("click", importLessonAudio);
  $("removeAudioBtn").addEventListener("click", removeLessonAudio);
  $("toggleDifficultBtn").addEventListener("click", () => {
    if (!practice) return;
    const review = reviewOf(practice.lesson, practice.indices[practice.position]);
    review.difficult = !review.difficult;
    saveData(); renderPractice();
    toast(review.difficult ? "已标为重难点" : "已移出重难点");
  });
  $("deleteLessonBtn").addEventListener("click", () => {
    if (!practice || !confirm(`确定删除《${practice.lesson.title}》及其学习记录吗？`)) return;
    if (window.Native && Native.removeImportedAudio) Native.removeImportedAudio(practice.lesson.id);
    data.lessons = data.lessons.filter(x => x.id !== practice.lesson.id);
    saveData(); practice = null; showView("home"); toast("篇目已删除");
  });
  ["speechRate","speechPause","speechRepeat","speechVoice"].forEach(id => $(id).addEventListener("input", updateSettings));
  $("previewVoiceBtn").addEventListener("click", previewVoice);
  $("ttsSettingsBtn").addEventListener("click", () => {
    if (window.Native && Native.openTtsSettings) Native.openTtsSettings();
    else toast("请到系统设置中选择中文语音");
  });
  $("exportBtn").addEventListener("click", exportBackup);
  $("importBackupBtn").addEventListener("click", chooseBackup);
  $("importInput").addEventListener("change", event => importBackup(event.target.files[0]));

  let orientationTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(orientationTimer);
    orientationTimer = setTimeout(() => {
      if (practice && practice.mode === "full") {
        if (!window.matchMedia("(orientation: landscape)").matches) exitFullTextMode();
        else scheduleFullTextFit();
      }
    }, 180);
  });

  window.appBack = () => {
    if (!$("batchModal").classList.contains("hidden")) { closeBatchImporter(); return true; }
    if (!$("editorModal").classList.contains("hidden")) { closeEditor(); return true; }
    if (practice && practice.mode === "full") { exitFullTextMode(); return true; }
    if (practice) { closePractice(); return true; }
    return false;
  };

  populateSettings();
  showView("home");
})();
