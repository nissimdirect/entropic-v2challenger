.PHONY: q7-smoke q7-measure q7-report q7-help

# Q7 multi-headed L benchmark targets.
# See docs/plans/q7/README.md for the master roadmap.
# See docs/runbooks/q7/q7-smoke.md for execution instructions.

PYTHON ?= python3
Q7_OUT ?= /tmp/q7-report.json
Q7_SEED ?= 42
Q7_SPARSITY ?= 8

q7-help:
	@echo "Q7 multi-headed L benchmark targets:"
	@echo "  q7-smoke    Run mock benchmark + validate schema (CI default; no GPU)"
	@echo "  q7-measure  Run real benchmark (Apple silicon required; PR #3+)"
	@echo "  q7-report   Render markdown verdict from a JSON report (PR #7+)"
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
	@echo "ERROR: --measure not implemented yet (PR #3+ scope)" >&2
	@echo "Use 'make q7-smoke' for CI / no-GPU verification" >&2
	@exit 1

q7-report:
	@echo "ERROR: q7-report markdown rendering not implemented yet (PR #7+ scope)" >&2
	@echo "For now, JSON reports are at $(Q7_OUT) and validated via 'make q7-smoke'" >&2
	@exit 1
