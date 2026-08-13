MAKEFLAGS += --no-print-directory

# Recipes spawn fresh non-interactive shells that don't source ~/.zshrc, so the
# asdf shim dir isn't on PATH unless we add it here.
export PATH := $(or $(ASDF_DATA_DIR),$(HOME)/.asdf)/shims:$(PATH)

GIT ?= git
CLOC ?= cloc
BATS ?= bats
DOCKER ?= docker
PNPM ?= pnpm
SHFMT ?= shfmt

OXFMT ?= $(PNPM) exec oxfmt
OXLINT ?= $(PNPM) exec oxlint
TSC ?= $(PNPM) exec tsc
VITEST ?= $(PNPM) exec vitest

SUDO ?= $(eval SUDO := $(shell command -v sudo >/dev/null && echo sudo))$(SUDO)
PKG_INSTALL ?= $(eval PKG_INSTALL := $(or \
	$(shell command -v brew >/dev/null && echo 'brew install'), \
	$(shell command -v apt-get >/dev/null && echo '$(SUDO) apt-get update && $(SUDO) apt-get install -y'), \
	$(shell command -v dnf >/dev/null && echo '$(SUDO) dnf install -y'), \
	echo "no supported package manager" >&2;false))$(PKG_INSTALL)

.PHONY: FORCE
FORCE:

.PHONY: sudo
sudo:
	@$(SUDO) true
