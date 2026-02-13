# Husky, Commitlint & Commitizen Setup Guide

This guide will help you set up and use the commit quality tools in this project.

## Installation

If you haven't already installed dependencies, run:

```bash
pnpm install
```

This will automatically:

1. Install all required packages
2. Initialize Husky with the `prepare` script
3. Set up Git hooks

## Initial Setup

After installation, initialize Husky:

```bash
# This creates the .husky directory and installs hooks
pnpm prepare
```

Make the hook scripts executable:

```bash
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

## What Gets Installed

### Core Dependencies

- **husky**: Git hooks manager
- **@commitlint/cli**: Commit message linter
- **@commitlint/config-conventional**: Conventional commits config
- **commitizen**: Interactive commit tool
- **cz-conventional-changelog**: Commitizen adapter
- **lint-staged**: Run linters on staged files
- **prettier**: Code formatter

### Configuration Files

- `.husky/pre-commit`: Pre-commit hook script
- `.husky/commit-msg`: Commit message validation hook
- `commitlint.config.js`: Commit message rules
- `.lintstagedrc.js`: Lint-staged configuration
- `.prettierrc`: Prettier formatting rules
- `.prettierignore`: Files to exclude from formatting

## How to Use

### Method 1: Interactive Commits (Recommended)

Use the commitizen tool for guided commit creation:

```bash
# Stage your changes
git add .

# Start interactive commit
pnpm commit
```

Follow the prompts:

1. Select the type of change
2. Enter the scope (optional)
3. Write a short description
4. Add a longer description (optional)
5. List breaking changes (optional)
6. Reference issues (optional)

### Method 2: Manual Commits

Write commits manually following the conventional format:

```bash
git add .
git commit -m "feat(video): add subtitle rendering support"
```

## What Happens on Commit

### Pre-commit Hook

Before your commit is created, `lint-staged` runs automatically:

1. **JavaScript/TypeScript files** (`*.{js,jsx,ts,tsx}`):
   - ESLint checks and fixes issues
   - Prettier formats the code

2. **Other files** (`*.{json,md,css,scss,yaml,yml}`):
   - Prettier formats the files

3. **Python files** (`*.py`):
   - Black checks formatting
   - Flake8 checks code quality

If any check fails, the commit is aborted. Fix the issues and try again.

### Commit Message Validation

After writing your commit message, commitlint validates it:

- Checks commit type is valid
- Ensures subject line follows rules
- Validates header length (max 100 chars)
- Checks for proper formatting

Invalid commits are rejected with helpful error messages.

## Examples

### Good Commit Flow

```bash
# Make changes to files
vim apps/web/app/page.tsx

# Stage changes
git add apps/web/app/page.tsx

# Commit with interactive tool
pnpm commit

# Or commit manually
git commit -m "feat(web): add new landing page hero section"

# Hooks run automatically:
# ✓ ESLint checks pass
# ✓ Prettier formats code
# ✓ Commit message is valid
# ✓ Commit created successfully
```

### Failed Commit Examples

**ESLint failure:**

```bash
git commit -m "feat(web): add new feature"

# Output:
# ✖ eslint --fix:
#   error: 'useState' is not defined
# ✖ lint-staged failed
```

**Solution:** Fix the ESLint error and commit again.

**Invalid commit message:**

```bash
git commit -m "Added new feature"

# Output:
# ✖ type must be one of [feat, fix, docs, ...]
# ✖ subject may not be empty
```

**Solution:** Use proper conventional commit format or use `pnpm commit`.

## Testing the Setup

### Test Pre-commit Hook

Create a test file with linting issues:

```bash
# Create a file with intentional issues
echo "const x = 'test'" > test-file.js

# Stage it
git add test-file.js

# Try to commit
git commit -m "test: verify hooks"

# Prettier will auto-fix and the commit will succeed
```

### Test Commit Message Validation

Try an invalid commit message:

```bash
git commit --allow-empty -m "invalid message"

# Should fail with validation errors
```

Try a valid commit message:

```bash
git commit --allow-empty -m "test(hooks): verify commit validation"

# Should succeed
```

## Common Issues

### Issue: Hooks not running

**Cause:** Husky not initialized

**Solution:**

```bash
pnpm prepare
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### Issue: "pnpm: command not found" in hooks

**Cause:** pnpm not in PATH for Git hooks

**Solution:** Install pnpm globally or update hooks to use `npx pnpm`.

### Issue: Python linters failing

**Cause:** Black or Flake8 not installed

**Solution:**

```bash
cd apps/processing-engine
pip install black flake8
```

Or remove Python checks from `.lintstagedrc.js` if not using Python.

### Issue: Too many files being checked

**Cause:** lint-staged checking all files

**Solution:** Only stage the files you want to commit:

```bash
git add specific-file.ts
git commit
```

## Customization

### Modify Commit Types

Edit `commitlint.config.js`:

```javascript
'type-enum': [
  2,
  'always',
  [
    'feat',
    'fix',
    'docs',
    // Add your custom types here
    'custom-type',
  ],
],
```

### Change Linting Rules

Edit `.lintstagedrc.js`:

```javascript
module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    // Add more commands here
  ],
};
```

### Adjust Prettier Rules

Edit `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 80 // Change to your preference
}
```

## Disabling Hooks (Not Recommended)

In emergencies, you can bypass hooks:

```bash
# Skip pre-commit hook
git commit --no-verify -m "emergency fix"

# Skip commit-msg hook (also skips pre-commit)
git commit --no-verify -m "any message"
```

**Warning:** This defeats the purpose of having quality checks. Only use in critical situations.

## CI/CD Integration

Consider adding these checks to your CI pipeline:

```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
```

## Additional Commands

```bash
# Format all files (not just staged)
pnpm format

# Check formatting without changes
pnpm format:check

# Run linting on all files
pnpm lint

# Run tests
pnpm test

# Create a commit with the interactive tool
pnpm commit
```

## Best Practices

1. **Commit often**: Small, atomic commits are easier to review and debug
2. **Use `pnpm commit`**: The interactive tool ensures correct formatting
3. **Stage selectively**: Only commit related changes together
4. **Write descriptive messages**: Help your future self and teammates
5. **Fix lint errors**: Don't bypass hooks unless absolutely necessary
6. **Keep hooks fast**: If hooks are slow, optimize or reduce checks

## Getting Help

If you encounter issues:

1. Check this guide
2. Review the error message carefully
3. Check the configuration files
4. Read [COMMIT_CONVENTIONS.md](./COMMIT_CONVENTIONS.md)
5. Ask the team for help

## Resources

- [Husky Documentation](https://typicode.github.io/husky/)
- [Commitlint Documentation](https://commitlint.js.org/)
- [Commitizen Documentation](https://github.com/commitizen/cz-cli)
- [Lint-staged Documentation](https://github.com/okonet/lint-staged)
- [Prettier Documentation](https://prettier.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## Maintenance

### Updating Dependencies

```bash
# Update husky
pnpm update husky -w

# Update commitlint
pnpm update @commitlint/cli @commitlint/config-conventional -w

# Update all dev dependencies
pnpm update -D -w
```

### Regenerating Hooks

If hooks get corrupted:

```bash
rm -rf .husky
pnpm prepare
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

---

For questions or issues with the setup, please open an issue in the repository.
