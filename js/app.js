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

  // === 页面导航 ===
  showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    this.currentPage = pageId;
    window.scrollTo(0, 0);
  },

  goBack() {
    if (this.currentPage === 'subject' || this.currentPage === 'wrong' || this.currentPage === 'stats') {
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
    document.getElementById('stats-overview').innerHTML = `
      <div class="stat-item"><div class="stat-num">${totalDone}</div><div class="stat-label">已做题数</div></div>
      <div class="stat-item"><div class="stat-num">${rate}%</div><div class="stat-label">正确率</div></div>
      <div class="stat-item"><div class="stat-num">${totalWrong}</div><div class="stat-label">错题数</div></div>`;

    // 渲染刷题计划
    this.renderPlan(subjectInfo);
  },

  renderPlan(subjectInfo) {
    // 20天计划，按科目难度分配天数
    // 策略：容易得分的科目先刷，每科集中3-4天
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
    let currentSubject = '';
    let highlightPhase = '';

    PLAN.forEach(p => {
      if (today >= currentDay && today < currentDay + p.days) {
        highlightPhase = p.key;
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
      html += `<div class="explanation">
        <div class="explanation-title">💡 解析</div>
        <div class="explanation-text">${this.escHtml(q.e)}</div></div>`;

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
      // 全科随机
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
        <div class="memo-answer-label">✅ 答案</div>
        <div class="memo-answer-text">${this.escHtml(ansText)}</div>
      </div>
      <div class="memo-explanation">
        <div class="memo-explanation-label">💡 解析</div>
        <div class="memo-explanation-text">${this.escHtml(q.e)}</div>
      </div>
    </div>`;

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
      return `<div class="wrong-item">
        <div class="wrong-item-header">
          <span class="question-type">${q.t === 'choice' ? '选择题' : q.t === 'fill' ? '填空题' : '简答题'}</span>
          <button class="wrong-remove" onclick="App.removeWrong(${q.id})">✕ 移除</button>
        </div>
        <div class="question-text">${this.escHtml(q.q)}</div>
        <div class="answer-show" style="margin-top:12px">✅ ${this.escHtml(ansText)}</div>
        <div class="explanation"><div class="explanation-text">${this.escHtml(q.e)}</div></div>
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
