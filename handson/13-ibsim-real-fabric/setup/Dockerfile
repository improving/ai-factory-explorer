# ibsim InfiniBand lab image.
#
# This is the ONE thing that makes the rest of this module portable to macOS, Windows (WSL2), or any
# Linux host: none of the labs talk to a real HCA or a real IB stack. They talk to `ibsim`, a
# userspace MAD/SMP simulator, over LD_PRELOAD-injected Unix sockets — so a plain Linux container is
# a complete, sufficient environment. See ../ARCHITECTURE.md for why this works and ../CAPABILITIES.md
# for exactly what it does and doesn't prove.
#
# Base: Ubuntu 24.04 LTS (Noble). Verified during authoring of this module:
#   ibsim-utils        0.10-2build1   (candidate on noble/universe)
#   opensm             3.3.23-2       (candidate on noble/universe)
#   infiniband-diags   50.0-2ubuntu0.2
#   rdma-core          50.0-2ubuntu0.2
# Ubuntu 22.04 (Jammy) also works (ibsim-utils 0.10-2, infiniband-diags 39.0-1) if you prefer it —
# swap the FROM line, everything else in this module is version-tolerant.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ibsim-utils \
        opensm \
        opensm-doc \
        infiniband-diags \
        rdma-core \
        libibmad5 \
        libibumad3 \
        tmux \
        procps \
        iproute2 \
        less \
        vim-tiny \
    && rm -rf /var/lib/apt/lists/*

# The image has no init system, so opensm never auto-starts: every lab starts it explicitly,
# scoped to one ibsim instance, via scripts/start-opensm.sh.

WORKDIR /lab

CMD ["sleep", "infinity"]
