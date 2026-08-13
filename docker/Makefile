.POSIX:
ROOTDIR ?= $(eval ROOTDIR := $(shell git rev-parse --show-toplevel))$(ROOTDIR)
include $(ROOTDIR)/make.mk

.DEFAULT_GOAL := build

# Test-only image, so it is built straight from the e2e context rather than
# declared in a bake file: it is never published.
.PHONY: build
build:
	@cd $(ROOTDIR)/tests/e2e && ./setup.sh

.PHONY: clean
clean:
	@cd $(ROOTDIR)/tests/e2e && ./teardown.sh
