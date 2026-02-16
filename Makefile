.PHONY: help up down logs up-prod down-prod logs-prod audit-migrations deploy-remote harden-firewall check-prod-secrets check-prod-secrets-remote keycloak-backup-db keycloak-audit-realm keycloak-export-realm logchange commit push deploy release release-sync

help:
	@printf "Targets:\n  up\n  down\n  logs\n  up-prod\n  down-prod\n  logs-prod\n  audit-migrations\n  deploy-remote\n  harden-firewall\n  check-prod-secrets\n  check-prod-secrets-remote\n  keycloak-backup-db\n  keycloak-audit-realm\n  keycloak-export-realm\n  logchange RU=\"...\" EN=\"...\" [TYPE=changed]\n  commit MSG=\"...\"\n  push\n  deploy\n  release-sync\n  release MSG=\"...\" RU=\"...\" EN=\"...\" [TYPE=changed]\n"

up:
	./infra/scripts/dev-compose.sh

down:
	docker compose -f infra/docker-compose.yml --env-file .env down

logs:
	docker compose -f infra/docker-compose.yml --env-file .env logs -f

up-prod:
	./infra/scripts/prod-compose.sh

down-prod:
	docker compose -f infra/docker-compose.prod.yml --env-file .env down

logs-prod:
	docker compose -f infra/docker-compose.prod.yml --env-file .env logs -f

audit-migrations:
	./infra/scripts/audit-migrations.sh

deploy-remote:
	./infra/scripts/deploy-remote.sh

harden-firewall:
	./infra/scripts/harden-firewall.sh

check-prod-secrets:
	./infra/scripts/check-prod-secrets.sh

check-prod-secrets-remote:
	@host=$${DEPLOY_HOST:-root@85.239.60.3}; \
	remote_dir=$${DEPLOY_PATH:-/opt/new_toggl}; \
	ssh $$host "cd '$$remote_dir' && bash -s .env" < ./infra/scripts/check-prod-secrets.sh

keycloak-backup-db:
	./infra/scripts/keycloak-backup-db.sh .env

keycloak-audit-realm:
	./infra/scripts/keycloak-realm-drift-audit.sh .env

keycloak-export-realm:
	./infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json

logchange:
	@if [ -z "$(RU)" ] || [ -z "$(EN)" ]; then \
		echo "Usage: make logchange RU=\"...\" EN=\"...\" [TYPE=changed]"; \
		exit 1; \
	fi
	@TYPE="$(TYPE)" RU="$(RU)" EN="$(EN)" ./infra/scripts/changelog-add.sh

commit:
	@if [ -z "$(MSG)" ]; then \
		echo "Usage: make commit MSG=\"...\""; \
		exit 1; \
	fi
	git add -A
	git commit -m "$(MSG)"

push:
	git push origin $$(git branch --show-current)

deploy: deploy-remote

release-sync:
	git add VERSION CHANGELOG.md CHANGELOG.en.md infra/releases.log
	@if git diff --cached --quiet; then \
		echo "No release artifacts to sync."; \
	else \
		release_version=$$(cat VERSION); \
		git commit -m "chore(release): sync release $$release_version"; \
		git push origin $$(git branch --show-current); \
	fi

release:
	@if [ -z "$(MSG)" ] || [ -z "$(RU)" ] || [ -z "$(EN)" ]; then \
		echo "Usage: make release MSG=\"...\" RU=\"...\" EN=\"...\" [TYPE=changed]"; \
		exit 1; \
	fi
	@TYPE="$(TYPE)" RU="$(RU)" EN="$(EN)" ./infra/scripts/changelog-add.sh
	git add -A
	git commit -m "$(MSG)"
	git push origin $$(git branch --show-current)
	./infra/scripts/deploy-remote.sh
	$(MAKE) release-sync
