"""Environment registry. A new net variant (transport, energy, tools...) is a new module here with an
Env class (usually a BasicEnv subclass) with `name`, `title`, `description`, `problem_types`, `options`,
`act(action)`, `action_keys()`, `obs_dim(n_jobs, n_machines)` and `size_from_spaces(n_obs, n_actions)`;
add it to ENVS and the app can train and run agents on it."""
from engine.envs.basic import BasicEnv
from engine.envs.hyper import HyperHeuristicEnv
from engine.envs.or_informed import OrInformedEnv

ENVS = {cls.name: cls for cls in (BasicEnv, OrInformedEnv, HyperHeuristicEnv)}
DEFAULT_ENV = BasicEnv.name


def get_env_class(name=DEFAULT_ENV):
    if name not in ENVS:
        raise ValueError(f"unknown environment '{name}', available: {', '.join(ENVS)}")
    return ENVS[name]


def make_env(instance, name=DEFAULT_ENV, **kwargs):
    return get_env_class(name)(instance, **kwargs)


__all__ = ["ENVS", "DEFAULT_ENV", "BasicEnv", "HyperHeuristicEnv", "OrInformedEnv", "get_env_class", "make_env"]
