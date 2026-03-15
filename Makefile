MODULE_NAME ?= nexus
BINDINGS_OUT ?= frontend/src/module_bindings

.PHONY: start publish generate logs

## Start local SpaceTimeDB instance
start:
	spacetime start

## Publish the Rust backend module to local SpaceTimeDB
publish:
	spacetime publish --skip-clippy $(MODULE_NAME)

## Generate TypeScript client bindings from the published module
generate:
	spacetime generate --lang typescript --out-dir $(BINDINGS_OUT)

## Tail SpaceTimeDB logs for the module
logs:
	spacetime logs $(MODULE_NAME)
