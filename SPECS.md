# Jolty

**Fast, local-first intelligent E2E testing**

Jolty is an intelligent end-to-end testing framework designed to test web applications with the lowest practical latency and minimal dependence on large generative models.

The core idea is to move large language models out of the normal execution hot path.

Instead of asking a powerful LLM to inspect the browser and decide the next action at every step, Jolty uses a **small, specialized decision model** for most navigation decisions.

Large models are only used when they provide meaningful value: planning, ambiguity resolution, recovery, and dataset generation.

---

# 1. The problem

Most current AI browser agents follow a loop similar to:

```text
Browser
   ↓
DOM / screenshot
   ↓
Large LLM
   ↓
Next action
   ↓
Playwright
   ↓
New browser state
   ↓
Large LLM
   ↓
...
```

This works, but it introduces several disadvantages:

* high latency per interaction;
* expensive token usage;
* API cost on every test execution;
* dependency on external inference providers;
* unnecessary use of large models for simple decisions;
* unpredictable execution times;
* model switching and prompt-cache issues;
* large amounts of browser state repeatedly sent to models.

Many browser decisions are significantly simpler than the capabilities of a large generative model.

Examples include:

```text
Which button should I click?

Which input should receive this value?

Should I wait?

Should I scroll?

Has this goal already been completed?
```

Jolty is built around the assumption that these decisions can usually be handled by a much smaller model.

---

# 2. Core hypothesis

Jolty's primary technical hypothesis is:

> A large percentage of E2E browser navigation decisions can be solved by a small specialized discriminative model when it receives a well-structured browser state and a small set of relevant candidate actions.

Instead of:

```text
browser state
     ↓
GPT / Claude
     ↓
next action
```

Jolty aims for:

```text
browser state
     ↓
candidate retrieval
     ↓
small decision model
     ↓
next action
```

The target is to make normal decisions in milliseconds or tens of milliseconds rather than hundreds or thousands.

---

# 3. System 1 / System 2 architecture

Jolty uses a hybrid decision architecture.

## System 1

System 1 is the fast path.

It consists of a small local model specialized in browser interaction.

Its responsibilities include decisions such as:

```text
click
type
select
scroll
wait
back
done
```

and choosing the correct target element.

Expected characteristics:

* local inference;
* low latency;
* low memory requirements;
* predictable outputs;
* model permanently loaded in memory;
* optimized specifically for browser navigation;
* no text generation.

## System 2

System 2 is a large general-purpose model.

It is only used when necessary.

Responsibilities include:

* initial test planning;
* ambiguous browser states;
* recovery from unexpected situations;
* difficult semantic reasoning;
* generating training labels;
* resolving failures from the fast model.

Conceptually:

```text
                 Natural-language test
                          │
                          ▼
                    ┌───────────┐
                    │  Planner  │
                    │ Large LLM │
                    └─────┬─────┘
                          │
                          ▼
                     Test graph
                          │
                          ▼
                     Playwright
                          │
                          ▼
                    Browser state
                          │
                          ▼
                Candidate retrieval
                          │
                          ▼
                Fast decision model
                          │
              ┌───────────┴───────────┐
              │                       │
       high confidence          low confidence
              │                       │
              ▼                       ▼
          Executor               Large LLM
              │                       │
              └───────────┬───────────┘
                          ▼
                       Validate
                          │
                          ▼
                     Next state
```

---

# 4. Test planning

A user should be able to define a test naturally.

Example:

```text
Make sure I can log in, change my username,
and then log out successfully.
```

The planner converts this into structured goals:

```text
GOAL 1
authenticated = true

GOAL 2
profile_settings_reached = true

GOAL 3
username_changed = true

GOAL 4
logged_out = true
```

The planner does not need to control every browser interaction.

Its role is to define what needs to happen.

Execution is delegated to the fast path.

This separation is important:

```text
planning ≠ execution
```

Large models are useful for planning.

Small specialized models can potentially be much better suited for repeated execution.

---

# 5. Browser-state representation

Jolty should avoid sending raw HTML to the model.

A page may contain thousands of DOM nodes:

```text
2,000 nodes
5,000 nodes
10,000+ nodes
```

Most of these are irrelevant for interaction.

Instead, Jolty should construct a compact representation using information such as:

