# Commit Conventions

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification to maintain a clean and organized commit history.

## Quick Start

### Interactive Commits with Commitizen

Use the interactive commit tool instead of `git commit`:

```bash
pnpm commit
```

This will guide you through creating a properly formatted commit message.

### Manual Commits

If you prefer to write commits manually, follow this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Commit Types

- **feat**: A new feature
  - Example: `feat(video): add subtitle rendering support`

- **fix**: A bug fix
  - Example: `fix(api): handle missing transcript error`

- **docs**: Documentation changes only
  - Example: `docs(readme): update installation instructions`

- **style**: Code style changes (formatting, semicolons, etc.)
  - Example: `style(web): apply prettier formatting`

- **refactor**: Code refactoring without changing functionality
  - Example: `refactor(services): extract video analysis logic`

- **perf**: Performance improvements
  - Example: `perf(rendering): optimize video encoding pipeline`

- **test**: Adding or updating tests
  - Example: `test(api): add content analysis service tests`

- **build**: Changes to build system or dependencies
  - Example: `build(deps): upgrade Next.js to 16.1.1`

- **ci**: CI/CD configuration changes
  - Example: `ci(github): add automated testing workflow`

- **chore**: Other maintenance tasks
  - Example: `chore(husky): configure pre-commit hooks`

- **revert**: Reverting a previous commit
  - Example: `revert: revert feat(video): add subtitle rendering`

## Scopes

Common scopes in this project:

- **web**: Web application changes
- **api**: API routes and endpoints
- **services**: Business logic services
- **video**: Video processing features
- **remotion**: Remotion server changes
- **processing-engine**: Python processing service
- **ui**: UI components
- **config**: Configuration files
- **deps**: Dependency updates

## Rules

### Subject Line

- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize the first letter
- No period at the end
- Maximum 100 characters
- Be concise but descriptive

**Good examples:**
```
feat(video): add face detection to smart crop
fix(api): prevent duplicate transcription requests
docs(architecture): add system overview diagram
```

**Bad examples:**
```
Added new feature
fixed bug
Update README.md.
feat(video): Added face detection feature for the smart crop functionality
```

### Body (Optional)

- Use the body to explain **what** and **why**, not **how**
- Separate from subject with a blank line
- Wrap at 100 characters per line
- Can include multiple paragraphs

Example:
```
feat(video): add face detection to smart crop

The smart crop feature now detects faces in videos and ensures they
remain visible during 16:9 to 9:16 conversion. This improves the
quality of automatically cropped videos.

Uses MediaPipe for face detection with high confidence threshold.
```

### Footer (Optional)

Use the footer for:
- Breaking changes
- Issue references
- Pull request references

**Breaking changes:**
```
feat(api): change video upload endpoint response format

BREAKING CHANGE: The /api/upload endpoint now returns { videoId, url }
instead of just the URL string. Update clients accordingly.
```

**Issue references:**
```
fix(rendering): resolve subtitle sync timing issue

Fixes #123
Closes #456
Related to #789
```

## Automated Checks

This project uses automated tools to enforce commit conventions:

### Pre-commit Hook

Before each commit, the following checks run automatically:

1. **ESLint**: Lints and fixes JavaScript/TypeScript files
2. **Prettier**: Formats all staged files
3. **Python Linters**: Checks Python code (Black, Flake8)

If any check fails, the commit is rejected. Fix the issues and try again.

### Commit Message Validation

After writing your commit message, it's validated against the conventional commits format. Invalid messages are rejected with an error explaining what's wrong.

## Examples

### Feature Addition

```
feat(remotion): add viral caption template

Implements a new caption template optimized for viral social media content.
Includes bold text, dynamic animations, and emoji support.
```

### Bug Fix

```
fix(video): prevent memory leak in transcription service

The Whisper service was not properly releasing resources after processing.
This fix ensures cleanup after each transcription job.

Fixes #234
```

### Documentation Update

```
docs(api): add video processing workflow diagram

Includes step-by-step visualization of the complete video processing
pipeline from upload to rendered output.
```

### Breaking Change

```
feat(api): redesign content analysis response structure

BREAKING CHANGE: The analyze endpoint now returns a nested structure
with separate sections for clips, metadata, and scores. Update all
clients to use the new response format.

Migration guide available in docs/migration/v2.md
```

### Multiple Changes (Use Multiple Commits)

Instead of:
```
fix: various fixes and improvements
```

Break into separate commits:
```
fix(video): handle empty transcript gracefully
fix(ui): correct button alignment in uploader
refactor(services): simplify error handling logic
```

## Tips

1. **Commit often**: Small, focused commits are better than large ones
2. **One concern per commit**: Each commit should represent one logical change
3. **Test before committing**: Make sure your changes work
4. **Use the interactive tool**: `pnpm commit` makes it easier to follow conventions
5. **Reference issues**: Link commits to issues for better traceability

## Troubleshooting

### Commit Rejected by Linter

```bash
# Fix linting issues
pnpm lint

# Fix formatting issues
pnpm format

# Try commit again
git commit
```

### Invalid Commit Message

If your commit message is rejected:

1. Check the error message for specific issues
2. Use `pnpm commit` for guided commit creation
3. Review the examples in this document

### Skip Hooks (Not Recommended)

Only in emergencies:

```bash
git commit --no-verify -m "emergency fix"
```

**Note**: Skipping hooks is discouraged and should only be used in critical situations.

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Commitizen](https://github.com/commitizen/cz-cli)
- [Commitlint](https://commitlint.js.org/)
- [Semantic Versioning](https://semver.org/)

## Configuration Files

- `commitlint.config.js`: Commit message validation rules
- `.lintstagedrc.js`: Pre-commit checks configuration
- `.husky/`: Git hooks configuration
- `.prettierrc`: Code formatting rules

For questions or suggestions about commit conventions, please open an issue or discussion.
