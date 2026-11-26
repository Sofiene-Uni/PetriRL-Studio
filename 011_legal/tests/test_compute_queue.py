import threading

import pytest

from studio.services import compute_queue as q


def test_one_slot_serves_in_arrival_order():
    q.configure(slots=1, max_waiting=2)
    a, b, c = q.join(), q.join(), q.join()
    assert [q.position(t) for t in (a, b, c)] == [1, 2, 3]
    assert q.wait(a) and q.position(a) == 0 and q.position(b) == 1
    with pytest.raises(q.QueueFull):            # 2 waiting already, the slot is taken
        q.join()
    started = []
    worker = threading.Thread(target=lambda: started.append(q.wait(b)))
    worker.start()
    worker.join(0.3)
    assert not started                          # b waits until a leaves
    q.leave(a)
    worker.join(2)
    assert started == [True] and q.position(c) == 1
    assert not q.wait(c, cancelled=lambda: True) and q.position(c) == 0
    q.leave(b)
    assert q.status() == {"slots": 1, "running": 0, "waiting": 0}
