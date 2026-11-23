"""Tests for the matching model: it is reproducible, good enough, and makes sense."""

import numpy as np

from train import FEATURES, MIN_AUC, make_dataset, train


def weight(model, name):
    return model["weights"][FEATURES.index(name)]


def test_same_seed_same_model():
    assert train(seed=7) == train(seed=7)


def test_dataset_shape_and_ranges():
    x, y = make_dataset(seed=1, n=500)
    assert x.shape == (500, len(FEATURES))
    assert set(np.unique(y)) == {0, 1}
    assert x[:, FEATURES.index("level_margin")].min() >= 0
    assert (x[:, FEATURES.index("avg_rating")] <= 5).all()


def test_model_beats_the_minimum_on_held_out_data():
    model = train()
    assert model["metrics"]["auc"] >= MIN_AUC
    assert model["metrics"]["n_test"] > 0


def test_weights_point_the_right_way():
    model = train()
    assert weight(model, "level_margin") > 0
    assert weight(model, "projects_completed") > 0
    assert weight(model, "active_projects") < 0, "busy trainees should score lower"
    assert len(model["mean"]) == len(model["std"]) == len(FEATURES)
