<!--
Thanks for the PR! A few quick checks before submitting:
- pnpm --filter web lint should report only pre-existing warnings
- npx tsc --noEmit -p apps/web/tsconfig.json should be silent
- If you touched server/db/schema/*, run pnpm --filter web db:generate
  and commit the new SQL + snapshot
- Keep the PR focused — split unrelated changes into separate PRs
-->

## Summary

<!-- 1-3 sentences: what does this change and why does it matter? -->

## Changes

<!-- Bullet list of the meaningful edits. Skip churn. -->

-

## Test plan

<!-- How you verified this locally. For UI changes, attach a screenshot
     or short clip. For backend, paste the relevant request/response or
     logs. -->

- [ ]
- [ ]

## Screenshots / clips (UI changes)

<!-- Drag-and-drop into the editor. -->

## Related issues

Closes #
