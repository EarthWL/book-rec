# GitHub Setup Instructions

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `book-rec`
   - **Description**: AI-powered manga and book collection manager with barcode scanning
   - **Visibility**: Public (or Private if you prefer)
   - **DO NOT** initialize with README, .gitignore, or license (we already have them)
3. Click "Create repository"

## Step 2: Push to GitHub

After creating the repository, run these commands:

```bash
cd /c/Users/criti/Documents/book-rec

# Add remote repository (replace EarthWL with your GitHub username)
git remote add origin https://github.com/EarthWL/book-rec.git

# Rename branch to main (GitHub standard)
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 3: Update README

After pushing, update the README.md with your actual GitHub username:

1. Edit README.md
2. Replace `EarthWL` with your actual GitHub username
3. Add screenshots if you want

```bash
# Commit changes
git add README.md
git commit -m "Update README with actual GitHub username"
git push
```

## Step 4: Configure GitHub Settings (Optional)

### Add Topics
Go to your repository → About (gear icon) → Topics:
- `manga`
- `books`
- `barcode-scanner`
- `collection-manager`
- `react`
- `fastapi`
- `docker`
- `gemini-api`
- `typescript`
- `python`

### Enable Discussions
Settings → General → Features → Enable Discussions

### Setup Branch Protection
Settings → Branches → Add branch protection rule:
- Branch name pattern: `main`
- Enable:
  - Require pull request reviews before merging
  - Require status checks to pass before merging

## Step 5: Add Repository Secrets (for GitHub Actions - Future)

Settings → Secrets and variables → Actions → New repository secret:
- `GEMINI_API_KEY`: Your Gemini API key (for future CI/CD)

## Troubleshooting

### Authentication Issues

If you get authentication errors when pushing:

**Option 1: SSH Key (Recommended)**
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key

# Change remote to SSH
git remote set-url origin git@github.com:EarthWL/book-rec.git
```

**Option 2: Personal Access Token**
```bash
# Generate token: GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
# Permissions: repo (full control)

# Use token as password when pushing
git push -u origin main
# Username: your_username
# Password: paste_your_token_here
```

## Next Steps

1. ✅ Repository created and code pushed
2. Add screenshots to README
3. Write detailed documentation
4. Setup GitHub Actions for CI/CD (optional)
5. Share with the community!

## Useful Commands

```bash
# Check remote
git remote -v

# View commit history
git log --oneline

# Create new branch
git checkout -b feature/new-feature

# Push new branch
git push -u origin feature/new-feature
```
