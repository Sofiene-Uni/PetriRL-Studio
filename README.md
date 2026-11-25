# PetriRL Studio

Web app to train or use reinforcement learning agents that schedule job shops (JSSP) on a colored timed
Petri net, explore the plan as an interactive Gantt chart, and replay the episode on the net.

## Run

```bash
pip install -r requirements.txt          # CPU torch is enough: pip install torch --index-url https://download.pytorch.org/whl/cpu
python run.py                            # http://localhost:5000
FLASK_CONFIG=production python run.py    # settings: config.py
pip install -r requirements-dev.txt && pytest       # tests
```

## Structure

```
run.py                      entry point: app = create_app()
config.py                   settings per environment (development, production, testing)

engine/                     simulation and RL, no web dependency (scripts, notebooks, the app)
  core/                     Petri net blocks, the JSSP net, the simulator
  instances/                instance data and scales, file formats, generators
  features/                 observation (look-ahead) and lower bounds
  envs/                     gymnasium environments + registry: basic (dispatching), hyper (hyper-heuristic)
  policies/                 14 job-selection heuristics (rules and hyper-heuristic actions), PPO mask gradient

studio/                     the Flask app
  __init__.py               create_app(): config, storage, stock content, blueprints, error handlers
  errors.py                 JSON errors for /api, HTML errors for pages
  blueprints/
    __init__.py             register_blueprints(): the one place to add a blueprint
    pages.py                /            (single page app shell)
    api/__init__.py         /api         (parent blueprint, /api/health)
    api/instances.py        /api/instances
    api/agents.py           /api/agents
    api/benchmarks.py       /api/benchmarks
    api/runs.py             /api/solve, /api/runs, /api/demo
    api/training.py         /api/train
  services/                 business logic, no HTTP: blueprints and scripts call it
    storage.py              data and stock folders, JSON records
    benchmark_catalog.py    benchmark catalog: problem type -> family -> instance, bounds, content matching
    instance_library.py     benchmarks, uploads and random instances; reference value for the gap
    agent_library.py        stock, trained and uploaded agents, rules
    episode_runner.py       runs instance x agent, records every firing for the replay
    training_jobs.py        background MaskablePPO training with live progress
  templates/                base.html, partials/, index.html
  static/css/               base, layout, components, views/*, responsive (loaded in that order)
  static/js/
    main.js                 router: ROUTES table, #/<page>/<arg>
    core/                   api client, DOM builders, colors, formatting, toasts/tooltip, shared state
    components/             multi-select (dropdown), pickers (instances, agents), gantt, petri-player, dropzone,
                            instance-actions, results-table, learning-chart, segmented
    views/                  home, solve, run, train, history

stock/                      shipped content
  benchmarks/               catalog.json + jssp/<family>/<instance>.txt (242 instances, read in place)
  agents/                   PPO 6x6, PPO 6x6 wait, PPO 15x15 (+ .json metadata), copied to data/ at first start
data/                       created at run time (instances, agents, runs); set PETRIRL_DATA_DIR to move it
tools/train_stock.py        trains a stock agent from the command line
tools/import_benchmarks.py  rebuilds stock/benchmarks from the source compilation
tests/                      engine/ (formats, feasible schedules, standby), api/ (Flask test client, short training)
```

The layers depend in one direction only: `views (JS) -> /api -> blueprints -> services -> engine`.

## How to extend

| You want | Do this |
|---|---|
| A new API resource | `studio/blueprints/api/<name>.py` with a blueprint, register it in `api/__init__.py`; logic goes in `studio/services/<name>.py` |
| A new HTML page outside the app (e.g. docs) | blueprint in `studio/blueprints/`, one line in `register_blueprints()`, template extending `base.html` |
| A new page in the app | `static/js/views/<name>.js` exporting `async (root, arg) => cleanup`, one line in `ROUTES` (main.js), a link in `templates/partials/topbar.html`, optional `css/views/<name>.css` |
| A new net variant (transport, energy, tools) | `engine/envs/<name>.py` with an Env class that has `name`, `obs_dim()` and `size_from_spaces()`, add it to `ENVS`; agents store their `env`, so training and solving pick it up |
| A new dispatching rule | a `JobRule` subclass in `engine/policies/heuristics.py`, added to `HEURISTICS`: it becomes a baseline and a hyper-heuristic action |
| A new instance format | a branch in `engine/instances/formats.py` + a test in `tests/engine/test_formats.py` |
| A new setting | `config.py`, read it with `current_app.config` in a blueprint and pass it to the service |

## Environments

Chosen on the home page (top bar chip); Train and Solve follow the choice.

| Env | One agent action | Actions | Options |
|---|---|---|---|
| `basic` Dispatching | release one job onto its next machine (or wait, see below) | one per job (+ wait) | wait action |
| `hyper` Hyper-heuristic | pick one of 14 heuristics, which makes the next k dispatching decisions | 14 | k (decisions per action) |

