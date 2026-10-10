/**
 * 腾讯营销 × 鹅选美妆节 · 客户页
 * 上半部分：报规划（10.13 截止，不卡死，逾期标记）
 * 下半部分：排位赛凭证（随时可传；一个排位事项一个模块，模块内一格一张）
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

  var state = { brand: '', answers: {}, remark: '', extra: {} };

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

  /* ================= 下半部分：排位赛凭证 ================= */
  // 格子状态：slots['module#idx'] = { status: empty|uploading|done|fail, url, name, time, msg }
  var slots = {};
  var vIssueCache = {};
  var picking = null;   // { mod, idx }

  function sk(modKey, idx) { return modKey + '#' + idx; }

  function renderVModules() {
    $('#vModules').innerHTML = VMODS.map(function (m) {
      var h = '<div class="rk-card' + (m.noUpload ? ' no-up' : '') + '">'
        + '<div class="rk-head"><b>' + esc(m.name) + '</b>'
        + '<span class="rk-score">🔥 ' + esc(m.score) + '</span>';

      if (!m.noUpload) {
        var done = (m.slots || []).filter(function (_, i) {
          var s = slots[sk(m.key, i)];
          return s && s.status === 'done';
        }).length;
        h += '<span class="rk-count' + (done ? ' ok' : '') + '">已传 ' + done + '/' + m.slots.length + '</span>';
      } else {
        h += '<span class="rk-count gov">官方校验</span>';
      }
      h += '</div>';

      h += '<div class="rk-body"><div class="rk-std"><div class="rk-lab">标准说明</div><ul>'
        + m.standard.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
      if (m.guide) {
        h += '<a class="rk-guide" href="' + esc(m.guide.url) + '" target="_blank">📖 ' + esc(m.guide.text) + '</a>';
      }
      if (m.examples && m.examples.length) {
        h += '<div class="rk-lab" style="margin-top:10px">示例（点击放大）</div><div class="rk-ex">'
          + m.examples.map(function (src) {
            return '<img src="' + esc(src) + '" data-big="' + esc(src) + '" loading="lazy" alt=""/>';
          }).join('') + '</div>';
      }
      h += '</div>';

      h += '<div class="rk-up"><div class="rk-lab">上传凭证</div>';
      if (m.noUpload) {
        h += '<div class="rk-gov">无需上传，官方校验</div>';
      } else {
        h += '<div class="rk-tip">' + esc(m.uploadTip) + '</div>';
        if (m.extraField) {
          var ef = m.extraField;
          h += '<label class="field" style="margin:8px 0 4px"><span class="label">' + esc(ef.label)
            + (ef.required ? ' <span class="req">*</span>' : '') + '</span>'
            + '<input class="rk-extra" data-mod="' + esc(m.key) + '" value="'
            + esc((state.extra || {})[m.key] || '') + '" placeholder="' + esc(ef.placeholder || '') + '"/></label>';
        }
        h += '<div class="rk-slots">' + m.slots.map(function (name, i) {
          var s = slots[sk(m.key, i)] || { status: 'empty' };
          var inner;
          if (s.status === 'done') {
            inner = '<div class="sl-state ok">✓ 已上传</div>'
              + '<a href="' + esc(s.url) + '" target="_blank" class="sl-file">' + esc(s.name) + '</a>'
              + '<div class="sl-time">' + esc(s.time || '') + '</div>'
              + '<button class="link-btn" data-act="pick" data-mod="' + esc(m.key) + '" data-i="' + i + '">重新上传</button>';
          } else if (s.status === 'uploading') {
            inner = '<div class="sl-state doing">上传中…</div><div class="sl-file">' + esc(s.name || '') + '</div>';
          } else if (s.status === 'fail') {
            inner = '<div class="sl-state bad">✗ 失败</div><div class="sl-time">' + esc(s.msg || '') + '</div>'
              + '<button class="link-btn" data-act="pick" data-mod="' + esc(m.key) + '" data-i="' + i + '">重新选择</button>';
          } else {
            inner = '<div class="sl-plus">＋</div><div class="sl-time">点击上传</div>';
          }
          return '<div class="slot ' + s.status + '"' + (s.status === 'empty'
              ? ' data-act="pick" data-mod="' + esc(m.key) + '" data-i="' + i + '"' : '') + '>'
            + '<div class="sl-name">' + esc(name) + '</div>' + inner + '</div>';
        }).join('') + '</div>';
      }
      return h + '</div></div></div>';
    }).join('');
  }

  $('#vModules').addEventListener('click', function (e) {
    var img = e.target.closest('img[data-big]');
    if (img) {
      $('#imgBig').src = img.dataset.big;
      $('#imgMask').classList.add('show');
      return;
    }
    var t = e.target.closest('[data-act="pick"]');
    if (!t) return;
    if (!state.brand.trim()) {
      alert('请先在最上方填写品牌名称');
      $('#brand').focus();
      return;
    }
    var mod = VMODS.filter(function (m) { return m.key === t.dataset.mod; })[0];
    if (mod && mod.extraField && mod.extraField.required && !String((state.extra || {})[mod.key] || '').trim()) {
      alert('请先填写「' + mod.extraField.label + '」');
      var inp = document.querySelector('.rk-extra[data-mod="' + mod.key + '"]');
      if (inp) inp.focus();
      return;
    }
    picking = { mod: t.dataset.mod, idx: +t.dataset.i };
    $('#vFile').click();
  });

  $('#vModules').addEventListener('input', function (e) {
    if (!e.target.classList.contains('rk-extra')) return;
    state.extra = state.extra || {};
    state.extra[e.target.dataset.mod] = e.target.value;
    saveDraft();
  });

  $('#imgMask').addEventListener('click', function () { this.classList.remove('show'); });

  $('#vFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || !picking) return;
    var isImg = /^image\//.test(f.type);
    var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isImg && !isPdf) { alert('仅支持图片或 PDF'); return; }
    if (f.size > (XC.voucher.maxMB || 5) * 1048576) { alert('文件超过 ' + (XC.voucher.maxMB || 5) + 'MB'); return; }
    uploadSlot(picking.mod, picking.idx, f);   // 选完直接上传，少一步
  });

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
        URL.revokeObjectURL(img.src);
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

  function uploadSlot(modKey, idx, file) {
    if (!GHUB.enabled()) {
      alert('当前未开通在线上传，请把凭证发给对接的腾讯销售。');
      return;
    }
    var brand = state.brand.trim();
    var mod = VMODS.filter(function (m) { return m.key === modKey; })[0];
    var key = sk(modKey, idx);
    slots[key] = { status: 'uploading', name: file.name };
    renderVModules();
    $('#vStatus').textContent = '正在上传「' + mod.name + ' · ' + mod.slots[idx] + '」…';

    var issueNo, f2;
    findIssue(brand, true).then(function (no) {
      issueNo = no;
      return compressIfNeeded(file);
    }).then(function (f) {
      f2 = f;
      return toBase64(f);
    }).then(function (b64) {
      var d = new Date();
      var ext = ((f2.name.match(/\.(\w+)$/) || [0, 'bin'])[1]).toLowerCase();
      var path = 'uploads/exuan/' + safeName(brand) + '/' + modKey + '-' + (idx + 1) + '-'
        + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes())
        + pad(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
      return GHUB.uploadFile(path, b64);
    }).then(function (up) {
      var v = {
        type: 'voucher', module: modKey, moduleName: mod.name,
        slot: idx, slotName: mod.slots[idx],
        brand: brand, name: f2.name, url: up.url, path: up.path, size: f2.size,
        uploadedAt: new Date().toISOString(),
      };
      if (mod.extraField) {
        v.extra = {};
        v.extra[mod.extraField.key] = String((state.extra || {})[modKey] || '').trim();
      }
      return GHUB.addComment(issueNo, GHUB.voucherCommentBody(v)).then(function () { return v; });
    }).then(function (v) {
      slots[key] = { status: 'done', url: v.url, name: v.name, time: fmtT(v.uploadedAt) };
      renderVModules();
      $('#vStatus').innerHTML = '<span style="color:#06a552">✓「' + esc(mod.name + ' · ' + mod.slots[idx])
        + '」上传成功</span>，等待官方校验';
    }).catch(function (e) {
      slots[key] = { status: 'fail', msg: e.message };
      renderVModules();
      $('#vStatus').textContent = '上传失败：' + e.message;
    });
  }

  /** 按品牌回填已传凭证（每格取最新一张） */
  function loadMyVouchers() {
    var brand = state.brand.trim();
    slots = {};
    renderVModules();
    if (!brand || !GHUB.readable()) return;
    $('#vStatus').textContent = '查询该品牌已传凭证…';
    findIssue(brand, false).then(function (no) {
      if (!no) { $('#vStatus').textContent = ''; return; }
      return GHUB.listComments(no).then(function (cs) {
        var n = 0;
        GHUB.parseVouchers(cs).forEach(function (v) {
          if (v.slot === undefined) return;
          var key = sk(v.module, v.slot);
          var old = slots[key];
          if (!old || String(v.uploadedAt) > String(old.at)) {
            if (!old) n++;
            slots[key] = { status: 'done', url: v.url, name: v.name, time: fmtT(v.uploadedAt), at: v.uploadedAt };
          }
          var ev = v.extra && v.extra[Object.keys(v.extra)[0]];
          if (ev) {
            state.extra = state.extra || {};
            if (!state.extra[v.module]) state.extra[v.module] = ev;
          }
        });
        renderVModules();
        $('#vStatus').textContent = n ? '该品牌已上传 ' + n + ' 张凭证，可继续补传或重新上传' : '';
      });
    }).catch(function () { $('#vStatus').textContent = ''; });
  }

  /* ================= 事件 & init ================= */
  var brandTimer = null;
  $('#brand').addEventListener('input', function () {
    state.brand = this.value;
    saveDraft();
    clearTimeout(brandTimer);
    brandTimer = setTimeout(loadMyVouchers, 800);
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
  renderVModules();
  if (state.brand) loadMyVouchers();
})();
