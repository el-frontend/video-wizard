module.exports = {
  // TypeScript and JavaScript files
  '*.{js,jsx,ts,tsx}': (filenames) => {
    const workspaces = new Set();
    filenames.forEach((file) => {
      if (file.includes('apps/web/')) workspaces.add('web');
      if (file.includes('apps/remotion-server/')) workspaces.add('remotion-server');
      if (file.includes('packages/')) {
        const match = file.match(/packages\/([^/]+)/);
        if (match) workspaces.add(match[1]);
      }
    });

    const commands = [];
    if (workspaces.size > 0) {
      const filters = Array.from(workspaces)
        .map((w) => `--filter=${w}`)
        .join(' ');
      commands.push(`turbo run lint ${filters}`);
    }

    return [...commands, `prettier --write ${filenames.join(' ')}`];
  },

  // JSON, Markdown, CSS, and other files
  '*.{json,md,css,scss,yaml,yml}': ['prettier --write'],

  // Python files (for processing-engine)
  '*.py': ['python -m black --check', 'python -m flake8'],
};
