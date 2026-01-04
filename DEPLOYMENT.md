# GitHub Pages Deployment Guide

This repository is configured to automatically deploy to GitHub Pages whenever you push changes to the `main` branch.

## ✅ What's Configured

1. **Automated Build & Deploy Workflow** (`.github/workflows/deploy-to-pages.yml`)
   - Triggers on every push to `main` branch
   - Builds the static site using `build-site.js`
   - Automatically deploys to GitHub Pages

2. **Build Script** (`build-site.js`)
   - Generates an `index.html` file in the `docs/` folder
   - Indexes all markdown notes and excalidraw diagrams
   - Creates a beautiful, responsive website

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
- Scans all `.md` files in the `Notes/` directory
- Scans all `.excalidraw` files in the repository
- Generates a beautiful HTML index with:
  - All study notes linked
  - All diagrams organized by category
  - Direct links to GitHub for viewing/editing
  - Responsive design that works on mobile

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

✅ All files in `Notes/` directory (`.md` files)
✅ All `.excalidraw` diagrams
✅ Links to GitHub for direct access
✅ Auto-generated `index.html`

❌ Raw Excalidraw files (not embedded, but linked to GitHub for viewing)
❌ Node modules
❌ Build artifacts

## 🔗 Links in Generated Site

The generated website provides:
- **View on GitHub** links for each markdown file (displays content in GitHub)
- **Open in GitHub** links for each diagram (opens in GitHub's viewer)
- Direct access to view/edit all files

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

## 📞 Support

For GitHub Pages issues, see:
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
