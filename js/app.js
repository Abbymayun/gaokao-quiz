/* === 高考基础刷题 - 核心逻辑 === */

const SUBJECTS = {
  chinese:    { name: '语文', emoji: '📝', color: '#e74c3c' },
  math:       { name: '数学', emoji: '📐', color: '#3498db' },
  english:    { name: '英语', emoji: '🔤', color: '#2ecc71' },
  physics:    { name: '物理', emoji: '⚡', color: '#9b59b6' },
  chemistry:  { name: '化学', emoji: '🧪', color: '#f39c12' },
  politics:   { name: '政治', emoji: '🏛️', color: '#1abc9c' }
};

const SUBJECT_KEYS = Object.keys(SUBJECTS);

const App = {
  currentSubject: null,
  currentPage: 'home',
  quiz: { questions: [], index: 0, answered: false, answeredMap: {} },
  memo: { questions: [], index: 0, scope: 'subject' },
  daily: { questions: [], index: 0, answeredMap: {} },
  confirmCallback: null,

  // === 数据层 ===
  getData() {
    try {
      return JSON.parse(localStorage.getItem('gaokao_data')) || {};
    } catch { return {}; }
  },

  saveData(data) {
    localStorage.setItem('gaokao_data', JSON.stringify(data));
  },

  getSubjectData(subject) {
    const data = this.getData();
    return data[subject] || { done: 0, correct: 0, wrong: 0, wrongIds: [] };
  },

  saveSubjectData(subject, sdata) {
    const data = this.getData();
    data[subject] = sdata;
    this.saveData(data);
  },

  recordAnswer(subject, qIndex, isCorrect) {
    const sd = this.getSubjectData(subject);
    sd.done = (sd.done || 0) + 1;
    if (isCorrect) {
      sd.correct = (sd.correct || 0) + 1;
    } else {
      sd.wrong = (sd.wrong || 0) + 1;
      if (!sd.wrongIds) sd.wrongIds = [];
      if (!sd.wrongIds.includes(qIndex)) sd.wrongIds.push(qIndex);
    }
    this.saveSubjectData(subject, sd);
  },

  // === 每日记忆模式 - 进度追踪 ===
  getDailyData() {
    try {
      return JSON.parse(localStorage.getItem('gaokao_daily')) || { seenIds: {}, date: '', dailyQuota: 30, todaySubjects: {} };
    } catch { return { seenIds: {}, date: '', dailyQuota: 30, todaySubjects: {} }; }
  },

  saveDailyData(data) {
    localStorage.setItem('gaokao_daily', JSON.stringify(data));
  },

  getTodayStr() {
    return new Date().toISOString().split('T')[0];
  },

  getDailyQuestions() {
    const dd = this.getDailyData();
    const today = this.getTodayStr();

    // 如果是新的一天，重置今日进度
    if (dd.date !== today) {
      dd.date = today;
      dd.todaySubjects = {};
      dd.todayDone = 0;
      this.saveDailyData(dd);
    }

    // 获取今天需要刷的科目（基于20天计划）
    const studyDay = this.getStudyDay();
    const PLAN_MAP = {
      1: ['english'], 2: ['english'], 3: ['english'],
      4: ['politics'], 5: ['politics'], 6: ['politics'],
      7: ['chinese'], 8: ['chinese'], 9: ['chinese'], 10: ['chinese'],
      11: ['math'], 12: ['math'], 13: ['math'], 14: ['math'],
      15: ['physics'], 16: ['physics'], 17: ['physics'],
      18: ['chemistry'], 19: ['chemistry'], 20: ['chemistry'],
    };

    // 超过20天进入复习轮：优先刷错题，然后按需分配
    let todaySubjs;
    if (studyDay > 20) {
      // 复习轮：优先有错题的科目
      todaySubjs = SUBJECT_KEYS.filter(k => {
        const sd = this.getSubjectData(k);
        return (sd.wrongIds || []).length > 0;
      });
      if (todaySubjs.length === 0) todaySubjs = SUBJECT_KEYS;
    } else {
      todaySubjs = PLAN_MAP[studyDay] || ['english'];
    }

    // 收集所有未做过的题目
    let pool = [];
    const seenIds = dd.seenIds || {};

    todaySubjs.forEach(key => {
      const bank = this.getQuestionBank(key);
      bank.forEach(q => {
        const qKey = key + '_' + q.id;
        // 优先刷错题，然后是没见过的题
        const sd = this.getSubjectData(key);
        const isWrong = (sd.wrongIds || []).includes(q.id);
        const seenCount = seenIds[qKey] || 0;
        // 已做过3次以上的跳过（除非是错题）
        if (seenCount >= 3 && !isWrong) return;
        pool.push({ ...q, _subject: key, _qKey: qKey, _isWrong: isWrong, _seenCount: seenCount });
      });
    });

    // 排序：错题优先，然后按见过的次数升序
    pool.sort((a, b) => {
      if (a._isWrong !== b._isWrong) return b._isWrong - a._isWrong;
      return a._seenCount - b._seenCount;
    });

    // 取每日配额数量的题目
    const quota = dd.dailyQuota || 30;
    const selected = pool.slice(0, quota);

    // 标记这些题目为已见
    selected.forEach(q => {
      if (!dd.seenIds) dd.seenIds = {};
      dd.seenIds[q._qKey] = (dd.seenIds[q._qKey] || 0) + 1;
    });
    this.saveDailyData(dd);

    return selected;
  },

  getDailyProgress() {
    const dd = this.getDailyData();
    const today = this.getTodayStr();
    if (dd.date !== today) return { done: 0, correct: 0, total: 0 };
    return {
      done: dd.todayDone || 0,
      correct: dd.todayCorrect || 0,
      total: dd.dailyQuota || 30
    };
  },

  recordDailyAnswer(q, isCorrect) {
    const dd = this.getDailyData();
    const today = this.getTodayStr();
    if (dd.date !== today) {
      dd.date = today;
      dd.todaySubjects = {};
      dd.todayDone = 0;
      dd.todayCorrect = 0;
    }
    dd.todayDone = (dd.todayDone || 0) + 1;
    if (isCorrect) dd.todayCorrect = (dd.todayCorrect || 0) + 1;
    this.saveDailyData(dd);
    // 同时记录到对应科目数据
    this.recordAnswer(q._subject, q.id, isCorrect);
  },

  // === 页面导航 ===
  showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    this.currentPage = pageId;
    window.scrollTo(0, 0);
  },

  goBack() {
    if (this.currentPage === 'daily') {
      this.showPage('home');
      this.renderHome();
    } else if (this.currentPage === 'subject' || this.currentPage === 'wrong' || this.currentPage === 'stats') {
      this.showPage('home');
      this.renderHome();
    } else if (this.currentPage === 'quiz' || this.currentPage === 'memorize') {
      this.showPage('subject');
      this.renderSubjectPage();
    }
  },

  // === 首页 ===
  renderHome() {
    const data = this.getData();
    let totalDone = 0, totalCorrect = 0, totalWrong = 0;

    // 计算各科目信息并排序（按得分难易：正确率高的排前面，没做的排最后）
    const subjectInfo = SUBJECT_KEYS.map(key => {
      const s = SUBJECTS[key];
      const sd = data[key] || { done: 0, correct: 0, wrong: 0 };
      const total = this.getQuestionBank(key).length;
      totalDone += sd.done || 0;
      totalCorrect += sd.correct || 0;
      totalWrong += sd.wrong || 0;
      const pct = total > 0 ? Math.min(100, Math.round((sd.done / total) * 100)) : 0;
      const rate = sd.done > 0 ? Math.round((sd.correct / sd.done) * 100) : -1;
      return { key, s, sd, total, pct, rate };
    });

    // 排序：有正确率的按正确率降序（越容易得分排前面），没做的放最后
    subjectInfo.sort((a, b) => {
      if (a.rate < 0 && b.rate >= 0) return 1;
      if (a.rate >= 0 && b.rate < 0) return -1;
      if (a.rate < 0 && b.rate < 0) return 0;
      return b.rate - a.rate;
    });

    const grid = document.getElementById('subject-grid');
    grid.innerHTML = subjectInfo.map(({ key, s, sd, total, pct }) => {
      return `
        <div class="subject-card" data-subject="${key}" onclick="App.openSubject('${key}')">
          <div class="subject-emoji">${s.emoji}</div>
          <div class="subject-name">${s.name}</div>
          <div class="subject-count">${sd.done || 0}/${total} 题 · 正确率 ${sd.done > 0 ? Math.round((sd.correct / sd.done) * 100) : 0}%</div>
          <div class="subject-progress"><div class="subject-progress-bar" style="width:${pct}%;background:${s.color}"></div></div>
        </div>`;
    }).join('');

    const rate = totalDone > 0 ? Math.round((totalCorrect / totalDone) * 100) : 0;

    // 每日记忆进度
    const dp = this.getDailyProgress();
    const dpPct = dp.total > 0 ? Math.round(dp.done / dp.total * 100) : 0;

    document.getElementById('stats-overview').innerHTML = `
      <div class="stat-item"><div class="stat-num">${totalDone}</div><div class="stat-label">已做题数</div></div>
      <div class="stat-item"><div class="stat-num">${rate}%</div><div class="stat-label">正确率</div></div>
      <div class="stat-item"><div class="stat-num">${totalWrong}</div><div class="stat-label">错题数</div></div>`;

    // 每日记忆入口（首页显眼位置）
    const dailyEl = document.getElementById('daily-entrance');
    if (dailyEl) {
      const studyDay = this.getStudyDay();
      const planSubjs = studyDay > 20 ? '查漏补缺' : (() => {
        const PLAN_MAP = {
          1: '英语', 2: '英语', 3: '英语',
          4: '政治', 5: '政治', 6: '政治',
          7: '语文', 8: '语文', 9: '语文', 10: '语文',
          11: '数学', 12: '数学', 13: '数学', 14: '数学',
          15: '物理', 16: '物理', 17: '物理',
          18: '化学', 19: '化学', 20: '化学',
        };
        return PLAN_MAP[studyDay] || '英语';
      })();
      const isComplete = dp.done >= dp.total && dp.total > 0;
      dailyEl.innerHTML = `
        <div class="daily-card ${isComplete ? 'daily-complete' : ''}" onclick="App.startDaily()">
          <div class="daily-card-left">
            <div class="daily-card-icon">${isComplete ? '🎉' : '🧠'}</div>
            <div class="daily-card-info">
              <div class="daily-card-title">每日记忆 · 第${studyDay}天</div>
              <div class="daily-card-sub">今日科目：${planSubjs} · 不重复刷题 · 自动追踪进度</div>
            </div>
          </div>
          <div class="daily-card-right">
            <div class="daily-progress-ring">
              <svg viewBox="0 0 36 36" class="circular-chart">
                <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="circle ${isComplete ? 'complete' : ''}" stroke-dasharray="${dpPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="daily-progress-text">${dpPct}%</div>
            </div>
            <div class="daily-stat">${dp.done}/${dp.total}题</div>
          </div>
        </div>`;
    }

    // 渲染刷题计划
    this.renderPlan(subjectInfo);
  },

  renderPlan(subjectInfo) {
    // 20天计划，按科目难度分配天数
    const PLAN = [
      { key: 'english',   name: '英语',   emoji: '🔤', days: 3, reason: '选择题为主，模式固定，提分最快' },
      { key: 'politics',  name: '政治',   emoji: '🏛️', days: 3, reason: '记忆型科目，背熟答案即可拿分' },
      { key: 'chinese',   name: '语文',   emoji: '📝', days: 4, reason: '语感+记忆并重，基础题拿分稳' },
      { key: 'math',      name: '数学',   emoji: '📐', days: 4, reason: '题量大但基础题套路强，集中攻克' },
      { key: 'physics',   name: '物理',   emoji: '⚡', days: 3, reason: '公式+概念理解，需要集中突破' },
      { key: 'chemistry', name: '化学',   emoji: '🧪', days: 3, reason: '知识点多但基础分好拿，集中记忆' },
    ];

    const planEl = document.getElementById('study-plan');
    if (!planEl) return;

    const today = this.getStudyDay();
    let currentDay = 1;

    PLAN.forEach(p => {
      if (today >= currentDay && today < currentDay + p.days) {
        // do nothing
      }
      currentDay += p.days;
    });

    currentDay = 1;
    let html = '';
    PLAN.forEach(p => {
      const isActive = today >= currentDay && today < currentDay + p.days;
      const isDone = today >= currentDay + p.days;
      const sd = (this.findSubjectInfo(subjectInfo, p.key) || {}).sd || { done: 0, correct: 0 };
      const total = this.getQuestionBank(p.key).length;
      const pct = total > 0 ? Math.min(100, Math.round((sd.done / total) * 100)) : 0;
      const rate = sd.done > 0 ? Math.round((sd.correct / sd.done) * 100) : 0;

      const statusClass = isDone ? 'done' : isActive ? 'active' : '';
      const statusIcon = isDone ? '✅' : isActive ? '🔥' : '⬜';
      const dayRange = `第${currentDay}-${currentDay + p.days - 1}天`;

      html += `
        <div class="plan-item ${statusClass}" onclick="${isDone || isActive ? "App.openSubject('" + p.key + "')" : ''}">
          <div class="plan-status">${statusIcon}</div>
          <div class="plan-info">
            <div class="plan-title">${p.emoji} ${p.name} <span class="plan-days">${dayRange}（${p.days}天）</span></div>
            <div class="plan-reason">${p.reason}</div>
            <div class="plan-progress">
              <div class="plan-progress-bar">
                <div class="plan-progress-fill" style="width:${pct}%"></div>
              </div>
              <span class="plan-progress-text">${sd.done || 0}/${total}题 · ${rate > 0 ? '正确率' + rate + '%' : '未开始'}</span>
            </div>
          </div>
        </div>`;
      currentDay += p.days;
    });

    // 如果超过20天
    if (today > 20) {
      html += `<div class="plan-item done">
        <div class="plan-status">🏆</div>
        <div class="plan-info">
          <div class="plan-title">第二轮复习 · 查漏补缺</div>
          <div class="plan-reason">重点关注错题本，把错题重新刷一遍</div>
        </div>
      </div>`;
    }

    planEl.innerHTML = html;
  },

  findSubjectInfo(list, key) {
    return list.find(item => item.key === key);
  },

  getStudyDay() {
    // 从localStorage读取开始日期，默认为今天
    const startStr = localStorage.getItem('gaokao_plan_start');
    const start = startStr ? new Date(startStr) : new Date();
    if (!startStr) localStorage.setItem('gaokao_plan_start', start.toISOString().split('T')[0]);
    const now = new Date();
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.min(diff + 1, 20));
  },

  openSubject(key) {
    this.currentSubject = key;
    this.showPage('subject');
    this.renderSubjectPage();
  },

  // === 科目详情页 ===
  renderSubjectPage() {
    const key = this.currentSubject;
    const s = SUBJECTS[key];
    const sd = this.getSubjectData(key);
    const total = this.getQuestionBank(key).length;
    const rate = sd.done > 0 ? Math.round((sd.correct / sd.done) * 100) : 0;

    document.getElementById('subject-title').textContent = s.emoji + ' ' + s.name;
    document.getElementById('wrong-count-badge').textContent = (sd.wrongIds || []).length;

    document.getElementById('subject-stats').innerHTML = `
      <div class="stat-item"><div class="stat-num">${sd.done || 0}</div><div class="stat-label">已做</div></div>
      <div class="stat-item"><div class="stat-num">${rate}%</div><div class="stat-label">正确率</div></div>
      <div class="stat-item"><div class="stat-num">${(sd.wrongIds || []).length}</div><div class="stat-label">错题</div></div>
      <div class="stat-item"><div class="stat-num">${total}</div><div class="stat-label">总题数</div></div>`;

    // 重新刷题按钮状态
    const resetBtn = document.getElementById('btn-reset-quiz');
    if (resetBtn) {
      if ((sd.done || 0) > 0) {
        resetBtn.style.display = 'inline-flex';
      } else {
        resetBtn.style.display = 'none';
      }
    }
  },

  resetQuiz() {
    const sd = this.getSubjectData(this.currentSubject);
    if ((sd.done || 0) === 0) { this.showToast('还没有刷题记录'); return; }
    const wrongIds = sd.wrongIds || [];
    this.showConfirm('确定重新刷题吗？\n将清空做题记录（正确率/已做题数），但保留错题本。', () => {
      sd.done = 0;
      sd.correct = 0;
      sd.wrong = 0;
      // 错题本保留不动
      this.saveSubjectData(this.currentSubject, sd);
      this.renderSubjectPage();
      this.showToast('已重置，可以重新刷题了！');
    });
  },

  // === 刷题模式 ===
  startQuiz() {
    const bank = this.getQuestionBank(this.currentSubject);
    if (bank.length === 0) { this.showToast('题库为空'); return; }
    // 随机打乱
    this.quiz.questions = this.shuffle([...bank]);
    this.quiz.index = 0;
    this.quiz.answeredMap = {};
    this.quiz.answered = false;
    this.showPage('quiz');
    this.renderQuiz();
  },

  renderQuiz() {
    const q = this.quiz.questions[this.quiz.index];
    if (!q) return;

    const total = this.quiz.questions.length;
    document.getElementById('quiz-progress').textContent = `${this.quiz.index + 1}/${total}`;

    const typeName = q.t === 'choice' ? '选择题' : q.t === 'fill' ? '填空题' : '简答题';
    const sd = this.getSubjectData(this.currentSubject);
    const hasRecord = sd.wrongIds && sd.wrongIds.includes(q.id);
    const wrongTag = hasRecord ? '<span style="color:#ea4335;margin-left:8px;font-size:12px;">⚠ 曾做错</span>' : '';

    let html = `<div class="question-card">
      <span class="question-type">${typeName}${wrongTag}</span>
      <div class="question-text">${this.quiz.index + 1}. ${this.escHtml(q.q)}</div>`;

    if (q.t === 'choice') {
      html += `<div class="options" id="options-area">`;
      const labels = ['A', 'B', 'C', 'D'];
      q.o.forEach((opt, i) => {
        let cls = 'option-btn';
        const rec = this.quiz.answeredMap[this.quiz.index];
        if (rec) {
          cls += ' disabled';
          if (i === q.a) cls += ' correct';
          else if (i === rec.selected && rec.selected !== q.a) cls += ' wrong';
        }
        html += `<button class="${cls}" onclick="App.selectOption(${i})" data-idx="${i}">
          <span class="option-label">${labels[i]}</span><span>${this.escHtml(opt)}</span></button>`;
      });
      html += `</div>`;
    } else if (q.t === 'fill') {
      const rec = this.quiz.answeredMap[this.quiz.index];
      const val = rec ? rec.input : '';
      const cls = rec ? (rec.correct ? 'correct' : 'wrong') : '';
      html += `<input class="fill-input ${cls}" id="fill-input" placeholder="请输入答案" value="${this.escHtml(val)}" ${rec ? 'readonly' : ''} onkeydown="if(event.key==='Enter')App.checkFill()">
        <div class="fill-actions">
          <button class="btn btn-primary" onclick="App.checkFill()" ${rec ? 'disabled' : ''}>提交答案</button>
        </div>`;
    } else {
      const rec = this.quiz.answeredMap[this.quiz.index];
      if (!rec) {
        html += `<div class="short-answer-area">
          <button class="btn btn-primary self-check-btn" onclick="App.showShortAnswer()">查看答案</button></div>`;
      }
    }

    // 显示答案和解析
    const rec = this.quiz.answeredMap[this.quiz.index];
    if (rec) {
      const labels = ['A', 'B', 'C', 'D'];
      let ansText = q.t === 'choice' ? labels[q.a] + '. ' + q.o[q.a] : q.a;
      html += `<div class="answer-show">✅ 正确答案：${this.escHtml(ansText)}</div>`;

      // 错误答案提示（选择题）
      if (q.t === 'choice') {
        html += `<div class="wrong-options-show">
          <div class="wrong-options-title">❌ 干扰项排除</div>`;
        q.o.forEach((opt, i) => {
          if (i !== q.a) {
            html += `<div class="wrong-option-item"><span class="wrong-option-label">${labels[i]}</span> ${this.escHtml(opt)}</div>`;
          }
        });
        html += `</div>`;
      }

      // 详细解析
      html += this.renderDetailedExplanation(q);

      if (q.t === 'short') {
        html += `<div class="self-check-result">
          <button class="btn ${rec.selfCorrect ? 'btn-primary' : 'btn-secondary'}" onclick="App.selfCheck(true)">我答对了</button>
          <button class="btn ${!rec.selfCorrect ? 'btn-danger' : 'btn-secondary'}" onclick="App.selfCheck(false)">我没答对</button></div>`;
      }
    }

    html += `</div>`;
    document.getElementById('quiz-area').innerHTML = html;

    document.getElementById('quiz-prev').disabled = this.quiz.index === 0;
    document.getElementById('quiz-next').textContent = this.quiz.index === total - 1 ? '完成' : '下一题';
    document.getElementById('quiz-next').disabled = false;
  },

  selectOption(idx) {
    if (this.quiz.answeredMap[this.quiz.index]) return;
    const q = this.quiz.questions[this.quiz.index];
    const isCorrect = idx === q.a;
    this.quiz.answeredMap[this.quiz.index] = { selected: idx, correct: isCorrect };
    this.recordAnswer(this.currentSubject, q.id, isCorrect);
    this.renderQuiz();
  },

  checkFill() {
    if (this.quiz.answeredMap[this.quiz.index]) return;
    const input = document.getElementById('fill-input');
    const userAns = input.value.trim();
    if (!userAns) { this.showToast('请输入答案'); return; }
    const q = this.quiz.questions[this.quiz.index];
    const isCorrect = this.checkFillAnswer(userAns, q.a);
    this.quiz.answeredMap[this.quiz.index] = { input: userAns, correct: isCorrect };
    this.recordAnswer(this.currentSubject, q.id, isCorrect);
    this.renderQuiz();
  },

  checkFillAnswer(user, correct) {
    return user === correct || user.toLowerCase() === correct.toLowerCase();
  },

  showShortAnswer() {
    this.quiz.answeredMap[this.quiz.index] = { selfCorrect: null };
    this.renderQuiz();
  },

  selfCheck(isCorrect) {
    const q = this.quiz.questions[this.quiz.index];
    if (this.quiz.answeredMap[this.quiz.index]._recorded) return;
    this.quiz.answeredMap[this.quiz.index].selfCorrect = isCorrect;
    this.quiz.answeredMap[this.quiz.index]._recorded = true;
    this.recordAnswer(this.currentSubject, q.id, isCorrect);
    this.renderQuiz();
  },

  quizPrev() {
    if (this.quiz.index > 0) { this.quiz.index--; this.renderQuiz(); }
  },

  quizNext() {
    const total = this.quiz.questions.length;
    if (this.quiz.index < total - 1) {
      this.quiz.index++;
      this.renderQuiz();
    } else {
      this.endQuiz();
    }
  },

  endQuiz() {
    // 统计本次刷题结果
    const done = Object.keys(this.quiz.answeredMap).length;
    const correct = Object.values(this.quiz.answeredMap).filter(r => r.correct !== false && r.selfCorrect !== false && (r.correct === true || r.selfCorrect === true)).length;
    this.showToast(`本次刷题完成！正确 ${correct}/${done}`);
    this.showPage('subject');
    this.renderSubjectPage();
  },

  // === 背题模式 ===
  startMemorize() {
    this.memo.scope = 'subject';
    this.memo.questions = this.getQuestionBank(this.currentSubject);
    this.memo.questions = this.shuffle([...this.memo.questions]);
    this.memo.index = 0;
    document.getElementById('btn-memo-subject').classList.add('active');
    document.getElementById('btn-memo-all').classList.remove('active');
    this.showPage('memorize');
    this.renderMemo();
  },

  setMemoScope(scope) {
    if (scope === 'all') {
      let all = [];
      SUBJECT_KEYS.forEach(k => {
        const bank = this.getQuestionBank(k);
        bank.forEach(q => all.push({ ...q, _subject: k }));
      });
      this.memo.questions = this.shuffle(all);
      document.getElementById('btn-memo-all').classList.add('active');
      document.getElementById('btn-memo-subject').classList.remove('active');
    } else {
      this.memo.questions = this.getQuestionBank(this.currentSubject);
      this.memo.questions = this.shuffle([...this.memo.questions]);
      document.getElementById('btn-memo-subject').classList.add('active');
      document.getElementById('btn-memo-all').classList.remove('active');
    }
    this.memo.index = 0;
    this.renderMemo();
  },

  renderMemo() {
    if (this.memo.questions.length === 0) {
      document.getElementById('memo-area').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">没有题目</div></div>';
      return;
    }

    const q = this.memo.questions[this.memo.index];
    const labels = ['A', 'B', 'C', 'D'];
    const subjKey = q._subject || this.currentSubject;
    const s = SUBJECTS[subjKey];
    const total = this.memo.questions.length;

    let ansText = q.t === 'choice' ? labels[q.a] + '. ' + q.o[q.a] : q.a;

    let html = `<div class="memo-card">
      <span class="memo-subject-tag" data-subject="${subjKey}">${s.emoji} ${s.name}</span>
      <div class="memo-question">${this.memo.index + 1}/${total}. ${this.escHtml(q.q)}</div>
      <div class="memo-answer">
        <div class="memo-answer-label">✅ 正确答案</div>
        <div class="memo-answer-text">${this.escHtml(ansText)}</div>
      </div>`;

    // 显示错误选项（选择题）
    if (q.t === 'choice') {
      html += `<div class="memo-wrong-options">
        <div class="memo-wrong-title">❌ 错误选项（干扰项）</div>`;
      q.o.forEach((opt, i) => {
        if (i !== q.a) {
          html += `<div class="memo-wrong-item"><span class="memo-wrong-label">${labels[i]}</span> ${this.escHtml(opt)}</div>`;
        }
      });
      html += `</div>`;
    }

    // 详细解析
    html += `<div class="memo-explanation">
      <div class="memo-explanation-label">💡 解析</div>
      <div class="memo-explanation-text">${this.escHtml(q.e)}</div>
    </div>`;

    html += `</div>`;
    document.getElementById('memo-area').innerHTML = html;
  },

  memoPrev() {
    if (this.memo.index > 0) { this.memo.index--; this.renderMemo(); }
  },

  memoNext() {
    if (this.memo.index < this.memo.questions.length - 1) { this.memo.index++; this.renderMemo(); }
    else { this.showToast('已是最后一题'); }
  },

  endMemorize() {
    this.showPage('subject');
    this.renderSubjectPage();
  },

  // === 每日记忆模式 ===
  startDaily() {
    const dp = this.getDailyProgress();
    if (dp.done >= dp.total) {
      this.showConfirm('今日任务已完成！\n要重新刷一套新的题目吗？', () => {
        // 重置今日进度
        const dd = this.getDailyData();
        dd.todayDone = 0;
        dd.todayCorrect = 0;
        this.saveDailyData(dd);
        this._initDaily();
      });
      return;
    }
    this._initDaily();
  },

  _initDaily() {
    this.daily.questions = this.getDailyQuestions();
    if (this.daily.questions.length === 0) {
      this.showToast('今天没有需要刷的题目了，明天再来！');
      return;
    }
    this.daily.index = 0;
    this.daily.answeredMap = {};
    this.showPage('daily');
    this.renderDaily();
  },

  renderDaily() {
    if (this.daily.questions.length === 0) {
      document.getElementById('daily-area').innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">今天没有新题目了！</div></div>';
      return;
    }

    const q = this.daily.questions[this.daily.index];
    const labels = ['A', 'B', 'C', 'D'];
    const s = SUBJECTS[q._subject];
    const total = this.daily.questions.length;
    const dp = this.getDailyProgress();

    document.getElementById('daily-progress').textContent = `${this.daily.index + 1}/${total}`;
    document.getElementById('daily-stats').textContent = `今日：${dp.done}/${dp.total} · 正确${dp.correct || 0}`;

    const typeName = q.t === 'choice' ? '选择题' : q.t === 'fill' ? '填空题' : '简答题';
    const wrongTag = q._isWrong ? '<span style="color:#ea4335;margin-left:8px;font-size:12px;">⚠ 错题回顾</span>' : '';

    let html = `<div class="question-card">
      <span class="memo-subject-tag" data-subject="${q._subject}" style="margin-bottom:8px">${s.emoji} ${s.name}</span>
      <span class="question-type" style="margin-left:8px">${typeName}${wrongTag}</span>
      <div class="question-text">${this.daily.index + 1}. ${this.escHtml(q.q)}</div>`;

    if (q.t === 'choice') {
      html += `<div class="options" id="daily-options-area">`;
      q.o.forEach((opt, i) => {
        let cls = 'option-btn';
        const rec = this.daily.answeredMap[this.daily.index];
        if (rec) {
          cls += ' disabled';
          if (i === q.a) cls += ' correct';
          else if (i === rec.selected && rec.selected !== q.a) cls += ' wrong';
        }
        html += `<button class="${cls}" onclick="App.selectDailyOption(${i})" data-idx="${i}">
          <span class="option-label">${labels[i]}</span><span>${this.escHtml(opt)}</span></button>`;
      });
      html += `</div>`;
    } else if (q.t === 'fill') {
      const rec = this.daily.answeredMap[this.daily.index];
      const val = rec ? rec.input : '';
      const cls = rec ? (rec.correct ? 'correct' : 'wrong') : '';
      html += `<input class="fill-input ${cls}" id="daily-fill-input" placeholder="请输入答案" value="${this.escHtml(val)}" ${rec ? 'readonly' : ''} onkeydown="if(event.key==='Enter')App.checkDailyFill()">
        <div class="fill-actions">
          <button class="btn btn-primary" onclick="App.checkDailyFill()" ${rec ? 'disabled' : ''}>提交答案</button>
        </div>`;
    } else {
      const rec = this.daily.answeredMap[this.daily.index];
      if (!rec) {
        html += `<div class="short-answer-area">
          <button class="btn btn-primary self-check-btn" onclick="App.showDailyShortAnswer()">查看答案</button></div>`;
      }
    }

    // 答案和解析
    const rec = this.daily.answeredMap[this.daily.index];
    if (rec) {
      let ansText = q.t === 'choice' ? labels[q.a] + '. ' + q.o[q.a] : q.a;
      html += `<div class="answer-show">✅ 正确答案：${this.escHtml(ansText)}</div>`;

      // 错误选项提示
      if (q.t === 'choice') {
        html += `<div class="wrong-options-show">
          <div class="wrong-options-title">❌ 干扰项排除</div>`;
        q.o.forEach((opt, i) => {
          if (i !== q.a) {
            html += `<div class="wrong-option-item"><span class="wrong-option-label">${labels[i]}</span> ${this.escHtml(opt)}</div>`;
          }
        });
        html += `</div>`;
      }

      // 详细解析
      html += this.renderDetailedExplanation(q);

      if (q.t === 'short') {
        html += `<div class="self-check-result">
          <button class="btn ${rec.selfCorrect ? 'btn-primary' : 'btn-secondary'}" onclick="App.dailySelfCheck(true)">我答对了</button>
          <button class="btn ${!rec.selfCorrect ? 'btn-danger' : 'btn-secondary'}" onclick="App.dailySelfCheck(false)">我没答对</button></div>`;
      }
    }

    html += `</div>`;
    document.getElementById('daily-area').innerHTML = html;

    document.getElementById('daily-prev').disabled = this.daily.index === 0;
    document.getElementById('daily-next').textContent = this.daily.index === total - 1 ? '完成今日任务' : '下一题';
    document.getElementById('daily-next').disabled = false;
  },

  selectDailyOption(idx) {
    if (this.daily.answeredMap[this.daily.index]) return;
    const q = this.daily.questions[this.daily.index];
    const isCorrect = idx === q.a;
    this.daily.answeredMap[this.daily.index] = { selected: idx, correct: isCorrect };
    this.recordDailyAnswer(q, isCorrect);
    this.renderDaily();
  },

  checkDailyFill() {
    if (this.daily.answeredMap[this.daily.index]) return;
    const input = document.getElementById('daily-fill-input');
    const userAns = input.value.trim();
    if (!userAns) { this.showToast('请输入答案'); return; }
    const q = this.daily.questions[this.daily.index];
    const isCorrect = this.checkFillAnswer(userAns, q.a);
    this.daily.answeredMap[this.daily.index] = { input: userAns, correct: isCorrect };
    this.recordDailyAnswer(q, isCorrect);
    this.renderDaily();
  },

  showDailyShortAnswer() {
    this.daily.answeredMap[this.daily.index] = { selfCorrect: null };
    this.renderDaily();
  },

  dailySelfCheck(isCorrect) {
    const q = this.daily.questions[this.daily.index];
    if (this.daily.answeredMap[this.daily.index]._recorded) return;
    this.daily.answeredMap[this.daily.index].selfCorrect = isCorrect;
    this.daily.answeredMap[this.daily.index]._recorded = true;
    this.recordDailyAnswer(q, isCorrect);
    this.renderDaily();
  },

  dailyPrev() {
    if (this.daily.index > 0) { this.daily.index--; this.renderDaily(); }
  },

  dailyNext() {
    const total = this.daily.questions.length;
    if (this.daily.index < total - 1) {
      this.daily.index++;
      this.renderDaily();
    } else {
      this.endDaily();
    }
  },

  endDaily() {
    const dp = this.getDailyProgress();
    const done = Object.keys(this.daily.answeredMap).length;
    const correct = Object.values(this.daily.answeredMap).filter(r => r.correct !== false && r.selfCorrect !== false && (r.correct === true || r.selfCorrect === true)).length;
    this.showToast(`今日任务完成！正确 ${correct}/${done} 题`);
    this.showPage('home');
    this.renderHome();
  },

  // === 详细解析生成器 ===
  renderDetailedExplanation(q) {
    let html = '';

    if (q.t === 'choice') {
      html += `<div class="explanation-detailed">
        <div class="explanation-detailed-title">📖 详细解析</div>
        <div class="explanation-detailed-text">${this.escHtml(q.e)}</div>
        <div class="explanation-tips">
          <div class="tip-item tip-key">🔑 知识要点</div>
          <div class="tip-text">本题考查"${this.escHtml(q.q)}"的核心知识点。正确答案为正确选项所表述的内容，需要在理解的基础上记忆。考试中此类题目通常考查基础概念，务必准确掌握。</div>
          <div class="tip-item tip-trap">⚠️ 易错提醒</div>
          <div class="tip-text">注意区分干扰项与正确答案的细微差别。干扰项往往包含"正确但非最佳"的选项，或使用了容易混淆的近义词/概念。做题时要仔细审题，注意关键词。</div>
        </div>
      </div>`;
    } else if (q.t === 'fill') {
      html += `<div class="explanation-detailed">
        <div class="explanation-detailed-title">📖 详细解析</div>
        <div class="explanation-detailed-text">${this.escHtml(q.e)}</div>
        <div class="explanation-tips">
          <div class="tip-item tip-key">🔑 知识要点</div>
          <div class="tip-text">本题需要准确填写答案，注意用词的精确性。高考填空题对答案的准确度要求较高，建议将标准答案完整记忆，不留模糊空间。</div>
          <div class="tip-item tip-trap">⚠️ 易错提醒</div>
          <div class="tip-text">填空题常见的失分原因包括：写错别字、漏字、用词不精确等。建议多写几遍加深记忆，确保考试时能准确写出。</div>
        </div>
      </div>`;
    } else {
      html += `<div class="explanation-detailed">
        <div class="explanation-detailed-title">📖 参考答案</div>
        <div class="explanation-detailed-text">${this.escHtml(q.e)}</div>
        <div class="explanation-tips">
          <div class="tip-item tip-key">🔑 答题要点</div>
          <div class="tip-text">简答题要注意条理清晰、要点完整。建议按照"总分"结构作答：先给出概括性结论，再分点展开论述。高考阅卷是按要点给分的，尽量多写相关知识点。</div>
          <div class="tip-item tip-trap">⚠️ 易错提醒</div>
          <div class="tip-text">简答题常见失分原因：答非所问、要点不全、逻辑混乱、缺乏专业术语等。审清题目要求，用学科专业术语作答，避免口语化表达。</div>
        </div>
      </div>`;
    }

    return html;
  },

  // === 错题本 ===
  startWrongBook() {
    this.showPage('wrong');
    this.renderWrongBook();
  },

  renderWrongBook() {
    const sd = this.getSubjectData(this.currentSubject);
    const bank = this.getQuestionBank(this.currentSubject);
    const wrongIds = sd.wrongIds || [];
    const wrongQs = wrongIds.map(id => bank.find(q => q.id === id)).filter(Boolean);

    if (wrongQs.length === 0) {
      document.getElementById('wrong-area').innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">暂无错题，继续加油！</div></div>';
      return;
    }

    const labels = ['A', 'B', 'C', 'D'];
    document.getElementById('wrong-area').innerHTML = wrongQs.map((q, i) => {
      let ansText = q.t === 'choice' ? labels[q.a] + '. ' + q.o[q.a] : q.a;

      let optionsHtml = '';
      if (q.t === 'choice') {
        optionsHtml = `<div class="wrong-options-show">
          <div class="wrong-options-title">❌ 干扰项排除</div>`;
        q.o.forEach((opt, idx) => {
          if (idx !== q.a) {
            optionsHtml += `<div class="wrong-option-item"><span class="wrong-option-label">${labels[idx]}</span> ${this.escHtml(opt)}</div>`;
          }
        });
        optionsHtml += `</div>`;
      }

      return `<div class="wrong-item">
        <div class="wrong-item-header">
          <span class="question-type">${q.t === 'choice' ? '选择题' : q.t === 'fill' ? '填空题' : '简答题'}</span>
          <button class="wrong-remove" onclick="App.removeWrong(${q.id})">✕ 移除</button>
        </div>
        <div class="question-text">${this.escHtml(q.q)}</div>
        <div class="answer-show" style="margin-top:12px">✅ ${this.escHtml(ansText)}</div>
        ${optionsHtml}
        <div class="explanation"><div class="explanation-title">💡 解析</div><div class="explanation-text">${this.escHtml(q.e)}</div></div>
      </div>`;
    }).join('');
  },

  removeWrong(qId) {
    const sd = this.getSubjectData(this.currentSubject);
    sd.wrongIds = (sd.wrongIds || []).filter(id => id !== qId);
    sd.wrong = Math.max(0, (sd.wrong || 0) - 1);
    this.saveSubjectData(this.currentSubject, sd);
    this.renderWrongBook();
    this.showToast('已移除');
  },

  clearWrongBook() {
    const sd = this.getSubjectData(this.currentSubject);
    if (!sd.wrongIds || sd.wrongIds.length === 0) { this.showToast('没有错题'); return; }
    this.showConfirm('确定要清空所有错题记录吗？', () => {
      sd.wrongIds = [];
      sd.wrong = 0;
      this.saveSubjectData(this.currentSubject, sd);
      this.renderWrongBook();
      this.renderSubjectPage();
      this.showToast('错题已清空');
    });
  },

  // === 统计页 ===
  showStats() {
    this.showPage('stats');
    this.renderStats();
  },

  renderStats() {
    const key = this.currentSubject;
    const s = SUBJECTS[key];
    const sd = this.getSubjectData(key);
    const total = this.getQuestionBank(key).length;
    const done = sd.done || 0;
    const correct = sd.correct || 0;
    const wrong = sd.wrong || 0;
    const rate = done > 0 ? Math.round((correct / done) * 100) : 0;
    const wrongIds = sd.wrongIds || [];

    let html = `<div class="stats-detail">
      <div class="stats-card">
        <h3>📊 ${s.name} 总览</h3>
        <div class="stat-row"><span>总题数</span><span>${total}</span></div>
        <div class="stat-row"><span>已做题数</span><span>${done}</span></div>
        <div class="stat-row"><span>答对</span><span style="color:#34a853">${correct}</span></div>
        <div class="stat-row"><span>答错</span><span style="color:#ea4335">${wrong}</span></div>
        <div class="stat-row"><span>正确率</span><span style="font-weight:700">${rate}%</span></div>
        <div class="stat-row"><span>错题数</span><span style="color:#ea4335">${wrongIds.length}</span></div>
        <div style="margin-top:12px">
          <div style="font-size:13px;color:#6b7280">刷题进度</div>
          <div class="stats-bar"><div class="stats-bar-fill" style="width:${Math.round(done/total*100)}%;background:${s.color}"></div></div>
          <div style="text-align:right;font-size:12px;color:#6b7280;margin-top:4px">${Math.round(done/total*100)}%</div>
        </div>
      </div>`;

    if (done > 0) {
      html += `<div class="stats-card"><h3>📈 正确率分布</h3>
        <div style="display:flex;height:24px;border-radius:6px;overflow:hidden">
          <div style="width:${rate}%;background:#34a853;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700">${rate}%</div>
          <div style="width:${100-rate}%;background:#ea4335;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700">${100-rate}%</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-top:6px">
          <span>✅ 答对 ${correct}</span><span>❌ 答错 ${wrong}</span>
        </div></div>`;
    }

    html += `<div class="stats-card"><h3>💡 建议</h3><p style="font-size:14px;line-height:1.7;color:#555">`;
    if (done === 0) {
      html += '还没有开始刷题，赶紧开始吧！建议先从背题模式入手，快速了解常见题型。';
    } else if (rate >= 80) {
      html += `正确率不错！继续保持。剩余 ${total - done} 题还没做，可以适当加快速度。`;
    } else if (rate >= 60) {
      html += `正确率还可以，但有提升空间。建议重点复习错题本中的 ${wrongIds.length} 道错题，然后再刷新题。`;
    } else {
      html += `正确率偏低，建议先切换到背题模式，把基础题目和答案多看几遍，形成记忆后再来刷题。不要着急，20天足够提分！`;
    }
    html += `</p></div>`;

    html += `<div class="stats-card"><h3>🗑️ 数据管理</h3>
      <button class="btn btn-danger" onclick="App.showConfirm('确定要清空${s.name}的所有数据吗？（包括做题记录、错题本）', ()=>{localStorage.removeItem('gaokao_data');App.renderStats();App.renderSubjectPage();App.showToast('数据已清空')})">清空本科目所有数据</button>
    </div>`;

    html += `</div>`;
    document.getElementById('stats-area').innerHTML = html;
  },

  // === 工具方法 ===
  getQuestionBank(subject) {
    const banks = {
      chinese: typeof QUESTIONS_CHINESE !== 'undefined' ? QUESTIONS_CHINESE : [],
      math: typeof QUESTIONS_MATH !== 'undefined' ? QUESTIONS_MATH : [],
      english: typeof QUESTIONS_ENGLISH !== 'undefined' ? QUESTIONS_ENGLISH : [],
      physics: typeof QUESTIONS_PHYSICS !== 'undefined' ? QUESTIONS_PHYSICS : [],
      chemistry: typeof QUESTIONS_CHEMISTRY !== 'undefined' ? QUESTIONS_CHEMISTRY : [],
      politics: typeof QUESTIONS_POLITICS !== 'undefined' ? QUESTIONS_POLITICS : []
    };
    return banks[subject] || [];
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
  },

  showConfirm(text, callback) {
    document.getElementById('confirm-text').textContent = text;
    document.getElementById('confirm-modal').classList.remove('hidden');
    this.confirmCallback = callback;
  },

  confirmOk() {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (this.confirmCallback) this.confirmCallback();
    this.confirmCallback = null;
  },

  confirmCancel() {
    document.getElementById('confirm-modal').classList.add('hidden');
    this.confirmCallback = null;
  }
};

// 启动
document.addEventListener('DOMContentLoaded', () => {
  App.renderHome();
});