The 14 heuristics (`engine/policies/heuristics.py`, from PetriRL envs/shu): FIFO, LIFO, SPT, LPT, SPS, LPS, LTWR, MTWR,
SPSR, LPSR, SPTN, LPTN, SWT, LWT. They only score actions enabled by the guard function, so they never propose an
infeasible action. As baselines in Solve, one heuristic runs the whole episode (plus RANDOM); choosing the same
heuristic at every step of the hyper env gives exactly that schedule (tested). In the replay of a hyper-heuristic
run, each released job shows the heuristic that chose it, and the policy view shows the probabilities over heuristics.

## Simulation theme

The replay (net, inspector, transport) and the home replay have a Dark / Light switch, saved in the browser.
Colors drawn in SVG come from `static/js/core/sim-theme.js`; the panel colors are the `.sim` CSS variables in
`css/views/run.css`. Switching keeps the replay position and the zoom.

## Masked actions

At each decision, the Petri net guard function enables some agent actions and masks the others (a busy job, a
finished job, a wait with no running operation). In the replay, enabled agent transitions are blue with a pulsing
halo, masked ones are dimmed, dashed and crossed; the policy view lists the masked actions (their probability is 0).

## Benchmarks and the gap

Job shop benchmarks, by family: Fisher and Thompson (ft, 3), Lawrence (la, 40), Adams, Balas and Zawack (abz, 5),
Applegate and Cook (orb, 10), Storer, Wu and Vaccari (swv, 20), Yamada and Nakano (yn, 4), Taillard (ta, 80),
Demirkol, Mehta and Uzsoy (dmu, 80): 242 instances, ids `jssp:<name>`. Each has its literature lower bound and
best known solution with references, from Weise T (2020), github.com/thomasWeise/jsspInstancesAndResults.
Bounds improved after 2020 are not included: set your own value with `PATCH /api/instances/<id> {"best_known": v}`
(refused below the proven lower bound).

The gap of a run is `(makespan - reference) / reference`. The reference is the optimum when it is proven
(best known = lower bound), otherwise the best known solution; instances without one (random, your own) use the
computed bound max(longest job, busiest machine). An uploaded file with the same operations as a benchmark (tools
ignored) gets the benchmark's values, e.g. sl00 is ta01. A new problem type (flexible job shop...) is a new key in
`catalog.json` plus an env whose `problem_types` lists it.

## Policy view

In the replay, the inspector shows the actor network (state, hidden layers, one output per enabled action) pulsing
on each decision, the action probabilities, and the confidence `1 - H(p) / log(n)` over the n enabled actions
(1: all weight on one action, 0: uniform; "forced" when only one action is enabled). The confidence strip shows it
for every decision of the episode; click it to jump. Rules have no probabilities.

## Wait action (standby)

An agent can get one more action besides "release job j": wait until the next operation finishes.
It is chosen when training (Train > Wait action) and stored with the agent.

| Mode | When waiting is enabled |
|---|---|
| `off` | never (the agent releases a job whenever one can start) |
| `on` | whenever an operation is running |
| `gt` | only when another job could reach the machine before the free job would finish there (Giffler-Thompson condition, `engine/features/bounds.py: gt_condition`) |

`on` and `gt` have the same action space and only differ in the mask, so an agent's mode can be switched
with `PATCH /api/agents/<id>` `{"standby": "gt"}`. Uploaded agents with a wait action start as `on`.
In the replay, the wait transition sits next to the job choices; waits show in the decision log and inspector.

## Instance formats

| Format | First line | Job rows |
|---|---|---|
| Standard (OR-Library) | `n_jobs n_machines` | `machine time machine time ...` |
| Taillard | `n_jobs n_machines` | `n_jobs` rows of times, then `n_jobs` rows of machines |
| PetriRL / Solax | `n_jobs n_machines n_tools` | `machine tool time ...` |

Machines numbered from 0 are shifted to 1..n.

## Notes

- A learned agent solves only instances of the size it was trained on (the net and the observation
  depend on it). The size is read from the agent's spaces; other pairs are skipped.
- Uploaded agents run with `normalize=True` and no standby, as in PetriRL `train.py`. Agents saved by
  PetriRL reference the module `mask_gradient`; the app maps it to `engine.policies.mask_gradient`.
- Training jobs run one at a time in a thread of the web process and are listed until the server restarts;
  the agents they save are kept. For several users or long trainings, move `training_jobs` to a task queue
  (e.g. RQ or Celery); the blueprint and the front end stay the same.
- The stock agents are short demonstration trainings: PPO 6x6 (61 on ft06), PPO 6x6 wait with `gt` (60 on ft06,
  optimum 55), PPO 15x15 (1427 on ta01, optimum 1231), PPO HH 6x6 (k = 3) and PPO HH 15x15 (k = 5, on ta01-ta10).
- `python tools/check_js_imports.py` (also run by the tests) checks that every front-end module imports what it uses
  and that no optional child is passed to the native `append` / `replaceChildren` (it would render as "null").
- sl00 is ta01 with a tool column: the basic net ignores tools, so both give the same results.
