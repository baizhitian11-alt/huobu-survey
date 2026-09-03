/**
 * 极简 XLSX 生成器 · 浏览器 + Node 通用（零依赖）
 *   buildXlsx([{ name:'Sheet1', cols:[{w:20}], rows:[['A','B'],[1,2]] }]) -> Uint8Array
 * ZIP 使用 store（不压缩）模式，因此浏览器端无需任何压缩库。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HBXlsx = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- CRC32 ---------- */
  var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();

  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  /* ---------- UTF-8 ---------- */
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return new Uint8Array(out);
  }

  /* ---------- ZIP (store) ---------- */
  function W(view, off, val, bytes) {
    for (var i = 0; i < bytes; i++) view[off + i] = (val >>> (i * 8)) & 0xff;
  }

  function zip(files) {
    var now = new Date();
    var time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    var date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    var parts = [], central = [], offset = 0, i;

    for (i = 0; i < files.length; i++) {
      var nameBuf = utf8(files[i].name);
      var data = files[i].data instanceof Uint8Array ? files[i].data : utf8(files[i].data);
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBuf.length);
      W(local, 0, 0x04034b50, 4);
      W(local, 4, 20, 2);
      W(local, 6, 0x0800, 2);   // UTF-8
      W(local, 8, 0, 2);        // store
      W(local, 10, time, 2);
      W(local, 12, date, 2);
      W(local, 14, crc, 4);
      W(local, 18, data.length, 4);
      W(local, 22, data.length, 4);
      W(local, 26, nameBuf.length, 2);
      W(local, 28, 0, 2);
      local.set(nameBuf, 30);
      parts.push(local, data);

      var cd = new Uint8Array(46 + nameBuf.length);
      W(cd, 0, 0x02014b50, 4);
      W(cd, 4, 20, 2);
      W(cd, 6, 20, 2);
      W(cd, 8, 0x0800, 2);
      W(cd, 10, 0, 2);
      W(cd, 12, time, 2);
      W(cd, 14, date, 2);
      W(cd, 16, crc, 4);
      W(cd, 20, data.length, 4);
      W(cd, 24, data.length, 4);
      W(cd, 28, nameBuf.length, 2);
      W(cd, 42, offset, 4);
      cd.set(nameBuf, 46);
      central.push(cd);

      offset += local.length + data.length;
    }

    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;

    var eocd = new Uint8Array(22);
    W(eocd, 0, 0x06054b50, 4);
    W(eocd, 8, files.length, 2);
    W(eocd, 10, files.length, 2);
    W(eocd, 12, cdSize, 4);
    W(eocd, 16, offset, 4);

    var total = offset + cdSize + 22;
    var out = new Uint8Array(total), pos = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], pos); pos += parts[i].length; }
    for (i = 0; i < central.length; i++) { out.set(central[i], pos); pos += central[i].length; }
    out.set(eocd, pos);
    return out;
  }

  /* ---------- XLSX ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(n) {
    var s = '';
    n += 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var cols = sheet.cols && sheet.cols.length
      ? '<cols>' + sheet.cols.map(function (c, i) {
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 16) + '" customWidth="1"/>';
        }).join('') + '</cols>'
      : '';

    var body = rows.map(function (row, r) {
      var cells = (row || []).map(function (v, c) {
        var ref = colName(c) + (r + 1);
        var style = r === 0 ? ' s="1"' : '';
        if (v === null || v === undefined || v === '') return '<c r="' + ref + '"' + style + '/>';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }

  function buildXlsx(sheets) {
    var files = [];

    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheets.map(function (s, i) {
            return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
          }).join('')
        + '</Types>',
    });

    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    });

    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + sheets.map(function (s, i) {
            return '<sheet name="' + esc(s.name || 'Sheet' + (i + 1)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
          }).join('')
        + '</sheets></workbook>',
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map(function (s, i) {
            return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
          }).join('')
        + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    });

    files.push({
      name: 'xl/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    });

    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });

    return zip(files);
  }

  /** 浏览器端：生成并触发下载 */
  function downloadXlsx(sheets, filename) {
    var bytes = buildXlsx(sheets);
    var blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  return { buildXlsx: buildXlsx, downloadXlsx: downloadXlsx };
}));
