# FOSS CAD + NLP: Building the Ultimate Open-Source AI-Driven CAD Platform

**Agent Research Report — March 11, 2026**
**Compiled from 4 parallel research agents analyzing 50+ projects, papers, and repositories**

---

## Executive Summary

The landscape for AI-driven CAD is exploding but fragmented. All the building blocks exist to create a production-quality, open-source, browser-based parametric CAD platform with natural language input. Nobody has assembled them into a cohesive product yet. This report maps the terrain and proposes an architecture.

**The gap nobody has filled:** A FOSS, browser-native parametric CAD tool that accepts natural language input and produces manufacturing-ready STEP files — with a clean web UI, constraint-based sketching, and an MCP server for AI agent integration.

---

## Part 1: The Foundation Layer — Geometry Kernels

### OpenCascade.js (WASM)

The industrial-grade kernel that powers most serious browser CAD projects.

| Attribute | Details |
|-----------|---------|
| Kernel | OCCT 7.6.2 (PR open for 8.0.0-RC4) |
| Binary size | 25-35MB uncompressed, 8-12MB gzipped, custom builds 5-15MB |
| Performance | 60-80% of native C++ speed |
| Threading | SharedArrayBuffer + Web Workers |
| License | LGPL 2.1 |

**What it provides:**
- Full B-rep topology (vertices, edges, wires, faces, shells, solids, compounds)
- NURBS surfaces and curves
- Boolean operations (fuse, cut, common)
- Fillets, chamfers (constant and variable radius)
- Sweeps, lofts, revolutions, extrusions
- Shelling, offsetting, draft angles
- STEP/IGES/BREP/STL import and export
- Shape healing for imported geometry

**What it does NOT provide:**
- 2D constraint solver for parametric sketching
- High-level API (raw bindings are verbose C++ mappings)

### planegcs (WASM) — The Missing Constraint Solver

FreeCAD's PlaneGCS solver compiled to WebAssembly. 76 stars on GitHub.

- Supports: points, lines, circles, arcs, ellipses, B-splines
- Constraints: coincident, distance, angle, parallel, perpendicular, tangent, symmetric, equal
- Algorithms: DogLeg, Levenberg-Marquardt, BFGS, SQP
- **This is the piece that makes parametric sketching possible in the browser**

### The Recommended Kernel Stack

```
┌─────────────────────────────────┐
│     Your Application Code       │
├─────────────────────────────────┤
│  Replicad (high-level TS API)   │  ← CadQuery-like fluent API
├─────────────────────────────────┤
│  planegcs (WASM)                │  ← 2D sketch constraints
├─────────────────────────────────┤
│  opencascade.js (WASM)          │  ← B-rep kernel
├─────────────────────────────────┤
│  Three.js                       │  ← 3D visualization
└─────────────────────────────────┘
```

---

## Part 2: Browser-Based CAD — Who's Building What

### Tier 1: Production Contenders

#### Chili3D (4,345 stars, AGPL-3.0)
- **Stack:** TypeScript + OpenCascade WASM (custom C++ bindings) + Three.js
- **UI:** Custom vanilla TS DOM (no React/Vue/Svelte)
- **Build:** Rspack (Rust-based)
- **Features:** Sketching, extrusion, revolution, sweep, loft, booleans, fillets, chamfers, shell, STEP/IGES/BREP export
- **Plugin system:** Formal manifest-based, ZIP/URL loading, JS/TS support
- **Missing:** Parametric constraint solver, assembly mates, GD&T, CAM, FEA
- **Status:** v0.7.0-beta, very active (daily commits)
- **Verdict:** Most complete browser CAD GUI, but AGPL license restricts commercial use

#### Replicad (590 stars, MIT)
- **Stack:** TypeScript + opencascade.js (third-party WASM) + Three.js (via helper)
- **Architecture:** Library-first (not an application). Optional React-based Studio IDE
- **Features:** Full 2D sketcher API, extrude/revolve/loft/sweep, booleans, fillets, chamfers, shell, STEP/STL export
- **Killer feature:** `Finder` system — query-based element selection: `shape.fillet(2, (e) => e.inDirection("Z"))`
- **Missing:** Constraint solver, assembly constraints
- **Status:** v0.21.0, moderate activity
- **Verdict:** Best foundation for NLP-driven CAD. API maps directly to what LLMs generate.

