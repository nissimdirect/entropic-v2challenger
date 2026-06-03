.PHONY: q7-smoke q7-measure q7-report q7-help q7-worker-stub q7-saturation q7-test

# Q7 multi-headed L benchmark targets.
# See docs/plans/q7/README.md for the master roadmap.
# See docs/runbooks/q7/q7-smoke.md for execution instructions.

PYTHON ?= python3
Q7_OUT ?= /tmp/q7-report.json
Q7_SEED ?= 42
Q7_SPARSITY ?= 8

q7-help:
	@echo "Q7 multi-headed L benchmark targets:"
	@echo "  q7-smoke         Run mock benchmark + validate schema (CI default; no GPU)"
	@echo "  q7-measure       Run real benchmark (Apple silicon required; PR #4+ wires the harness)"
	@echo "  q7-report        Render markdown verdict from a JSON report (PR #7+)"
	@echo "  q7-worker-stub   Run the L-worker stub on Q7_WORKER_PORT (default 6099)"
	@echo "  q7-saturation    Run queue saturation against mock loaders"
	@echo "  q7-test          Run all Q7 smoke tests"
	@echo ""
	@echo "Variables:"
	@echo "  Q7_OUT=$(Q7_OUT)"
	@echo "  Q7_SEED=$(Q7_SEED)"
	@echo "  Q7_SPARSITY=$(Q7_SPARSITY)"

q7-smoke:
	cd backend/scripts && $(PYTHON) -m q7_benchmark.runner --mock --seed $(Q7_SEED) --sparsity $(Q7_SPARSITY) --out $(Q7_OUT)
	cd backend/scripts && $(PYTHON) -m q7_benchmark.report validate $(Q7_OUT)
	@echo "OK: q7-smoke passed (mock mode, deterministic, schema-valid)"

q7-measure:
	cd backend/scripts && $(PYTHON) -m q7_benchmark.runner --measure --sparsity $(Q7_SPARSITY) --out $(Q7_OUT) $(Q7_MEASURE_FLAGS)
	cd backend/scripts && $(PYTHON) -m q7_benchmark.report validate $(Q7_OUT)
	@echo "OK: q7-measure produced a valid report (real encode lights up in PR #5+)"

Q7_WORKER_PORT ?= 6099
q7-worker-stub:
	cd backend && PYTHONPATH=src $(PYTHON) -m q7_worker --port $(Q7_WORKER_PORT)

q7-saturation:
	cd backend && PYTHONPATH=scripts $(PYTHON) -c "from q7_benchmark.loaders import make_loader; from q7_benchmark.queue_sat import measure_saturation; import numpy as np; r=measure_saturation(make_loader('dinov2', backend='mock'), lambda: np.zeros((224,224,3),dtype=np.uint8), n_threads=4, window_seconds=2.0); print(r)"

q7-test:
	cd backend && PYTHONPATH=scripts $(PYTHON) -m pytest tests/test_q7_benchmark/ -m smoke -q --confcutdir=tests/test_q7_benchmark -o addopts=""

q7-report:
	@echo "ERROR: q7-report markdown rendering not implemented yet (PR #7+ scope)" >&2
	@echo "For now, JSON reports are at $(Q7_OUT) and validated via 'make q7-smoke'" >&2
	@exit 1
