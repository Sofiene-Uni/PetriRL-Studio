import pytest

from engine.instances import InstanceError, parse_instance, to_text

STANDARD = "2 2\n0 3 1 2\n1 4 0 1\n"
TAILLARD = "2 2\nTimes\n3 2\n4 1\nMachines\n1 2\n2 1\n"
SOLAX = "2 2 2\n1 1 3 2 2 2\n2 1 4 1 2 1\n"
EXPECTED = [[(1, 0, 3), (2, 0, 2)], [(2, 0, 4), (1, 0, 1)]]


def test_standard_zero_indexed_is_shifted():
    seq, nm, fmt = parse_instance(STANDARD)
    assert (seq, nm, fmt) == (EXPECTED, 2, "standard")


def test_taillard_matrices():
    seq, nm, fmt = parse_instance(TAILLARD)
    assert (seq, fmt) == (EXPECTED, "taillard")


def test_solax_triples_keep_tools():
    seq, _, fmt = parse_instance(SOLAX)
    assert fmt == "solax"
    assert seq[0] == [(1, 1, 3), (2, 2, 2)]


def test_round_trip():
    seq, nm, _ = parse_instance(STANDARD)
    assert parse_instance(to_text(seq, nm))[0] == seq


@pytest.mark.parametrize("text", ["", "garbage", "2 2\n0 3 1\n0 1 1 2\n", "3 2\n0 1 1 1\n"])
def test_bad_files_raise(text):
    with pytest.raises(InstanceError):
        parse_instance(text)
