from __future__ import annotations

import hashlib
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT, settings
from app.core.tracing import get_trace_id
from app.models import AdminAuditLog, User
from app.services.ai.intent.types import (
    IntentEvalReport,
    IntentRegistryConfig,
    IntentRouterConfigView,
    RegistryValidationIssue,
    RegistryValidationResult,
)


logger = logging.getLogger(__name__)


class IntentRegistryValidationError(ValueError):
    """Intent Registry 校验失败。"""

    def __init__(self, result: RegistryValidationResult) -> None:
        self.result = result
        message = result.errors[0].message if result.errors else "Intent Registry 校验失败"
        super().__init__(message)


class IntentRegistryStore:
    """管理 Intent Registry 的文件读取、校验、草稿和版本回滚。"""

    _cache: tuple[Path, str, IntentRegistryConfig, str] | None = None

    def __init__(self) -> None:
        self.example_path = Path(__file__).resolve().with_name("examples.yaml")
        self.storage_path = (PROJECT_ROOT / "storage" / "intent-router" / "intent_registry.yaml").resolve()

    @classmethod
    def invalidate_cache(cls) -> None:
        """清除进程内有效配置缓存。"""
        cls._cache = None

    def active_read_path(self) -> Path:
        """按优先级返回当前应该读取的配置路径。"""
        configured = str(getattr(settings, "INTENT_ROUTER_REGISTRY_PATH", "") or "").strip()
        if configured:
            return Path(configured).expanduser().resolve()
        if self.storage_path.exists():
            return self.storage_path
        return self.example_path

    def active_write_path(self) -> Path:
        """返回发布和后台保存时使用的活跃配置路径。"""
        configured = str(getattr(settings, "INTENT_ROUTER_REGISTRY_PATH", "") or "").strip()
        if configured:
            return Path(configured).expanduser().resolve()
        return self.storage_path

    def draft_path(self) -> Path:
        """返回草稿 YAML 文件路径。"""
        active = self.active_write_path()
        return active.with_name(f"{active.stem}.draft{active.suffix or '.yaml'}")

    def revisions_dir(self) -> Path:
        """返回发布版本备份目录。"""
        return self.active_write_path().parent / "revisions"

    def load_active(self, *, force: bool = False) -> IntentRegistryConfig:
        """加载当前有效 Registry；无运行时配置时回退内置示例。"""
        path = self.active_read_path()
        if not force and self._cache and self._cache[0] == path:
            return self._cache[2]
        try:
            yaml_text = path.read_text(encoding="utf-8")
            result, config = self.validate_yaml(yaml_text)
            if not result.ok or not config:
                raise IntentRegistryValidationError(result)
        except Exception as exc:
            if self._cache and not force:
                logger.warning(
                    "加载 Intent Registry 失败，继续使用内存缓存：path=%s trace_id=%s",
                    path,
                    get_trace_id(),
                    exc_info=True,
                )
                return self._cache[2]
            if path != self.example_path:
                logger.warning(
                    "加载 Intent Registry 失败，尝试回退内置示例：path=%s example_path=%s trace_id=%s",
                    path,
                    self.example_path,
                    get_trace_id(),
                    exc_info=True,
                )
                yaml_text = self.example_path.read_text(encoding="utf-8")
                result, config = self.validate_yaml(yaml_text)
                if result.ok and config:
                    path = self.example_path
                else:
                    raise IntentRegistryValidationError(result)
            else:
                raise
        version = self.version_for_yaml(yaml_text)
        self._cache = (path, version, config, yaml_text)
        return config

    def active_yaml_text(self) -> str:
        """返回当前有效 YAML 原文。"""
        path = self.active_read_path()
        if self._cache and self._cache[0] == path:
            return self._cache[3]
        if path.exists():
            return path.read_text(encoding="utf-8")
        return self.example_path.read_text(encoding="utf-8")

    def version_for_yaml(self, yaml_text: str) -> str:
        """按内容生成稳定版本号。"""
        digest = hashlib.sha256(yaml_text.encode("utf-8")).hexdigest()[:12]
        return f"ir-{digest}"

    def dump_yaml(self, config: IntentRegistryConfig) -> str:
        """把结构化 Registry 序列化为 YAML。"""
        data = config.model_dump(mode="json", by_alias=True, exclude_none=True)
        return yaml.safe_dump(data, allow_unicode=True, sort_keys=False)

    def validate_yaml(self, yaml_text: str) -> tuple[RegistryValidationResult, IntentRegistryConfig | None]:
        """解析并校验 YAML，返回错误列表和可用配置。"""
        try:
            data = yaml.safe_load(yaml_text) or {}
        except yaml.YAMLError as exc:
            mark = getattr(exc, "problem_mark", None)
            issue = RegistryValidationIssue(
                path="$",
                message=str(exc),
                line=(mark.line + 1) if mark else None,
                column=(mark.column + 1) if mark else None,
            )
            return RegistryValidationResult(ok=False, errors=[issue]), None

        secret_issues = self._secret_issues(data)
        if secret_issues:
            return RegistryValidationResult(ok=False, errors=secret_issues), None

        try:
            config = IntentRegistryConfig.model_validate(data)
        except ValidationError as exc:
            errors = [
                RegistryValidationIssue(
                    path=".".join(str(part) for part in error.get("loc", ())) or "$",
                    message=str(error.get("msg") or "字段校验失败"),
                )
                for error in exc.errors()
            ]
            return RegistryValidationResult(ok=False, errors=errors), None
        return RegistryValidationResult(ok=True, errors=[]), config

    def save_draft(self, yaml_text: str) -> IntentRegistryConfig:
        """校验并保存草稿，不替换当前有效配置。"""
        result, config = self.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise IntentRegistryValidationError(result)
        path = self.draft_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml_text, encoding="utf-8")
        return config

    def import_as_draft(self, yaml_text: str) -> IntentRegistryConfig:
        """导入 YAML 并保存为待发布草稿。"""
        return self.save_draft(yaml_text)

    def reload_from_file(self) -> IntentRegistryConfig:
        """从活跃配置文件重新加载并刷新缓存。"""
        path = self.active_read_path()
        yaml_text = path.read_text(encoding="utf-8")
        result, config = self.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise IntentRegistryValidationError(result)
        self._cache = (path, self.version_for_yaml(yaml_text), config, yaml_text)
        return config

    def publish(self, yaml_text: str | None = None) -> IntentRegistryConfig:
        """发布草稿或指定 YAML 到活跃配置文件，并备份上一版本。"""
        if yaml_text is None:
            draft = self.draft_path()
            yaml_text = draft.read_text(encoding="utf-8") if draft.exists() else self.active_yaml_text()
        result, config = self.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise IntentRegistryValidationError(result)

        target = self.active_write_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            self._backup_active(target)
        elif self.active_read_path().exists() and self.active_read_path() != self.example_path:
            self._backup_active(self.active_read_path())
        target.write_text(yaml_text, encoding="utf-8")
        draft = self.draft_path()
        if draft.exists():
            draft.unlink()
        self._cache = (target.resolve(), self.version_for_yaml(yaml_text), config, yaml_text)
        return config

    def rollback(self) -> IntentRegistryConfig:
        """回滚到最近一次发布前的备份版本。"""
        revisions = sorted(self.revisions_dir().glob("intent_registry.*.yaml"), reverse=True)
        if not revisions:
            raise FileNotFoundError("没有可回滚的 Intent Registry 版本")
        source = revisions[0]
        yaml_text = source.read_text(encoding="utf-8")
        result, config = self.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise IntentRegistryValidationError(result)
        target = self.active_write_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            self._backup_active(target)
        shutil.copyfile(source, target)
        self._cache = (target.resolve(), self.version_for_yaml(yaml_text), config, yaml_text)
        return config

    def config_view(
        self,
        *,
        evaluation: IntentEvalReport | None = None,
        updated_by: str | None = None,
    ) -> IntentRouterConfigView:
        """生成管理端配置视图。"""
        active_config = self.load_active()
        active_yaml_text = self.active_yaml_text()
        yaml_text = active_yaml_text
        config: IntentRegistryConfig | None = active_config
        validation, _ = self.validate_yaml(active_yaml_text)
        draft = self.draft_path()
        draft_version = None
        if draft.exists():
            draft_yaml_text = draft.read_text(encoding="utf-8")
            draft_version = self.version_for_yaml(draft_yaml_text)
            validation, draft_config = self.validate_yaml(draft_yaml_text)
            yaml_text = draft_yaml_text
            config = draft_config
        return IntentRouterConfigView(
            active_path=str(self.active_read_path()),
            active_version=self.version_for_yaml(active_yaml_text),
            draft_version=draft_version,
            updated_at=datetime.now(timezone.utc).isoformat(),
            updated_by=updated_by,
            validation=validation,
            evaluation=evaluation,
            yaml_text=yaml_text,
            config=config.model_dump(mode="json", by_alias=True) if config else None,
            embedding_warmup_status="ready" if config and config.intents else "not_started",
            has_draft=draft.exists(),
        )

    def _backup_active(self, source: Path) -> None:
        """把当前活跃配置复制到修订目录。"""
        self.revisions_dir().mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        target = self.revisions_dir() / f"intent_registry.{timestamp}.{self.version_for_yaml(source.read_text(encoding='utf-8'))}.yaml"
        shutil.copyfile(source, target)

    def _secret_issues(self, data: Any, path: str = "$") -> list[RegistryValidationIssue]:
        """检查配置中是否出现密钥、令牌或密码字段。"""
        secret_tokens = ("api_key", "apikey", "secret", "token", "password", "access_key", "private_key")
        issues: list[RegistryValidationIssue] = []
        if isinstance(data, dict):
            for key, value in data.items():
                normalized = str(key).lower().replace("-", "_")
                child_path = f"{path}.{key}"
                if any(token in normalized for token in secret_tokens):
                    issues.append(RegistryValidationIssue(path=child_path, message="Intent Registry 不允许保存 API Key、Secret、Token 或密码字段"))
                issues.extend(self._secret_issues(value, child_path))
        elif isinstance(data, list):
            for index, item in enumerate(data):
                issues.extend(self._secret_issues(item, f"{path}[{index}]"))
        return issues