* accessibility roles;
* ARIA labels;
* visible text;
* labels;
* interactive state;
* enabled / disabled state;
* visibility;
* bounding information when useful;
* selected values;
* navigation state.

For example:

```text
URL: /login

[1] input    "Email"
[2] input    "Password"
[3] button   "Log in"
[4] button   "Continue with Google"
[5] link     "Forgot password?"
```

This is significantly more useful to the decision model than raw HTML.

---

# 6. Candidate extraction

The model should not inspect every browser element.

Jolty first filters the page deterministically.

Example:

```text
1,500 DOM nodes
      ↓
visible + interactive filtering
      ↓
83 relevant elements
```

Possible filters include:

```text
visible
interactive
enabled
ARIA-relevant
focusable
clickable
editable
```

This filtering should be extremely cheap.

---

# 7. Candidate retrieval

Even 80 candidates are too many for a small decision model.

A retrieval layer reduces the candidate set further.

Example:

```text
83 candidates
     ↓
retrieval / ranking
     ↓
top 8–15
```

Initial retrieval should remain simple.

Possible signals:

```text
role matching
text matching
label matching
goal keyword overlap
visibility
interaction history
element state
navigation context
```

For example:

```text
Current goal:
"Change password"

Candidates:

Security                0.94
Account settings        0.82
Profile                 0.51
API keys                0.18
Log out                 0.03
```

Only the highest-ranking candidates reach the model.

---

# 8. Avoiding unnecessary embeddings

The MVP should not immediately depend on a vector database or expensive embedding pipeline.

Initially:

```text
heuristics
+
lexical matching
+
simple scoring
```

may be enough.

If retrieval quality later becomes a bottleneck, Jolty can introduce:

```text
small embedding model
cross-encoder
semantic reranker
```

The architecture should support this evolution without requiring it from the start.

---

# 9. Browser Decision Model

The long-term core component of Jolty is the **Browser Decision Model**, internally abbreviated as:

```text
BDM
```

Its conceptual function is:

```text
f(
  goal,
  browser_state,
  candidate_actions,
  history
)

→ P(action)
```

Example input:

```text
GOAL:
Log in

URL:
/login

STATE:
email_filled = true
password_filled = true

CANDIDATES:

[1] Email input
[2] Password input
[3] Log in button
[4] Continue with Google
```

Possible output:

```text
click(3)        0.96
type(1)         0.01
type(2)         0.01
wait            0.01
done            0.01
```

Jolty executes the highest-confidence valid action.

---

# 10. Action model

The basic action vocabulary should remain intentionally small.

Initial set:

```text
click
type
select
scroll
wait
back
done
```

Additional actions can be added later when required.

Keeping the action space constrained has several advantages:

* easier training;
* easier evaluation;
* better observability;
* lower model complexity;
* fewer hallucinated actions.

---

# 11. Action and target separation

An alternative architecture is to separate two decisions.

First:

```text
What action should be executed?
```

Example:

```text
click    0.97
type     0.01
scroll   0.01
wait     0.01
```

Then:

```text
Which element should receive that action?
```

Example:

```text
[1] Profile              0.03
[2] Account              0.11
[3] Personal settings    0.85
[4] Log out              0.01
```

This approach may be easier to train and evaluate than predicting the complete action directly.

Both approaches should eventually be benchmarked.

---

# 12. Ranking-based modeling

Rather than training the model around fixed element classes, Jolty can score candidate actions independently.

For example:

```text
goal + browser_state + candidate_1 → 0.06
goal + browser_state + candidate_2 → 0.92
goal + browser_state + candidate_3 → 0.14
goal + browser_state + candidate_4 → 0.03
```

Then:

```text
best_candidate = argmax(score)
```

This is attractive because the number of browser elements is dynamic.

Jolty does not need classes such as:

```text
element_1
element_2
...
element_100
```

to exist permanently.

---

# 13. Initial model: Laya

Jolty should not start by training a new model.

The MVP should first use an existing open-source fast decision model such as **Laya**.

Its purpose is to validate the core hypothesis:

> Can a small non-generative model correctly handle a significant percentage of browser decisions?

Laya should be treated as a baseline rather than as a permanent architectural dependency.

The long-term path is:

