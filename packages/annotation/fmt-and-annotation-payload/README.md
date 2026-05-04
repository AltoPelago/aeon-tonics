# @aeon-tonics/fmt-and-annotation-payload

Converts AEON annotation stream records into embedded headerless `&ND` payloads and materializes
them as `FmtAndDocument`.

This package intentionally sits outside AEON core:

- AEON core owns parsing source and emitting `AnnotationRecord` metadata.
- `fmt-and-annotation-payload` owns interpreting annotation comment bodies as embedded `&ND`.
- `fmt-and-model` owns AES/model projection and optional bridges back into `and-core`.

```ts
import { compile } from '@aeon/core';
import { parseFmtAndAnnotationPayloads } from '@aeon-tonics/fmt-and-annotation-payload';

const result = compile('//# # Title\nname:string = "Aeon"');
const parsed = await parseFmtAndAnnotationPayloads(result.annotations ?? []);

console.log(parsed.payloads[0]?.document.root);
```

## Notes

- payload parsing is async because `fmt-and-model` may dynamically load `and-core`
- annotation payloads are treated as embedded `&ND`, so the helper injects the file header context
  before parsing
- batch parsing collects issues rather than failing the whole operation on the first invalid payload
