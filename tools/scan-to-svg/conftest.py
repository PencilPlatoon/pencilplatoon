import numpy as np
import pytest


def _edge(a, b, n):
    return np.column_stack([np.linspace(a[0], b[0], n), np.linspace(a[1], b[1], n)])


@pytest.fixture
def trapezoid():
    """A 3-edge trapezoid outline (open path): left edge up, top across, right
    edge down. Mirrors the cannon seg9 case that must stay straight."""
    return np.vstack([
        _edge((0, 0), (10, 50), 30),
        _edge((10, 50), (60, 50), 30)[1:],
        _edge((60, 50), (70, 0), 30)[1:],
    ])
