#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create docs directory
const docsDir = './docs';
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Helper function to recursively get all files
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip hidden directories and node_modules
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
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

// Read main README
const mainReadme = fs.readFileSync('./README.md', 'utf8');

// Generate HTML
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Design Ultimatum</title>
    <style>
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
        }

        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 3rem 1rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        header p {
            font-size: 1.1rem;
            opacity: 0.95;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        .info-box {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .info-box h2 {
            color: #667eea;
            margin-bottom: 1rem;
            font-size: 1.5rem;
        }

        .info-box p {
            margin-bottom: 0.5rem;
            color: #555;
        }

        .info-box a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
        }

        .info-box a:hover {
            text-decoration: underline;
        }

        .info-box ul {
            margin-left: 2rem;
            margin-top: 1rem;
        }

        .info-box li {
            margin-bottom: 0.5rem;
            color: #555;
        }

        .section {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .section h2 {
            color: #667eea;
            margin-bottom: 1.5rem;
            font-size: 1.8rem;
            border-bottom: 3px solid #667eea;
            padding-bottom: 0.5rem;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
        }

        .card {
            background: #f9f9f9;
            border-left: 4px solid #667eea;
            padding: 1.5rem;
            border-radius: 4px;
            transition: all 0.3s ease;
        }

        .card:hover {
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
            transform: translateY(-2px);
        }

        .card a {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .card a:hover {
            text-decoration: underline;
        }

        .card-title {
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #333;
        }

        .card-meta {
            font-size: 0.85rem;
            color: #999;
            margin-top: 1rem;
        }

        footer {
            background: #333;
            color: white;
            text-align: center;
            padding: 2rem;
            margin-top: 3rem;
        }

        footer a {
            color: #667eea;
            text-decoration: none;
        }

        footer a:hover {
            text-decoration: underline;
        }

        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #667eea;
            color: white;
            border-radius: 20px;
            font-size: 0.85rem;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
        }

        .emoji {
            font-size: 1.2em;
            margin-right: 0.5rem;
        }

        @media (max-width: 768px) {
            header h1 {
                font-size: 2rem;
            }

            .container {
                padding: 1rem;
            }

            .grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>📚 System Design Ultimatum</h1>
        <p>A curated collection of system design diagrams and patterns</p>
    </header>

    <div class="container">
        <div class="info-box">
            <h2>🎯 Welcome</h2>
            <p>
                This is an ultimate resource for system design interviews and learning.
                It contains a comprehensive collection of system-design diagrams in Excalidraw format,
                along with detailed notes on patterns, architectures, and best practices.
            </p>
            <p style="margin-top: 1rem;">
                <strong>📖 Source:</strong> <a href="https://github.com/Prakash-sa/system-design-ultimatum" target="_blank">GitHub Repository</a>
            </p>
            <p style="margin-top: 0.5rem;">
                <strong>🔧 Tools:</strong> Install the Excalidraw extension in VS Code to open and edit .excalidraw files directly.
            </p>
        </div>

        <div class="section">
            <h2><span class="emoji">📖</span>Study Notes & References</h2>
            <div class="grid">
${markdownFiles.map(file => {
  const relativePath = file.replace(/^\.\//, '');
  const filename = path.basename(file);
  const displayName = filename.replace('.md', '').replace(/-/g, ' ');
  const folder = path.dirname(relativePath);
  
  return `                <div class="card">
                    <div class="card-title">${displayName}</div>
                    <div class="card-meta">
                        📁 ${folder}
                    </div>
                    <a href="https://github.com/Prakash-sa/system-design-ultimatum/blob/main/${relativePath}" target="_blank">
                        View on GitHub →
                    </a>
                </div>`;
}).join('\n')}
            </div>
        </div>

        <div class="section">
            <h2><span class="emoji">📊</span>System Design Diagrams</h2>
            <div class="grid">
${excalidrawFiles.map(file => {
  const relativePath = file.replace(/^\.\//, '');
  const filename = path.basename(file, '.excalidraw');
  const folder = path.dirname(relativePath);
  const emoji = getEmojiForFolder(folder);
  
  return `                <div class="card">
                    <div class="card-title">${emoji} ${filename}</div>
                    <div class="card-meta">
                        📁 ${folder}
                    </div>
                    <a href="https://github.com/Prakash-sa/system-design-ultimatum/blob/main/${relativePath}" target="_blank">
                        Open in GitHub →
                    </a>
                </div>`;
}).join('\n')}
            </div>
        </div>

        <div class="info-box">
            <h2>🚀 Getting Started</h2>
            <ul>
                <li><strong>Quick References:</strong> Check the study notes for foundational concepts</li>
                <li><strong>System Designs:</strong> Browse the diagrams organized by category</li>
                <li><strong>Interview Prep:</strong> Study the Q&A sections in each document</li>
                <li><strong>Local Setup:</strong> Clone the repo and open files in Excalidraw</li>
            </ul>
        </div>

        <div class="info-box">
            <h2>📚 Resources</h2>
            <ul>
                <li><a href="https://www.youtube.com/@jordanhasnolife5163" target="_blank">Jordan Has No Life's YouTube channel</a></li>
                <li>Alex Xu's System Design Interview book</li>
                <li><a href="https://www.youtube.com/@SDFC" target="_blank">System Design Fight Club</a></li>
                <li><a href="https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction" target="_blank">Hello Interview notes</a></li>
                <li><a href="https://www.youtube.com/@ByteMonk" target="_blank">ByteMonk</a></li>
            </ul>
        </div>
    </div>

    <footer>
        <p>System Design Ultimatum | <a href="https://github.com/Prakash-sa/system-design-ultimatum" target="_blank">GitHub</a></p>
        <p style="font-size: 0.9rem; margin-top: 1rem; opacity: 0.8;">Last updated: ${new Date().toLocaleDateString()}</p>
    </footer>
</body>
</html>`;

function getEmojiForFolder(folder) {
  const emojiMap = {
    '1. Foundational(Introductory) Design': '🧩',
    '2. Content Delivery & Media Systems': '🌐',
    '3. Social & Communication Systems': '💬',
    '4. Search, Discovery & Recommendation': '🕸️',
    '5. Storage, Data, and Compute Infrastructure': '☁️',
    '6. Scalability & Reliability Systems': '⚙️',
    '7. Analytics, Streaming, and Data Pipelines': '🧠',
    '8. Security, Identity, and Access Systems': '🔒',
    '9. DevOps-Cloud-SaaS Infrastructure': '🧰',
    '10. Hybrid or AI-Augmented Systems': '🧮',
    '11. Deployment Strategies': '☁️',
    '12. AI Design Patterns': '🤖',
    'Notes': '📝'
  };
  
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (folder.includes(key)) {
      return emoji;
    }
  }
  return '📄';
}

// Write index.html
fs.writeFileSync(path.join(docsDir, 'index.html'), htmlContent);

// Copy CSS and assets if needed
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

console.log('✅ Site generated successfully!');
console.log('📁 Output: ./docs/index.html');
console.log('📊 Files indexed: ' + markdownFiles.length + ' markdown files, ' + excalidrawFiles.length + ' diagrams');
