"""PetriRL engine: JSSP as a colored timed Petri net + gymnasium environments (adapted from PetriRL).
No web dependency: usable from scripts, notebooks and the Studio app.

    engine/core       Petri net blocks, the JSSP net, the simulator
    engine/instances  instance data, file formats, generators
    engine/features   observation and lower bounds
    engine/envs       gymnasium environments (registry)
    engine/policies   dispatching rules, PPO mask gradient
"""
from engine.envs import make_env
from engine.instances import Instance, InstanceError, parse_instance

__all__ = ["Instance", "InstanceError", "parse_instance", "make_env"]
