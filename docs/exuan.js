/**
 * 腾讯营销 × 鹅选美妆节 · 客户页
 * 上半部分：报规划（10.13 截止，不卡死，逾期标记）
 * 下半部分：排位赛凭证（随时可传；单入口多选，每个文件标注对应排位事项）
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

      if (q.type === 'text' || q.type === 'number' || q.type === 'date') {
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
        h += '<div class="chips">' + q.options.map(function (op) {
          return '<span class="chip' + (arr.indexOf(op) >= 0 ? ' on' : '') + '" data-qk="'
            + esc(q.key) + '" data-op="' + esc(op) + '">' + esc(op) + '</span>';
        }).join('') + '</div>';
      }
      if (q.hint) h += '<div class="hint">' + esc(q.hint) + '</div>';
      return h + '</div>';
    }).join('');
  }

  $('#questionBox').addEventListener('click', function (e) {
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

  /* ================= 下半部分：排位赛凭证（单入口 · 多张 · 随时） ================= */
  var MODS = XC.voucher.modules || [];
  var UP_MODS = MODS.filter(function (m) { return !m.noUpload; });
  var modBy = function (k) { return MODS.filter(function (m) { return m.key === k; })[0]; };
  var QUEUE = [];        // 待上传 [{id, file, mod, status: wait|uploading|fail, msg, preview}]
  var MINE = [];         // 已上传凭证记录
  var uploading = false;
  var seq = 0;
  var vIssueCache = {};
  var isImgName = function (s) { return /\.(png|jpe?g|webp|gif)$/i.test(s || ''); };

  /* ---- 规则表（只读） ---- */
  function renderRules() {
    $('#rkTable').innerHTML = '<table class="tbl rk-tbl"><thead><tr>'
      + '<th style="width:84px">排位事项</th><th>标准说明</th><th style="width:200px">上传凭证</th><th style="width:76px">美力值</th>'
      + '</tr></thead><tbody>' + MODS.map(function (m) {
        return '<tr><td><b>' + esc(m.name) + '</b></td><td><ul class="rk-ul">'
          + m.standard.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
          + (m.guide ? '<a class="rk-guide" href="' + esc(m.guide.url) + '" target="_blank">📖 ' + esc(m.guide.text) + '</a>' : '')
          + ((m.examples || []).length ? '<div class="rk-ex">' + m.examples.map(function (src) {
            return '<img src="' + esc(src) + '" data-big="' + esc(src) + '" loading="lazy" alt="示例"/>';
          }).join('') + '</div>' : '')
          + '</td><td>' + (m.noUpload ? '<span class="rk-gov-s">无需上传 · 官方校验</span>' : esc(m.uploadTip)) + '</td>'
          + '<td class="rk-sc">🔥 ' + esc(m.score) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---- 待上传队列 ---- */
  function addFiles(list) {
    var maxB = (XC.voucher.maxMB || 5) * 1048576, bad = [];
    Array.prototype.forEach.call(list || [], function (f) {
      var isImg = /^image\//.test(f.type);
      var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isImg && !isPdf) { bad.push(f.name + '（仅支持图片/PDF）'); return; }
      if (f.size > maxB) { bad.push(f.name + '（超过 ' + (XC.voucher.maxMB || 5) + 'MB）'); return; }
      QUEUE.push({
        id: ++seq, file: f, mod: state.lastMod || '', status: 'wait',
        preview: isImg ? URL.createObjectURL(f) : '',
      });
    });
    if (bad.length) alert('以下文件未加入：\n· ' + bad.join('\n· '));
    renderQueue();
  }

  function modOptions(sel) {
    return '<option value="">— 选择对应排位事项 —</option>' + UP_MODS.map(function (m) {
      return '<option value="' + esc(m.key) + '"' + (m.key === sel ? ' selected' : '') + '>'
        + esc(m.name) + '</option>';
    }).join('');
  }

  function renderQueue() {
    var btn = $('#btnUpload');
    if (!QUEUE.length) {
      $('#vQueue').innerHTML = '';
      btn.disabled = true;
      btn.textContent = '上传';
      return;
    }
    var h = '<div class="q-bar">已选 <b>' + QUEUE.length + '</b> 个文件'
      + (QUEUE.length > 1 ? '　全部设为 <select id="qAll"' + (uploading ? ' disabled' : '') + '>' + modOptions('') + '</select>' : '')
      + '</div>';
    h += QUEUE.map(function (q) {
      var meta = Math.round(q.file.size / 1024) + 'KB';
      if (q.status === 'uploading') meta += ' · <span class="doing">上传中…</span>';
      if (q.status === 'fail') meta += ' · <span class="bad">失败：' + esc(q.msg || '') + '</span>';
      return '<div class="q-row ' + q.status + (q.mod ? '' : ' nomod') + '">'
        + (q.preview ? '<img class="q-th" src="' + q.preview + '" alt=""/>' : '<div class="q-th pdf">PDF</div>')
        + '<div class="q-info"><div class="q-name">' + esc(q.file.name) + '</div><div class="q-meta">' + meta + '</div></div>'
        + '<select class="q-mod" data-id="' + q.id + '"' + (uploading ? ' disabled' : '') + '>' + modOptions(q.mod) + '</select>'
        + (uploading ? '' : '<button class="q-rm" data-id="' + q.id + '" title="移除">×</button>')
        + '</div>';
    }).join('');
    // 涉及「素材力」等需要附加信息的事项，补一个输入框
    UP_MODS.forEach(function (m) {
      if (!m.extraField || !QUEUE.some(function (q) { return q.mod === m.key; })) return;
      h += '<label class="field q-extra"><span class="label">' + esc(m.name) + ' · ' + esc(m.extraField.label)
        + (m.extraField.required ? ' <span class="req">*</span>' : '') + '</span>'
        + '<input class="rk-extra" data-mod="' + esc(m.key) + '" value="' + esc((state.extra || {})[m.key] || '')
        + '" placeholder="' + esc(m.extraField.placeholder || '') + '"' + (uploading ? ' disabled' : '') + '/></label>';
    });
    $('#vQueue').innerHTML = h;
    btn.disabled = uploading;
    btn.textContent = uploading ? '上传中…' : '上传 ' + QUEUE.length + ' 个文件';
  }

  $('#vDrop').addEventListener('click', function () { if (!uploading) $('#vFile').click(); });
  $('#vFile').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    $('#vDrop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    $('#vDrop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('over'); });
  });
  $('#vDrop').addEventListener('drop', function (e) {
    if (!uploading && e.dataTransfer) addFiles(e.dataTransfer.files);
  });
  // 截图直接粘贴
  document.addEventListener('paste', function (e) {
    if (uploading || !e.clipboardData) return;
    var fs = [];
    Array.prototype.forEach.call(e.clipboardData.items || [], function (it) {
      if (it.kind !== 'file') return;
      var f = it.getAsFile();
      if (!f) return;
      if (/^image\//.test(f.type) && /^image\.\w+$/i.test(f.name || 'image.png')) {
        var d = new Date();
        f = new File([f], '截图-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
          + '-' + (fs.length + 1) + '.' + (f.type.split('/')[1] || 'png'), { type: f.type });
      }
      fs.push(f);
    });
    if (!fs.length) return;
    e.preventDefault();
    addFiles(fs);
    $('#vQueue').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#vQueue').addEventListener('change', function (e) {
    if (e.target.id === 'qAll') {
      if (!e.target.value) return;
      QUEUE.forEach(function (q) { q.mod = e.target.value; });
      state.lastMod = e.target.value;
    } else if (e.target.classList.contains('q-mod')) {
      var q = QUEUE.filter(function (x) { return x.id === +e.target.dataset.id; })[0];
      if (q) { q.mod = e.target.value; if (q.mod) state.lastMod = q.mod; }
    } else {
      return;
    }
    saveDraft();
    renderQueue();
  });
  $('#vQueue').addEventListener('input', function (e) {
    if (!e.target.classList.contains('rk-extra')) return;
    state.extra = state.extra || {};
    state.extra[e.target.dataset.mod] = e.target.value;
    saveDraft();
  });
  $('#vQueue').addEventListener('click', function (e) {
    var b = e.target.closest('.q-rm');
    if (!b) return;
    QUEUE = QUEUE.filter(function (q) {
      if (q.id === +b.dataset.id && q.preview) URL.revokeObjectURL(q.preview);
      return q.id !== +b.dataset.id;
    });
    renderQueue();
  });

  /* ---- 上传 ---- */
  function compressIfNeeded(file) {
    if (!/^image\//.test(file.type) || file.size <= 1048576 || /gif/i.test(file.type)) {
      return Promise.resolve(file);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1800, w = img.width, h = img.height;
        if (Math.max(w, h) > max) { var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(function (b) {
          resolve(b && b.size < file.size
            ? new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { resolve(file); };
      img.src = URL.createObjectURL(file);
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

  function findIssue(brand, create) {
    if (vIssueCache[brand]) return Promise.resolve(vIssueCache[brand]);
    return GHUB.listByLabel(XC.label).then(function (arr) {
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
  }

  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|#%\s]+/g, '-').slice(0, 40); }

  function uploadOne(issueNo, brand, q) {
    var mod = modBy(q.mod), f2;
    q.status = 'uploading';
    renderQueue();
    return compressIfNeeded(q.file).then(function (f) {
      f2 = f;
      return toBase64(f);
    }).then(function (b64) {
      var d = new Date();
      var ext = ((f2.name.match(/\.(\w+)$/) || [0, 'bin'])[1]).toLowerCase();
      var path = 'uploads/exuan/' + safeName(brand) + '/' + mod.key + '-'
        + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes())
        + pad(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
      return GHUB.uploadFile(path, b64);
    }).then(function (up) {
      var v = {
        type: 'voucher', module: mod.key, moduleName: mod.name, brand: brand,
        name: q.file.name, url: up.url, path: up.path, size: f2.size,
        uploadedAt: new Date().toISOString(),
      };
      if (mod.extraField) {
        v.extra = {};
        v.extra[mod.extraField.key] = String((state.extra || {})[mod.key] || '').trim();
      }
      return GHUB.addComment(issueNo, GHUB.voucherCommentBody(v)).then(function () { return v; });
    });
  }

  function uploadAll() {
    var brand = state.brand.trim();
    if (!brand) { alert('请先在最上方填写品牌名称'); $('#brand').focus(); return; }
    if (!QUEUE.length) return;
    var noMod = QUEUE.filter(function (q) { return !q.mod; }).length;
    if (noMod) { alert('还有 ' + noMod + ' 个文件没选「对应排位事项」'); return; }
    var missExtra = UP_MODS.filter(function (m) {
      return m.extraField && m.extraField.required
        && QUEUE.some(function (q) { return q.mod === m.key; })
        && !String((state.extra || {})[m.key] || '').trim();
    });
    if (missExtra.length) { alert('请填写「' + missExtra[0].name + ' · ' + missExtra[0].extraField.label + '」'); return; }
    if (!GHUB.enabled()) { alert('当前未开通在线上传，请把凭证发给对接的腾讯销售。'); return; }

    uploading = true;
    renderQueue();
    var ok = 0, bad = 0, total = QUEUE.length;
    $('#vStatus').textContent = '准备上传…';

    findIssue(brand, true).then(function (no) {
      var chain = Promise.resolve();
      QUEUE.slice().forEach(function (q) {
        chain = chain.then(function () {
          $('#vStatus').textContent = '正在上传 ' + (ok + bad + 1) + '/' + total + '…';
          return uploadOne(no, brand, q).then(function (v) {
            ok++;
            v.__local = q.preview;   // 刚传的先用本地预览，避免 CDN 延迟看不到图
            MINE.push(v);
            QUEUE = QUEUE.filter(function (x) { return x !== q; });
            renderQueue();
            renderMine();
          }, function (e) {
            bad++;
            q.status = 'fail';
            q.msg = e.message;
            renderQueue();
          });
        });
      });
      return chain;
    }).catch(function (e) {
      bad = total - ok;
      alert('上传失败：' + e.message);
    }).then(function () {
      uploading = false;
      QUEUE.forEach(function (q) { if (q.status === 'uploading') q.status = 'wait'; });
      renderQueue();
      $('#vStatus').innerHTML = (ok ? '<span style="color:#06a552">✓ 成功上传 ' + ok + ' 个</span>' : '')
        + (bad ? (ok ? '，' : '') + '<span style="color:#d4380d">' + bad + ' 个失败，可重新点上传</span>' : '')
        + (ok ? '，等待官方校验' : '');
    });
  }

  /* ---- 我已上传的 ---- */
  function renderMine() {
    var box = $('#vMine');
    if (!state.brand.trim()) {
      $('#mineCount').textContent = '';
      box.innerHTML = '<div class="empty-tip">填写品牌名称后，这里会显示该品牌已上传的全部凭证</div>';
      return;
    }
    $('#mineCount').textContent = MINE.length ? '共 ' + MINE.length + ' 个文件' : '';
    box.innerHTML = UP_MODS.map(function (m) {
      var list = MINE.filter(function (v) { return v.module === m.key; })
        .sort(function (a, b) { return String(a.uploadedAt).localeCompare(String(b.uploadedAt)); });
      var cnt = list.length
        ? '<span class="mine-n ok">' + list.length + ' 个' + (m.max ? ' / 最多 ' + m.max + ' 场' : '') + '</span>'
        : '<span class="mine-n">未上传</span>';
      var ext = m.extraField && (state.extra || {})[m.key]
        ? '<i>' + esc(m.extraField.label) + '：' + esc(state.extra[m.key]) + '</i>' : '';
      return '<div class="mine-mod' + (list.length ? '' : ' empty') + '"><div class="mine-head"><b>' + esc(m.name) + '</b>'
        + cnt + ext + '</div>'
        + (list.length ? '<div class="mine-grid">' + list.map(function (v) {
          var img = isImgName(v.path || v.name);
          return '<a class="mine-it" href="' + esc(v.url) + '" target="_blank" title="' + esc(v.name) + '">'
            + (img ? '<img src="' + esc(v.__local || v.url) + '" loading="lazy" alt=""/>' : '<div class="mine-pdf">PDF</div>')
            + '<span class="mine-nm">' + esc(v.name) + '</span><span class="mine-t">' + esc(fmtT(v.uploadedAt)) + '</span></a>';
        }).join('') + '</div>' : '')
        + '</div>';
    }).join('');
  }

  function loadMine() {
    var brand = state.brand.trim();
    var local = MINE.filter(function (v) { return v.__local && v.brand === brand; });
    MINE = local;
    renderMine();
    if (!brand || !GHUB.readable()) return;
    $('#mineCount').textContent = '查询中…';
    findIssue(brand, false).then(function (no) {
      if (!no) { renderMine(); return; }
      return GHUB.listComments(no).then(function (cs) {
        var got = GHUB.parseVouchers(cs);
        var paths = {};
        got.forEach(function (v) { paths[v.path] = 1; });
        MINE = got.concat(local.filter(function (v) { return !paths[v.path]; }));
        got.forEach(function (v) {
          var ev = v.extra && v.extra[Object.keys(v.extra)[0]];
          if (ev) { state.extra = state.extra || {}; state.extra[v.module] = ev; }
        });
        renderMine();
      });
    }).catch(function () { renderMine(); });
  }

  $('#rkTable').addEventListener('click', function (e) {
    var img = e.target.closest('img[data-big]');
    if (!img) return;
    $('#imgBig').src = img.dataset.big;
    $('#imgMask').classList.add('show');
  });
  $('#imgMask').addEventListener('click', function () { this.classList.remove('show'); });
  $('#btnUpload').addEventListener('click', uploadAll);
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
  renderQueue();
  renderMine();
  if (state.brand) loadMine();
})();
