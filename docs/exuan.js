/**
 * 腾讯营销 × 鹅选美妆节 · 客户页
 * 上半部分：报规划（10.13 截止，不卡死，逾期标记）
 * 下半部分：排位赛凭证（随时可传；每个排位事项一个上传入口，可多张）
 */
(function () {
  'use strict';

  var XC = window.HB_EXUAN;
  var GHUB = window.HBGitHub;
  var BRANDS = (window.HB_PRODUCTS && window.HB_PRODUCTS.brands) || [];
  var DRAFT_KEY = 'huobu_exuan_draft_v2';
  var VMODS = XC.voucher.modules || [];

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function fmtT(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var state = { brand: '', answers: {}, remark: '', extra: {}, lastMod: '' };

  /* ================= 头部 ================= */
  $('#actNav').innerHTML = '<a class="act-tab" href="index.html">← 全部活动</a>'
    + '<span class="act-tab on">鹅选美妆节</span>';
  $('#exTitle').textContent = XC.activityName;
  if (XC.logo) {
    $('#exLogo').innerHTML = '<img src="' + esc(XC.logo) + '" alt="视频号11.11 鹅选美妆节"/>';
    $('#exLogo').style.display = '';
  }
  $('#exSub').textContent = XC.subTitle + ' · ' + XC.intro.time;
  $('#exRights').innerHTML = XC.intro.rights.map(function (r) {
    return '<div class="ex-right"><b>' + esc(r.name) + '</b><span>' + esc(r.desc) + '</span></div>';
  }).join('');
  $('#p1Title').textContent = XC.part1.title;
  $('#p1Time').textContent = XC.part1.timeTip;
  $('#p2Title').textContent = XC.voucher.title;
  $('#p2Time').innerHTML = esc(XC.voucher.timeTip) + '　<b>' + esc(XC.voucher.totalScore) + '</b>';
  $('#p2Rank').textContent = XC.voucher.rankTip || '';
  $('#vFile').accept = XC.voucher.accept || '';
  $('#brandList').innerHTML = BRANDS.map(function (b) {
    return '<option value="' + esc(b) + '"></option>';
  }).join('');

  /* ================= 截止时间（不卡死） ================= */
  var deadline = XC.deadline ? new Date(XC.deadline) : null;
  function isLate() { return !!(deadline && new Date() > deadline); }
  function renderDeadline() {
    var box = $('#deadlineBox');
    if (!deadline) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    var ms = deadline - new Date();
    if (ms > 0) {
      var d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000),
        m = Math.floor(ms % 3600000 / 60000);
      box.className = 'deadline-box light';
      box.innerHTML = '⏰ 距截止还剩 <b>' + (d ? d + ' 天 ' : '') + h + ' 小时 ' + m + ' 分</b>';
    } else {
      box.className = 'deadline-box light late';
      box.innerHTML = '⚠ 已过 10.13 截止时间，仍可提交，但会标记为「逾期提交」';
    }
  }
  renderDeadline();
  setInterval(renderDeadline, 30000);

  /* ================= 上半部分题目 ================= */
  function visible(q) {
    if (!q.showWhen) return true;
    var v = state.answers[q.showWhen.key];
    return Array.isArray(v) ? v.indexOf(q.showWhen.equals) >= 0 : v === q.showWhen.equals;
  }

  function renderQuestions() {
    var n = 1;  // 1 号题是品牌名称
    $('#questionBox').innerHTML = XC.questions.map(function (q) {
      if (!visible(q)) return '';
      n++;
      var v = state.answers[q.key];
      var h = '<div class="q-item"><div class="q-title"><span class="q-no">' + n + '</span>'
        + esc(q.title) + (q.required !== false ? ' <span class="req">*</span>' : '')
        + (q.type === 'multi' ? ' <span class="q-multi">多选</span>' : '') + '</div>';

      if (q.type === 'dates') {
        // 多个日期：选一个日期点「添加」，已选日期以标签展示，可删
        var ds = toDates(v);
        h += '<div class="q-inline"><input class="q-input q-date-pick" type="date" data-dk="' + esc(q.key) + '"'
          + (q.min ? ' min="' + q.min + '"' : '') + (q.max ? ' max="' + q.max + '"' : '') + '/>'
          + '<button class="btn ghost sm q-date-add" data-dk="' + esc(q.key) + '">＋ 添加日期</button></div>'
          + '<div class="q-dates">' + (ds.length ? ds.map(function (d) {
            return '<span class="q-date">' + esc(fmtDate(d))
              + '<button class="q-date-rm" data-dk="' + esc(q.key) + '" data-d="' + esc(d) + '" title="删除">×</button></span>';
          }).join('') : '<span class="q-date-empty">还没有添加日期，选好后点「添加日期」，可添加多个</span>') + '</div>';
      } else if (q.type === 'text' || q.type === 'number' || q.type === 'date') {
        var attrs = ' data-qk="' + esc(q.key) + '" value="' + esc(v || '') + '"'
          + ' placeholder="' + esc(q.placeholder || '') + '"';
        if (q.type === 'number') attrs += ' type="number" step="any" inputmode="decimal"';
        else if (q.type === 'date') {
          attrs += ' type="date"' + (q.min ? ' min="' + q.min + '"' : '') + (q.max ? ' max="' + q.max + '"' : '');
        }
        h += '<div class="q-inline"><input class="q-input"' + attrs + '/>'
          + (q.unit ? '<span class="q-unit">' + esc(q.unit) + '</span>' : '') + '</div>';
      } else {
        var arr = Array.isArray(v) ? v : (v ? [v] : []);
        var rich = q.options.some(function (op) { return typeof op === 'object'; });
        h += '<div class="chips' + (rich ? ' chips-rich' : '') + '">' + q.options.map(function (op) {
          var label = typeof op === 'object' ? op.label : op;
          var on = arr.indexOf(label) >= 0 ? ' on' : '';
          if (typeof op !== 'object') {
            return '<span class="chip' + on + '" data-qk="' + esc(q.key) + '" data-op="' + esc(label) + '">' + esc(label) + '</span>';
          }
          return '<span class="chip chip-rich' + on + '" data-qk="' + esc(q.key) + '" data-op="' + esc(label) + '">'
            + '<b>' + esc(label) + '</b>'
            + (op.url ? '<a class="chip-link" href="' + esc(op.url) + '" target="_blank" rel="noopener">介绍：'
              + esc(op.desc || '查看详情') + ' ↗</a>' : '')
            + '</span>';
        }).join('') + '</div>';
      }
      if (q.hint) h += '<div class="hint">' + esc(q.hint) + '</div>';
      return h + '</div>';
    }).join('');
  }

  /** 兼容旧草稿：单个日期字符串 → 数组 */
  function toDates(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return v ? [String(v)] : [];
  }
  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    var wk = '日一二三四五六'.charAt(new Date(+m[1], +m[2] - 1, +m[3]).getDay());
    return (+m[2]) + '月' + (+m[3]) + '日（周' + wk + '）';
  }

  $('#questionBox').addEventListener('click', function (e) {
    if (e.target.closest('.chip-link')) return;   // 点「介绍」只打开链接，不切换选中

    var add = e.target.closest('.q-date-add');
    var rm = e.target.closest('.q-date-rm');
    if (add || rm) {
      e.preventDefault();
      var dk = (add || rm).dataset.dk;
      var qd = XC.questions.filter(function (x) { return x.key === dk; })[0];
      var ds = toDates(state.answers[dk]);
      if (add) {
        var inp = document.querySelector('.q-date-pick[data-dk="' + dk + '"]');
        var val = inp && inp.value;
        if (!val) { alert('请先选择一个日期'); if (inp) inp.focus(); return; }
        if ((qd.min && val < qd.min) || (qd.max && val > qd.max)) {
          alert('日期需在 ' + qd.min + ' 至 ' + qd.max + ' 之间');
          return;
        }
        if (ds.indexOf(val) < 0) ds.push(val);
      } else {
        ds = ds.filter(function (d) { return d !== rm.dataset.d; });
      }
      ds.sort();
      state.answers[dk] = ds;
      saveDraft();
      renderQuestions();
      return;
    }

    var chip = e.target.closest('.chip');
    if (!chip) return;
    var q = XC.questions.filter(function (x) { return x.key === chip.dataset.qk; })[0];
    if (!q) return;
    var op = chip.dataset.op;
    if (q.type === 'single') {
      state.answers[q.key] = op;
    } else {
      var arr = Array.isArray(state.answers[q.key]) ? state.answers[q.key] : [];
      var i = arr.indexOf(op);
      if (i >= 0) arr.splice(i, 1); else arr.push(op);
      state.answers[q.key] = arr;
    }
    saveDraft();
    renderQuestions();
  });
  $('#questionBox').addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.qk;
    if (!k) return;
    state.answers[k] = e.target.value;
    saveDraft();
  });

  /* ================= 草稿 ================= */
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { }
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && typeof d === 'object') {
        state.brand = d.brand || '';
        state.answers = d.answers || {};
        state.remark = d.remark || '';
        state.extra = d.extra || {};
        state.lastMod = d.lastMod || '';
        XC.questions.forEach(function (q) {
          if (q.type === 'dates') state.answers[q.key] = toDates(state.answers[q.key]);
        });
      }
    } catch (e) { }
  }

  /* ================= 提交上半部分 ================= */
  function validate() {
    var miss = [];
    if (!state.brand.trim()) miss.push('品牌名称');
    XC.questions.forEach(function (q) {
      if (!visible(q) || q.required === false) return;
      var v = state.answers[q.key];
      if (Array.isArray(v) ? !v.length : !String(v == null ? '' : v).trim()) miss.push(q.title);
    });
    return miss;
  }

  function answerText(q, v) {
    if (v == null || v === '') return '';
    var t = Array.isArray(v) ? v.join('、') : String(v);
    return q.unit && t ? t + q.unit : t;
  }

  function issueBody(rec) {
    var lines = [
      '**模块**：' + XC.activityName + ' · 报规划',
      '**品牌名称**：' + rec.brand,
      '**提交时间**：' + rec.createdAt + (rec.late ? '（逾期提交）' : ''),
      '',
    ];
    XC.questions.forEach(function (q) {
      lines.push('- ' + q.title + '：' + (answerText(q, rec.answers[q.key]) || '-'));
    });
    if (rec.remark) lines.push('', '**备注**：' + rec.remark);
    lines.push('', '<!-- 以下为机器读取用，请勿修改 -->', '```json', JSON.stringify(rec), '```');
    return lines.join('\n');
  }

  function downloadReceipt(rec) {
    var blob = new Blob([JSON.stringify(rec, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '鹅选美妆节_' + rec.brand + '_' + rec.id + '.hbjson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function showDone(rec, online) {
    $('#doneTitle').textContent = online ? '报规划提交成功！' : '已生成回执文件';
    $('#doneId').innerHTML = (rec.late ? '<span style="color:#c47f00">已标记：逾期提交</span><br/>' : '')
      + '编号：' + esc(rec.id)
      + (online ? '<br/>接下来可以在下方「排位赛」上传凭证，周期内随时可传'
        : '<br/>请将下载的回执文件发回给对接的腾讯销售');
    $('#doneBtns').innerHTML = '<button class="btn primary" id="btnGoV">去传凭证</button>';
    $('#btnGoV').onclick = function () {
      $('#doneMask').classList.remove('show');
      $('#voucherCard').scrollIntoView({ behavior: 'smooth' });
    };
    $('#doneMask').classList.add('show');
  }

  function submit() {
    var miss = validate();
    if (miss.length) {
      alert('以下为必填，请补充：\n· ' + miss.join('\n· '));
      return;
    }
    var rec = {
      id: 'EX' + Date.now().toString(36).toUpperCase(),
      module: 'exuan',
      kind: 'plan',
      brand: state.brand.trim(),
      late: isLate(),
      answers: state.answers,
      remark: state.remark.trim(),
      createdAt: new Date().toISOString(),
    };
    var btn = $('#btnSubmit');
    btn.disabled = true;

    if (!GHUB.enabled()) {
      downloadReceipt(rec);
      showDone(rec, false);
      btn.disabled = false;
      return;
    }
    GHUB.submitIssue('[鹅选美妆节·报规划] ' + rec.brand + (rec.late ? '（逾期）' : '') + ' · ' + rec.id,
      issueBody(rec), [XC.label])
      .then(function () {
        $('#p1State').innerHTML = '<span style="color:#06a552">✓ 已提交 ' + fmtT(rec.createdAt)
          + '</span>，如需修改可重新提交，以最新一次为准';
        showDone(rec, true);
      })
      .catch(function (e) {
        alert('提交失败：' + e.message + '\n\n已为你下载回执文件，请发给对接的腾讯销售。');
        downloadReceipt(rec);
      })
      .finally(function () { btn.disabled = false; });
  }

  /* ================= 下半部分：排位赛凭证（每个排位事项一个上传入口 · 可多张 · 随时） ================= */
  var MODS = XC.voucher.modules || [];
  var UP_MODS = MODS.filter(function (m) { return !m.noUpload; });
  var modBy = function (k) { return MODS.filter(function (m) { return m.key === k; })[0]; };
  var MINE = [];        // 该品牌已上传的凭证
  var BUSY = {};        // modKey -> [{ name, preview }]
  var MSG = {};         // modKey -> { cls, text }
  var pickingMod = null;
  var vIssueCache = {};
  var issuePromise = {};
  var isImgName = function (s) { return /\.(png|jpe?g|webp|gif)$/i.test(s || ''); };

  /** 贴片：预览图（点击放大）+ 网盘下载链接 */
  function stickerHtml(st) {
    return '<div class="rk-sticker"><div class="rk-lab-s">' + esc(st.title) + ' · 预览</div>'
      + '<div class="rk-ex">' + (st.previews || []).map(function (src) {
        return '<img class="st-img" src="' + esc(src) + '" data-big="' + esc(src) + '" loading="lazy" alt="贴片预览"/>';
      }).join('') + '</div>'
      + (st.download ? '<a class="st-dl" href="' + esc(st.download.url) + '" target="_blank" rel="noopener">⬇ '
        + esc(st.download.text) + '</a>' : '')
      + '</div>';
  }

  /* ---- 表格：排位事项 / 标准说明 / 上传凭证(入口) / 美力值 ---- */
  function renderRules() {
    $('#rkTable').innerHTML = '<table class="tbl rk-tbl"><thead><tr>'
      + '<th style="width:76px">排位事项</th><th>标准说明</th>'
      + '<th style="width:340px">上传凭证</th><th style="width:72px">美力值</th>'
      + '</tr></thead><tbody>' + MODS.map(function (m) {
        var up;
        if (m.noUpload) {
          up = '<span class="rk-gov-s">无需上传 · 官方校验</span>';
        } else {
          up = '<div class="cell-up" data-mod="' + esc(m.key) + '"><div class="cu-tip">' + esc(m.uploadTip) + '</div>';
          if ((m.proofExamples || []).length) {
            up += '<div class="cu-proof"><span class="cu-proof-lab">凭证示例（点击放大）</span>'
              + m.proofExamples.map(function (src) {
                return '<img src="' + esc(src) + '" data-big="' + esc(src) + '" loading="lazy" alt="凭证示例"/>';
              }).join('') + '</div>';
          }
          if (m.extraField) {
            up += '<input class="rk-extra cu-extra" data-mod="' + esc(m.key) + '" value="'
              + esc((state.extra || {})[m.key] || '') + '" placeholder="' + esc(m.extraField.label)
              + (m.extraField.required ? '（必填）' : '') + '"/>';
          }
          up += '<div id="cu-' + esc(m.key) + '"></div></div>';
        }
        return '<tr><td><b>' + esc(m.name) + '</b></td><td><ul class="rk-ul">'
          + m.standard.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
          + (m.guide ? '<a class="rk-guide" href="' + esc(m.guide.url) + '" target="_blank">📖 ' + esc(m.guide.text) + '</a>' : '')
          + (m.showSticker && XC.voucher.sticker ? stickerHtml(XC.voucher.sticker) : '')
          + ((m.examples || []).length ? '<div class="rk-lab-s">示例</div><div class="rk-ex">' + m.examples.map(function (src) {
            return '<img src="' + esc(src) + '" data-big="' + esc(src) + '" loading="lazy" alt="示例"/>';
          }).join('') + '</div>' : '')
          + '</td><td>' + up + '</td><td class="rk-sc">🔥 ' + esc(m.score) + '</td></tr>';
      }).join('') + '</tbody></table>';
    renderAllCells();
  }

  /* ---- 单个事项的上传格：已传缩略图 + 上传中 + 按钮 ---- */
  function renderCell(key) {
    var el = document.getElementById('cu-' + key);
    if (!el) return;
    var m = modBy(key);
    var list = MINE.filter(function (v) { return v.module === key; })
      .sort(function (a, b) { return String(a.uploadedAt).localeCompare(String(b.uploadedAt)); });
    var busy = BUSY[key] || [];
    var h = '';
    if (list.length || busy.length) {
      h += '<div class="cu-list">' + list.map(function (v) {
        return '<a class="cu-it" href="' + esc(v.url) + '" target="_blank" title="' + esc(v.name + ' · ' + fmtT(v.uploadedAt)) + '">'
          + (isImgName(v.path || v.name) ? '<img src="' + esc(v.__local || v.url) + '" loading="lazy" alt=""/>'
            : '<span class="cu-pdf">PDF</span>') + '</a>';
      }).join('') + busy.map(function (b) {
        return '<span class="cu-it busy">' + (b.preview ? '<img src="' + b.preview + '" alt=""/>'
          : '<span class="cu-pdf">PDF</span>') + '<i>上传中</i></span>';
      }).join('') + '</div>';
    }
    h += '<div class="cu-bar"><button class="btn sm ' + (list.length ? 'ghost' : 'primary') + ' cu-btn" data-mod="'
      + esc(key) + '"' + (busy.length ? ' disabled' : '') + '>'
      + (busy.length ? '上传中…' : (list.length ? '＋ 继续上传' : '＋ 上传凭证')) + '</button>'
      + '<span class="cu-n' + (list.length ? ' ok' : '') + '">'
      + (list.length ? '已传 ' + list.length + ' 张' : '未上传') + (m.max ? ' · 最多 ' + m.max + ' 场' : '')
      + '</span></div>';
    var msg = MSG[key];
    if (msg) h += '<div class="cu-msg ' + msg.cls + '">' + msg.text + '</div>';
    el.innerHTML = h;
  }

  function renderAllCells() {
    UP_MODS.forEach(function (m) { renderCell(m.key); });
    var st = $('#vStatus');
    if (!state.brand.trim()) st.textContent = '请先在最上方填写品牌名称，再上传凭证';
    else st.textContent = MINE.length ? '「' + state.brand.trim() + '」共已上传 ' + MINE.length + ' 张凭证' : '';
  }

  function readyFor(key) {
    var m = modBy(key);
    if (!state.brand.trim()) {
      alert('请先在最上方填写品牌名称');
      $('#brand').focus();
      return false;
    }
    if (m.extraField && m.extraField.required && !String((state.extra || {})[key] || '').trim()) {
      alert('请先填写「' + m.name + ' · ' + m.extraField.label + '」');
      var inp = document.querySelector('.cu-extra[data-mod="' + key + '"]');
      if (inp) inp.focus();
      return false;
    }
    if (!GHUB.enabled()) {
      alert('当前未开通在线上传，请把凭证发给对接的腾讯销售。');
      return false;
    }
    return true;
  }

  /* ---- 表格内交互 ---- */
  var tbl = $('#rkTable');
  tbl.addEventListener('click', function (e) {
    var img = e.target.closest('img[data-big]');
    if (img) {
      $('#imgBig').src = img.dataset.big;
      $('#imgMask').classList.add('show');
      return;
    }
    var btn = e.target.closest('.cu-btn');
    if (!btn || btn.disabled || !readyFor(btn.dataset.mod)) return;
    pickingMod = btn.dataset.mod;
    $('#vFile').click();
  });
  tbl.addEventListener('input', function (e) {
    if (!e.target.classList.contains('rk-extra')) return;
    state.extra = state.extra || {};
    state.extra[e.target.dataset.mod] = e.target.value;
    saveDraft();
  });
  tbl.addEventListener('dragover', function (e) {
    var c = e.target.closest('.cell-up');
    if (!c) return;
    e.preventDefault();
    c.classList.add('over');
  });
  tbl.addEventListener('dragleave', function (e) {
    var c = e.target.closest('.cell-up');
    if (c && !c.contains(e.relatedTarget)) c.classList.remove('over');
  });
  tbl.addEventListener('drop', function (e) {
    var c = e.target.closest('.cell-up');
    if (!c) return;
    e.preventDefault();
    c.classList.remove('over');
    var key = c.dataset.mod;
    if ((BUSY[key] || []).length) return;
    if (e.dataTransfer && e.dataTransfer.files.length && readyFor(key)) uploadFiles(key, e.dataTransfer.files);
  });
  $('#vFile').addEventListener('change', function () {
    var fs = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (pickingMod && fs.length) uploadFiles(pickingMod, fs);
  });

  /* ---- 上传实现 ---- */
  /**
   * 图片压缩：超过 1MB 的图（含手机原图 / HEIC）统一压成长边 2000px 的 JPEG，
   * 十几 MB 的原图一般压完 1MB 以内。解码失败（如电脑版 Chrome 不认 HEIC）则原样上传。
   */
  function compressIfNeeded(file) {
    var isImg = /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!isImg || file.size <= 1048576 || /gif/i.test(file.type)) {
      return Promise.resolve(file);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      var src = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2000, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (Math.max(w, h) > max) { var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);   // 透明 PNG 转 JPEG 垫白底
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(src);
        cv.toBlob(function (b) {
          resolve(b && b.size < file.size
            ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(src); resolve(file); };
      img.src = src;
    });
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = function () { reject(new Error('读取文件失败')); };
      r.readAsDataURL(file);
    });
  }

  /** 找该品牌的记录 issue；没有则建占位 issue（并发上传只建一个） */
  function findIssue(brand, create) {
    if (vIssueCache[brand]) return Promise.resolve(vIssueCache[brand]);
    if (create && issuePromise[brand]) return issuePromise[brand];
    var p = GHUB.listByLabel(XC.label).then(function (arr) {
      var hit = arr.filter(function (r) { return (r.brand || '').trim() === brand; })[0];
      if (hit) { vIssueCache[brand] = hit.__issue; return hit.__issue; }
      if (!create) return null;
      var rec = {
        id: 'EV' + Date.now().toString(36).toUpperCase(), module: 'exuan', kind: 'voucherOnly',
        brand: brand, createdAt: new Date().toISOString(),
      };
      return GHUB.submitIssue('[鹅选美妆节·凭证] ' + brand,
        '**模块**：' + XC.activityName + ' · 排位赛凭证（该品牌尚未提交报规划）\n\n'
        + '<!-- 以下为机器读取用，请勿修改 -->\n```json\n' + JSON.stringify(rec) + '\n```',
        [XC.label]).then(function (r) { vIssueCache[brand] = r.issue; return r.issue; });
    });
    if (create) {
      issuePromise[brand] = p;
      p.catch(function () { delete issuePromise[brand]; });
    }
    return p;
  }

  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|#%\s]+/g, '-').slice(0, 40); }

  function uploadOne(issueNo, brand, key, file) {
    var mod = modBy(key), f2;
    return compressIfNeeded(file).then(function (f) {
      f2 = f;
      var maxMB = XC.voucher.maxMB || 25;
      if (f.size > maxMB * 1048576) {
        throw new Error('压缩后仍超过 ' + maxMB + 'MB，请截图后再传');
      }
      return toBase64(f);
    }).then(function (b64) {
      var d = new Date();
      var ext = ((f2.name.match(/\.(\w+)$/) || [0, 'bin'])[1]).toLowerCase();
      var path = 'uploads/exuan/' + safeName(brand) + '/' + key + '-'
        + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes())
        + pad(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
      return GHUB.uploadFile(path, b64);
    }).then(function (up) {
      var v = {
        type: 'voucher', module: key, moduleName: mod.name, brand: brand,
        name: file.name, url: up.url, path: up.path, size: f2.size,
        uploadedAt: new Date().toISOString(),
      };
      if (mod.extraField) {
        v.extra = {};
        v.extra[mod.extraField.key] = String((state.extra || {})[key] || '').trim();
      }
      return GHUB.addComment(issueNo, GHUB.voucherCommentBody(v)).then(function () { return v; });
    });
  }

  function uploadFiles(key, files) {
    var brand = state.brand.trim();
    var maxMB = XC.voucher.maxMB || 25, maxB = maxMB * 1048576, valid = [], bad = [];
    Array.prototype.forEach.call(files, function (f) {
      var isImg = /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name);
      var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isImg && !isPdf) bad.push(f.name + '（仅支持图片 / PDF）');
      // 图片会先压缩再上传，原图放宽到 100MB；PDF 不压缩，按上限校验
      else if (isPdf && f.size > maxB) bad.push(f.name + '（PDF 超过 ' + maxMB + 'MB，请压缩后再传）');
      else if (isImg && f.size > 100 * 1048576) bad.push(f.name + '（图片超过 100MB）');
      else valid.push(f);
    });
    if (bad.length) alert('以下文件未上传：\n· ' + bad.join('\n· '));
    if (!valid.length) return;

    var items = valid.map(function (f) {
      return { name: f.name, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' };
    });
    BUSY[key] = items.slice();
    MSG[key] = null;
    renderCell(key);

    var ok = 0, fail = 0, errs = [];
    findIssue(brand, true).then(function (no) {
      var chain = Promise.resolve();
      valid.forEach(function (f, i) {
        chain = chain.then(function () {
          return uploadOne(no, brand, key, f).then(function (v) {
            ok++;
            v.__local = items[i].preview;   // 刚传的先用本地预览，避免 CDN 延迟看不到图
            MINE.push(v);
          }, function (e) {
            fail++;
            errs.push(f.name + '：' + e.message);
          }).then(function () {
            BUSY[key] = (BUSY[key] || []).filter(function (x) { return x !== items[i]; });
            renderCell(key);
          });
        });
      });
      return chain;
    }).catch(function (e) {
      fail = valid.length - ok;
      errs.push(e.message);
    }).then(function () {
      BUSY[key] = [];
      MSG[key] = fail
        ? { cls: 'bad', text: (ok ? '✓ 成功 ' + ok + ' 张，' : '') + '✗ 失败 ' + fail + ' 张，可重新上传<br/>' + esc(errs.slice(0, 2).join('；')) }
        : { cls: 'ok', text: '✓ 成功上传 ' + ok + ' 张，等待官方校验' };
      renderAllCells();
    });
  }

  /* ---- 读取该品牌已上传的凭证 ---- */
  function loadMine() {
    var brand = state.brand.trim();
    var local = MINE.filter(function (v) { return v.__local && v.brand === brand; });
    MINE = local;
    MSG = {};
    renderAllCells();
    if (!brand || !GHUB.readable()) return;
    $('#vStatus').textContent = '查询「' + brand + '」已上传的凭证…';
    GHUB.listByLabel(XC.label).then(function (arr) {
      var mine = arr.filter(function (r) { return (r.brand || '').trim() === brand; });
      if (mine.length) vIssueCache[brand] = mine[0].__issue;
      return Promise.all(mine.map(function (r) {
        return GHUB.listComments(r.__issue).then(GHUB.parseVouchers).catch(function () { return []; });
      }));
    }).then(function (groups) {
      if (state.brand.trim() !== brand) return;   // 期间改了品牌名，丢弃旧结果
      var got = [].concat.apply([], groups || []);
      var paths = {};
      got.forEach(function (v) {
        paths[v.path] = 1;
        var ev = v.extra && v.extra[Object.keys(v.extra)[0]];
        if (ev) { state.extra = state.extra || {}; state.extra[v.module] = ev; }
      });
      // 用此刻的本地记录合并（查询期间新传成功的也要保留，不能用发起查询时的快照）
      var localNow = MINE.filter(function (v) { return v.__local && v.brand === brand; });
      MINE = got.concat(localNow.filter(function (v) { return !paths[v.path]; }));
      renderRules();   // 重新渲染以回填账户ID
    }).catch(function () { renderAllCells(); });
  }

  $('#imgMask').addEventListener('click', function () { this.classList.remove('show'); });
  $('#btnMine').addEventListener('click', loadMine);

  /* ================= 事件 & init ================= */
  var brandTimer = null;
  $('#brand').addEventListener('input', function () {
    state.brand = this.value;
    saveDraft();
    clearTimeout(brandTimer);
    brandTimer = setTimeout(loadMine, 800);
  });
  $('#remark').addEventListener('input', function () { state.remark = this.value; saveDraft(); });
  $('#btnSubmit').addEventListener('click', submit);
  $('#btnClear').addEventListener('click', function () {
    if (!confirm('清空报规划的填写内容？（不影响已上传的凭证）')) return;
    state.answers = {};
    state.remark = '';
    $('#remark').value = '';
    saveDraft();
    renderQuestions();
  });

  loadDraft();
  $('#brand').value = state.brand;
  $('#remark').value = state.remark;
  renderQuestions();
  renderRules();
  if (state.brand) loadMine();
})();
