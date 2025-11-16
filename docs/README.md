# Nostalgi2D Documentation

This directory contains documentation for the Nostalgi2D game engine.

## Actor Synchronization Protocol

The actor synchronization protocol defines how game objects (actors) are synchronized between the server and clients in a networked multiplayer environment.

### Documents

1. **[actor-synchronization-protocol.md](./actor-synchronization-protocol.md)** - Main protocol specification
   - Overview and core principles
   - Message type definitions
   - Protocol flows and sequences
   - Ownership model
   - Error handling
   - Future enhancements

2. **[actor-synchronization-examples.md](./actor-synchronization-examples.md)** - Implementation examples
   - Server-side implementation code
   - Client-side implementation code
   - Message serialization
   - Common patterns and utilities
   - Testing examples
   - Performance and security considerations

3. **[actor-sync-quick-reference.md](./actor-sync-quick-reference.md)** - Quick reference guide
   - Key concepts summary
   - Message types cheat sheet
   - Rules and checklists
   - Common patterns
   - Debugging tips
   - Architecture diagrams

4. **[actor-sync-diagrams.md](./actor-sync-diagrams.md)** - Visual diagrams
   - System architecture diagram
   - Data flow diagrams
   - Connection flow sequence
   - Ownership model visualization
   - Message timing diagrams
   - State reconciliation flow
   - Bandwidth optimization examples

### Getting Started

If you're implementing actor synchronization for the first time:

1. Start with the **Quick Reference** to understand the key concepts
2. Review the **Visual Diagrams** to see the flows and architecture
3. Read the **Protocol Specification** to understand the full protocol
4. Refer to **Implementation Examples** for code samples
5. Use the **Quick Reference** during development

### Related Code

- Actor base class: `src/packages/engine/world/actor.ts`
- Network endpoint: `src/packages/engine/network/endpoint.ts`
- Server implementation: `src/apps/server/server.ts`
- Engine core: `src/packages/engine/engine.ts`

### Issue References

- Issue #35: Define actor synchronization protocol (this documentation addresses this issue)

## Contributing

When adding new documentation:

1. Keep documents focused and single-purpose
2. Include code examples where helpful
3. Update this README with links to new documents
4. Cross-reference related documents
