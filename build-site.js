#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toHtmlFileName = (filePath, ext) =>
  filePath.replace(/^\.\//, '').replace(/\//g, '_').replace(ext, '.html');

const safeHref = (fileName) => escapeHtml(encodeURI(fileName));

// Create docs directory
const docsDir = './docs';
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Lightweight markdown to HTML converter optimized for Notes
function markdownToHtml(markdown) {
  const applyInline = (text = '') => {
    let t = escapeHtml(text);
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" loading="lazy" />');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.*?)__/g, '<strong>$1</strong>');
    t = t.replace(/\*(.*?)\*/g, '<em>$1</em>');
    t = t.replace(/_(.*?)_/g, '<em>$1</em>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  };

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];

  let inCode = false;
  let codeLang = '';
  let codeLines = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let inDetails = false;
  let paragraph = '';

  const closeParagraph = () => {
    if (paragraph.trim()) {
      html.push('<p>' + applyInline(paragraph.trim()) + '</p>');
      paragraph = '';
    }
  };

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>');
      inBlockquote = false;
    }
  };

  const isSeparatorRow = (row) => /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/.test(row);
  const splitCells = (row) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => applyInline(c.trim()));

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    // Handle <details> and <summary> tags
    if (line.trim() === '<details>' || line.trim().startsWith('<details ')) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      html.push(line.trim());
      inDetails = true;
      continue;
    }

    if (line.trim() === '</details>') {
      html.push(line.trim());
      inDetails = false;
      continue;
    }

    if (line.trim().startsWith('<summary>') || line.trim() === '<summary>') {
      html.push(line.trim());
      continue;
    }

    if (line.trim() === '</summary>') {
      html.push(line.trim());
      continue;
    }

    if (line.startsWith('```')) {
      if (inCode) {
        html.push('<pre><code class="language-' + escapeHtml(codeLang) + '">' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        codeLines = [];
        codeLang = '';
        inCode = false;
      } else {
        closeParagraph();
        closeLists();
        closeBlockquote();
        inCode = true;
        codeLang = line.replace(/```/, '').trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      continue;
    }

    if (/^(\*\s*\*\s*\*|---)$/.test(line)) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      html.push('<hr/>');
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeLists();
      closeBlockquote();
      const level = headingMatch[1].length;
      html.push('<h' + level + '>' + applyInline(headingMatch[2].trim()) + '</h' + level + '>');
      continue;
    }

    // Tables (continuous pipe-starting lines)
    const nextLine = lines[i + 1]?.trim();
    if (line.startsWith('|') && nextLine && nextLine.startsWith('|')) {
      const tableLines = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        tableLines.push(lines[j].trim());
        j++;
      }
      if (tableLines.length >= 2) {
        closeParagraph();
        closeLists();
        closeBlockquote();

        const headerCells = splitCells(tableLines[0]);
        const bodyLines = isSeparatorRow(tableLines[1]) ? tableLines.slice(2) : tableLines.slice(1);
        const bodyRows = bodyLines.map(splitCells);

        let tableHtml = '<table><thead><tr>' + headerCells.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>';
        bodyRows.forEach(row => {
          tableHtml += '<tr>' + row.map(c => '<td>' + c + '</td>').join('') + '</tr>';
        });
        tableHtml += '</tbody></table>';
        html.push(tableHtml);
        i = j - 1;
        continue;
      }
    }

    if (line.startsWith('>')) {
      closeParagraph();
      closeLists();
      if (!inBlockquote) {
        html.push('<blockquote>');
        inBlockquote = true;
      }
      html.push('<p>' + applyInline(line.replace(/^>\s?/, '').trim()) + '</p>');
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      closeParagraph();
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push('<li>' + applyInline(olMatch[1]) + '</li>');
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      closeParagraph();
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push('<li>' + applyInline(ulMatch[1]) + '</li>');
      continue;
    }

    // Default: part of a paragraph
    paragraph = paragraph ? paragraph + ' ' + line.trim() : line.trim();
  }

  closeParagraph();
  closeLists();
  closeBlockquote();

  if (inCode) {
    html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
  }

  return html.join('\n');
}

// Generate SVG preview + standalone SVG export from Excalidraw JSON
function generateExcalidrawSvgPreview(data, name = 'Diagram') {
  const elements = (data.elements || []).filter(el => el && !el.isDeleted);
  if (elements.length === 0) {
    return { svg: '<p style="color: #999; text-align: center;">No elements in diagram</p>', hasElements: false };
  }

  const background = data.appState?.viewBackgroundColor || '#ffffff';
  const patternCache = new Map();
  const defs = [];

  const safeNumber = (val, fallback = 0) => (Number.isFinite(val) ? val : fallback);
  const safePositive = (val, fallback = 1) => {
    const n = safeNumber(val, fallback);
    return Math.abs(n) > 0 ? Math.abs(n) : fallback;
  };

  const clamp = (val, fallback = 0) => (Number.isFinite(val) ? val : fallback);

  const rotatePoint = (px, py, cx, cy, angle) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      cx + (px - cx) * cos - (py - cy) * sin,
      cy + (px - cx) * sin + (py - cy) * cos,
    ];
  };

  const getRoundness = (element) => {
    if (!element.roundness) return 0;
    if (typeof element.roundness === 'number') return element.roundness;
    return clamp(element.roundness.value, 0);
  };

  const normalizeElement = (element) => ({
    ...element,
    x: safeNumber(element.x, 0),
    y: safeNumber(element.y, 0),
    width: safePositive(element.width, 1),
    height: safePositive(element.height, 1),
    strokeWidth: safePositive(element.strokeWidth, 1),
    opacity: Number.isFinite(element.opacity) ? element.opacity : 100,
    angle: safeNumber(element.angle, 0),
  });

  const normalizedElements = elements.map(normalizeElement);

  const escapeText = (text = '') =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const getStrokeDasharray = (style, strokeWidth) => {
    if (style === 'dashed') return `${strokeWidth * 4} ${strokeWidth * 3}`;
    if (style === 'dotted') return `${strokeWidth} ${strokeWidth * 2.5}`;
    return '';
  };

  const ensurePattern = (fillStyle, strokeColor, backgroundColor) => {
    const key = `${fillStyle}-${strokeColor}-${backgroundColor}`;
    if (patternCache.has(key)) {
      return patternCache.get(key);
    }

    const id = `pattern-${patternCache.size + 1}`;
    let pattern = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">`;
    pattern += `<rect width="8" height="8" fill="${backgroundColor}"/>`;

    if (fillStyle === 'hachure') {
      pattern += `<path d="M0 8 L8 0" stroke="${strokeColor}" stroke-width="1" />`;
    } else {
      pattern += `<path d="M0 8 L8 0" stroke="${strokeColor}" stroke-width="1" />`;
      pattern += `<path d="M0 0 L8 8" stroke="${strokeColor}" stroke-width="1" />`;
    }

    pattern += '</pattern>';
    patternCache.set(key, id);
    defs.push(pattern);
    return id;
  };

  const getFill = (element) => {
    const bg = element.backgroundColor || 'transparent';
    if (bg === 'transparent' || element.type === 'line' || element.type === 'arrow') return 'none';

    if (element.fillStyle === 'hachure' || element.fillStyle === 'cross-hatch') {
      const patternId = ensurePattern(element.fillStyle, element.strokeColor || '#000000', bg);
      return `url(#${patternId})`;
    }

    return bg;
  };

  const fontFamilyMap = {
    1: 'Excalifont',
    2: 'Excalifont',
    3: 'Excalifont',
    4: 'Excalifont',
    5: 'Excalifont',
  };

  const getElementBounds = (element) => {
    const angle = clamp(element.angle, 0);
    if (element.type === 'arrow' || element.type === 'line') {
      const points = element.points && element.points.length ? element.points : [[0, 0], [element.width || 0, element.height || 0]];
      const coords = points.map(([px, py]) => [element.x + safeNumber(px, 0), element.y + safeNumber(py, 0)]);
      const cx = element.x + clamp(element.width, 0) / 2;
      const cy = element.y + clamp(element.height, 0) / 2;

      const rotated = angle
        ? coords.map(([px, py]) => rotatePoint(px, py, cx, cy, angle))
        : coords;

      const xs = rotated.map(p => p[0]);
      const ys = rotated.map(p => p[1]);

      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }

    const w = clamp(element.width, 0);
    const h = clamp(element.height, 0);
    const corners = [
      [element.x, element.y],
      [element.x + w, element.y],
      [element.x + w, element.y + h],
      [element.x, element.y + h],
    ];

    const cx = element.x + w / 2;
    const cy = element.y + h / 2;
    const rotated = angle
      ? corners.map(([px, py]) => rotatePoint(px, py, cx, cy, angle))
      : corners;

    const xs = rotated.map(p => p[0]);
    const ys = rotated.map(p => p[1]);

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  const bounds = normalizedElements.map(getElementBounds).reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  if (!Number.isFinite(bounds.minX)) {
    return { svg: '<p style="color: #999; text-align: center;">No drawable elements</p>', hasElements: false };
  }

  const padding = 32;
  const minX = Math.floor(bounds.minX - padding);
  const minY = Math.floor(bounds.minY - padding);
  const width = Math.ceil(bounds.maxX - bounds.minX + padding * 2) || 800;
  const height = Math.ceil(bounds.maxY - bounds.minY + padding * 2) || 600;

  defs.push('<style type="text/css">@font-face{font-family:"Excalifont";src:url("https://unpkg.com/@excalidraw/excalidraw@0.17.6/fonts/Excalifont-Regular.woff2") format("woff2");font-display:swap;} text{font-family:"Excalifont";}</style>');

  const marker = '<marker id="arrowhead" markerWidth="14" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>';
  defs.push(marker);

  const svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" style="background:${background};">`);
  svgParts.push('<defs>' + defs.join('') + '</defs>');
  svgParts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}" />`);

  const filesMap = data.files || {};

  const renderLinearElement = (element) => {
    const strokeWidth = clamp(element.strokeWidth, 1) || 1;
    const stroke = element.strokeColor || '#000000';
    const opacity = typeof element.opacity === 'number' ? element.opacity / 100 : 1;
    const points = Array.isArray(element.points) && element.points.length ? element.points : [[0, 0], [element.width || 0, element.height || 0]];
    const absPoints = points.map(([px, py]) => [element.x + safeNumber(px, 0), element.y + safeNumber(py, 0)]);
    const dashArray = getStrokeDasharray(element.strokeStyle, strokeWidth);
    const centerX = element.x + clamp(element.width, 0) / 2;
    const centerY = element.y + clamp(element.height, 0) / 2;

    const rotatedPoints = element.angle
      ? absPoints.map(([px, py]) => rotatePoint(px, py, centerX, centerY, element.angle))
      : absPoints;

    const pointsAttr = rotatedPoints.map(([px, py]) => `${px},${py}`).join(' ');
    const startMarker = element.startArrowhead === 'arrow' ? ' url(#arrowhead)' : '';
    const endMarker = element.endArrowhead === 'arrow' ? ' url(#arrowhead)' : '';

    return `<polyline points="${pointsAttr}" fill="none" stroke="${stroke}" color="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} ${startMarker ? `marker-start="${startMarker.trim()}"` : ''} ${endMarker ? `marker-end="${endMarker.trim()}"` : ''} opacity="${opacity}" />`;
  };

  const renderTextElement = (element) => {
    const fontSize = clamp(element.fontSize, 16) || 16;
    const fontFamily = fontFamilyMap[element.fontFamily] || 'Arial, sans-serif';
    const opacity = typeof element.opacity === 'number' ? element.opacity / 100 : 1;
    const lines = (element.text || '').split('\n');
    const lineHeightPx = (element.lineHeight || 1.25) * fontSize;
    const totalHeight = lines.length * lineHeightPx;

    let x = element.x;
    if (element.textAlign === 'center') x = element.x + clamp(element.width, 0) / 2;
    else if (element.textAlign === 'right') x = element.x + clamp(element.width, 0);

    let y = element.y + fontSize;
    if (element.verticalAlign === 'middle') {
      y = element.y + clamp(element.height, totalHeight) / 2 - totalHeight / 2 + fontSize;
    } else if (element.verticalAlign === 'bottom') {
      y = element.y + clamp(element.height, totalHeight) - totalHeight + fontSize * 0.9;
    }

    const anchor = element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start';
    const transform = element.angle ? ` transform="rotate(${(element.angle * 180 / Math.PI).toFixed(3)} ${x} ${y - fontSize})"` : '';

    const tspans = lines.map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? 0 : lineHeightPx}">${escapeText(line)}</tspan>`).join('');
    return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" fill="${element.strokeColor || '#000'}" text-anchor="${anchor}" opacity="${opacity}"${transform}>${tspans}</text>`;
  };

  const renderShape = (element) => {
    const strokeWidth = clamp(element.strokeWidth, 1) || 1;
    const stroke = element.strokeColor || '#000000';
    const fill = getFill(element);
    const dashArray = getStrokeDasharray(element.strokeStyle, strokeWidth);
    const opacity = typeof element.opacity === 'number' ? element.opacity / 100 : 1;
    const roundness = getRoundness(element);
    const transform = element.angle
      ? ` transform="rotate(${(element.angle * 180 / Math.PI).toFixed(3)} ${element.x + element.width / 2} ${element.y + element.height / 2})"`
      : '';

    if (element.type === 'rectangle') {
      return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="${roundness}" ry="${roundness}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} opacity="${opacity}"${transform} />`;
    }

    if (element.type === 'ellipse') {
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} opacity="${opacity}"${transform} />`;
    }

    if (element.type === 'diamond') {
      const x = element.x;
      const y = element.y;
      const w = element.width;
      const h = element.height;
      const points = [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ].map(([px, py]) => (element.angle ? rotatePoint(px, py, x + w / 2, y + h / 2, element.angle) : [px, py]))
        .map(([px, py]) => `${px},${py}`)
        .join(' ');

      return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} opacity="${opacity}" />`;
    }

    if (element.type === 'image') {
      const fileId = element.fileId;
      const imageData = fileId && filesMap[fileId];
      const href = imageData?.dataURL || '';
      const transformAttr = element.angle
        ? ` transform="rotate(${(element.angle * 180 / Math.PI).toFixed(3)} ${element.x + element.width / 2} ${element.y + element.height / 2})"`
        : '';
      if (!href) {
        return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="#f5f5f5" stroke="#999" stroke-width="${strokeWidth}" opacity="${opacity}"${transformAttr} />`;
      }

      return `<image href="${href}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"${transformAttr} />`;
    }

    // Fallback for unknown types
    return '';
  };

  normalizedElements.forEach(element => {
    if (element.type === 'line' || element.type === 'arrow') {
      svgParts.push(renderLinearElement(element));
    } else if (element.type === 'text') {
      svgParts.push(renderTextElement(element));
    } else {
      svgParts.push(renderShape(element));
    }
  });

  svgParts.push('</svg>');

  return {
    svg: svgParts.join(''),
    hasElements: true,
  };
}

// Helper function to recursively get all files
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'docs') {
        getAllFiles(filePath, fileList);
      }
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Get all markdown and excalidraw files
const allFiles = getAllFiles('.');
const isExcludedTopLevel = (filePath) => {
  const relativeDir = path.relative('.', path.dirname(filePath));
  const top = relativeDir.split(path.sep)[0];
  return relativeDir === '' || relativeDir === '.' || top === 'Books';
};

const markdownFiles = allFiles
  .filter(f =>
    f.endsWith('.md') &&
    !f.includes('node_modules') &&
    !f.includes('.github') &&
    f !== './README.md' &&
    !isExcludedTopLevel(f)
  )
  .sort();

const excalidrawFiles = allFiles
  .filter(f =>
    f.endsWith('.excalidraw') &&
    !f.includes('node_modules') &&
    !isExcludedTopLevel(f)
  )
  .sort();

// Organize files by folder
function getFilesByFolder() {
  const folders = {};
  
  markdownFiles.forEach(f => {
    const dir = path.dirname(f).replace(/^\.\//, '');
    if (!folders[dir]) folders[dir] = { markdown: [], excalidraw: [] };
    folders[dir].markdown.push(f);
  });
  
  excalidrawFiles.forEach(f => {
    const dir = path.dirname(f).replace(/^\.\//, '');
    if (!folders[dir]) folders[dir] = { markdown: [], excalidraw: [] };
    folders[dir].excalidraw.push(f);
  });
  
  return folders;
}

const filesByFolder = getFilesByFolder();

function buildFolderTree() {
  const root = { name: 'Root', children: new Map(), files: { markdown: [], excalidraw: [] } };

  Object.entries(filesByFolder).forEach(([folder, files]) => {
    const parts = folder.split('/').filter(Boolean);
    let node = root;
    parts.forEach(part => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), files: { markdown: [], excalidraw: [] } });
      }
      node = node.children.get(part);
    });
    node.files.markdown.push(...files.markdown);
    node.files.excalidraw.push(...files.excalidraw);
  });

  return root;
}

// Generate CSS
const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {
  --slate-900: #0f172a;
  --slate-800: #1e293b;
  --slate-700: #334155;
  --slate-600: #475569;
  --slate-200: #e2e8f0;
  --sand-100: #f8f4ee;
  --sand-200: #efe7db;
  --mint-600: #0f766e;
  --mint-500: #14b8a6;
  --amber-500: #f59e0b;
  --amber-200: #fde68a;
  --shadow-soft: 0 18px 45px rgba(15, 23, 42, 0.12);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
  line-height: 1.6;
  color: var(--slate-800);
  background: radial-gradient(circle at top left, #ffffff 0%, var(--sand-100) 35%, #f1f5f9 100%);
  display: flex;
  min-height: 100vh;
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 300px;
  height: 100vh;
  background: linear-gradient(160deg, #ffffff 0%, #f2f6f8 45%, #eef4f2 100%);
  border-right: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.nav-header {
  padding: 1.25rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: linear-gradient(120deg, rgba(20, 184, 166, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
}

.nav-brand {
  color: var(--slate-900);
  text-decoration: none;
  font-size: 1.15rem;
  font-weight: 700;
  font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
  letter-spacing: 0.2px;
  display: block;
}

.nav-header a:hover {
  color: var(--mint-600);
}

.nav-close {
  border: 1px solid rgba(15, 23, 42, 0.15);
  background: #fff;
  color: var(--slate-700);
  font-size: 0.85rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: none;
}

.nav-close:hover {
  border-color: var(--mint-500);
  color: var(--mint-600);
}

.nav-tools {
  padding: 0.75rem 1.25rem 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.nav-search {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  color: var(--slate-600);
}

.nav-search input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: #fff;
  padding: 0.6rem 0.8rem;
  font-size: 0.9rem;
  color: var(--slate-800);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.nav-search input:focus {
  outline: none;
  border-color: var(--mint-500);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
}

.nav-scroll {
  overflow-y: auto;
  padding-bottom: 2rem;
}

.nav-content {
  padding: 0.75rem 0;
}

.nav-folder {
  margin-bottom: 0.5rem;
}

.nav-folder summary {
  padding: 0.65rem 1.15rem;
  font-weight: 600;
  color: var(--mint-600);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.nav-folder summary::-webkit-details-marker {
  display: none;
}

.nav-folder summary::after {
  content: '+';
  font-size: 0.9rem;
  color: var(--slate-500);
  transition: transform 0.2s ease;
}

.nav-folder[open] summary::after {
  content: '-';
}

.nav-item {
  display: block;
  padding: 0.55rem 1.5rem;
  color: var(--slate-700);
  text-decoration: none;
  font-size: 0.92rem;
  border-left: 3px solid transparent;
  border-radius: 10px;
  margin: 0.1rem 0.9rem 0.1rem 0.75rem;
  transition: all 0.2s ease;
}

.nav-folder-body {
  padding-left: 0.5rem;
}

.nav-item:hover {
  background: rgba(20, 184, 166, 0.12);
  color: var(--slate-900);
  border-left-color: var(--mint-500);
}

.nav-item.is-active {
  background: rgba(245, 158, 11, 0.14);
  border-left-color: var(--amber-500);
  color: var(--slate-900);
  font-weight: 600;
}

.nav-folder.is-hidden,
.nav-item.is-hidden {
  display: none;
}

.main-content {
  margin-left: 300px;
  flex: 1;
  min-height: 100vh;
  background: white;
}

header {
  background: linear-gradient(125deg, #0f766e 0%, #14b8a6 45%, #f59e0b 120%);
  color: white;
  padding: 2rem 2.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  position: relative;
  overflow: hidden;
}

header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
  letter-spacing: 0.3px;
}

header p {
  font-size: 1rem;
  opacity: 0.95;
}

.container {
  max-width: 900px;
  padding: 2rem;
}

.nav-toggle {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  display: none;
  backdrop-filter: blur(6px);
}

.nav-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
}

.nav-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 90;
}

body.nav-open .nav-overlay {
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 960px) {
  body {
    flex-direction: column;
  }

  .sidebar {
    width: min(90vw, 360px);
    transform: translateX(-105%);
    transition: transform 0.25s ease;
  }

  body.nav-open .sidebar {
    transform: translateX(0);
  }

  .nav-close {
    display: inline-flex;
  }

  .nav-toggle {
    display: inline-flex;
  }

  .main-content {
    margin-left: 0;
  }
}

h1, h2, h3, h4 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: #333;
}

h1 { font-size: 2rem; border-bottom: 2px solid #667eea; padding-bottom: 0.5rem; }
h2 { font-size: 1.5rem; color: #667eea; }
h3 { font-size: 1.2rem; }

p {
  margin-bottom: 1rem;
  line-height: 1.8;
  color: #555;
}

a {
  color: #667eea;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

code {
  background: #f5f5f5;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

pre {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 1rem;
  border-radius: 5px;
  overflow-x: auto;
  margin: 1rem 0;
}

pre code {
  background: none;
  color: inherit;
  padding: 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  border: 1px solid #ddd;
}

table th, table td {
  border: 1px solid #ddd;
  padding: 0.75rem;
  text-align: left;
}

table th {
  background: #f5f5f5;
  font-weight: 600;
  color: #333;
}

table tr:nth-child(even) {
  background: #fafafa;
}

ul {
  margin-left: 2rem;
  margin-bottom: 1rem;
}

li {
  margin-bottom: 0.5rem;
}

ol {
  margin-left: 2rem;
  margin-bottom: 1rem;
}

blockquote {
  border-left: 4px solid #667eea;
  padding-left: 1rem;
  margin: 1rem 0;
  color: #444;
  background: #f7f7ff;
}

hr {
  border: 0;
  border-top: 1px solid #e0e0e0;
  margin: 2rem 0;
}

.content-page {
  background: white;
}

.diagram-container {
  background: #f9f9f9;
  padding: 2rem;
  border-radius: 8px;
  margin: 1rem 0;
  border: 1px solid #e0e0e0;
}

.diagram-preview {
  background: white;
  padding: 1.5rem;
  border-radius: 6px;
  margin-bottom: 2rem;
  text-align: center;
  border: 1px solid #e0e0e0;
  overflow-x: auto;
}

.diagram-preview svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.diagram-preview img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.diagram-json {
  background: white;
  padding: 1rem;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: #666;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid #ddd;
}

.diagram-info {
  background: #e3f2fd;
  padding: 1rem;
  border-left: 4px solid #667eea;
  margin-bottom: 1.5rem;
  border-radius: 4px;
}

details {
  margin: 1rem 0;
}

summary {
  cursor: pointer;
  padding: 0.75rem;
  background: #f5f5f5;
  border-radius: 4px;
  font-weight: 600;
  color: #667eea;
  user-select: none;
}

summary:hover {
  background: #efefef;
}

footer {
  background: #333;
  color: white;
  text-align: center;
  padding: 2rem;
  margin-top: 3rem;
}

@media (max-width: 768px) {
  body {
    flex-direction: column;
  }

  .sidebar {
    position: relative;
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid #e0e0e0;
  }

  .nav-content {
    display: flex;
    flex-wrap: wrap;
  }

  .nav-folder {
    flex: 1 1 200px;
    margin-right: 1rem;
  }

  .main-content {
    margin-left: 0;
  }

  header h1 {
    font-size: 1.5rem;
  }

  .container {
    padding: 1rem;
  }
}
`;

// Generate navigation HTML
function generateNav() {
  const tree = buildFolderTree();

  function renderFolder(node, depth = 0) {
    let html = '';
    const childNames = Array.from(node.children.keys()).sort((a, b) => {
      if (depth === 0) {
        if (a === 'Notes' && b !== 'Notes') return -1;
        if (b === 'Notes' && a !== 'Notes') return 1;
      }
      return a.localeCompare(b);
    });

    childNames.forEach(name => {
      const child = node.children.get(name);
      const hasContent = child.files.markdown.length + child.files.excalidraw.length + child.children.size > 0;
      if (!hasContent) return;

      const indentPx = depth * 12;
      html += '<details class="nav-folder" data-depth="' + depth + '" style="margin-left:' + indentPx + 'px">';
      html += '<summary class="nav-folder-title">' + escapeHtml(name) + '</summary>';
      html += '<div class="nav-folder-body">';

      // Sort markdown files by name
      const sortedMarkdown = child.files.markdown.slice().sort((a, b) => 
        path.basename(a, '.md').localeCompare(path.basename(b, '.md'))
      );
      
      sortedMarkdown.forEach(f => {
        const itemName = path.basename(f, '.md');
        const htmlFile = toHtmlFileName(f, '.md');
        const itemIndent = indentPx + 12;
        html += '<a href="' + safeHref(htmlFile) + '" class="nav-item" style="padding-left:' + (16 + itemIndent / 8) + 'px">📄 ' + escapeHtml(itemName) + '</a>';
      });

      // Sort excalidraw files by name
      const sortedExcalidraw = child.files.excalidraw.slice().sort((a, b) => 
        path.basename(a, '.excalidraw').localeCompare(path.basename(b, '.excalidraw'))
      );
      
      sortedExcalidraw.forEach(f => {
        const itemName = path.basename(f, '.excalidraw');
        const htmlFile = toHtmlFileName(f, '.excalidraw');
        const itemIndent = indentPx + 12;
        html += '<a href="' + safeHref(htmlFile) + '" class="nav-item" style="padding-left:' + (16 + itemIndent / 8) + 'px">📊 ' + escapeHtml(itemName) + '</a>';
      });

      html += renderFolder(child, depth + 1);
      html += '</div></details>';
    });

    return html;
  }

  let nav = '<nav class="sidebar" aria-label="Sidebar navigation">';
  nav += '<div class="nav-header"><a class="nav-brand" href="' + safeHref('index.html') + '">🏠 System Design</a><button class="nav-close" type="button" aria-label="Close navigation">Close</button></div>';
  nav += '<div class="nav-tools"><label class="nav-search">Browse<input id="nav-search" type="search" placeholder="Search topics" aria-label="Search navigation" autocomplete="off"></label></div>';
  nav += '<div class="nav-scroll"><div class="nav-content">';
  nav += renderFolder(tree, 0);
  nav += '</div></div></nav>';
  return nav;
}

// Generate base page template
function generatePageTemplate(title, content) {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} - System Design Ultimatum</title>
    <style>
${globalStyles}
    </style>
</head>
<body>
${generateNav()}
    <div class="nav-overlay" data-nav-overlay></div>
    <div class="main-content">
        <header>
            <button class="nav-toggle" type="button" aria-label="Open navigation">Menu</button>
            <h1>${safeTitle}</h1>
        </header>
        <div class="container content-page">
${content}
        </div>
        <footer>
            <p>System Design Ultimatum</p>
            <p style="font-size: 0.9rem; margin-top: 1rem; opacity: 0.8;">Last updated: ${new Date().toLocaleDateString()}</p>
        </footer>
    </div>
    <script>
      (() => {
        const navSearch = document.querySelector('#nav-search');
        const navItems = Array.from(document.querySelectorAll('.nav-item'));
        const folders = Array.from(document.querySelectorAll('.nav-folder'));
        const navToggle = document.querySelector('.nav-toggle');
        const navClose = document.querySelector('.nav-close');
        const overlay = document.querySelector('.nav-overlay');

        const setNavOpen = (open) => {
          document.body.classList.toggle('nav-open', open);
        };

        const currentPage = window.location.pathname.split('/').pop();
        navItems.forEach((item) => {
          if (item.getAttribute('href') === currentPage) {
            item.classList.add('is-active');
            let parent = item.closest('.nav-folder');
            while (parent) {
              parent.open = true;
              parent = parent.parentElement.closest('.nav-folder');
            }
          }
        });

        folders.forEach((folder) => {
          if (folder.hasAttribute('open')) {
            folder.dataset.initialOpen = 'true';
          }
        });

        if (navSearch) {
          navSearch.addEventListener('input', (event) => {
            const query = event.target.value.trim().toLowerCase();
            if (!query) {
              navItems.forEach((item) => item.classList.remove('is-hidden'));
              folders.forEach((folder) => {
                folder.classList.remove('is-hidden');
                folder.open = folder.dataset.initialOpen === 'true';
              });
              return;
            }

            navItems.forEach((item) => {
              const match = item.textContent.toLowerCase().includes(query);
              item.classList.toggle('is-hidden', !match);
            });

            folders.forEach((folder) => {
              const hasMatch = folder.querySelector('.nav-item:not(.is-hidden)');
              folder.classList.toggle('is-hidden', !hasMatch);
              if (hasMatch) {
                folder.open = true;
              }
            });
          });
        }

        if (navToggle) {
          navToggle.addEventListener('click', () => setNavOpen(true));
        }
        if (navClose) {
          navClose.addEventListener('click', () => setNavOpen(false));
        }
        if (overlay) {
          overlay.addEventListener('click', () => setNavOpen(false));
        }
      })();
    </script>
</body>
</html>`;
}

// Generate markdown files
markdownFiles.forEach(filePath => {
  const filename = path.basename(filePath, '.md');
  const directory = path.dirname(filePath).replace(/^\.\//, '');
  const htmlFileName = toHtmlFileName(filePath, '.md');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const htmlContent = markdownToHtml(content);
    const fullHtml = generatePageTemplate(filename, htmlContent);
    
    fs.writeFileSync(path.join(docsDir, htmlFileName), fullHtml);
    console.log('✓ Generated: ' + htmlFileName);
  } catch (err) {
    console.log('✗ Error generating ' + filePath + ': ' + err.message);
  }
});

// Generate excalidraw files
excalidrawFiles.forEach(filePath => {
  const filename = path.basename(filePath, '.excalidraw');
  const htmlFileName = toHtmlFileName(filePath, '.excalidraw');
  const svgFileName = htmlFileName.replace('.html', '.svg');
  const safeFileName = escapeHtml(filename);
  const safeSvgHref = safeHref(svgFileName);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Generate SVG preview + standalone file
    const svgResult = generateExcalidrawSvgPreview(data, filename);
    if (svgResult.hasElements) {
      fs.writeFileSync(path.join(docsDir, svgFileName), svgResult.svg);
    }
    
    let diagramInfo = '<div class="diagram-container">';
    
    // Add info box
    diagramInfo += '<div class="diagram-info">';
    diagramInfo += '<strong>📊 Diagram:</strong> ' + safeFileName + '<br/>';
    diagramInfo += '<strong>Elements:</strong> ' + (data.elements ? data.elements.length : 0) + '<br/>';
    diagramInfo += '<strong>Action:</strong> <a href="https://excalidraw.com" target="_blank">Open in Excalidraw Editor →</a>';
    diagramInfo += '</div>';
    
    // Add SVG preview
    diagramInfo += '<h3>Visual Preview</h3>';
    if (svgResult.hasElements) {
      diagramInfo += '<div class="diagram-preview"><img src="' + safeSvgHref + '" alt="' + safeFileName + ' diagram" loading="lazy"/></div>';
      diagramInfo += '<p style="margin: 0 0 1.5rem;"><a href="' + safeSvgHref + '" download>⬇️ Download SVG</a></p>';
    } else {
      diagramInfo += '<div class="diagram-preview">' + svgResult.svg + '</div>';
    }
    
    // Add JSON data below
    diagramInfo += '<h3>Diagram Data</h3>';
    diagramInfo += '<details><summary>📄 Show JSON Data</summary>';
    diagramInfo += '<div class="diagram-json">' + JSON.stringify(data, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    diagramInfo += '</details>';
    
    diagramInfo += '</div>';
    
    const fullHtml = generatePageTemplate(filename, diagramInfo);
    
    fs.writeFileSync(path.join(docsDir, htmlFileName), fullHtml);
    console.log('✓ Generated: ' + htmlFileName);
  } catch (err) {
    console.log('✗ Error generating ' + filePath + ': ' + err.message);
  }
});

// Generate index page
const indexContent = `
<h2>Welcome to System Design Ultimatum</h2>
<p>A comprehensive collection of system design diagrams, notes, and best practices.</p>

<div style="margin-top: 2rem; padding: 1.5rem; background: #f0f4ff; border-radius: 8px; border-left: 4px solid #667eea;">
  <h3 style="margin-top: 0;">📚 Getting Started</h3>
  <ul>
    <li>Browse the navigation menu on the left to explore study notes and diagrams</li>
    <li>Click on any file to view its content directly</li>
    <li>Markdown files are rendered as readable HTML pages</li>
    <li>Excalidraw diagrams are displayed as visual previews with structured data</li>
  </ul>
</div>

<div style="margin-top: 2rem; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
  <h3>📊 Content Overview</h3>
  <p><strong>Study Notes:</strong> ${markdownFiles.length} files</p>
  <p><strong>Diagrams:</strong> ${excalidrawFiles.length} files</p>
  <p><strong>Folders:</strong> ${Object.keys(filesByFolder).length}</p>
</div>

<div style="margin-top: 2rem; padding: 1.5rem; background: #f9f9f9; border-radius: 8px;">
  <h3>🔍 Quick Links by Category</h3>
  ${Object.keys(filesByFolder).sort((a, b) => a.localeCompare(b)).map(folder => {
    const { markdown, excalidraw } = filesByFolder[folder];
    const folderName = folder || 'Root';
    let html = '<div style="margin-bottom: 1.5rem;"><strong>' + escapeHtml(folderName) + '</strong><br/>';
    
    // Sort markdown files
    const sortedMarkdown = markdown.slice().sort((a, b) => 
      path.basename(a, '.md').localeCompare(path.basename(b, '.md'))
    );
    sortedMarkdown.forEach(f => {
      const name = path.basename(f, '.md');
      const htmlFile = toHtmlFileName(f, '.md');
      html += '<a href="' + safeHref(htmlFile) + '">📄 ' + escapeHtml(name) + '</a><br/>';
    });
    
    // Sort excalidraw files
    const sortedExcalidraw = excalidraw.slice().sort((a, b) => 
      path.basename(a, '.excalidraw').localeCompare(path.basename(b, '.excalidraw'))
    );
    sortedExcalidraw.forEach(f => {
      const name = path.basename(f, '.excalidraw');
      const htmlFile = toHtmlFileName(f, '.excalidraw');
      html += '<a href="' + safeHref(htmlFile) + '">📊 ' + escapeHtml(name) + '</a><br/>';
    });
    
    html += '</div>';
    return html;
  }).join('')}
</div>

<div style="margin-top: 2rem; padding: 1.5rem; background: #fff9e6; border-radius: 8px; border-left: 4px solid #ffc107;">
  <h3 style="margin-top: 0;">💡 Tips</h3>
  <ul>
    <li>Use the search function (Ctrl/Cmd+F) to find topics across all pages</li>
    <li>Diagrams show visual preview with expandable JSON data</li>
    <li>Click "Open in Excalidraw Editor" to edit diagrams interactively</li>
    <li>All content is automatically organized by folder</li>
    <li>Pages update automatically when changes are pushed to the repository</li>
  </ul>
</div>
`;

const indexHtml = generatePageTemplate('System Design Ultimatum', indexContent);
fs.writeFileSync(path.join(docsDir, 'index.html'), indexHtml);
console.log('✓ Generated: index.html');

// Create .nojekyll
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

console.log('\n✅ Site generated successfully!');
console.log('📁 Output: ./docs/');
console.log('📊 Total files: ' + (markdownFiles.length + excalidrawFiles.length + 1));
