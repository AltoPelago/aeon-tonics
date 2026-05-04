# Fmt AND Editor Workflow Example

This fixture demonstrates the higher-level `fmt.and` editing path:

1. Create a `FmtAndDocument`
2. Apply `fmt-and-editor` operations such as:
   - insert paragraph before
   - insert paragraph after
   - insert heading before
   - insert heading after
   - replace paragraph text
   - replace heading text
   - wrap a block in a blockquote
   - unwrap a blockquote
   - set and clear extension fallback
   - remove inline and block nodes by path
3. Inspect the updated `FmtAndDocument`
4. Emit canonical `&ND`
5. Render HTML

Run it from the workspace root:

```sh
sh examples/fmt-and-editor-workflow/run.sh
```

This example is intentionally narrower than the `fmt-and-model` workflow.
It is meant to show the ergonomic editor layer you would likely call from app code once you already
have a `FmtAndDocument` in memory.
