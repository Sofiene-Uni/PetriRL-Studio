"""Petri net of a JSSP instance (adapted from PetriRL Petri_build)."""
from engine.core.build_blocks import IdGen, Place, Token, Transition


class PetriNet:
    def __init__(self, instance, standby=False):
        self.instance = instance
        self.n_jobs, self.n_machines, self.n_tools, _, self.max_ops = instance.specs
        self.standby = standby
        self.places, self.transitions = {}, {}
        self.number_of_ops = 0
        self.create_petri()
        self.cache = self.cache_nodes()

    # ------------------------------------------------------------ building
    def add_nodes_layer(self, genre, type_, role, colored, timed, number):
        node_class, store = (Place, self.places) if genre == "place" else (Transition, self.transitions)
        for i in range(1, number + 1):
            node = node_class(label=f"{role} {i}", type_=type_, role=role, color=i if colored else None, timed=timed)
            store[node.uid] = node

    def add_connection(self, parent_role, child_role, contype, fc):
        places, transitions = self.places.values(), self.transitions.values()
        if contype == "p2t":
            parents = [p for p in places if p.role == parent_role]
            children = [t for t in transitions if t.role == child_role]
        else:
            parents = [t for t in transitions if t.role == parent_role]
            children = [p for p in places if p.role == child_role]
        pairs = [(p, c) for p in parents for c in children] if fc else zip(parents, children)
        for parent, child in pairs:
            parent.add_arc(child, parent=False)
            child.add_arc(parent, parent=True)

    def create_petri(self):
        IdGen.reset()
        nj, nm = self.n_jobs, self.n_machines
        layers = [  # genre, type, role, colored, timed, number
            ("place", "s", "job_sorting", False, False, 1),
            ("trans", "a", "job_sort", True, False, nj),
            ("place", "f", "job_idle", True, False, nj),
            ("place", "b", "job", True, False, nj),
            ("trans", "c", "job_select", True, False, nj),
            ("place", "s", "machine_sorting", False, False, 1),
            ("trans", "a", "machine_sort", True, False, nm),
            ("place", "b", "machine_buffer", True, False, nm),
            ("trans", "a", "machine_start", False, False, nm),
            ("place", "p", "machine_processing", True, True, nm),
            ("place", "f", "machine_idle", False, False, nm),
            ("trans", "t", "machine_finish", False, True, nm),
            ("place", "d", "delivery", False, False, nm),
        ]
        if self.standby:
            layers.append(("trans", "c", "standby", False, False, 1))
        arcs = [  # parent role, child role, type, fully connected
            ("job_sorting", "job_sort", "p2t", True),
            ("job_sort", "job_idle", "t2p", False),
            ("job_idle", "job_select", "p2t", False),
            ("job", "job_select", "p2t", False),
            ("machine_sorting", "machine_sort", "p2t", True),
            ("machine_sort", "machine_buffer", "t2p", False),
            ("machine_buffer", "machine_start", "p2t", False),
            ("machine_idle", "machine_start", "p2t", False),
            ("machine_start", "machine_processing", "t2p", False),
            ("machine_processing", "machine_finish", "p2t", False),
            ("machine_finish", "machine_idle", "t2p", False),
            ("machine_finish", "delivery", "t2p", False),
            ("machine_finish", "job_sorting", "t2p", True),
            ("job_select", "machine_sorting", "t2p", True),
        ]
        for layer in layers:
            self.add_nodes_layer(*layer)
        for arc in arcs:
            self.add_connection(*arc)

    def add_tokens(self):
        """One token in every flag place, one token per operation in its job place."""
        self.number_of_ops = 0
        for place in self.places.values():
            if place.type == "f":
                place.token_container.append(Token(initial_place=place.uid))
        for job, place in enumerate(self.cache["job"], start=1):
            sequence = self.instance.job_sequences[job - 1]
            previous = 0
            for i, (machine, tool, p) in enumerate(sequence, start=1):
                last = i == len(sequence)
                nxt = 0 if last else sequence[i][0]
                place.token_container.append(Token(initial_place=place.uid, color=(job, machine, tool),
                                                   time_features=[p, 0, 0, 0, 0], rank=i,
                                                   machine_sequence=(previous, machine, nxt), last_op=last))
                self.number_of_ops += 1
                previous = machine

    def clear_petri(self):
        for place in self.places.values():
            place.token_container = []

    def cache_nodes(self):
        places, transitions = list(self.places.values()), list(self.transitions.values())
        by_color = lambda nodes: sorted(nodes, key=lambda x: x.color or 0)
        role = lambda r: by_color([p for p in places if p.role == r])
        return {
            "places": places,
            "transitions": transitions,
            "buffer_places": [p for p in places if p.type == "b"],
            "process_places": [p for p in places if p.type == "p"],
            "sorting_places": [p for p in places if p.type == "s"],
            "delivery_places": [p for p in places if p.type == "d"],
            "job": role("job"),
            "job_idle": role("job_idle"),
            "machine_buffer": role("machine_buffer"),
            "machine_processing": role("machine_processing"),
            "machine_idle": [p for p in places if p.role == "machine_idle"],
            "auto_no_sort": [t for t in transitions if t.type == "a" and t.role not in ("job_sort", "machine_sort")],
            "controllable_transitions": [t for t in transitions if t.type == "c"],
        }

    # ------------------------------------------------------------ export for the web player
    def structure(self):
        """Nodes and arcs for the front end. idx: position inside its role layer."""
        counters = {}

        def node(n, kind):
            i = counters.get(n.role, 0)
            counters[n.role] = i + 1
            return {"id": n.uid, "kind": kind, "role": n.role, "type": n.type, "color": n.color, "idx": i}

        nodes = [node(p, "place") for p in self.places.values()] + \
                [node(t, "transition") for t in self.transitions.values()]
        arcs = [[p.uid, c.uid] for p in self.places.values() for c in p.children] + \
               [[t.uid, c.uid] for t in self.transitions.values() for c in t.children]
        return {"nodes": nodes, "arcs": arcs, "n_jobs": self.n_jobs, "n_machines": self.n_machines}
