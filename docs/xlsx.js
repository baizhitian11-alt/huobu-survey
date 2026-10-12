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

  /**
   * sheet 可选字段：
   *   cols       列宽，[16, 20] 或 [{w:16}]
   *   rowHeights { 行号(0起): 像素 }
   *   images     [{ row, col, data:Uint8Array, ext:'jpeg'|'png', w, h, offX, offY }]  w/h 为显示像素
   *   links      [{ row, col, url }]  单元格超链接
   *   wrap       true 时正文单元格垂直居中 + 自动换行
   * @param {number} relDrawing 该 sheet 的 drawing 关系 id（无图片时为 0）
   * @param {Array} linkRids    与 sheet.links 一一对应的关系 id
   */
  function sheetXml(sheet, relDrawing, linkRids) {
    var rows = sheet.rows || [];
    var cols = sheet.cols && sheet.cols.length
      ? '<cols>' + sheet.cols.map(function (c, i) {
          var w = typeof c === 'number' ? c : (c && c.w) || 16;
          return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
        }).join('') + '</cols>'
      : '';
    var heights = sheet.rowHeights || {};
    var bodyStyle = sheet.wrap ? ' s="2"' : '';

    var body = rows.map(function (row, r) {
      var cells = (row || []).map(function (v, c) {
        var ref = colName(c) + (r + 1);
        var style = r === 0 ? ' s="1"' : bodyStyle;
        if (v === null || v === undefined || v === '') return '<c r="' + ref + '"' + style + '/>';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      var ht = heights[r] ? ' ht="' + (Math.round(heights[r] * 0.75 * 100) / 100) + '" customHeight="1"' : '';
      return '<row r="' + (r + 1) + '"' + ht + '>' + cells + '</row>';
    }).join('');

    var links = (sheet.links || []).length
      ? '<hyperlinks>' + sheet.links.map(function (l, i) {
          return '<hyperlink ref="' + colName(l.col) + (l.row + 1) + '" r:id="rId' + linkRids[i] + '"/>';
        }).join('') + '</hyperlinks>'
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + cols + '<sheetData>' + body + '</sheetData>' + links
      + (relDrawing ? '<drawing r:id="rId' + relDrawing + '"/>' : '')
      + '</worksheet>';
  }

  var EMU = 9525;   // 1 像素 = 9525 EMU

  /** 列宽(字符) → 像素，按 Excel 默认字体近似 */
  function colPx(sheet, c) {
    var w = sheet.cols && sheet.cols[c];
    w = typeof w === 'number' ? w : (w && w.w) || 8.43;
    return Math.floor(w * 7 + 5);
  }
  function rowPx(sheet, r) {
    return (sheet.rowHeights && sheet.rowHeights[r]) || 20;
  }

  /** 从 (起始格 + 偏移) 走 dist 像素，得到终点所在格与格内偏移 */
  function walk(start, off, dist, sizeOf) {
    var i = start, pos = off + dist;
    while (pos > sizeOf(i)) { pos -= sizeOf(i); i++; }
    return { idx: i, off: pos };
  }

  /**
   * 图片用 twoCellAnchor + editAs="oneCell"（Excel 自己保存时用的写法，WPS / Numbers 兼容最好）：
   * 随单元格移动，但不随单元格拉伸变形
   */
  function drawingXml(sheet, images, imgRids) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
      + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + images.map(function (im, i) {
          var cx = Math.round(im.w * EMU), cy = Math.round(im.h * EMU);
          var cw = function (c) { return colPx(sheet, c); }, rh = function (r) { return rowPx(sheet, r); };
          var fromC = walk(im.col, 0, im.offX || 0, cw), fromR = walk(im.row, 0, im.offY || 0, rh);
          var endC = walk(fromC.idx, fromC.off, im.w, cw);
          var endR = walk(fromR.idx, fromR.off, im.h, rh);
          return '<xdr:twoCellAnchor editAs="oneCell">'
            + '<xdr:from><xdr:col>' + fromC.idx + '</xdr:col><xdr:colOff>' + Math.round(fromC.off * EMU) + '</xdr:colOff>'
            + '<xdr:row>' + fromR.idx + '</xdr:row><xdr:rowOff>' + Math.round(fromR.off * EMU) + '</xdr:rowOff></xdr:from>'
            + '<xdr:to><xdr:col>' + endC.idx + '</xdr:col><xdr:colOff>' + Math.round(endC.off * EMU) + '</xdr:colOff>'
            + '<xdr:row>' + endR.idx + '</xdr:row><xdr:rowOff>' + Math.round(endR.off * EMU) + '</xdr:rowOff></xdr:to>'
            + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (i + 2) + '" name="' + esc(im.name || ('图片' + (i + 1))) + '"'
            + (im.__linkRid ? ' descr="点击打开原图"><a:hlinkClick r:id="rId' + im.__linkRid + '"/></xdr:cNvPr>' : '/>')
            + '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
            + '<xdr:blipFill><a:blip r:embed="rId' + imgRids[i] + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
            + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>'
            + '<xdr:clientData/></xdr:twoCellAnchor>';
        }).join('')
      + '</xdr:wsDr>';
  }

  function relsXml(list) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map(function (r) {
          return '<Relationship Id="rId' + r.id + '" Type="' + r.type + '" Target="' + esc(r.target) + '"'
            + (r.external ? ' TargetMode="External"' : '') + '/>';
        }).join('')
      + '</Relationships>';
  }

  var REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
  var REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  var REL_LINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

  function buildXlsx(sheets) {
    var files = [];
    var drawingNo = 0, mediaNo = 0;
    var drawingParts = [];   // Content_Types 用
    var mediaSeen = [];      // 同一份图片数据只存一次：[{ data, target }]
    function mediaTarget(im) {
      for (var m = 0; m < mediaSeen.length; m++) if (mediaSeen[m].data === im.data) return mediaSeen[m].target;
      mediaNo++;
      var ext = im.ext === 'png' ? 'png' : 'jpeg';
      files.push({ name: 'xl/media/image' + mediaNo + '.' + ext, data: im.data });
      var t = '../media/image' + mediaNo + '.' + ext;
      mediaSeen.push({ data: im.data, target: t });
      return t;
    }

    // 先处理每个 sheet 的图片 / 超链接，生成 drawing、media、rels
    var sheetParts = sheets.map(function (s, i) {
      var rels = [], relDrawing = 0, linkRids = [], rid = 0;
      var imgs = (s.images || []).filter(function (im) { return im && im.data && im.data.length; });
      if (imgs.length) {
        drawingNo++;
        relDrawing = ++rid;
        rels.push({ id: relDrawing, type: REL_DRAWING, target: '../drawings/drawing' + drawingNo + '.xml' });
        var dRels = [], imgRids = [], dRid = 0, targetRid = {};
        imgs = imgs.map(function (im) {
          var t = mediaTarget(im);
          if (!targetRid[t]) { targetRid[t] = ++dRid; dRels.push({ id: dRid, type: REL_IMAGE, target: t }); }
          imgRids.push(targetRid[t]);
          var o = Object.assign({}, im);
          if (im.url) { o.__linkRid = ++dRid; dRels.push({ id: dRid, type: REL_LINK, target: im.url, external: true }); }
          return o;
        });
        files.push({ name: 'xl/drawings/drawing' + drawingNo + '.xml', data: drawingXml(s, imgs, imgRids) });
        files.push({ name: 'xl/drawings/_rels/drawing' + drawingNo + '.xml.rels', data: relsXml(dRels) });
        drawingParts.push(drawingNo);
      }
      (s.links || []).forEach(function (l) {
        var id = ++rid;
        linkRids.push(id);
        rels.push({ id: id, type: REL_LINK, target: l.url, external: true });
      });
      if (rels.length) {
        files.push({ name: 'xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels', data: relsXml(rels) });
      }
      return { xml: sheetXml(Object.assign({}, s, { images: imgs }), relDrawing, linkRids) };
    });

    files.unshift({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheets.map(function (s, i) {
            return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
          }).join('')
        + drawingParts.map(function (n) {
            return '<Override PartName="/xl/drawings/drawing' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
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
        + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    });

    sheetParts.forEach(function (p, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: p.xml });
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
