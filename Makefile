.POSIX:
export ROOTDIR ?= $(eval ROOTDIR := $(shell git rev-parse --show-toplevel))$(ROOTDIR)
include $(ROOTDIR)/make.mk

.DEFAULT_GOAL := build

ASDF_VERSION ?= v0.18.0

.PHONY: prepare prepare/asdf prepare/cloc
prepare: sudo
	@command -v asdf >/dev/null 2>&1 || $(MAKE) prepare/asdf
	@command -v $(CLOC) >/dev/null 2>&1 || $(MAKE) prepare/cloc
	@awk '!/^#/ && NF {print $$1}' .tool-versions | \
		while read t; do asdf plugin add "$$t" 2>/dev/null || true; done
	@rcfile=$$(mktemp); \
		{ asdf install 2>&1; echo $$? >$$rcfile; } | grep --line-buffered -v 'is already installed' || true; \
		rc=$$(cat $$rcfile); rm -f $$rcfile; exit $$rc
	@$(PNPM) install
prepare/asdf:
	@command -v brew >/dev/null 2>&1 && brew install asdf || { \
		o=$$(uname | tr A-Z a-z); a=$$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/'); \
		curl -fsSL "https://github.com/asdf-vm/asdf/releases/download/$(ASDF_VERSION)/asdf-$(ASDF_VERSION)-$$o-$$a.tar.gz" \
			| $(SUDO) tar -xz -C /usr/local/bin asdf; \
	}
prepare/cloc:
	@$(PKG_INSTALL) cloc

.PHONY: configure
configure:
	@for cmd in $(PNPM) node; do \
		command -v $$cmd >/dev/null 2>&1 || { echo "$$cmd is missing, run \`make prepare\`"; exit 1; }; \
	done
	@[ -d node_modules ] || $(PNPM) install

.PHONY: build
build: configure
	@$(TSC) -p tsconfig.cjs.json
	@$(TSC) -p tsconfig.esm.json
	@cp src/moduleDir.cjs lib/moduleDir.js
	@cp src/moduleDir.mjs es/moduleDir.js
	@# es/ ships ESM while the package root is CommonJS, so the subtree needs
	@# its own type marker or node reads es/*.js as CommonJS.
	@echo '{"type":"module"}' > es/package.json

.PHONY: test
test: test/unit

# Coverage is always on: the text reporter documents the run in CI logs and the
# lcov file is what sonar-scanner ingests.
.PHONY: test/unit
test/unit: configure
	@$(VITEST) run --coverage --coverage.reporter=text --coverage.reporter=lcov

.PHONY: test/e2e
test/e2e: configure build
	@cd tests/e2e && export PROJECT_ROOT=$(ROOTDIR) && \
		trap './teardown.sh' EXIT INT TERM; \
		./setup.sh && $(BATS) .

# shfmt cannot parse bats's `@test "name" {` syntax, so the suite is scoped to
# real shell scripts. An empty list has to short-circuit: with no file
# arguments shfmt reads stdin instead.
_SHFMT = files=$$($(GIT) ls-files '*.sh'); [ -z "$$files" ] || $(SHFMT)

.PHONY: format
format: configure
	@$(OXFMT) src tests
	@$(_SHFMT) -w -i 2 -ci $$files

.PHONY: lint
lint: configure
	@$(OXFMT) --check src tests
	@$(OXLINT) src tests
	@$(TSC) -p tsconfig.lint.json
	@$(_SHFMT) -d -i 2 -ci $$files

.PHONY: count
count:
	@$(CLOC) $$($(GIT) ls-files)

.PHONY: docker docker/%
docker: FORCE
	@$(MAKE) -C docker
docker/%: FORCE
	@$(MAKE) -C docker $*

.PHONY: publish pack
publish: build
	@$(PNPM) publish --access public
pack: build
	@$(PNPM) pack

.PHONY: clean
clean:
	@rm -rf coverage es lib
	@rm -rf node_modules/.make node_modules/.vite

.PHONY: purge
purge: clean
	@$(GIT) clean -fxd
