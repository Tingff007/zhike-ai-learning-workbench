.PHONY: dev backend frontend docker lint test migrate downgrade seed install install-frontend install-backend

# 国内镜像：前端 npmmirror（淘宝），后端清华 PyPI
NPM_REGISTRY := https://registry.npmmirror.com
PIP_INDEX := https://pypi.tuna.tsinghua.edu.cn/simple

install: install-frontend install-backend

install-frontend:
	cd frontend && pnpm install --registry=$(NPM_REGISTRY)

install-backend:
	cd backend && PIP_CONFIG_FILE=pip.conf pip install -r requirements.txt -i $(PIP_INDEX)

dev:
	@echo "Backend: cd backend && uvicorn app.main:app --reload --port 8001"
	@echo "Frontend: cd frontend && pnpm dev"

backend:
	cd backend && python run_dev.py

frontend:
	cd frontend && pnpm dev

docker:
	docker compose up --build

lint:
	cd backend && python scripts/check_backend_static_self.py

guard:
	cd backend && python scripts/check_backend_static_self.py && pytest tests/test_ingestion_status.py tests/test_ingestion_status_builder.py tests/test_document_upload_validation.py tests/test_knowledge_upload_policy.py tests/test_agent_workflow_auth.py tests/test_backend_comment_language_guard.py tests/test_backend_contract_governance.py tests/test_exception_observability_guard.py tests/test_route_private_access_guard.py tests/test_service_private_access_guard.py -q

test:
	cd backend && pytest


migrate:
	cd backend && alembic upgrade head

downgrade:
	cd backend && alembic downgrade -1

seed:
	cd backend && alembic upgrade 0002_seed_deep_learning
