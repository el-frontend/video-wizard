# Husky & Commitlint Installation Checklist

Use this checklist to ensure everything is set up correctly.

## Pre-Installation

- [ ] Verify you're in the project root directory
- [ ] Ensure Git repository is initialized (`git status` works)
- [ ] Check that pnpm is installed (`pnpm --version`)
- [ ] Backup any existing Git hooks (if any)

## Installation Steps

### Option 1: Automated Setup (Recommended)

- [ ] Make setup script executable

  ```bash
  chmod +x setup-hooks.sh
  ```

- [ ] Run the setup script

  ```bash
  ./setup-hooks.sh
  ```

- [ ] Verify the output shows "✅ Setup complete!"

### Option 2: Manual Setup

- [ ] Install dependencies

  ```bash
  pnpm install
  ```

- [ ] Initialize Husky

  ```bash
  pnpm prepare
  ```

- [ ] Make hooks executable
  ```bash
  chmod +x .husky/pre-commit
  chmod +x .husky/commit-msg
  ```

## Verification

### Check Files Created

- [ ] `.husky/pre-commit` exists and is executable
- [ ] `.husky/commit-msg` exists and is executable
- [ ] `commitlint.config.js` exists
- [ ] `.lintstagedrc.js` exists
- [ ] `.prettierrc` exists
- [ ] `.prettierignore` exists

### Test Hooks

- [ ] Test valid commit message

  ```bash
  git commit --allow-empty -m "test(setup): verify hooks work"
  ```

  Expected: ✅ Commit succeeds

- [ ] Test invalid commit message

  ```bash
  git commit --allow-empty -m "invalid message format"
  ```

  Expected: ❌ Commit fails with validation error

- [ ] Test interactive commit tool

  ```bash
  pnpm commit
  ```

  Expected: ✅ Shows interactive prompts

- [ ] Create a test file with formatting issues

  ```bash
  echo "const x='test'" > test.js
  git add test.js
  git commit -m "test(format): check prettier"
  ```

  Expected: ✅ Prettier auto-fixes the file

- [ ] Remove test file
  ```bash
  git reset HEAD~1
  rm test.js
  ```

## Post-Installation

### Review Documentation

- [ ] Read `COMMIT_CONVENTIONS.md`
- [ ] Read `HUSKY_SETUP.md`
- [ ] Review `SETUP_SUMMARY.md`
- [ ] Check updated `README.md` for new sections

### Configure (Optional)

- [ ] Review and customize `commitlint.config.js` if needed
- [ ] Adjust `.lintstagedrc.js` for your workflow
- [ ] Modify `.prettierrc` to match your style preferences
- [ ] Update Python linting rules if not using Python

### Share with Team

- [ ] Inform team members about new commit conventions
- [ ] Share documentation links
- [ ] Demonstrate `pnpm commit` interactive tool
- [ ] Add to onboarding documentation

## Troubleshooting

### If hooks don't run:

- [ ] Check `.git/hooks` directory exists
- [ ] Verify hooks are executable: `ls -la .husky/`
- [ ] Re-run `pnpm prepare`
- [ ] Check Git version is 2.9 or higher: `git --version`

### If pnpm commands fail in hooks:

- [ ] Ensure pnpm is in system PATH
- [ ] Try using `npx pnpm` instead in hook files
- [ ] Install pnpm globally: `npm install -g pnpm`

### If ESLint/Prettier fail:

- [ ] Verify they're installed: `pnpm list eslint prettier`
- [ ] Check workspace configuration
- [ ] Run manually first: `pnpm lint` and `pnpm format`

### If Python linters fail:

- [ ] Install Python dependencies: `pip install black flake8`
- [ ] Or remove Python checks from `.lintstagedrc.js`
- [ ] Verify Python version is compatible

## Final Checks

- [ ] All team members have run the setup
- [ ] Everyone can make commits using `pnpm commit`
- [ ] Pre-commit hooks are running for everyone
- [ ] Commit messages are being validated
- [ ] Code is being formatted automatically
- [ ] Documentation is accessible to the team

## Success Indicators

✅ You'll know everything is working when:

1. Running `pnpm commit` shows interactive prompts
2. Invalid commit messages are rejected
3. Code is auto-formatted on commit
4. ESLint errors prevent commits
5. Team members are using conventional commit format
6. Git history shows clean, consistent commits

## Need Help?

If you encounter issues not covered here:

1. Check `HUSKY_SETUP.md` troubleshooting section
2. Review error messages carefully
3. Search for similar issues online
4. Ask team members who successfully completed setup
5. Create an issue in the repository

## Additional Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Husky Documentation](https://typicode.github.io/husky/)
- [Commitlint Documentation](https://commitlint.js.org/)
- [Commitizen Documentation](https://github.com/commitizen/cz-cli)
- [Lint-staged Documentation](https://github.com/okonet/lint-staged)

---

**Note:** Mark each checkbox as you complete the steps. If you encounter any issues, refer to the troubleshooting section and documentation.

**Status:**

- [ ] Installation Complete
- [ ] Verification Passed
- [ ] Team Informed
- [ ] Ready to Use

Once all checkboxes are marked, you're ready to start using the new commit workflow! 🎉