```text
Laya
  ↓
collect traces
  ↓
build dataset
  ↓
train Jolty BDM
  ↓
export ONNX
  ↓
replace Laya
```

The rest of the runtime should ideally remain unchanged.

---

# 14. Confidence-based fallback

The fast model does not need to be perfect.

Jolty should explicitly support uncertainty.

Conceptually:

```text
high confidence
      ↓
execute

medium confidence
      ↓
additional validation

low confidence
      ↓
System 2 fallback
```

Example:

```text
confidence >= 0.85
→ execute directly

0.60 <= confidence < 0.85
→ verify or apply secondary decision logic

confidence < 0.60
→ use large LLM
```

These thresholds are placeholders.

They must be learned experimentally.

The real requirement is proper confidence calibration.

---

# 15. Confidence calibration

A model returning:

```text
confidence = 0.95
```

does not automatically mean it is correct 95% of the time.

Jolty therefore needs calibration evaluation.

We should measure:

```text
predicted confidence
vs
actual correctness
```

A good model should behave approximately like:

```text
0.90 confidence
≈
90% accuracy in that confidence bucket
```

This will directly determine safe fallback thresholds.

---

# 16. Large-model fallback

When the BDM is uncertain, System 2 receives the same structured state.

Example:

```text
Current goal:
Open account security settings

Candidates:

[12] Profile
[15] Account
[17] Personal settings
[19] Security
```

If the BDM produces:

```text
Profile              0.27
Account              0.26
Personal settings    0.23
Security             0.24
```

the state is ambiguous.

The large model resolves the action.

The result is then both:

1. executed;
2. stored as potential training data.

---

# 17. Learning from fallbacks

Every fallback is valuable.

When System 1 fails or becomes uncertain:

```text
browser state
+
goal
+
candidates
+
BDM prediction
+
teacher decision
+
execution result
```

can be stored.

Over time, these examples produce a high-value dataset consisting specifically of cases that the fast model finds difficult.

This enables an active-learning style loop:

```text
BDM
 │
 │ uncertain
 ▼
Teacher LLM
 │
 ▼
Correct decision
 │
 ▼
Dataset
 │
 ▼
Train better BDM
 │
 └──────────────→ fewer fallbacks
```

The system should improve as more tests are executed.

---

# 18. Dataset

A navigation example could contain:

```text
test_id
run_id
step_id

goal
url
browser_state

candidate_elements
candidate_actions

selected_action

model
confidence

teacher_action
validation_result

latency
```

Conceptual example:

```text
GOAL:
Log in

URL:
/login

CANDIDATES:
1. Home
2. Log in
3. Register
4. Pricing

ACTION:
click(2)

OUTCOME:
success
```

---

# 19. Hard cases

The dataset must eventually include difficult UI scenarios such as:

```text
cookie banners
modals
popovers
loading states
skeleton UIs
duplicate labels
dropdown menus
responsive layouts
iframes
SPAs
delayed network responses
form validation
pagination
infinite scroll
dynamic content
disabled controls
navigation redirects
```

Easy examples alone would produce misleading evaluation results.

---

# 20. Dataset generation

A large model can initially act as a teacher.

Pipeline:

```text
Browser
   ↓
State extractor
   ↓
Teacher LLM
   ↓
Next action
   ↓
Playwright execution
   ↓
Validation
   ↓
Store training example
```

This makes it possible to generate large datasets without manually labeling every action.

However, teacher outputs should not automatically be considered ground truth.

The outcome should be validated whenever possible.

---

# 21. Deterministic validation

E2E testing has a major advantage over generic autonomous agents:

many results can be validated deterministically.

Examples:

```text
URL changed
element appeared
element disappeared
toast became visible
input value changed
request succeeded
HTTP 500 occurred
console error appeared
user became authenticated
expected state was reached
```

Therefore:

```text
AI chooses action
      ↓
Playwright executes
      ↓
deterministic validator
```

should be preferred whenever possible.

This reduces the need for another model to determine whether the action succeeded.

---

# 22. Test compilation

Jolty should eventually avoid using AI even when repeating known tests.

First successful execution:

```text
Natural-language goal
        ↓
AI-assisted exploration
        ↓
Successful execution trace
```

Then:

```text
Successful trace
      ↓
Compiler
      ↓
Deterministic Playwright test
```

Future runs can use:

