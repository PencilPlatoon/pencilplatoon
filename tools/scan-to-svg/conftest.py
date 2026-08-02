import numpy as np
import pytest

from _helpers import edge


@pytest.fixture
def trapezoid():
    """A 3-edge trapezoid outline (open path): left edge up, top across, right
    edge down. Mirrors the cannon seg9 case that must stay straight."""
    return np.vstack([
        edge((0, 0), (10, 50), 30),
        edge((10, 50), (60, 50), 30)[1:],
        edge((60, 50), (70, 0), 30)[1:],
    ])
