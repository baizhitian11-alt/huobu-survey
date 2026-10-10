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
  $('#vNoteLabel').textContent = XC.voucher.noteLabel || '凭证说明';
  $('#vNote').placeholder = XC.voucher.notePlaceholder || '';

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

  /* ================= 凭证上传 ================= */
  var vFiles = [];        // 待上传队列 [{file, status, msg, url}]
  var vIssueCache = {};   // brand -> issueNumber

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60);
  }

  function ts() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function addFiles(list) {
    var maxB = (XC.voucher.maxMB || 5) * 1024 * 1024;
    Array.prototype.forEach.call(list, function (f) {
      var isImg = /^image\//.test(f.type);
      var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isImg && !isPdf) {
        vFiles.push({ file: f, status: 'fail', msg: '仅支持图片或 PDF' });
        return;
      }
      if (f.size > maxB) {
        vFiles.push({ file: f, status: 'fail', msg: '超过 5MB 限制' });
        return;
      }
      vFiles.push({ file: f, status: 'pending' });
    });
    renderVList();
  }

  function renderVList() {
    if (!vFiles.length) { $('#vList').innerHTML = ''; return; }
    $('#vList').innerHTML = vFiles.map(function (it, i) {
      var kb = Math.round(it.file.size / 1024);
      var st = it.status === 'pending' ? '<span class="vs">待上传</span>'
        : it.status === 'uploading' ? '<span class="vs doing">上传中…</span>'
        : it.status === 'done' ? '<span class="vs ok">✓ 已上传</span>'
        : '<span class="vs bad">✗ ' + esc(it.msg || '失败') + '</span>';
      var link = it.url ? ' <a href="' + esc(it.url) + '" target="_blank">查看</a>' : '';
      var del = (it.status === 'pending' || it.status === 'fail')
        ? ' <a href="javascript:;" class="vrm" data-i="' + i + '">移除</a>' : '';
      return '<div class="vitem"><span class="vname">' + esc(it.file.name)
        + ' <i>' + kb + 'KB</i></span>' + st + link + del + '</div>';
    }).join('');
  }

  $('#vList').addEventListener('click', function (e) {
    var rm = e.target.closest('.vrm');
    if (!rm) return;
    vFiles.splice(+rm.dataset.i, 1);
    renderVList();
  });

  $('#vDrop').addEventListener('click', function () { $('#vFile').click(); });
  $('#vFile').addEventListener('change', function () {
    addFiles(this.files);
    this.value = '';
  });
  ['dragover', 'dragenter'].forEach(function (ev) {
    $('#vDrop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    $('#vDrop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('over'); });
  });
  $('#vDrop').addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
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

  function uploadAll() {
    var brand = $('#vBrand').value.trim();
    if (!brand) { alert('请先填写客户名称'); $('#vBrand').focus(); return; }
    var pend = vFiles.filter(function (f) { return f.status === 'pending'; });
    if (!pend.length) { alert('请先选择凭证文件'); return; }
    if (!GHUB.enabled()) {
      alert('当前未配置在线后端，无法上传凭证。\n请联系运营同学线下回传。');
      return;
    }

    var btn = $('#btnUpload');
    btn.disabled = true;
    $('#vStatus').textContent = '正在定位报名记录…';

    var issueNo;
    findOrCreateIssue(brand).then(function (no) {
      issueNo = no;
      var chain = Promise.resolve();
      pend.forEach(function (it) {
        chain = chain.then(function () {
          it.status = 'uploading';
          renderVList();
          return compressIfNeeded(it.file).then(function (f) {
            return toBase64(f).then(function (b64) {
              var ext = (f.name.match(/\.(\w+)$/) || [0, 'bin'])[1].toLowerCase();
              var path = 'uploads/exuan/' + safeName(brand)
                + '/' + ts() + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
              return GHUB.uploadFile(path, b64).then(function (up) {
                var v = {
                  type: 'voucher',
                  brand: brand,
                  name: f.name,
                  url: up.url,
                  path: up.path,
                  size: f.size,
                  note: $('#vNote').value.trim(),
                  uploadedAt: new Date().toISOString(),
                };
                return GHUB.addComment(issueNo, GHUB.voucherCommentBody(v)).then(function () {
                  it.status = 'done';
                  it.url = up.url;
                  renderVList();
                });
              });
            });
          }).catch(function (e) {
            it.status = 'fail';
            it.msg = e.message;
            renderVList();
          });
        });
      });
      return chain;
    }).then(function () {
      var ok = vFiles.filter(function (f) { return f.status === 'done'; }).length;
      var bad = vFiles.filter(function (f) { return f.status === 'fail'; }).length;
      $('#vStatus').innerHTML = '本次上传完成：成功 <b>' + ok + '</b>'
        + (bad ? '，失败 <b style="color:#d4380d">' + bad + '</b>（可点移除后重试）' : '')
        + '。运营审核通过后给予进一步扶持。';
      loadMyVouchers(brand);
    }).catch(function (e) {
      $('#vStatus').textContent = '上传失败：' + e.message;
    }).finally(function () {
      btn.disabled = false;
    });
  }

  /** 展示该客户已上传的凭证 */
  function loadMyVouchers(brand) {
    if (!GHUB.readable() || !brand) return;
    $('#vStatus').textContent = '查询已传凭证…';
    findOrCreateQuiet(brand).then(function (no) {
      if (!no) { $('#vStatus').textContent = ''; return; }
      return GHUB.listComments(no).then(function (cs) {
        var vs = GHUB.parseVouchers(cs);
        if (!vs.length) { $('#vStatus').textContent = '该客户暂未上传过凭证'; return; }
        $('#vStatus').innerHTML = '该客户已上传 <b>' + vs.length + '</b> 份凭证：'
          + vs.map(function (v, i) {
            return '<a href="' + esc(v.url) + '" target="_blank">' + (i + 1) + '. ' + esc(v.name) + '</a>';
          }).join('　');
      });
    }).catch(function () { $('#vStatus').textContent = ''; });
  }

  /** 只查不建（避免客户误触发就产生空 issue） */
  function findOrCreateQuiet(brand) {
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
  $('#btnUpload').addEventListener('click', uploadAll);
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
  renderConfirm();
})();
