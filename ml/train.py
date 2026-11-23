"""Train the trainee-project matching model (story #24).

The model predicts how likely a trainee is to deliver a project well (on time,
rated 4 or 5) from six features the platform already knows. Jiwar has no real
project history yet, so it is trained on a seeded synthetic dataset whose rules
come from the proposal (level, experience, ratings, workload). The export is a
plain JSON file of weights; the projects service scores candidates with it, and
the admin still makes the final assignment.

    python ml/train.py           # train, evaluate, write the model
    python ml/train.py --check   # retrain and fail if the committed model differs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split

FEATURES = [
    "level_margin",  # trainee level minus the project's required level (0..2)
    "credits",  # verified credits / 100
    "projects_completed",  # approved client projects so far
    "avg_rating",  # average client rating 1..5, 0 when not rated yet
    "active_projects",  # projects in progress right now
    "preferred",  # 1 when the business named this trainee
]
SEED = 42
N_SAMPLES = 3000
MIN_AUC = 0.75
MODEL_PATH = Path(__file__).resolve().parent.parent / "services/projects/src/matching/model.json"


def make_dataset(seed: int = SEED, n: int = N_SAMPLES) -> tuple[np.ndarray, np.ndarray]:
    """Synthetic trainees and outcomes. Deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    level_margin = rng.integers(0, 3, n)
    credits = rng.uniform(0.3, 2.0, n)
    projects = rng.poisson(2.0, n).clip(0, 12)
    rated = projects > 0
    avg_rating = np.where(rated, rng.uniform(2.5, 5.0, n), 0.0)
    active = rng.integers(0, 4, n)
    preferred = (rng.random(n) < 0.15).astype(int)

    # The hidden rule the model has to recover, plus noise.
    latent = (
        -1.2
        + 0.7 * level_margin
        + 0.6 * credits
        + 0.18 * projects
        + 0.9 * np.where(rated, avg_rating - 3.5, 0.0)
        - 0.8 * active
        + 0.4 * preferred
        + rng.normal(0, 0.8, n)
    )
    x = np.column_stack([level_margin, credits, projects, avg_rating, active, preferred]).astype(float)
    y = (latent > 0).astype(int)
    return x, y


def train(seed: int = SEED) -> dict:
    x, y = make_dataset(seed)
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=seed, stratify=y)

    # Standardise with the training set only, and export the scaling so the
    # service applies exactly the same transformation.
    mean = x_train.mean(axis=0)
    std = x_train.std(axis=0)
    std[std == 0] = 1.0
    model = LogisticRegression(C=1.0, max_iter=1000)
    model.fit((x_train - mean) / std, y_train)

    proba = model.predict_proba((x_test - mean) / std)[:, 1]
    return {
        "version": "matching-v1",
        "features": FEATURES,
        "mean": [round(v, 10) for v in mean.tolist()],
        "std": [round(v, 10) for v in std.tolist()],
        "weights": [round(v, 10) for v in model.coef_[0].tolist()],
        "intercept": round(float(model.intercept_[0]), 10),
        "metrics": {
            "auc": round(float(roc_auc_score(y_test, proba)), 4),
            "accuracy": round(float(accuracy_score(y_test, proba >= 0.5)), 4),
            "n_train": int(len(y_train)),
            "n_test": int(len(y_test)),
            "positive_rate": round(float(y.mean()), 4),
        },
        "trained_on": f"synthetic data from ml/train.py, seed {seed}, {N_SAMPLES} samples",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed model is out of date")
    args = parser.parse_args()

    model = train()
    if model["metrics"]["auc"] < MIN_AUC:
        print(f"AUC {model['metrics']['auc']} is below {MIN_AUC}", file=sys.stderr)
        return 1

    text = json.dumps(model, indent=2) + "\n"
    if args.check:
        committed = MODEL_PATH.read_text(encoding="utf-8") if MODEL_PATH.exists() else ""
        if committed != text:
            print(
                "services/projects/src/matching/model.json is out of date: run python ml/train.py",
                file=sys.stderr,
            )
            return 1
        print(f"model up to date, AUC {model['metrics']['auc']}")
        return 0

    MODEL_PATH.write_text(text, encoding="utf-8")
    print(json.dumps(model["metrics"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