#### Comparison for NLP Suitability

| Dimension | Chili3D | Replicad |
|-----------|---------|----------|
| License | AGPL-3.0 | **MIT** |
| NLP suitability | Hard (GUI-command driven) | **Excellent (pure API)** |
| STEP export | Yes | Yes |
| Embeddable | No (full app) | **Yes (library)** |
| API surface for LLM | Large, coupled to UI | **Small, well-typed, chainable** |
| Plugin system | Yes | No |
| Constraint solver | No | No |

### Tier 2: Emerging

| Project | Stars | Approach | Notes |
|---------|-------|----------|-------|
| CascadeStudio | 1,323 | Code-CAD IDE in browser | JS scripting, OCCT 8.0 RC4 |
| ManifoldCAD | — | Guaranteed-manifold mesh booleans | Fast but mesh-only, no B-rep |
| Tau CAD | — | "AI-native CAD for the web" | Multi-kernel, MIT, early |
| three.cad | 339 | Parametric sketching with SolveSpace WASM | Has constraint solver! |
| JSCAD | 3,100 | Mature code-CAD, CSG-based | Not B-rep (mesh/CSG only) |

### Tier 3: Archived/Stalled

- **CADmium** — Was the most promising (Rust + WASM + SvelteKit). **Archived September 2025.** Team stopped maintaining it.

---

## Part 3: The NLP-to-CAD Pipeline — State of the Art

### What Works Today

| Approach | Project | Output | Validity | Limitations |
|----------|---------|--------|----------|-------------|
| Text → KCL → STEP | Zoo.dev Text-to-CAD API | Parametric KCL code | Variable | Proprietary engine |
| Text → CadQuery → STEP | ProCAD (Feb 2026) | Python code | **99.1%** | Needs clarification agent |
| Image → CadQuery → STEP | CAD-Coder (MIT) | Python code | 100% syntax | Image input only |
| Text → OpenSCAD → STL | openscad-agent | OpenSCAD code | Good for simple | Mesh only, no B-rep |
| Text → STEP directly | STEP-LLM (Jan 2026) | Raw STEP file | Research | Not production-ready |

### The Breakthrough: ProCAD's Two-Agent Architecture

ProCAD (February 2026, arxiv 2602.03045) achieved the best results in the field:

```
User prompt → Clarification Agent → Refined spec → CAD Coding Agent → CadQuery code → STEP
```

- **Invalid code rate: 0.9%** (down from 4.8% without clarification)
- **79.9% reduction** in geometric error vs. direct prompting
- **Key insight:** The biggest failure mode isn't code generation — it's under-specified prompts

### Common LLM Failure Modes in CAD Generation

1. **Hallucinated API calls** — LLMs invent functions that don't exist (most common)
2. **Invalid geometry** — Self-intersecting solids, non-manifold edges
3. **Spatial reasoning failures** — Features misaligned across planes
4. **Scale inconsistency** — Mixing units, wrong-sized parts
5. **Boolean operation errors** — Wrong order or wrong target bodies

### Research Trajectory (2025-2026)