```text
Playwright only
```

until the test breaks.

This creates a useful lifecycle:

```text
explore once
compile
execute cheaply many times
```

---

# 23. Self-healing tests

If a generated deterministic test later fails:

```text
Playwright test
      ↓
FAIL
```

Jolty can attempt recovery.

First:

```text
BDM
```

Then, if necessary:

```text
System 2 LLM
```

If a new valid path is found:

```text
new trace
   ↓
validation
   ↓
update deterministic test
```

This turns Jolty into a self-healing testing system rather than simply an AI browser agent.

---

# 24. Runtime stack

The Jolty execution runtime should remain as small and fast as possible.

Recommended stack:

```text
TypeScript
Node.js 24 LTS
Playwright
ONNX Runtime Node
SQLite
Vitest
```

Node should currently be preferred over Bun for the main runtime.

The reason is not raw JavaScript benchmark performance.

The important dependencies are:

```text
Playwright
+
ONNX Runtime
```

Both have mature first-class Node support.

For Jolty, reliability in long-running browser and native inference workloads is more valuable than improving JavaScript startup time.

---

# 25. Bun

Bun can still be useful for development tooling.

Possible uses:

```text
bun install
bun run build
bun run lint
bun run scripts
```

But the production runner should initially remain:

```text
node
```

If future benchmarks demonstrate that Bun becomes stable enough for Jolty's complete workload and provides a measurable hot-path advantage, the decision can be revisited.

The runtime should be selected from real Jolty benchmarks rather than generic runtime benchmarks.

---

# 26. Training stack

Model development should remain separate from the execution runtime.

Recommended stack:

```text
Python
PyTorch
Hugging Face Transformers
PEFT
DuckDB
Parquet
```

Conceptually:

```text
              Jolty project
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼

       Runtime             Training

      TypeScript            Python
      Node.js               PyTorch
      Playwright            Transformers
      ONNX Runtime          PEFT
      SQLite                DuckDB
                            Parquet
          │                   │
          └──────────┬────────┘
                     ▼
                model.onnx
```

The output of the training pipeline should be an optimized model deployable directly inside the Node runtime.

---

# 27. Model architecture

Jolty should not train a language model from scratch.

Instead, it should fine-tune a pretrained encoder.

Potential starting architectures:

```text
ModernBERT
DeBERTa
MiniLM
DistilBERT
mmBERT
```

ModernBERT-base is particularly interesting because it is small enough to experiment with while retaining strong language representations.

The model does not need to:

```text
write code
write prose
answer questions
generate JSON
reason about arbitrary knowledge
```

It needs to learn one narrow problem:

```text
browser state
+
goal
+
candidate
     ↓
is this the correct next action?
```

That specialization is Jolty's advantage.

---

# 28. Fine-tuning strategy

Training complexity should increase only when necessary.

Recommended progression:

```text
1. existing model zero-shot baseline

2. frozen encoder + decision head

3. LoRA / PEFT

4. partial fine-tuning

5. full fine-tuning
```

There is no reason to immediately fine-tune hundreds of millions of parameters.

The simplest approach that achieves the required accuracy should win.

---

# 29. Training is not the hardest part

The technically difficult part is unlikely to be running:

```text
model.train()
```

The real challenge is producing a high-quality dataset.

Jolty needs:

```text
correct labels
hard negatives
diverse websites
realistic flows
failure cases
confidence calibration
proper train/test separation
```

A poorly designed dataset can produce impressive-looking benchmarks while failing on real websites.

---

# 30. Performance philosophy

Performance is a core product requirement.

The hot path is:

```text
Browser
  ↓
State extraction
  ↓
Candidate retrieval
  ↓
Tokenization
  ↓
ONNX inference
  ↓
Decision
  ↓
Playwright action
```

Every component should be measured independently.

Example telemetry:

```text
state extraction        1.8 ms
candidate retrieval     0.7 ms
serialization           0.2 ms
tokenization            2.7 ms
ONNX inference         11.4 ms
decision decoding       0.1 ms
────────────────────────────
decision pipeline      16.9 ms
```

Without this breakdown, optimization becomes guesswork.

---

# 31. Persistent browser

Browser startup should never happen for every step.

Jolty should keep Chromium alive:

```text
Chromium process
████████████████████████████████
```