class IntentRegistryAdminService:
    """管理端 Intent Registry 操作服务，负责审计和事务提交。"""

    def __init__(self, db: Session, store: IntentRegistryStore | None = None) -> None:
        self.db = db
        self.store = store or IntentRegistryStore()

    def view(self, *, evaluation: IntentEvalReport | None = None, actor_external_id: str | None = None) -> IntentRouterConfigView:
        """读取当前配置视图。"""
        return self.store.config_view(evaluation=evaluation, updated_by=actor_external_id)

    def validate(self, yaml_text: str) -> RegistryValidationResult:
        """校验 YAML 原文。"""
        result, _ = self.store.validate_yaml(yaml_text)
        return result

    def save_draft(self, yaml_text: str, *, actor_external_id: str | None) -> IntentRouterConfigView:
        """保存通过校验的草稿并写入审计日志。"""
        config = self.store.save_draft(yaml_text)
        self._audit(actor_external_id, "intent_router.config.save", "draft", {"version": config.version, "status": "success"})
        self.db.commit()
        return self.view(actor_external_id=actor_external_id)

    def import_yaml(self, yaml_text: str, *, actor_external_id: str | None) -> IntentRouterConfigView:
        """导入 YAML 为草稿并写入审计日志。"""
        config = self.store.import_as_draft(yaml_text)
        self._audit(actor_external_id, "intent_router.config.import", "draft", {"version": config.version, "status": "success"})
        self.db.commit()
        return self.view(actor_external_id=actor_external_id)

    def export_yaml(self, *, actor_external_id: str | None) -> str:
        """导出当前有效 YAML 并写入审计日志。"""
        yaml_text = self.store.active_yaml_text()
        self._audit(actor_external_id, "intent_router.config.export", "active", {"version": self.store.version_for_yaml(yaml_text), "status": "success"})
        self.db.commit()
        return yaml_text

    def publish(self, yaml_text: str | None, *, actor_external_id: str | None, evaluation: IntentEvalReport | None = None) -> IntentRouterConfigView:
        """发布配置并写入审计日志。"""
        old_version = self.store.version_for_yaml(self.store.active_yaml_text())
        config = self.store.publish(yaml_text)
        new_version = self.store.version_for_yaml(self.store.dump_yaml(config))
        self._audit(
            actor_external_id,
            "intent_router.config.publish",
            "active",
            {
                "status": "success",
                "old_version": old_version,
                "new_version": new_version,
                "registry_version": config.version,
                "evaluation": evaluation.model_dump(mode="json") if evaluation else None,
            },
        )
        self.db.commit()
        return self.view(evaluation=evaluation, actor_external_id=actor_external_id)

    def reload(self, *, actor_external_id: str | None, evaluation: IntentEvalReport | None = None) -> IntentRouterConfigView:
        """从文件重新加载配置并写入审计日志。"""
        try:
            config = self.store.reload_from_file()
            detail = {"status": "success", "registry_version": config.version, "path": str(self.store.active_read_path())}
            action_status = "success"
        except Exception as exc:
            detail = {"status": "failed", "path": str(self.store.active_read_path()), "error": str(exc)}
            action_status = "failed"
            self._audit(actor_external_id, "intent_router.config.reload", "active", detail)
            self.db.commit()
            logger.warning(
                "Intent Registry 重新加载失败，已写入审计日志：path=%s actor_external_id=%s trace_id=%s",
                detail["path"],
                actor_external_id,
                get_trace_id(),
                exc_info=True,
            )
            raise
        self._audit(actor_external_id, "intent_router.config.reload", "active", {**detail, "action_status": action_status})
        self.db.commit()
        return self.view(evaluation=evaluation, actor_external_id=actor_external_id)

    def rollback(self, *, actor_external_id: str | None, evaluation: IntentEvalReport | None = None) -> IntentRouterConfigView:
        """回滚上一版本并写入审计日志。"""
        config = self.store.rollback()
        self._audit(actor_external_id, "intent_router.config.rollback", "active", {"status": "success", "registry_version": config.version})
        self.db.commit()
        return self.view(evaluation=evaluation, actor_external_id=actor_external_id)

    def audit_failure(self, actor_external_id: str | None, action: str, target_id: str, error: str) -> None:
        """记录失败的配置治理操作。"""
        self._audit(actor_external_id, action, target_id, {"status": "failed", "error": error})
        self.db.commit()

    def _audit(self, actor_external_id: str | None, action: str, target_id: str, detail: dict[str, Any]) -> None:
        """写入管理员审计日志。"""
        actor_id = None
        if actor_external_id:
            actor = self.db.execute(select(User).where(User.external_id == actor_external_id)).scalar_one_or_none()
            actor_id = actor.id if actor else None
        self.db.add(
            AdminAuditLog(
                actor_user_id=actor_id,
                action=action,
                target_type="intent_router",
                target_id=target_id,
                detail_json={**detail, "trace_id": detail.get("trace_id") or get_trace_id()},
            )
        )
