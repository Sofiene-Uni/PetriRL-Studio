"""JSSP simulation on the colored timed Petri net (adapted from PetriRL Simulator)."""
import numpy as np

from engine.features.bounds import gt_condition
from engine.features.observation import get_obs_lookahead, lookahead_scale
from engine.core.petri_net import PetriNet


STANDBY_MODES = {
    "off": "no wait action",
    "on": "wait allowed whenever an operation is running",
    "gt": "wait allowed only when it can shorten the makespan (Giffler-Thompson condition)",
}


def standby_mode(value):
    """Normalizes a standby setting: False/None -> "off", True -> "on", or one of STANDBY_MODES."""
    if value in (None, False):
        return "off"
    if value is True:
        return "on"
    if value not in STANDBY_MODES:
        raise ValueError(f"standby must be one of {', '.join(STANDBY_MODES)}")
    return value


class Simulator(PetriNet):
    """standby          : "off", "on" or "gt" (see STANDBY_MODES). With "on"/"gt" the last action waits
                       until the next operation finishes.
    normalize        : observation scaled by the instance scales, reward scaled by the lower bound.
    random_instances : each reset draws a random instance with the same size and statistics.
    pool             : list of job_sequences of the same size; each reset picks one of them.
    """

    def __init__(self, instance, standby=False, normalize=False, random_instances=False, pool=None, seed=None):
        self.standby_mode = standby_mode(standby)
        super().__init__(instance, standby=self.standby_mode != "off")
        self.normalize = normalize
        self.random_instances = random_instances
        self.pool = pool or [instance.base_sequences]
        self.rng = np.random.default_rng(seed)
        self.action_map = self.action_mapping()
        self.mask = []
        self.petri_reset()

    def update_scales(self):
        self.obs_scale = lookahead_scale(self) if self.normalize else None
        self.reward_scale = float(self.instance.scales["lb"]) if self.normalize else 1.0

    def set_observer(self, fn):
        for t in self.transitions.values():
            t.observer = fn

    def get_state(self):
        obs = get_obs_lookahead(self)
        return obs if self.obs_scale is None else obs / self.obs_scale

    def petri_reset(self):
        if len(self.pool) > 1 or self.random_instances:
            base = self.pool[int(self.rng.integers(len(self.pool)))]
            if self.random_instances:
                self.instance.sample_like(self.rng, base=base)
            else:
                self.instance.set_sequences(base)
        self.update_scales()
        self.clock = 0
        self.interaction_counter = 0
        self.job_free = {}          # job -> clock at which its last operation finished (SWT / LWT rules)
        self.clear_petri()
        self.add_tokens()

    def action_mapping(self):
        controlled = self.cache["controllable_transitions"]
        self.standby_index = next((i for i, t in enumerate(controlled) if t.role == "standby"), None)
        return dict(enumerate(controlled))

    def is_terminal(self):
        return sum(len(p.token_container) for p in self.cache["delivery_places"]) >= self.number_of_ops

    def time_tick(self):
        for p in self.cache["process_places"] + self.cache["buffer_places"]:
            p.tick()
        for buffer in self.cache["machine_buffer"]:
            for token in buffer.token_container:
                token.buffer_accumulator += 1
        self.clock += 1

    def sort_tokens(self):
        """Routes tokens of the sorting places by job color (job_sorting) or machine color (machine_sorting)."""
        color_index = {"job_sorting": 0, "machine_sorting": 1}
        for place in self.cache["sorting_places"]:
            i = color_index[place.role]
            for token in place.token_container.copy():
                for transition in place.children:
                    if token.color[i] == transition.color:
                        transition.fire(self.clock)
                        break

    def refresh_state(self):
        self.sort_tokens()
        for transition in self.cache["auto_no_sort"]:
            if transition.check_state():
                transition.fire(self.clock)

    def operation_running(self):
        return any(p.token_container for p in self.cache["machine_processing"])

    def next_event(self):
        if not self.operation_running():
            return 0
        ticks = 0
        while not self.is_terminal():
            self.time_tick()
            ticks += 1
            if self.fire_timed() > 0:
                break
        self.guard_function()
        return ticks

    def guard_function(self):
        self.refresh_state()
        mask = [t.check_state() for t in self.action_map.values()]
        if self.standby_index is not None:
            mask[self.standby_index] = self.operation_running() and (self.standby_mode != "gt" or gt_condition(self))
        self.mask = mask
        return mask

    def real_action_available(self):
        mask = self.guard_function()
        return any(m for i, m in enumerate(mask) if i != self.standby_index)

    def fire_timed(self):
        completed = 0
        for place in self.cache["process_places"]:
            if place.token_container:
                token = place.token_container[0]
                if token.logging[place.uid][2] >= token.time_features[0]:
                    self.job_free[token.color[0]] = self.clock
                    place.children[0].fire(self.clock)
                    completed += 1
        self.refresh_state()
        return completed

    def fire_controlled(self, transition):
        if transition.role == "standby":
            self.next_event()
        elif all(p.token_container for p in transition.parents):
            transition.fire(self.clock)
        self.interaction_counter += 1

    def interact(self, action):
        """Applies one action, then advances time until a real decision is possible."""
        transition = self.action_map[int(action)]
        self.fire_controlled(transition)
        while not self.real_action_available():
            self.time_tick()
            self.fire_timed()
            if self.is_terminal():
                break
        return {"standby": transition.role == "standby"}

    def schedule(self):
        """Finished operations: job, rank, machine, start, end (read from the token logs)."""
        processing = {p.uid: p.color for p in self.cache["machine_processing"]}
        rows = []
        for place in self.cache["delivery_places"]:
            for tok in place.token_container:
                for uid, entry in tok.logging.items():
                    if uid in processing:
                        rows.append({"job": tok.color[0], "rank": tok.rank, "machine": processing[uid],
                                     "start": entry[0], "end": entry[0] + entry[2], "p": tok.time_features[0]})
        return sorted(rows, key=lambda r: (r["machine"], r["start"]))
