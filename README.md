# PetriRL Studio

Web application of the [PetriRL framework](https://github.com/Sofiene-Uni/PetriRL-Framework): train or use
reinforcement learning agents that schedule job shops on a colored timed Petri net, and replay every decision.

![PetriRL Studio replay](docs/images/replay-overview.gif)

## Features

- **Solve** your own instances (drag and drop) or 242 classic benchmarks (ft, la, abz, orb, swv, yn, ta, dmu), and
  compare agents and dispatching rules by their gap to the optimum or best known solution.
- **Plan**: interactive Gantt chart with job routes and critical path, export as CSV, PNG or SVG.
- **Replay** the episode on the Petri net, with enabled and masked actions and the agent's probabilities and confidence.
- **Train** MaskablePPO agents (sb3-contrib) with a live learning curve.
- **Environments**: dispatching (one action releases one job, optional wait) and hyper-heuristic (one action picks one
  of 14 dispatching rules for the next k decisions).

![Replay with the policy network, confidence and decisions](assets/replay-policy.gif)

## Quick start

```bash
git clone https://github.com/Sofiene-Uni/PetriRL-Studio.git
cd PetriRL-Studio
pip install -r requirements.txt
python run.py          # http://localhost:5000
```

Tests: `pip install -r requirements-dev.txt && pytest`

## Structure

```
engine/     Petri net, simulator, gym environments, heuristics (no web dependency)
studio/     Flask app: blueprints (pages, /api), services, templates, static (JS, CSS)
stock/      benchmark instances and pretrained demo agents
tools/      stock agent training, benchmark import, front-end checks
tests/      engine and API tests
```

## Credit and citation

Developed by **Sofiene Lassoued** during his PhD at **South Westphalia University of Applied Sciences
(Fachhochschule Südwestfalen, FH SWF)**. You are welcome to use, modify and share it; please keep this credit
and cite the PetriRL paper when the app or its results appear in scientific work:

```bibtex
@article{lassoued2024petrirl,
  title   = {Introducing PetriRL: An innovative framework for JSSP resolution integrating Petri nets and event-based reinforcement learning},
  author  = {Lassoued, Sofiene and Schwung, Andreas},
  journal = {Journal of Manufacturing Systems},
  volume  = {74},
  pages   = {690--702},
  year    = {2024},
  doi     = {10.1016/j.jmsy.2024.04.028}
}
```
