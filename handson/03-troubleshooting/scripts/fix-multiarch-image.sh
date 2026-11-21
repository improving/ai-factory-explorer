#!/usr/bin/env bash
# Work around `kind load docker-image` failing with:
#   ctr: content digest sha256:...: not found
#
# Cause: on Docker Desktop (default on macOS), the containerd image store keeps
# the whole multi-arch manifest list for ghcr.io/nvidia/nvml-mock, but
# `kind load docker-image` hands the node an archive whose per-platform layers
# it doesn't have. The error names a digest, not the actual cause.
#
# Fix: save a single-platform archive matching the kind node's architecture,
# and load that archive instead of the image reference.
#
# Usage:
#   ./fix-multiarch-image.sh <image[:tag]> <kind-cluster-name>
# Example:
#   ./fix-multiarch-image.sh ghcr.io/nvidia/nvml-mock:0.4.0 mokka
set -euo pipefail

IMAGE="${1:-ghcr.io/nvidia/nvml-mock:${MOKKA_VERSION:-0.4.0}}"
CLUSTER="${2:-mokka}"

ARCH=$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')
ARCHIVE="$(basename "${IMAGE//[:\/]/_}").tar"

echo "Platform: linux/${ARCH}"
echo "Saving ${IMAGE} to ${ARCHIVE} (single platform only)..."
docker save --platform "linux/${ARCH}" "$IMAGE" -o "$ARCHIVE"

echo "Loading ${ARCHIVE} into kind cluster ${CLUSTER}..."
kind load image-archive "$ARCHIVE" --name "$CLUSTER"

echo "Done. A locally built (single-arch) image would not have needed this step."
