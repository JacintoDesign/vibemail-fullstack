Run the following three verification checks for the current build unit and report the results. Do NOT fix anything — this command is read-only reporting only.

The current build unit is: $ARGUMENTS
If no unit number was provided, ask the user which unit they are on before proceeding.

---

## Check 1 — TypeScript

Run:
```
npx tsc --noEmit
```

Report:
- PASS if the command exits 0 with no output.
- FAIL and list every type error verbatim if it exits non-zero.

---

## Check 2 — Test suite

Run:
```
npm test
```

Report:
- The total number of passing tests.
- The total number of failing tests.
- For each failing test: the test name and the full failure message.
- PASS if exit code is 0 and failing count is 0.
- FAIL otherwise.

---

## Check 3 — Modified files

Run:
```
git diff --name-only
git diff --name-only --cached
```

List every file that appears in either output.

Then cross-reference against `build_sequence.md` for the current unit to determine expected scope. Flag any modified file that falls outside the expected scope for this unit as UNEXPECTED.

- PASS if no files are listed, or all listed files are within expected scope.
- FAIL and list the unexpected paths if any file is outside expected scope.

---

## Final verdict

If all three checks are PASS:
> ✅ Unit [N] verified — TypeScript clean, tests green, no unexpected modifications.

If any check is FAIL:
> ❌ Unit [N] failed.
> 
> Then list each failure with its check number and specific details.

Do not suggest fixes. Do not modify any file. Report only.