- **CadQuery is winning** as the preferred LLM output format over OpenSCAD (Python-native, B-rep output, richer API)
- **RL with geometric rewards** (Chamfer Distance) outperforms supervised fine-tuning
- **Small models work** — CAD-Recode achieves SOTA with Qwen2-1.5B (you don't need GPT-4 for this)
- **Agentic multi-step approaches** dramatically outperform single-shot generation
- **Visual feedback loops** (render → VLM critique → iterate) improve quality significantly

---

## Part 4: Existing MCP Servers — What's Already Built

### The MCP CAD Ecosystem

| Platform | Best MCP Server | Stars | Tools | Approach |
|----------|----------------|-------|-------|----------|
| CadQuery | bertvanbrakel/mcp-cadquery | 14 | 10 | Code generation (AI writes Python) |
| Onshape | hedless/onshape-mcp | 28 | 45 | API wrapping (structured tool calls) |
| FreeCAD | neka-nat/freecad-mcp | 591 | 11 | Hybrid (tools + execute_code + screenshots) |
| SolidWorks | vespo92/SolidworksMCP-TS | — | 88 | COM interop + VBA fallback |

### Three Interaction Paradigms

1. **Code Generation** — AI writes CadQuery/Python, server executes it. Most flexible, risk of hallucinated APIs.
2. **API Wrapping** — AI calls structured tools with parameters. Most reliable, least flexible.
3. **Hybrid** — Structured tools for common ops + `execute_code` escape hatch + visual feedback. **Best balance.**

### Key Lessons from Existing Servers

- **Visual feedback is a differentiator** — neka-nat's FreeCAD MCP (591 stars) returns screenshots to the AI. Users love this.
- **Nobody has solved sketch constraints** via MCP — even Onshape's 45-tool server lists them as "research phase"
- **Workspace isolation** (bertvanbrakel's approach) prevents cross-contamination between sessions
- **Part libraries** indexed by the MCP server enable reuse
- **Zero standardization** exists across CAD MCP servers — every one uses different schemas

---

## Part 5: Zoo.dev — The Commercial Benchmark

### What Zoo Built

Zoo.dev (formerly KittyCAD) is the most advanced AI-CAD platform, but largely proprietary:

| Component | Open Source? | License |
|-----------|-------------|---------|
| Modeling App (GUI) | Yes | MIT |
| KCL Language (kcl-lib) | Yes | MIT |
| Geometry Engine | **No** | Proprietary |
| Text-to-CAD ML Model | **No** | API only |
| Client Libraries | Yes | Various |

### Their Geometry Engine

- **Custom B-rep kernel** — NOT based on OCCT
- **GPU-accelerated** surface-surface intersection (patented)
- **B-spline standardization** — minimal primitive set
- **Sub-second boolean operations**
- **Rendering:** Vulkan, streamed as video via WebSocket (the viewport is a `<video>` element)

### What We Can Learn (and Replicate in FOSS)

1. **KCL's design is excellent** — pipeline-oriented, units-aware, terse enough for version control. The language spec is MIT. We could implement a compatible runtime on top of OpenCascade.
2. **The clarification-first UX** — Their Zookeeper agent asks questions before generating. ProCAD validates this approach academically.
3. **Feature tree as code** — Every model is a text file. Git-friendly. This is the right paradigm.
4. **What we CAN'T replicate:** Their custom GPU kernel. But OCCT is proven industrial-grade — it's what CATIA-adjacent tools use.

---

## Part 6: The Proposed Architecture

### Vision

**An open-source, browser-native parametric CAD platform with natural language input, producing manufacturing-ready STEP files.**

### Name Ideas (TBD)
- ForgeCAD
- OpenForge
- SketchBridge
- ParamCAD
- NexusCAD

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Web Application                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ NLP Input  │  │ Code Editor  │  │ 3D Viewport      │ │
│  │ (chat UI)  │  │ (Monaco)     │  │ (Three.js)       │ │
│  └─────┬──────┘  └──────┬───────┘  └────────┬─────────┘ │
│        │                │                    │           │
│  ┌─────▼────────────────▼────────────────────▼─────────┐ │
│  │              Application Core                        │ │
│  │  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │ │
│  │  │ Clarifier   │  │ CAD Code │  │ Visual        │  │ │
│  │  │ Agent       │  │ Generator│  │ Validator     │  │ │
│  │  │ (ProCAD     │  │ (LLM →   │  │ (render →     │  │ │
│  │  │  pattern)   │  │ Replicad)│  │  VLM check)   │  │ │
│  │  └─────────────┘  └──────────┘  └───────────────┘  │ │
│  │                                                      │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │           MCP Server (TypeScript)             │   │ │
│  │  │  Tools: sketch, extrude, fillet, export, ...  │   │ │
│  │  │  Resources: part library, material DB         │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Engine Layer (WASM, Web Workers)         │ │
│  │  ┌────────────┐  ┌──────────┐  ┌─────────────────┐  │ │
│  │  │ Replicad   │  │ planegcs │  │ opencascade.js  │  │ │
│  │  │ (API)      │  │ (sketch  │  │ (B-rep kernel)  │  │ │
│  │  │            │  │ solver)  │  │                 │  │ │
│  │  └────────────┘  └──────────┘  └─────────────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript | Ecosystem, hiring pool, component libraries |
| 3D Viewport | Three.js + React Three Fiber | Mature, well-documented, huge community |
| Code Editor | Monaco Editor | VSCode-quality editing, syntax highlighting |
| Build | Vite | Fast, modern, great DX |
| CAD Kernel | opencascade.js (WASM) | Industrial-grade, STEP/IGES, proven |
| High-level API | Replicad | CadQuery-like fluent TS API, MIT license |
| Sketch Constraints | planegcs (WASM) | Full parametric constraints, proven in FreeCAD |
| AI Integration | MCP Server (TS) | Standard protocol, Claude/GPT compatible |
| NLP Pipeline | Clarifier + Code Gen + Visual Validation | ProCAD-proven architecture |
| File Formats | STEP, IGES, STL, BREP, glTF | Full manufacturing + web compatibility |
| State | Zustand or Jotai | Lightweight, React-native |
| Deployment | Vercel/Cloudflare (static) or self-hosted | All computation is client-side WASM |

### MCP Tool Schema (Draft)

```typescript
// Core modeling tools
create_sketch({ plane: "XY" | "XZ" | "YZ" | face_id, origin?: [x,y,z] })
sketch_rectangle({ width: mm, height: mm, center?: [x,y] })
sketch_circle({ radius: mm, center?: [x,y] })
sketch_line({ from: [x,y], to: [x,y] })
sketch_arc({ from: [x,y], to: [x,y], radius: mm })
sketch_fillet({ radius: mm, vertices?: vertex_id[] })
add_constraint({ type: "coincident"|"parallel"|"perpendicular"|"distance"|"angle", entities: id[], value?: number })
extrude({ sketch_id, depth: mm, direction?: "normal"|"reverse"|"both" })
revolve({ sketch_id, axis: "X"|"Y"|"Z"|edge_id, angle: degrees })
sweep({ profile_id, path_id })
loft({ profiles: sketch_id[] })
fillet({ edges: edge_id[], radius: mm })
chamfer({ edges: edge_id[], distance: mm })
boolean({ operation: "fuse"|"cut"|"common", body_a: id, body_b: id })
shell({ faces_to_remove: face_id[], thickness: mm })

// Query tools
get_edges({ filter?: "parallel_to_Z" | "at_height_10" | ... })
get_faces({ filter?: "normal_to_X" | "largest" | ... })
get_mass_properties({})
measure_distance({ entity_a: id, entity_b: id })

// Export tools
export_step({ path: string })
export_stl({ path: string, tolerance?: mm })
export_gltf({ path: string })

// NLP tools
describe_to_cad({ description: string, clarify?: boolean })
refine_model({ feedback: string })
get_viewport_screenshot({})
```

### Development Phases

#### Phase 1: Foundation (Weeks 1-4)
- [ ] Scaffold React + Vite + Three.js app
- [ ] Integrate opencascade.js WASM in Web Worker
- [ ] Integrate Replicad as modeling API
- [ ] Basic 3D viewport (orbit, pan, zoom, select)
- [ ] STEP/STL export from browser
- [ ] Basic UI: feature tree, property panel

#### Phase 2: Sketcher (Weeks 5-8)
- [ ] Integrate planegcs WASM for 2D constraint solving
- [ ] Interactive sketch mode on planes
- [ ] Sketch tools: line, rectangle, circle, arc, spline
- [ ] Constraints: coincident, distance, angle, parallel, perpendicular
- [ ] Dimension display and editing

#### Phase 3: MCP + NLP (Weeks 9-12)
- [ ] MCP server exposing Replicad operations as tools
- [ ] Clarification agent (ProCAD-style prompt refinement)
- [ ] Code generation: NLP → Replicad TypeScript
- [ ] Visual feedback loop: render → validate → iterate
- [ ] Chat UI for natural language input
- [ ] Monaco editor for direct code editing

#### Phase 4: Polish (Weeks 13-16)
- [ ] Part library (searchable, indexed)
- [ ] Undo/redo (transaction-based, inspired by Chili3D)
- [ ] Assembly support (basic multi-body positioning)
- [ ] Material assignment and appearance
- [ ] Performance optimization (lazy WASM loading, worker pooling)
- [ ] Documentation and contributor guide

---

## Part 7: Key Decisions and Trade-offs

### Why Replicad over building from scratch?
- MIT license, production-tested, CadQuery-equivalent API
- Abstracts the verbose OCCT calls into ergonomic TypeScript
- Finder system maps perfectly to LLM queries
- Already handles STEP export, tessellation, memory management

### Why not just fork Chili3D?
- **AGPL-3.0** requires open-sourcing all connected code (even SaaS)
- Tightly coupled custom UI framework — hard to replace with React
- Better to learn from its architecture than inherit its constraints

### Why not Onshape?
- Proprietary, API rate limits, paid for serious use
- Network dependency for every operation
- No FOSS geometry engine

### Why browser-native (WASM) over server-side?
- Zero infrastructure cost — all computation on client
- No GPU servers needed (unlike Zoo.dev)
- Works offline
- Privacy — geometry never leaves the browser
- Instant deployment (static hosting)

### Why TypeScript for the MCP server?
- Same language as the frontend (full-stack coherence)
- MCP SDK has first-class TypeScript support
- Replicad is already TypeScript
- Matches SolidworksMCP-TS patterns for consistency

---

## Part 8: Competitive Landscape Summary

```
                    FOSS ←————————————————————→ Proprietary
                     │                              │
  Full CAD App ──────┤── Chili3D (AGPL)             │── Zoo.dev
                     │── FreeCAD (LGPL)             │── Onshape
                     │                              │── SolidWorks
                     │                              │── Fusion 360
                     │                              │
  Library/API ───────┤── Replicad (MIT) ◄── US      │
                     │── CadQuery (Apache)          │
                     │── Build123d (Apache)         │
                     │── opencascade.js (LGPL)      │
                     │                              │
  AI/NLP Layer ──────┤── openscad-agent             │── Zoo Text-to-CAD
                     │── ProCAD (research)          │
                     │── CAD-Coder (research)       │
                     │── MCP servers (various)      │
                     │                              │
  ═══════════════════╪══════════════════════════════╪═══
  THE GAP ───────────┤── ??? ◄── NOBODY IS HERE     │
  (FOSS + Browser +  │   Browser-native FOSS CAD    │
   NLP + B-rep +     │   with NLP + STEP export     │
   Web App)          │   + parametric constraints   │
                     │                              │
```

**The gap is clear. The building blocks are proven. The research says it works. Time to build.**

---

## References

### Geometry Kernels
- [opencascade.js](https://github.com/donalffons/opencascade.js) — OCCT WASM port
- [planegcs](https://github.com/Salusoft89/planegcs) — FreeCAD constraint solver in WASM
- [Replicad](https://github.com/sgenoud/replicad) — TypeScript CAD API (MIT)
- [Chili3D](https://github.com/xiangechen/chili3d) — Browser CAD (AGPL)

### Research Papers
- [ProCAD](https://arxiv.org/abs/2602.03045) — Two-agent clarification + generation (Feb 2026)
- [Text2CAD](https://github.com/SadilKhan/Text2CAD) — NeurIPS 2024 Spotlight
- [CAD-Coder](https://arxiv.org/abs/2505.14646) — Image → CadQuery (MIT, May 2025)
- [CAD-Recode](https://github.com/filaPro/cad-recode) — Point cloud → CadQuery, SOTA with small model
- [STEP-LLM](https://arxiv.org/abs/2601.12641) — Direct STEP generation (Jan 2026)
- [CAD-Llama](https://arxiv.org/abs/2505.04481) — Structured Parametric CAD Code

### MCP Servers
- [mcp-cadquery](https://github.com/bertvanbrakel/mcp-cadquery) — CadQuery MCP (Python)
- [onshape-mcp](https://github.com/hedless/onshape-mcp) — Onshape MCP (45 tools)
- [freecad-mcp](https://github.com/neka-nat/freecad-mcp) — FreeCAD MCP (591 stars)

### Commercial Reference
- [Zoo.dev](https://zoo.dev) — KCL language + proprietary geometry engine
- [KittyCAD/modeling-app](https://github.com/KittyCAD/modeling-app) — Zoo's open-source GUI (MIT)
