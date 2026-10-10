/**
 * 双11鹅选美妆节 · 客户页逻辑
 * 上半部分：固定问卷（限时，逾期可交但标记）
 * 下半部分：凭证上传（随时，图片+PDF，≤5MB，存 GitHub data 分支 + issue 评论登记）
 */
(function () {
  'use strict';

  var XC = window.HB_EXUAN;
  var GHUB = window.HBGitHub;
  var BRANDS = (window.HB_PRODUCTS && window.HB_PRODUCTS.brands) || [];
  var DRAFT_KEY = 'huobu_exuan_draft_v1';

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var state = { brand: '', answers: {}, remark: '' };

  /* ================= 导航 ================= */
  $('#actNav').innerHTML =
    '<a class="act-tab" href="index.html">← 全部活动</a>'
    + '<span class="act-tab on">双11鹅选美妆节</span>';

  /* ================= 倒计时 / 逾期标记 ================= */
  var deadline = XC.deadline ? new Date(XC.deadline) : null;

  function fmtTime(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function isLate() {
    return !!(deadline && new Date() > deadline);
  }

  function renderDeadline() {
    var box = $('#deadlineBox');
    if (!deadline) { box.style.display = 'none'; $('#part1Tag').textContent = ''; return; }
    box.style.display = 'block';
    var now = new Date();
    if (now <= deadline) {
      var ms = deadline - now;
      var day = Math.floor(ms / 86400000);
      var hr = Math.floor((ms % 86400000) / 3600000);
      var min = Math.floor((ms % 3600000) / 60000);
      box.className = 'deadline-box';
      box.innerHTML = '⏰ 活动报名截止：<b>' + fmtTime(deadline) + '</b>'
        + '　剩余 <b>' + (day > 0 ? day + ' 天 ' : '') + hr + ' 小时 ' + min + ' 分</b>'
        + '<div class="dl-sub">凭证上传不受此时间限制，随时可在页面底部提交</div>';
      $('#part1Tag').textContent = '限时';
    } else {
      box.className = 'deadline-box late';
      box.innerHTML = '⚠ 已超过原定报名截止时间（' + fmtTime(deadline) + '）。'
        + '现在仍可提交，但会标记为「逾期提交」；凭证上传不受影响。';
      $('#part1Tag').textContent = '逾期可交';
      $('#part1Tag').classList.add('late');
    }
  }
  if (deadline) { renderDeadline(); setInterval(renderDeadline, 30000); }

  $('#heroDesc').textContent = XC.heroDesc || '';
  $('#voucherTitle').textContent = XC.voucher.title || '扶持凭证上传';
  $('#voucherDesc').textContent = XC.voucher.desc || '';
  $('#vFile').accept = XC.voucher.accept || '';

  /* ================= 客户名称 datalist ================= */
  var dl = BRANDS.map(function (b) { return '<option value="' + esc(b) + '"></option>'; }).join('');
  $('#brandList').innerHTML = dl;
  $('#brandList2').innerHTML = dl;

  /* ================= 题目渲染 ================= */
  function visible(q) {
    if (!q.showWhen) return true;
    var dep = state.answers[q.showWhen.key];
    if (Array.isArray(dep)) return dep.indexOf(q.showWhen.equals) >= 0;
    return dep === q.showWhen.equals;
  }

  function renderQuestions() {
    var h = '';
    XC.questions.forEach(function (q, qi) {
      if (!visible(q)) return;
      var v = state.answers[q.key];
      h += '<div class="q-item" data-q="' + esc(q.key) + '">'
        + '<div class="q-title">' + esc(q.title)
        + (q.required !== false ? ' <span class="req">*</span>' : '') + '</div>';

      if (q.type === 'text') {
        h += '<input class="q-input" data-qk="' + esc(q.key) + '" value="' + esc(v || '') + '"/>';
      } else if (q.type === 'textarea') {
        h += '<textarea class="q-input" data-qk="' + esc(q.key) + '" rows="4">' + esc(v || '') + '</textarea>';
      } else if (q.type === 'single' || q.type === 'multi') {
        var arr = Array.isArray(v) ? v : (v ? [v] : []);
        h += '<div class="chips">';
        q.options.forEach(function (op) {
          var on = arr.indexOf(op) >= 0 ? ' on' : '';
          h += '<span class="chip' + on + '" data-qk="' + esc(q.key) + '" data-op="' + esc(op) + '">'
            + esc(op) + '</span>';
        });
        if (q.allowOther) {
          var otherVal = state.answers[q.key + '__other'] || '';
          var otherOn = arr.indexOf('其他') >= 0 ? ' on' : '';
          h += '<span class="chip' + otherOn + '" data-qk="' + esc(q.key) + '" data-op="其他">其他</span>';
          h += '<input class="chip-other" data-qk="' + esc(q.key) + '__other"'
            + ' placeholder="其他，请说明" value="' + esc(otherVal) + '"'
            + (otherOn ? '' : ' style="display:none"') + '/>';
        }
        h += '</div>';
      }
      if (q.hint) h += '<div class="hint">' + esc(q.hint) + '</div>';
      h += '</div>';
    });
    $('#questionBox').innerHTML = h;
  }

  /* 题目交互 */
  $('#questionBox').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var qk = chip.dataset.qk, op = chip.dataset.op;
    var q = null;
    XC.questions.forEach(function (x) { if (x.key === qk) q = x; });
    if (!q) return;

    if (q.type === 'single') {
      state.answers[qk] = op;
    } else {
      var arr = Array.isArray(state.answers[qk]) ? state.answers[qk] : [];
      var i = arr.indexOf(op);
      if (i >= 0) arr.splice(i, 1); else arr.push(op);
      state.answers[qk] = arr;
    }
    saveDraft();
    renderQuestions();   // showWhen 联动 + chip 状态
    renderConfirm();
  });

  $('#questionBox').addEventListener('input', function (e) {
    var qk = e.target.dataset && e.target.dataset.qk;
    if (!qk) return;
    state.answers[qk] = e.target.value;
    saveDraft();
    renderConfirm();
  });

  /* ================= 草稿 ================= */
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { }
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && typeof d === 'object') state = d;
    } catch (e) { }
  }

  /* ================= 提交前确认 ================= */
  function renderConfirm() {
    var rows = [];
    rows.push('<div class="cf-row"><span>客户名称</span><b>' + (esc(state.brand) || '<i>未填</i>') + '</b></div>');
    XC.questions.forEach(function (q) {
      if (!visible(q)) return;
      var v = state.answers[q.key];
      var txt = '';
      if (Array.isArray(v)) {
        txt = v.map(function (x) {
          return x === '其他' ? '其他（' + (state.answers[q.key + '__other'] || '未说明') + '）' : x;
        }).join('、');
      } else if (v === '其他') {
        txt = '其他（' + (state.answers[q.key + '__other'] || '未说明') + '）';
      } else {
        txt = v || '';
      }
      rows.push('<div class="cf-row"><span>' + esc(q.title) + '</span><b>'
        + (txt ? esc(txt) : '<i>未填</i>') + '</b></div>');
    });
    if (state.remark) {
      rows.push('<div class="cf-row"><span>备注</span><b>' + esc(state.remark) + '</b></div>');
    }
    $('#confirm').innerHTML = rows.join('');
  }

  /* ================= 校验 & 提交 ================= */
  function validate() {
    var miss = [];
    if (!state.brand.trim()) miss.push('客户名称');
    XC.questions.forEach(function (q) {
      if (!visible(q) || q.required === false) return;
      var v = state.answers[q.key];
      var empty = Array.isArray(v) ? !v.length : !String(v || '').trim();
      if (empty) miss.push(q.title);
      if ((Array.isArray(v) ? v.indexOf('其他') >= 0 : v === '其他')
        && !String(state.answers[q.key + '__other'] || '').trim()) {
        miss.push(q.title + '（其他需说明）');
      }
    });
    return miss;
  }

  function downloadReceipt(data) {
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '鹅选美妆节_' + (data.brand || '未填客户') + '_' + data.id + '.hbjson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function buildRecord() {
    return {
      id: 'EX' + Date.now().toString(36).toUpperCase(),
      module: 'exuan',
      brand: state.brand.trim(),
      late: isLate(),
      answers: state.answers,
      remark: state.remark.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  function exuanIssueBody(rec) {
    var lines = [
      '**模块**：双11鹅选美妆节 · 活动报名',
      '**客户名称**：' + rec.brand,
      '**提交时间**：' + rec.createdAt + (rec.late ? '（逾期提交）' : ''),
      '',
    ];
    XC.questions.forEach(function (q) {
      var v = rec.answers[q.key];
      if (v === undefined) return;
      var txt = Array.isArray(v) ? v.join('、') : String(v || '');
      if (rec.answers[q.key + '__other']) txt += '（' + rec.answers[q.key + '__other'] + '）';
      lines.push('**' + q.title + '**：' + (txt || '（未填）'));
    });
    if (rec.remark) lines.push('', '**备注**：' + rec.remark);
    lines.push('', '<!-- 以下为机器读取用，请勿修改 -->', '```json', JSON.stringify(rec), '```');
    return lines.join('\n');
  }

  function showDone(rec, online) {
    $('#doneTitle').textContent = online ? '报名提交成功！' : '已生成回执文件';
    $('#doneId').innerHTML = (rec.late ? '<span style="color:#c47f00">已标记：逾期提交</span><br/>' : '')
      + '编号：' + esc(rec.id)
      + (online ? '' : '<br/>请将下载的回执文件发回给对接的运营同学');
    $('#doneBtns').innerHTML =
      '<button class="btn ghost" onclick="location.reload()">再填一份</button>'
      + '<a class="btn primary" href="javascript:;" id="btnGoVoucher">去上传凭证</a>';
    $('#btnGoVoucher').addEventListener('click', function (e) {
      e.preventDefault();
      $('#doneMask').classList.remove('show');
      $('#voucherCard').scrollIntoView({ behavior: 'smooth' });
    });
    $('#doneMask').classList.add('show');
  }

  function submit() {
    var miss = validate();
    if (miss.length) {
      alert('请先完成：\n· ' + miss.slice(0, 6).join('\n· '));
      return;
    }
    var rec = buildRecord();
    var btn = $('#btnSubmit');
    btn.disabled = true;

    if (!GHUB.enabled()) {
      downloadReceipt(rec);
      localStorage.removeItem(DRAFT_KEY);
      showDone(rec, false);
      btn.disabled = false;
      return;
    }

    GHUB.submitIssue(
      '[鹅选美妆节] ' + rec.brand + ' · ' + rec.id + (rec.late ? '（逾期）' : ''),
      exuanIssueBody(rec),
      [XC.label]
    ).then(function () {
      localStorage.removeItem(DRAFT_KEY);
      showDone(rec, true);
    }).catch(function (e) {
      alert('提交失败：' + e.message + '\n\n已为你下载回执文件，请发回给运营同学。');
      downloadReceipt(rec);
    }).finally(function () {
      btn.disabled = false;
    });
  }

  /* ================= 凭证上传：一个模块一张 ================= */
  var VMODS = XC.voucher.modules || [];
  /** 每个模块独立状态：empty / pending / uploading / done / fail */
  var mState = {};
  VMODS.forEach(function (m) { mState[m.key] = { status: 'empty' }; });
  var vIssueCache = {};   // brand -> issueNumber
  var pickingKey = null;  // 当前正在为哪个模块选文件

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60);
  }

  function ts() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function renderVModules() {
    $('#vModules').innerHTML = VMODS.map(function (m) {
      var st = mState[m.key];
      var head = '<div class="vm-head"><b>' + esc(m.name) + '</b>'
        + (m.required ? '<span class="vm-req">必传</span>' : '<span class="vm-opt">选传</span>');

      var body = '';
      if (st.status === 'empty') {
        head += '<span class="vs">未上传</span></div>';
        body = '<div class="vm-slot" data-key="' + esc(m.key) + '">'
          + '<span class="vm-plus">＋</span> 选择这一张凭证<br/>'
          + '<span class="vdrop-sub">截图图片 / PDF，≤5MB</span></div>';
      } else if (st.status === 'pending') {
        head += '<span class="vs doing">待确认</span></div>';
        body = '<div class="vm-file">'
          + '<span class="vname">' + esc(st.file.name) + ' <i>'
          + Math.round(st.file.size / 1024) + 'KB</i></span></div>'
          + '<div class="vm-btns">'
          + '<button class="btn primary sm" data-act="ok" data-key="' + esc(m.key) + '">确认上传</button>'
          + '<button class="btn ghost sm" data-act="cancel" data-key="' + esc(m.key) + '">换一张</button>'
          + '</div>';
      } else if (st.status === 'uploading') {
        head += '<span class="vs doing">上传中…</span></div>';
        body = '<div class="vm-file"><span class="vname">' + esc(st.name || '') + '</span></div>';
      } else if (st.status === 'done') {
        head += '<span class="vs ok">✓ 已上传</span></div>';
        body = '<div class="vm-file">'
          + '<a href="' + esc(st.url) + '" target="_blank">' + esc(st.name || '查看凭证') + '</a>'
          + (st.time ? ' <i>' + esc(st.time) + '</i>' : '')
          + '</div>'
          + '<div class="vm-btns">'
          + '<button class="btn ghost sm" data-act="re" data-key="' + esc(m.key) + '">重新上传</button>'
          + '</div>';
      } else {  // fail
        head += '<span class="vs bad">✗ 上传失败</span></div>';
        body = '<div class="vm-file"><span class="vname" style="color:#d4380d">'
          + esc(st.msg || '') + '</span></div>'
          + '<div class="vm-btns">'
          + '<button class="btn primary sm" data-act="retry" data-key="' + esc(m.key) + '">重试</button>'
          + '<button class="btn ghost sm" data-act="cancel" data-key="' + esc(m.key) + '">换一张</button>'
          + '</div>';
      }

      return '<div class="vm-card">' + head
        + (m.desc ? '<div class="vm-desc">' + esc(m.desc) + '</div>' : '')
        + body + '</div>';
    }).join('');
  }

  /* 模块卡片交互（事件委托） */
  $('#vModules').addEventListener('click', function (e) {
    var slot = e.target.closest('.vm-slot');
    if (slot) {
      pickingKey = slot.dataset.key;
      $('#vFile').click();
      return;
    }
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var key = btn.dataset.key, act = btn.dataset.act;
    if (act === 'ok' || act === 'retry') uploadModule(key);
    else if (act === 'cancel') { mState[key] = { status: 'empty' }; renderVModules(); }
    else if (act === 're') { pickingKey = key; $('#vFile').click(); }
  });

  /* 选中文件 → 进入待确认（一个模块只留一张） */
  $('#vFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || !pickingKey) return;

    var isImg = /^image\//.test(f.type);
    var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    var maxB = (XC.voucher.maxMB || 5) * 1024 * 1024;
    if (!isImg && !isPdf) { alert('仅支持图片或 PDF 文件'); return; }
    if (f.size > maxB) { alert('文件超过 ' + (XC.voucher.maxMB || 5) + 'MB 限制'); return; }

    mState[pickingKey] = { status: 'pending', file: f };
    renderVModules();
  });

  /** 图片压缩：>1MB 的图压到最长边 1600 / jpeg 0.85 */
  function compressIfNeeded(file) {
    if (!/^image\//.test(file.type) || file.size <= 1024 * 1024 || /gif/i.test(file.type)) {
      return Promise.resolve(file);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height;
        if (Math.max(w, h) > max) {
          var r = max / Math.max(w, h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        cv.toBlob(function (b) {
          resolve(b && b.size < file.size
            ? new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
            : file);
        }, 'image/jpeg', 0.85);
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

  /** 找到该客户的报名 issue；没有就先建一个「凭证登记」占位 issue */
  function findOrCreateIssue(brand) {
    if (vIssueCache[brand]) return Promise.resolve(vIssueCache[brand]);
    return GHUB.listByLabel(XC.label).then(function (arr) {
      for (var i = 0; i < arr.length; i++) {
        if ((arr[i].brand || '') === brand) {
          vIssueCache[brand] = arr[i].__issue;
          return arr[i].__issue;
        }
      }
      // 还没交上半部分，也能先传凭证：建占位 issue
      var rec = {
        id: 'EX' + Date.now().toString(36).toUpperCase(),
        module: 'exuan', brand: brand, voucherOnly: true,
        createdAt: new Date().toISOString(),
      };
      var body = '**模块**：双11鹅选美妆节 · 凭证登记（该客户尚未提交活动报名，先传了凭证）\n\n'
        + '<!-- 以下为机器读取用，请勿修改 -->\n```json\n' + JSON.stringify(rec) + '\n```';
      return GHUB.submitIssue('[鹅选美妆节] ' + brand + ' · 凭证登记', body, [XC.label])
        .then(function (r) {
          vIssueCache[brand] = r.issue;
          return r.issue;
        });
    });
  }

  /** 只查不建（避免客户误触发就产生空 issue） */
  function findIssueQuiet(brand) {
    if (vIssueCache[brand]) return Promise.resolve(vIssueCache[brand]);
    return GHUB.listByLabel(XC.label).then(function (arr) {
      for (var i = 0; i < arr.length; i++) {
        if ((arr[i].brand || '') === brand) {
          vIssueCache[brand] = arr[i].__issue;
          return arr[i].__issue;
        }
      }
      return null;
    });
  }

  /** 上传某一个模块的那一张凭证 */
  function uploadModule(key) {
    var brand = $('#vBrand').value.trim();
    if (!brand) { alert('请先填写客户名称'); $('#vBrand').focus(); return; }
    if (!GHUB.enabled()) {
      alert('当前未配置在线后端，无法上传凭证。\n请联系运营同学线下回传。');
      return;
    }
    var st = mState[key];
    if (!st || !st.file) return;
    var mod = null;
    VMODS.forEach(function (m) { if (m.key === key) mod = m; });

    st.status = 'uploading';
    st.name = st.file.name;
    renderVModules();
    $('#vStatus').textContent = '正在上传「' + (mod ? mod.name : key) + '」…';

    var issueNo, upUrl, upPath, finalFile;
    findOrCreateIssue(brand).then(function (no) {
      issueNo = no;
      return compressIfNeeded(st.file);
    }).then(function (f) {
      finalFile = f;
      return toBase64(f);
    }).then(function (b64) {
      var ext = (finalFile.name.match(/\.(\w+)$/) || [0, 'bin'])[1].toLowerCase();
      var path = 'uploads/exuan/' + safeName(brand) + '/' + key
        + '-' + ts() + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
      return GHUB.uploadFile(path, b64);
    }).then(function (up) {
      upUrl = up.url;
      upPath = up.path;
      var v = {
        type: 'voucher',
        module: key,
        moduleName: mod ? mod.name : key,
        brand: brand,
        name: finalFile.name,
        url: up.url,
        path: up.path,
        size: finalFile.size,
        uploadedAt: new Date().toISOString(),
      };
      return GHUB.addComment(issueNo, GHUB.voucherCommentBody(v));
    }).then(function () {
      mState[key] = {
        status: 'done', url: upUrl, path: upPath,
        name: finalFile.name, time: ts(),
      };
      renderVModules();
      $('#vStatus').innerHTML = '「' + esc(mod ? mod.name : key) + '」上传成功，'
        + '<a href="' + esc(upUrl) + '" target="_blank">查看凭证</a>。审核通过后给予进一步扶持。';
    }).catch(function (e) {
      mState[key] = { status: 'fail', file: st.file, msg: e.message };
      renderVModules();
      $('#vStatus').textContent = '上传失败：' + e.message;
    });
  }

  /** 展示该客户各模块已上传的凭证（按模块归位，最新一张生效） */
  function loadMyVouchers(brand) {
    if (!GHUB.readable() || !brand) return;
    $('#vStatus').textContent = '查询已传凭证…';
    findIssueQuiet(brand).then(function (no) {
      if (!no) { $('#vStatus').textContent = ''; return; }
      return GHUB.listComments(no).then(function (cs) {
        var vs = GHUB.parseVouchers(cs);
        var latest = {};   // module -> 最新一份
        vs.forEach(function (v) {
          var k = v.module || '__unknown';
          if (!latest[k] || String(v.uploadedAt) > String(latest[k].uploadedAt)) latest[k] = v;
        });
        var filled = 0;
        VMODS.forEach(function (m) {
          var v = latest[m.key];
          if (v && (!mState[m.key] || mState[m.key].status === 'empty')) {
            mState[m.key] = { status: 'done', url: v.url, path: v.path, name: v.name, time: fmtT(v.uploadedAt) };
          }
          if (v) filled++;
        });
        renderVModules();
        $('#vStatus').innerHTML = filled
          ? '该客户已上传 <b>' + filled + '</b> / ' + VMODS.length + ' 个模块的凭证'
          : '该客户暂未上传过凭证';
      });
    }).catch(function () { $('#vStatus').textContent = ''; });
  }

  function fmtT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var vBrandTimer = null;
  $('#vBrand').addEventListener('input', function () {
    clearTimeout(vBrandTimer);
    var b = this.value.trim();
    vBrandTimer = setTimeout(function () { loadMyVouchers(b); }, 800);
  });

  /* ================= 表单联动 ================= */
  $('#brand').addEventListener('input', function () {
    state.brand = this.value;
    if (!$('#vBrand').value.trim()) $('#vBrand').value = this.value;
    saveDraft();
    renderConfirm();
  });
  $('#remark').addEventListener('input', function () {
    state.remark = this.value;
    saveDraft();
    renderConfirm();
  });

  $('#btnSubmit').addEventListener('click', submit);
  $('#btnClear').addEventListener('click', function () {
    if (!confirm('清空上半部分所有填写内容？（不影响已上传的凭证）')) return;
    state = { brand: '', answers: {}, remark: '' };
    localStorage.removeItem(DRAFT_KEY);
    $('#brand').value = '';
    $('#remark').value = '';
    renderQuestions();
    renderConfirm();
  });

  /* ================= init ================= */
  loadDraft();
  $('#brand').value = state.brand || '';
  $('#vBrand').value = state.brand || '';
  $('#remark').value = state.remark || '';
  renderQuestions();
  renderVModules();
  renderConfirm();
})();
