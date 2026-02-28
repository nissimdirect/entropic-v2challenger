"""Color Suite utility effects (util.* namespace)."""

# Optional fast paths
try:
    import cv2

    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from scipy.interpolate import PchipInterpolator  # noqa: F401

    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
