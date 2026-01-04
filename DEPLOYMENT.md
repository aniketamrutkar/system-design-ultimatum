# GitHub Pages Deployment Guide

This repository is configured to automatically deploy to GitHub Pages whenever you push changes to the `main` branch.

## ✅ What's Configured

1. **Automated Build & Deploy Workflow** (`.github/workflows/deploy-to-pages.yml`)
   - Triggers on every push to `main` branch
   - Builds the static site using `build-site.js`
   - Automatically deploys to GitHub Pages

2. **Build Script** (`build-site.js`)
   - Generates individual HTML pages for each markdown file and diagram
   - Creates a navigation sidebar with all files organized by folder
   - Renders markdown as readable HTML (no GitHub redirect)
   - Displays Excalidraw diagrams with SVG previews + downloadable SVGs, plus JSON viewers
   - Creates a fully-functional website accessible entirely on GitHub Pages

## 📑 Site Features

### Navigation Sidebar
- Fixed sidebar with organized folder structure
- Quick access to all markdown files and diagrams
- Responsive design - sidebar adapts on mobile
- Home button to return to main page

### Markdown Files
- All `.md` files converted to readable HTML pages
- Preserves formatting: headings, bold, italic, links, code blocks, tables
- Syntax highlighting for code blocks
- No redirect to GitHub - everything renders on the site

### Excalidraw Diagrams
- Each diagram gets its own page
- Shows diagram metadata and structure
- Inline SVG preview plus downloadable SVG export
- JSON preview of diagram data
- Link to Excalidraw editor for interactive viewing/editing
- Direct preview without leaving the site

### Search & Navigation
- Use browser search (Ctrl+F / Cmd+F) to find topics
- Folder-based organization in sidebar
- Breadcrumb-style navigation via sidebar
- Consistent header on all pages

## 🚀 How to Use

### Initial Setup (One-time)

1. **Enable GitHub Pages** for your repository:
   - Go to Repository Settings → Pages
   - Under "Build and deployment", select:
     - Source: `GitHub Actions`
   - Save

2. **No other setup needed!** The workflow is ready to go.

### Workflow

Just commit and push your changes to `main`:

```bash
git add .
git commit -m "your message"
git push origin main
```

The GitHub Actions workflow will automatically:
1. ✅ Build the static site
2. ✅ Generate `docs/index.html` with all files
3. ✅ Deploy to GitHub Pages

### View Your Site

Once deployed, visit: `https://Prakash-sa.github.io/system-design-ultimatum/`

The site updates automatically with every push!

## 📋 How It Works

### GitHub Actions Workflow

The workflow (`.github/workflows/deploy-to-pages.yml`):
- Runs on every push to `main`
- Installs Node.js
- Runs `build-site.js` to generate the site
- Uploads the `docs/` folder as a GitHub Pages artifact
- Deploys the artifact to GitHub Pages

### Build Script

The build script (`build-site.js`):
- Scans all `.md` files and renders them to HTML
- Scans all `.excalidraw` files in the repository
- Generates a beautiful HTML index with:
  - All study notes linked
  - All diagrams organized by category
  - Direct links to GitHub for viewing/editing
  - Responsive design that works on mobile
  - Downloadable SVGs per diagram

## 🎨 Customization

### Change the Site Design

Edit `build-site.js` and modify the HTML template in the `htmlContent` variable.

### Add Custom Styling

Update the `<style>` section in `build-site.js` to customize colors, fonts, etc.

### Add New Sections

In `build-site.js`, you can add new sections to the generated HTML by modifying the template.

## 🔍 Troubleshooting

### Site Not Updating?

1. Check GitHub Actions:
   - Go to Repository → Actions tab
   - Look for "Deploy to GitHub Pages" workflow
   - Click on the latest run to see logs
   - Check if it shows ✅ or ❌

2. Check GitHub Pages Settings:
   - Go to Settings → Pages
   - Verify source is set to "GitHub Actions"
   - Check that deployment shows "Active"

3. Clear Browser Cache:
   - Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Or clear browser cache manually

### Workflow Failed?

Check the Actions tab for error messages. Common issues:
- Missing Node.js modules (should auto-install)
- File encoding issues (ensure all files are UTF-8)
- GitHub Pages permissions (check repository settings)

## 📊 What Gets Deployed?

✅ All markdown files (`.md`) - converted to readable HTML pages
✅ All Excalidraw diagrams - displayed with SVG previews and metadata
✅ Navigation sidebar with folder organization
✅ Auto-generated `index.html` and individual pages for each file
✅ Responsive design for desktop and mobile
✅ No external redirects or GitHub dependencies

❌ Node modules
❌ Build artifacts
❌ Raw source files (only processed HTML deployed)

## 🔗 Site Structure

The generated website is completely self-contained:
- **index.html** - Home page with overview and quick links
- **Individual HTML files** - One for each markdown and diagram file
- **Navigation sidebar** - Organized by folder with quick access to all content
- **No external dependencies** - Everything renders from the generated HTML

## 📝 Adding New Files

Simply add new files to your repository and push:
- New markdown files in `Notes/` → automatically indexed
- New excalidraw diagrams → automatically indexed
- Workflow rebuilds and deploys automatically

## 🛠️ Manual Deploy (if needed)

To manually rebuild without pushing:

```bash
# Install Node.js if not already installed
node build-site.js

# Then commit and push
git add docs/
git commit -m "Rebuild site"
git push origin main
```

`docs/` is ignored in the repo and normally produced by CI; commit it only for a manual override or debugging.

## 📞 Support

For GitHub Pages issues, see:
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
