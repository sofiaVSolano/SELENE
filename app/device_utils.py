"""
device_utils.py
----------------
Resolucion centralizada de dispositivo (CUDA/CPU) para ambos detectores.
"""

from __future__ import annotations

import logging

import torch

logger = logging.getLogger("app.device_utils")

_warned_no_cuda = False


def resolve_device(requested: str = "auto") -> torch.device:
    """Resuelve el dispositivo de inferencia a partir de "auto"|"cuda"|"cpu".

    "auto" usa CUDA si esta disponible; si no, cae a CPU emitiendo un unico
    aviso (no interrumpe la ejecucion). Pedir "cuda" explicitamente sin GPU
    disponible lanza un error, ya que en ese caso el usuario espera GPU.
    """
    global _warned_no_cuda

    if requested == "cpu":
        return torch.device("cpu")

    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("Se solicito device='cuda' pero no hay ninguna GPU CUDA disponible.")
        return torch.device("cuda")

    if requested != "auto":
        raise ValueError(f"device invalido: {requested!r} (usar 'auto', 'cuda' o 'cpu')")

    if torch.cuda.is_available():
        return torch.device("cuda")

    if not _warned_no_cuda:
        logger.warning(
            "CUDA no disponible, usando CPU (ambos detectores son fasterrcnn_resnet50_fpn_v2 "
            "y seran notablemente mas lentos)."
        )
        _warned_no_cuda = True
    return torch.device("cpu")
