"""Places, transitions and tokens of the colored timed Petri net (adapted from PetriRL)."""


class IdGen:
    uid_counter = 0

    @classmethod
    def generate_uid(cls):
        uid = cls.uid_counter
        cls.uid_counter += 1
        return str(uid)

    @classmethod
    def reset(cls):
        cls.uid_counter = 0


class Place:
    def __init__(self, label, type_="", role="", color=None, timed=False, show=True):
        self.uid = IdGen.generate_uid()
        self.label = label
        self.type = type_
        self.role = role
        self.color = color
        self.timed = timed
        self.show = show
        self.parents = []
        self.children = []
        self.token_container = []

    def add_arc(self, node, parent=True):
        (self.parents if parent else self.children).append(node)

    def tick(self, dt=1):
        for token in self.token_container:
            token.logging[self.uid][2] += dt


class Transition:
    def __init__(self, label, type_="", role="", color=None, timed=False, show=True):
        self.uid = IdGen.generate_uid()
        self.label = label
        self.type = type_
        self.role = role
        self.color = color
        self.timed = timed
        self.show = show
        self.parents = []
        self.children = []
        self.non_flag_parents = []
        self.enabled = False
        self.observer = None          # callback(transition, clock, popped, token) used by the replay recorder

    def add_arc(self, node, parent=True):
        if parent:
            self.parents.append(node)
            if node.type != "f":
                self.non_flag_parents.append(node)
        else:
            self.children.append(node)

    def check_state(self):
        n = len(self.non_flag_parents)
        if n == 0:                              # standby: no parents
            self.enabled = True
        elif n == 1:                            # every parent (flags included) must hold a token
            self.enabled = all(p.token_container for p in self.parents)
        else:
            colors = [set(t.color for t in p.token_container) for p in self.non_flag_parents]
            self.enabled = bool(set.intersection(*colors))
        return self.enabled

    def fire(self, clock=0):
        """Moves the first token of the non-flag parent to every child (flag parents lose one token)."""
        if len(self.non_flag_parents) != 1 or not self.non_flag_parents[0].token_container:
            return
        token = self.non_flag_parents[0].token_container[0]
        popped = [(p.uid, p.token_container.pop(0).uid) for p in self.parents]
        for child in self.children:
            token.logging[child.uid] = [clock, 0, 0]
            child.token_container.append(token)
        if self.observer is not None:
            self.observer(self, clock, popped, token)


class Token:
    """color = (job, machine, tool); time_features[0] = process time; logging[place] = [entry, leave, elapsed]."""

    def __init__(self, initial_place="", rank=0, color=(0, 0, 0), time_features=None,
                 machine_sequence=(0, 0, 0), last_op=False):
        self.uid = IdGen.generate_uid()
        self.rank = rank
        self.color = color
        self.time_features = list(time_features) if time_features is not None else [0, 0, 0, 0, 0]
        self.logging = {initial_place: [0, 0, 0]}
        self.machine_sequence = machine_sequence
        self.last_op = last_op
        self.buffer_accumulator = 0.0
