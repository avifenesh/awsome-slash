__all__ = ["PublicClass", "public_function"]

import os, sys
from math import sqrt
from collections import deque, defaultdict


def public_function(value):
    return value + 1


async def async_function():
    return 1


class PublicClass:
    def method(self):
        return "ok"


class _PrivateClass:
    pass
