# Fmt AND Model Workflow Example

This fixture demonstrates the end-to-end `fmt.and` path:

1. Parse `&ND` text into `FmtAndDocument`
2. Mutate the live `FmtAndDocument` tree directly with the helper layer
3. Convert that model back to `NdDocument`
4. Export AES and minimized AEON
5. Emit canonical `&ND`
6. Render HTML
7. Collect diagnostics for a failing input

Run it from the workspace root:

```sh
sh examples/fmt-and-model-workflow/run.sh
```

The script is read-only. It prints each stage to the terminal so the replacement flow is easy to
inspect without opening the package internals first.
It is especially useful if you want to see the intended editing model: make explicit object-tree
changes first, then project back out through AES, AEON, canonical `&ND`, or HTML.
The current version includes paragraph, heading, blockquote, and extension-fallback helper usage.
It also demonstrates mixed inline composition for links, code spans, and strong text.
It now also covers helper-built code blocks, tables, and horizontal rules.
It includes a small path-helper pass as well, showing path-based inline insertion, fallback
replacement, and nested lookup over the `FmtAndDocument` tree.
