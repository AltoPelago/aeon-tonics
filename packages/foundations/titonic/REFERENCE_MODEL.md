# Titonic Reference Model

This document defines the intended internal model for clone and pointer references in Titonic
before implementation work expands to support them.

The goal is to preserve AEON semantics while keeping the Titonic runtime memory-efficient and
predictable.

## Problem

AEON distinguishes between two different reference forms:

- clone reference: `~path`
- pointer reference: `~>path`

They are not the same thing semantically:

- clone means "take the referenced value as a copy"
- pointer means "act as a live alias to the target"

However, eagerly copying large clone subtrees on import can be wasteful.

Titonic is a live document model, so it benefits from an internal representation that can:

- avoid unnecessary duplication
- preserve the semantic difference between clone and pointer
- export back into AES honestly

## Design Decision

Titonic should treat:

- pointer references as true live aliases
- clone references as copy-on-write views

That means clone references may remain internally pointer-like until they are mutated, but they
must still behave as clones from the user's perspective.

## Mental Model

- `~>` = symbolic alias
- `~` = lazy snapshot

The snapshot does not need to be physically copied on import.
It only needs to become independent when mutation would otherwise cause aliasing.

## Proposed Internal Node Kinds

The current Titonic implementation already has scalar, object, and list nodes.

Reference support should extend the node model with:

- `PointerAliasNode`
  A live alias to another node path or resolved node identity.
- `CloneViewNode`
  A lazy clone of another node path or resolved node identity.

Suggested conceptual shape:

```ts
type TitonicNode =
  | ScalarNode
  | ObjectNode
  | ListNode
  | PointerAliasNode
  | CloneViewNode;
```

Possible reference node structure:

```ts
interface PointerAliasNode extends BaseNode {
  readonly kind: 'pointer-alias';
  readonly targetPath: readonly ReferencePathSegment[];
}

interface CloneViewNode extends BaseNode {
  readonly kind: 'clone-view';
  readonly targetPath: readonly ReferencePathSegment[];
  realized?: TitonicNode;
}
```

The exact structure may evolve, but the behavioral contract should remain stable.

## Read Semantics

### Pointer Alias

Reads through a pointer alias should resolve to the target node directly.

Effects:

- reading the alias reads the target
- reading a nested child through the alias reads the corresponding target child
- no independent local state exists unless the underlying target changes

### Clone View

Reads through a clone view should behave like reading an independent value snapshot.

Implementation rule:

- if the clone has not been realized, read from the target
- if the clone has been realized, read from the realized local subtree

This preserves the illusion of a clone without requiring immediate full duplication.

## Write Semantics

### Pointer Alias

Writes through a pointer alias must update the target.

Effects:

- assigning to the alias mutates the target
- mutating a nested property through the alias mutates the target subtree
- deleting through the alias affects the target

This is true alias behavior.

### Clone View

Writes through a clone view must never mutate the source target.

Effects:

- before any write, the clone view must detach
- detachment creates a private realized subtree
- the write is then applied to the realized subtree

This is copy-on-write behavior.

## Detachment Rules For Clones

A clone should detach when any mutation would otherwise change shared state.

That includes:

- assigning a new value to the clone itself
- assigning to a child inside the clone
- creating a property inside the clone
- deleting a property inside the clone
- changing a list element inside the clone
- inserting into a list inside the clone
- deleting from a list inside the clone

Detachment algorithm:

1. resolve the current target subtree
2. realize a private copy of that subtree
3. replace or populate the clone node's realized storage
4. apply the mutation to the realized subtree

Once detached, the clone should behave like an ordinary independent subtree.

## Export Semantics

Export must reflect the current truth of the Titonic document.

### Pointer Alias Export

If a pointer alias remains a pointer alias, export it as:

```aeon
b = ~>a
```

### Clone View Export

If a clone has never detached and still faithfully represents the original clone relationship,
export it as:

```aeon
b = ~a
```

If the clone has detached and diverged, Titonic must no longer export it as a clone reference.
At that point it should export the realized concrete subtree instead.

That means:

- unchanged clone stays symbolic
- mutated clone becomes concrete

This is both honest and efficient.

## Why This Model Is Valuable

This approach gives Titonic:

- lower memory cost for large cloned subtrees
- AEON-correct distinction between clone and pointer semantics
- natural behavior for a live in-memory document model
- an export path that preserves symbolic references where possible

## Constraints

Reference support in Titonic should still respect the package charter:

- Titonic owns live document behavior, not schema validation
- Titonic should round-trip through AES cleanly
- Titonic should not collapse clone and pointer into one user-visible behavior
- Titonic should prefer integrity and predictability over hidden magic

## Non-Goals

This reference model is not intended to:

- implement AEOS validation rules
- invent new AEON reference syntax
- hide the difference between clone and pointer from the runtime
- force all clones to become concrete immediately

## Recommended Implementation Order

1. Add import/export support for clone and pointer reference nodes.
2. Implement pointer alias read/write behavior.
3. Implement clone read behavior without eager realization.
4. Add clone detachment on mutation.
5. Add export logic that emits symbolic clone references only when still valid.
6. Add targeted tests for nested writes, list mutations, and divergence after clone detachment.

## Testing Priorities

The first tests for this model should pin:

- pointer reads mirror target reads
- pointer writes mutate the target
- clone reads initially mirror the target
- clone writes detach and stop affecting the target
- nested clone mutation detaches only the clone side
- unchanged clones export as `~path`
- detached clones export as concrete values

These are the behaviors most likely to drift if the implementation is not pinned early.
