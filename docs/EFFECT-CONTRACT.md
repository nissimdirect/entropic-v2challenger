# Entropic v2 — Effect Contract

> Every effect in the system MUST follow this contract.
> No exceptions. No module globals. No hidden state.

---

## 1. The Pure Function Signature

```python
from typing import Any
import numpy as np

def apply(
    frame: np.ndarray,
    params: dict[str, Any],
    state_in: dict[str, Any] | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict[str, Any] | None]:
    """
    Process a single frame.

    Args:
        frame:       Input image as numpy array, shape (H, W, 4), dtype uint8, RGBA
        params:      Effect parameters — all values already resolved
                     (base → modulation → automation → clamped)
        state_in:    State from previous frame (for temporal effects) or None
        frame_index: Current frame number (0-based)
        seed:        Deterministic seed for this effect at this frame
        resolution:  (width, height) of the output

    Returns:
        Tuple of:
        - output_frame: Processed image, same shape as input
        - state_out:    State to pass to next frame, or None if stateless
    """
```

## 2. Rules

### 2.1 No Module Globals
```python
# WRONG — module-level mutable state
_cache = {}
_previous_frame = None

def apply(frame, params, state_in, **kw):
    _cache[kw['frame_index']] = frame  # Mutating global!
    ...

# RIGHT — explicit state passing
def apply(frame, params, state_in, **kw):
    prev = state_in.get('previous_frame') if state_in else None
    ...
    return output, {'previous_frame': frame}
```

### 2.2 Seeded Determinism
```python
# WRONG — non-deterministic
import random
noise = random.random()

# RIGHT — seeded from arguments
rng = np.random.default_rng(kw['seed'])
noise = rng.random()
```

Every call with the same (frame, params, state_in, frame_index, seed) MUST produce the same output. Preview and export are identical.

### 2.3 No Side Effects
- No file I/O
- No network calls
- No print statements (use logging)
- No spawning processes
- No modifying input arrays (copy first if needed)

### 2.4 Input Safety
- Never assume frame shape — always check `frame.shape`
- Handle edge cases: frame_index=0 (first frame), empty params, None state_in
- Clamp outputs to 0-255 uint8 range

## 3. The Effect Container

The container wraps every effect automatically. Effect authors write ONLY the processing stage.

```
Input Frame
    │
    ▼
[Masking Stage]     ← Container handles this
    │  Mask image * input = masked input
    ▼
[Processing Stage]  ← YOUR apply() function
    │
    ▼
[Mix/Blend Stage]   ← Container handles this
    │  (dry * (1 - mix)) + (wet * mix) = output
    ▼
Output Frame
```

### Container Implementation (pseudocode)
```python
class EffectContainer:
    def __init__(self, effect_fn, effect_id: str):
        self.effect_fn = effect_fn
        self.effect_id = effect_id

    def process(self, frame, params, state_in, *, frame_index, project_seed, resolution):
        # 1. Compute deterministic seed
        seed = hash(f"{project_seed}:{self.effect_id}:{frame_index}:{params.get('seed', 0)}")

        # 2. Apply mask (if provided)
        mask = params.pop('_mask', None)
        if mask is not None:
            # mask is (H, W) float32, 0.0-1.0
            masked_frame = frame.copy()
            # Regions where mask=0 will get dry signal
        else:
            masked_frame = frame

        # 3. Run effect (the pure function)
        wet_frame, state_out = self.effect_fn(
            masked_frame, params, state_in,
            frame_index=frame_index, seed=seed, resolution=resolution
        )

        # 4. Mix dry/wet
        mix = params.get('_mix', 1.0)  # 0.0 = fully dry, 1.0 = fully wet
        if mix < 1.0:
            output = np.clip(
                frame.astype(np.float32) * (1 - mix) + wet_frame.astype(np.float32) * mix,
                0, 255
            ).astype(np.uint8)
        else:
            output = wet_frame

        # 5. Apply mask blend (if masked)
        if mask is not None:
            mask_3d = mask[:, :, np.newaxis]  # Broadcast to RGBA
            output = np.clip(
                frame.astype(np.float32) * (1 - mask_3d) + output.astype(np.float32) * mask_3d,
                0, 255
            ).astype(np.uint8)

        return output, state_out
```