and create lightweight browser contexts for isolated tests.

Example:

```text
Chromium

├── Context A
├── Context B
├── Context C
└── Context D
```

This improves both latency and throughput.

---

# 32. Persistent model

The same principle applies to inference.

Bad:

```text
step
→ load model
→ infer
→ unload
```

Correct:

```text
process startup
     ↓
load BDM
     ↓
████ model remains resident ████
     ↓
infer
infer
infer
infer
```

Model-loading cost should disappear from per-step latency.

---

# 33. Single-process fast path

The MVP should avoid:

```text
Node
 ↓ HTTP
Python inference service
 ↓
Node
```

This introduces unnecessary:

```text
serialization
IPC
network stack
process scheduling
JSON parsing
```

Instead:

```text
Node process

Playwright
    ↓
Retriever
    ↓
ONNX Runtime
    ↓
Decision
```

should remain in the same runtime whenever possible.

---

# 34. Tokenization

Once inference becomes fast, tokenization can become a meaningful percentage of the total latency.

It must be measured separately.

If:

```text
inference = 8 ms
tokenization = 5 ms
```

then optimizing only the model misses a large part of the hot path.

Potential future optimizations include:

```text
faster tokenizer implementation
token cache
state-prefix reuse
native implementation
reduced input representation
```

---

# 35. Quantization

The final BDM should be benchmarked at different precisions.

For example:

```text
FP32
 ↓
FP16
 ↓
INT8
```

Potential benefits:

```text
lower RAM
lower memory bandwidth
lower inference latency
higher throughput
```

The best configuration should be determined based on:

```text
latency
accuracy
memory
throughput
```

rather than model size alone.

---

# 36. Latency mode and throughput mode

Jolty should eventually support two scheduling strategies.

## Latency mode

Optimized for one interactive test.

```text
state
  ↓
immediate inference
  ↓
action
```

No waiting for batching.

## Throughput mode

Optimized for CI.

Multiple tests can produce decisions simultaneously:

```text
Test A ─┐
Test B ─┤
Test C ─┼──→ inference batch
Test D ─┤
Test E ─┘
```

Batching may significantly increase total decisions per second.

---

# 37. Worker architecture

High-concurrency Jolty could eventually evolve toward:

```text
                 Scheduler
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
   Browser workers        Inference worker
          │                     │
      Chromium              BDM resident
      Chromium                  │
      Chromium              batch queue
```

This architecture should only be introduced after profiling demonstrates a need.

The MVP should stay simpler.

---

# 38. Storage architecture

Operational data should use SQLite.

Examples:

```text
runs
tests
steps
decisions
fallbacks
models
errors
```

Example:

```text
run_481

├── step_001
├── step_002
├── step_003
│    model=bdm-v1
│    confidence=.94
│    action=click
│    target=e14
│
└── step_004
     fallback=true
```

SQLite is ideal for a local-first developer tool and requires no additional infrastructure.

---

# 39. Dataset storage

Training datasets should not remain entirely inside SQLite.

Jolty should export them to Parquet:

```text
datasets/
└── navigation-v001/
    ├── train-000.parquet
    ├── train-001.parquet
    ├── validation.parquet
    └── test.parquet
```

DuckDB can then analyze them efficiently.

This gives Jolty:

```text
SQLite → operational state
Parquet → ML datasets
DuckDB → analytics / research
```

---

# 40. Observability

Jolty should treat observability as a first-class feature.

Every decision should answer:

```text
What was the goal?

What browser state was observed?

Which candidates were considered?

Which candidate was selected?

Which model made the decision?

What was the confidence?

How long did each stage take?

Was a fallback required?

Did the action succeed?
```

Example trace:

```text
STEP 14

goal
  → open account security settings

candidates
  [e42] Profile            .48
  [e45] Account            .37
  [e51] Security           .93

decision
  → click e51

model
  → jolty-bdm-v1

inference
  → 12.7 ms

pipeline
  → 17.9 ms

confidence
  → .93

fallback
  → no

result
  → success
```

This information is useful for:

* debugging;
* model evaluation;
* training;
* regression detection;
* performance optimization.

---

# 41. CLI-first design

Jolty should initially be a CLI tool.

Example:

```bash
jolty run auth.test.yml
```

Natural-language mode:

