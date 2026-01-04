#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create docs directory
const docsDir = './docs';
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Simple markdown to HTML converter
function markdownToHtml(markdown) {
  let html = markdown;
  
  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Code blocks (before other replacements)
  const codeBlocks = [];
  html = html.replace(/```[\s\S]*?```/gm, (match) => {
    codeBlocks.push(match);
    return '___CODE_BLOCK_' + (codeBlocks.length - 1) + '___';
  });
  
  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Tables
  html = html.replace(/\|[\s\S]*?\n\|[\s\S]*?\n/gm, (match) => {
    const rows = match.split('\n').filter(r => r.trim());
    let table = '<table><tbody>';
    rows.forEach((row, idx) => {
      const cells = row.split('|').filter(c => c.trim());
      const tag = idx === 1 || row.includes('---') ? 'th' : 'td';
      table += '<tr>';
      cells.forEach(cell => {
        table += '<' + tag + '>' + cell.trim() + '</' + tag + '>';
      });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Unordered lists
  html = html.replace(/^\s*[\*\-] (.*?)$/gm, '<li>$1</li>');
  
  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    const lang = block.match(/```(\w+)/)?.[1] || '';
    const code = block.replace(/```\w*\n?/, '').replace(/```/, '');
    const replacement = '<pre><code class="language-' + lang + '">' + code + '</code></pre>';
    html = html.replace('___CODE_BLOCK_' + idx + '___', replacement);
  });
  
  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/^(?!<[h|p|t|u|l|b|c])/gm, '<p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>(<h|<t|<u|<b|<c|<pre)/g, '$1');
  html = html.replace(/(<\/h|<\/t|<\/u|<\/b|<\/c|<\/pre>)<\/p>/g, '$1');
  
  return html;
}

// Generate better SVG preview from Excalidraw JSON
function generateExcalidrawSvgPreview(data) {
  if (!data.elements || data.elements.length === 0) {
    return '<p style="color: #999; text-align: center;">No elements in diagram</p>';
  }

  // Filter out non-drawable elements and calculate bounds
  const drawableElements = data.elements.filter(el => el.type && el.x !== undefined && el.y !== undefined);
  
  if (drawableElements.length === 0) {
    return '<p style="color: #999; text-align: center;">No drawable elements</p>';
  }

  // Calculate bounds more carefully
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  drawableElements.forEach(element => {
    const x = element.x || 0;
    const y = element.y || 0;
    const w = element.width || 100;
    const h = element.height || 100;
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  // Add reasonable padding
  const padding = 40;
  minX = Math.max(-10000, minX - padding);
  minY = Math.max(-10000, minY - padding);
  maxX = Math.min(10000, maxX + padding);
  maxY = Math.min(10000, maxY + padding);

  const width = Math.min(maxX - minX, 2000) || 800;
  const height = Math.min(maxY - minY, 1500) || 600;
  const scale = Math.min(1, Math.min(2000 / (maxX - minX), 1500 / (maxY - minY)));

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(width) + '" height="' + Math.round(height) + '" viewBox="' + Math.round(minX) + ' ' + Math.round(minY) + ' ' + Math.round(width / scale) + ' ' + Math.round(height / scale) + '" style="border: 1px solid #ddd; border-radius: 4px; background: white; display: block; margin: 0 auto;">';
  
  // Define arrowhead marker
  svg += '<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#666" /></marker></defs>';

  // Draw elements
  drawableElements.forEach(element => {
    try {
      const x = element.x || 0;
      const y = element.y || 0;
      const w = element.width || 100;
      const h = element.height || 100;
      const fill = element.backgroundColor || '#ffffff';
      const stroke = element.strokeColor || '#000000';
      const strokeWidth = element.strokeWidth === 'bold' ? 2 : element.strokeWidth === 'extra-bold' ? 3 : 1;

      if (element.type === 'rectangle') {
        const radius = element.roundness ? 8 : 0;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" rx="' + radius + '"/>';
      } 
      else if (element.type === 'diamond') {
        const cx = x + w / 2;
        const cy = y + h / 2;
        svg += '<path d="M ' + cx + ' ' + y + ' L ' + (x + w) + ' ' + cy + ' L ' + cx + ' ' + (y + h) + ' L ' + x + ' ' + cy + ' Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>';
      } 
      else if (element.type === 'ellipse') {
        svg += '<ellipse cx="' + (x + w / 2) + '" cy="' + (y + h / 2) + '" rx="' + (w / 2) + '" ry="' + (h / 2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>';
      } 
      else if (element.type === 'line' || element.type === 'arrow') {
        const endX = x + w;
        const endY = y + h;
        svg += '<line x1="' + x + '" y1="' + y + '" x2="' + endX + '" y2="' + endY + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" marker-end="' + (element.type === 'arrow' ? 'url(#arrowhead)' : '') + '"/>';
      }
      else if (element.type === 'text') {
        const fontSize = Math.min(element.fontSize || 16, 24);
        const textContent = (element.text || '').substring(0, 50);
        svg += '<text x="' + (x + 5) + '" y="' + (y + fontSize + 2) + '" font-size="' + fontSize + '" fill="' + stroke + '" font-family="Arial, sans-serif">' + textContent + '</text>';
      }
    } catch (e) {
      // Skip problematic elements
    }
  });

  svg += '</svg>';
  return svg;
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
const markdownFiles = allFiles.filter(f => 
  f.endsWith('.md') && 
  !f.includes('node_modules') && 
  !f.includes('.github') &&
  f !== './README.md'
).sort();

const excalidrawFiles = allFiles.filter(f => 
  f.endsWith('.excalidraw') && 
  !f.includes('node_modules')
).sort();

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

// Generate CSS
const globalStyles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
  display: flex;
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 280px;
  height: 100vh;
  background: white;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  z-index: 100;
}

.nav-header {
  padding: 1.5rem 1rem;
  border-bottom: 2px solid #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.nav-header a {
  color: white;
  text-decoration: none;
  font-size: 1.2rem;
  font-weight: 600;
  display: block;
}

.nav-header a:hover {
  opacity: 0.9;
}

.nav-content {
  padding: 1rem 0;
}

.nav-folder {
  margin-bottom: 0.5rem;
}

.nav-folder-title {
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: #667eea;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-item {
  display: block;
  padding: 0.5rem 1.5rem;
  color: #555;
  text-decoration: none;
  font-size: 0.95rem;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.nav-item:hover {
  background: #f5f5f5;
  color: #667eea;
  border-left-color: #667eea;
}

.main-content {
  margin-left: 280px;
  flex: 1;
  min-height: 100vh;
  background: white;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

header p {
  font-size: 1rem;
  opacity: 0.95;
}

.container {
  max-width: 900px;
  padding: 2rem;
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
  const folders = Object.keys(filesByFolder).sort();
  let nav = '<nav class="sidebar"><div class="nav-header"><a href="index.html">🏠 Home</a></div><div class="nav-content">';
  
  folders.forEach(folder => {
    const folderName = folder || 'Root';
    nav += '<div class="nav-folder"><div class="nav-folder-title">' + folderName + '</div>';
    
    const { markdown, excalidraw } = filesByFolder[folder];
    
    markdown.forEach(f => {
      const name = path.basename(f, '.md');
      const htmlFile = f.replace(/^\.\//, '').replace(/\//g, '_').replace('.md', '.html');
      nav += '<a href="' + htmlFile + '" class="nav-item">📄 ' + name + '</a>';
    });
    
    excalidraw.forEach(f => {
      const name = path.basename(f, '.excalidraw');
      const htmlFile = f.replace(/^\.\//, '').replace(/\//g, '_').replace('.excalidraw', '.html');
      nav += '<a href="' + htmlFile + '" class="nav-item">📊 ' + name + '</a>';
    });
    
    nav += '</div>';
  });
  
  nav += '</div></nav>';
  return nav;
}

// Generate base page template
function generatePageTemplate(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - System Design Ultimatum</title>
    <style>
${globalStyles}
    </style>
</head>
<body>
${generateNav()}
    <div class="main-content">
        <header>
            <h1>${title}</h1>
        </header>
        <div class="container content-page">
${content}
        </div>
        <footer>
            <p>System Design Ultimatum</p>
            <p style="font-size: 0.9rem; margin-top: 1rem; opacity: 0.8;">Last updated: ${new Date().toLocaleDateString()}</p>
        </footer>
    </div>
</body>
</html>`;
}

// Generate markdown files
markdownFiles.forEach(filePath => {
  const filename = path.basename(filePath, '.md');
  const directory = path.dirname(filePath).replace(/^\.\//, '');
  const htmlFileName = filePath.replace(/^\.\//, '').replace(/\//g, '_').replace('.md', '.html');
  
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
  const htmlFileName = filePath.replace(/^\.\//, '').replace(/\//g, '_').replace('.excalidraw', '.html');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Generate SVG preview
    const svgPreview = generateExcalidrawSvgPreview(data);
    
    let diagramInfo = '<div class="diagram-container">';
    
    // Add info box
    diagramInfo += '<div class="diagram-info">';
    diagramInfo += '<strong>📊 Diagram:</strong> ' + filename + '<br/>';
    diagramInfo += '<strong>Elements:</strong> ' + (data.elements ? data.elements.length : 0) + '<br/>';
    diagramInfo += '<strong>Action:</strong> <a href="https://excalidraw.com" target="_blank">Open in Excalidraw Editor →</a>';
    diagramInfo += '</div>';
    
    // Add SVG preview
    diagramInfo += '<h3>Visual Preview</h3>';
    diagramInfo += '<div class="diagram-preview">' + svgPreview + '</div>';
    
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
  ${Object.keys(filesByFolder).sort().map(folder => {
    const { markdown, excalidraw } = filesByFolder[folder];
    const folderName = folder || 'Root';
    let html = '<div style="margin-bottom: 1.5rem;"><strong>' + folderName + '</strong><br/>';
    
    markdown.forEach(f => {
      const name = path.basename(f, '.md');
      const htmlFile = f.replace(/^\.\//, '').replace(/\//g, '_').replace('.md', '.html');
      html += '<a href="' + htmlFile + '">📄 ' + name + '</a><br/>';
    });
    
    excalidraw.forEach(f => {
      const name = path.basename(f, '.excalidraw');
      const htmlFile = f.replace(/^\.\//, '').replace(/\//g, '_').replace('.excalidraw', '.html');
      html += '<a href="' + htmlFile + '">📊 ' + name + '</a><br/>';
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
