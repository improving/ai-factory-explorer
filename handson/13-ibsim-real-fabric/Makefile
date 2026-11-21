# Convenience targets wrapping scripts/*.sh. Every target is safe to re-run.
#
# Usage examples:
#   make setup                    # build the image
#   make verify                   # sanity-check the image
#   make start TOPO=simple        # start ibsim on topologies/simple.net
#   make discover                 # ibnetdiscover against the running fabric
#   make opensm                   # start OpenSM
#   make routes ARGS=1            # ibroute against switch lid 1
#   make trace ARGS="2 3"         # ibtracert from lid 2 to lid 3
#   make failure PORT='"Switch1"[3]'
#   make recover PORT='"Switch1"[3]'
#   make diagnose                 # collect a diagnostics bundle
#   make stop                     # tear the container down
#   make clean                    # stop + remove the built image

TOPO ?= simple
ARGS ?=
PORT ?=

.PHONY: setup verify start stop opensm discover routes trace failure recover diagnose reset clean

setup:
	./setup/install.sh

verify:
	./setup/verify.sh

start:
	./scripts/start-sim.sh $(TOPO)

stop:
	./scripts/stop-sim.sh

opensm:
	./scripts/start-opensm.sh

discover:
	./scripts/discover.sh $(ARGS)

routes:
	./scripts/routes.sh $(ARGS)

trace:
	./scripts/trace.sh $(ARGS)

failure:
	./scripts/inject-failure.sh '$(PORT)'

recover:
	./scripts/restore-link.sh '$(PORT)'

diagnose:
	./scripts/collect-diagnostics.sh

reset:
	./scripts/reset.sh

clean: reset
	docker rmi "$${IBSIM_LAB_IMAGE:-ibsim-lab:latest}" 2>/dev/null || true