```bash
jolty run "verify that I can log in and change my username"
```

Debug browser:

```bash
jolty run auth.test.yml --headed
```

Trace:

```bash
jolty trace <run-id>
```

Benchmark:

```bash
jolty bench
```

Model evaluation:

```bash
jolty model eval jolty-bdm-v1
```

Dataset operations:

```bash
jolty dataset export
```

The CLI should remain fast, predictable, and script-friendly.

---

# 42. Dashboard

A dashboard should not be part of the initial MVP.

Initially:

```text
CLI
+
HTML report
+
Playwright trace
```

is enough.

A web dashboard becomes useful once Jolty has meaningful data such as:

```text
success rate
fallback rate
decision latency
model accuracy
dataset growth
regressions
```

At that point a lightweight React frontend may be justified.

---

# 43. Repository structure

A possible structure:

```text
jolty/
│
├── packages/
│   ├── browser/
│   │   ├── playwright/
│   │   ├── state-extractor/
│   │   └── actions/
│   │
│   ├── decision/
│   │   ├── laya/
│   │   ├── onnx/
│   │   ├── calibration/
│   │   └── fallback/
│   │
│   ├── retrieval/
│   │   ├── candidates/
│   │   └── ranking/
│   │
│   ├── core/
│   │   ├── planner/
│   │   ├── executor/
│   │   └── validator/
│   │
│   └── telemetry/
│
├── apps/
│   └── cli/
│
├── training/
│   ├── datasets/
│   ├── train/
│   ├── eval/
│   ├── calibration/
│   └── export-onnx/
│
├── benchmarks/
│
├── examples/
│
└── docs/
```

A simple workspace solution is preferable initially.

There is no need to introduce unnecessary infrastructure before the project grows.

---

# 44. MVP stack

The first version should remain intentionally small.

## Runtime

```text
TypeScript
Node.js 24 LTS
Playwright
ONNX Runtime
SQLite
Vitest
```

## ML / research

```text
Python
PyTorch
Transformers
PEFT
DuckDB
Parquet
```

Initially avoid:

```text
Redis
PostgreSQL
vector databases
Kafka
Kubernetes
microservices
distributed queues
complex dashboards
Rust rewrites
```

Each new technology should only be introduced because profiling or product requirements justify it.

---

# 45. Benchmark design

Jolty needs a defensible benchmark.

At minimum, compare three systems.

## A. LLM browser agent

```text
Browser
 ↓
Large LLM
 ↓
action
```

at every step.

## B. Jolty hybrid mode

```text
Browser
 ↓
BDM
 ↓
LLM fallback only when required
```

## C. Deterministic Playwright

Human-written test.

Measure:

```text
test success rate
step accuracy
total duration
decision latency
LLM calls
token consumption
cost per test
fallback rate
```

The same test scenarios should be used for all systems.

---

# 46. Key metrics

## Quality

```text
step accuracy
task success rate
goal completion rate
```

## Fast-path coverage

```text
percentage of decisions solved without System 2
```

This may be Jolty's most important metric.

For example:

```text
BDM:         92%
LLM fallback: 8%
```

could already represent an excellent result.

## Performance

```text
decision latency
total test duration
tests per second
browser idle time
```

## Cost

```text
tokens per test
LLM calls per test
cost per test
```

## Reliability

```text
incorrect actions
retries
dead ends
recovery rate
self-healing success rate
```

---

# 47. Candidate retrieval metrics

The retrieval system needs its own evaluation.

A critical metric is:

```text
Recall@K
```

If the correct element is not present in the top-K candidates, the BDM cannot select it.

For example:

```text
Recall@5  = 91%
Recall@10 = 97%
Recall@15 = 99%
```

This makes retrieval performance just as important as model accuracy.

---

# 48. Main risks

## Generalization

A model trained on a narrow set of websites may perform poorly on unfamiliar UI styles.

## Retrieval failure

The correct element may be removed before inference.

## Confidence calibration

The model may be confidently wrong.

## Dynamic interfaces

Modern SPAs introduce asynchronous states, overlays, transitions, and delayed content.

## Long-horizon reasoning

The BDM is designed for:

```text
next action
```

not:

```text
reason about the next 40 actions
```

Planning and execution therefore need to remain separate.

## Teacher quality

