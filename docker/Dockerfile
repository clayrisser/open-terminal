# Headless desktop for the e2e suite: a real X server and a real terminal
# emulator, with open-terminal installed from the tarball that would be
# published rather than from the working tree.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    procps \
    x11-utils \
    xauth \
    xterm \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app

COPY open-terminal.tgz /tmp/open-terminal.tgz

# A bare install of the tarball, with no build toolchain present, is what
# proves the package no longer needs to compile a native addon. The manifest is
# written by hand because `pnpm init` emits a devEngines range that corepack
# then refuses to resolve.
RUN printf '{"name":"e2e","version":"0.0.0","private":true}' > package.json \
  && pnpm add /tmp/open-terminal.tgz \
  && rm -f /tmp/open-terminal.tgz

COPY fixtures ./fixtures
