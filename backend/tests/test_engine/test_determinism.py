"""Tests for seeded determinism."""

from engine.determinism import derive_seed, make_rng


def test_same_inputs_produce_identical_seed():
    seed_a = derive_seed(42, "invert", 10)
    seed_b = derive_seed(42, "invert", 10)
    assert seed_a == seed_b


def test_different_frame_index_produces_different_seed():
    seed_a = derive_seed(42, "invert", 10)
    seed_b = derive_seed(42, "invert", 11)
    assert seed_a != seed_b


def test_make_rng_same_seed_identical_sequence():
    rng_a = make_rng(12345)
    rng_b = make_rng(12345)
    vals_a = [rng_a.random() for _ in range(100)]
    vals_b = [rng_b.random() for _ in range(100)]
    assert vals_a == vals_b


def test_different_user_seed():
    seed_a = derive_seed(42, "invert", 10, user_seed=0)
    seed_b = derive_seed(42, "invert", 10, user_seed=99)
    assert seed_a != seed_b