Large-model-generated labels are not guaranteed to be correct.

Outcome validation is essential.

---

# 49. Development phases

## Phase 1 — Fast-path prototype

Build:

```text
Playwright
browser-state extraction
candidate filtering
candidate ranking
Laya integration
confidence threshold
LLM fallback
telemetry
```

Goal:

> Determine whether the System 1 approach is viable.

---

## Phase 2 — Dataset generation

Store:

```text
browser state
goal
candidate set
selected action
teacher action
outcome
confidence
latency
```

Build a meaningful navigation dataset.

---

## Phase 3 — Jolty BDM v1

Fine-tune the first dedicated browser decision model.

Compare:

```text
Laya
vs
Jolty BDM
vs
large LLM
```

Measure:

```text
accuracy
latency
fallback rate
memory
throughput
```

---

## Phase 4 — Optimization

Explore:

```text
ONNX graph optimization
FP16
INT8
tokenization optimization
state caching
batch inference
candidate-ranking improvements
```

---

## Phase 5 — Test compilation

Convert successful AI-assisted traces into deterministic Playwright tests.

---

## Phase 6 — Self-healing

Use Jolty's decision engine to repair broken tests automatically.

---

## Phase 7 — Continuous learning

Use difficult production traces and fallbacks to continuously improve the BDM.

---

# 50. Jolty's main differentiation

Jolty should not be positioned as:

> another browser agent powered by AI.

The important distinction is:

> **Jolty moves generative AI out of the browser execution hot path.**

The normal path is:

```text
deterministic extraction
+
candidate retrieval
+
small local decision model
+
deterministic validation
```

A large LLM becomes an exception.

Not the default.

---

# 51. Performance target

The first target should be:

```text
Decision pipeline < 25 ms
```

excluding actual browser rendering/navigation time.

A more aggressive future target:

```text
Decision pipeline < 10 ms
```

on suitable hardware and an optimized Jolty model.

These are engineering goals, not assumptions.

Every stage needs to be benchmarked.

---

# 52. Project philosophy

Jolty should follow one important hierarchy:

```text
1. deterministic logic
2. heuristics
3. retrieval
4. small specialized model
5. large general-purpose model
```

The system should always use the cheapest and fastest method capable of making a reliable decision.

Large models are powerful.

That does not mean they should be used everywhere.

---

# 53. Project identity

## Name

**Jolty**

The name derives naturally from *jolt*: a quick movement or sudden burst of energy.

It fits the project's main characteristics:

```text
fast
short
lightweight
active
easy to type
easy to pronounce
```

CLI usage also reads naturally:

```bash
jolty run
jolty trace
jolty bench
jolty inspect
jolty model eval
```

---

# 54. Possible positioning

Primary:

> **Jolty — Fast, local-first intelligent E2E testing.**

Alternative:

> **Jolty — E2E testing without an LLM in the hot path.**

More technical:

> **Jolty — Low-latency browser testing powered by specialized decision models.**

Short:

> **Jolty — E2E at inference speed.**

---

# 55. Final vision

The long-term Jolty architecture becomes:

```text
                    Test intent
                        │
                        ▼
                     Planner
                        │
                        ▼
                    Test graph
                        │
                        ▼
                      Browser
                        │
                        ▼
                   State extractor
                        │
                        ▼
                     Retriever
                        │
                        ▼
                  Jolty BDM
                        │
             ┌──────────┴──────────┐
             │                     │
       high confidence       low confidence
             │                     │
             ▼                     ▼
          Executor              Teacher
             │                     │
             └──────────┬──────────┘
                        ▼
                    Validator
                        │
                        ▼
                       Trace
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
       Training dataset       Test compiler
             │                     │
             ▼                     ▼
       Better Jolty BDM    Deterministic E2E
```

The central goal is not to build a smaller version of a general browser agent.

The goal is to build a fundamentally different execution architecture where **most browser decisions do not require generative inference at all**.

The key research question for Jolty is therefore:

> **What percentage of real-world E2E browser decisions can be removed from the generative-LLM path without materially reducing test success rate?**

If that percentage is high, Jolty can offer a meaningful combination of:

```text
lower latency
lower cost
local execution
higher throughput
less token usage
better predictability
better observability
```

That is the core technical and product opportunity behind Jolty.
