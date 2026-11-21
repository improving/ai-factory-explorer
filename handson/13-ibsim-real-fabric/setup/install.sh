#!/usr/bin/env bash
# Build the ibsim lab image. Works the same on macOS, Linux, and WSL2 because it never touches the
# host's kernel or network stack — it's a plain Docker build.
#
# Usage: setup/install.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

IMAGE_TAG="${IBSIM_LAB_IMAGE:-ibsim-lab:latest}"

command -v docker >/dev/null 2>&1 || {
    echo "ERROR: docker is not installed or not on PATH. Install Docker Desktop (macOS/Windows) or" >&2
    echo "       Docker Engine (Linux) first: https://docs.docker.com/get-docker/" >&2
    exit 1
}

docker info >/dev/null 2>&1 || {
    echo "ERROR: the Docker daemon isn't reachable. Start Docker Desktop (or 'sudo systemctl start docker')." >&2
    exit 1
}

echo ">>> Building ${IMAGE_TAG} from Dockerfile ..."
docker build -t "${IMAGE_TAG}" .
echo ">>> Built ${IMAGE_TAG}."

echo
echo "### What this installed (inside the image, not on your host):"
echo "  ibsim-utils        -- ibsim, ibsim-run"
echo "  opensm              -- the InfiniBand Subnet Manager"
echo "  infiniband-diags   -- ibnetdiscover, ibroute, ibtracert, iblinkinfo, ibstat, ibstatus,"
echo "                         ibportstate, ibqueryerrors, ibping, ..."
echo "  rdma-core            -- libibverbs/libibumad runtime shared by the above"
echo "  libibmad5, libibumad3 -- MAD/UMAD libraries the diagnostics link against"
echo
echo "Building from source instead (e.g. if your distro lacks a package, or you need a newer ibsim"
echo "than your distro ships). Verified: ibsim ships a plain hand-written Makefile, NOT autotools --"
echo "there is no ./configure or ./autogen.sh, despite that being common for other linux-rdma projects:"
echo
echo "  apt-get install -y build-essential libibmad-dev libibumad-dev pkg-config"
echo "  git clone https://github.com/linux-rdma/ibsim.git"
echo "  cd ibsim"
echo "  make                  # builds against the system's installed libibmad/libibumad (from"
echo "                        # libibmad-dev/libibumad-dev above); produces ibsim/ibsim and"
echo "                        # umad2sim/libumad2sim.so"
echo "  sudo make install     # installs into /usr/local by default"
echo
echo "  # To build against a separate rdma-core source checkout instead of the system libraries:"
echo "  make IB_DEV_DIR=/path/to/rdma-core"
echo
echo "Next: setup/verify.sh"