## 4. Parameter Definition

Every effect declares its parameters via a schema:

```python
PARAMS = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Threshold",
        "description": "Pixel sort brightness threshold",
        "curve": "s-curve",       # Optional: linear | logarithmic | exponential | s-curve (default: linear)
        "unit": "%",              # Optional: display unit string (default: "")
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "diagonal"],
        "default": "horizontal",
        "label": "Sort Direction",
        "description": "Sort direction — horizontal sorts rows, vertical sorts columns",
    },
    "reverse": {
        "type": "bool",
        "default": False,
        "label": "Reverse",
        "description": "Reverse the sort order",
    },
}
```

### Optional fields (Phase 2A additions)

| Field | Type | Default | Applies to | Purpose |
|-------|------|---------|------------|---------|
| `curve` | `str` | `"linear"` | `float`, `int` | Controls knob scaling — how slider position maps to param value |
| `unit` | `str` | `""` | `float`, `int` | Display unit suffix in the UI (e.g., `"°"`, `"px"`, `"%"`, `"Hz"`) |
| `description` | `str` | `""` | all | Tooltip text shown on hover |

**Curve types:**
- `linear` — 1:1 mapping, uniform resolution across range
- `logarithmic` — more resolution at low end (e.g., chromatic aberration where a little goes a long way)
- `exponential` — more resolution at low end of slider, param grows fast at high end (e.g., blur radius, noise)
- `s-curve` — more resolution at extremes, fast through the middle (e.g., threshold)

This schema is:
1. Sent to frontend via `list_effects` command (auto-generates UI)
2. Used for validation (reject out-of-range values)
3. Used for determinism (all params are explicit, no hidden defaults)
4. Used by the Knob/Slider components to apply non-linear scaling (Phase 2A)

## 5. Effect Registration

```python
# effects/fx/pixelsort.py

EFFECT_ID = "fx.pixelsort"
EFFECT_NAME = "Pixel Sort"
EFFECT_CATEGORY = "fx"

PARAMS = { ... }

def apply(frame, params, state_in, *, frame_index, seed, resolution):
    threshold = params['threshold']
    direction = params['direction']
    ...
    return output_frame, None  # Stateless effect

# effects/registry.py
from effects.fx.pixelsort import apply as pixelsort_apply, PARAMS as pixelsort_params

REGISTRY = {
    "fx.pixelsort": {
        "fn": pixelsort_apply,
        "params": pixelsort_params,
        "name": "Pixel Sort",
        "category": "fx",
    },
    ...
}
```

## 6. Temporal Effects (Special Case)

Effects that need frame history (feedback, physics, temporal) use `state_in`/`state_out`:

```python
# effects/fx/feedback.py

def apply(frame, params, state_in, *, frame_index, seed, resolution):
    decay = params['decay']

    # Get previous frame from state
    prev = state_in.get('buffer') if state_in else None

    if prev is None:
        # First frame — no feedback
        return frame, {'buffer': frame.copy()}

    # Blend current with previous
    blended = np.clip(
        frame.astype(np.float32) * (1 - decay) + prev.astype(np.float32) * decay,
        0, 255
    ).astype(np.uint8)

    return blended, {'buffer': blended.copy()}
```

**Critical rule:** State must be serializable (numpy arrays, numbers, strings). No file handles, no sockets, no lambda functions.

## 7. Testing Contract

Every effect MUST have:
1. **Unit test:** `apply()` with known input produces expected output
2. **Determinism test:** Two calls with same args produce identical output
3. **Boundary test:** All params at min, max, and default values
4. **State test (temporal only):** state_in=None (first frame), state_in=valid (continuation)

```python
def test_pixelsort_determinism():
    frame = np.random.default_rng(42).integers(0, 256, (100, 100, 4), dtype=np.uint8)
    params = {'threshold': 0.5, 'direction': 'horizontal', 'reverse': False}
    kw = {'frame_index': 0, 'seed': 12345, 'resolution': (100, 100)}

    result1, _ = pixelsort.apply(frame, params, None, **kw)
    result2, _ = pixelsort.apply(frame, params, None, **kw)

    np.testing.assert_array_equal(result1, result2)
```
