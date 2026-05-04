# Fmt AND Annotation Payload Workflow Example

This fixture demonstrates the annotation-oriented `fmt.and` path:

1. Compile AEON source with annotation comments
2. Extract annotation records from AEON core
3. Convert those records into embedded headerless `&ND` payloads
4. Emit canonical embedded `&ND` from each payload
5. Show issue collection for invalid payloads

Run it from the workspace root:

```sh
sh examples/fmt-and-annotation-payload-workflow/run.sh
```

The script is read-only and prints the payloads and issues directly.
