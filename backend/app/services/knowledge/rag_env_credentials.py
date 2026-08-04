"""按 RAG 接入模板的 env_prefix 与 credential_fields 解析 .env 凭证，避免写死厂商变量名。"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.rag_integration import RagCredentialField, RagIntegrationTemplateItem


def credential_env_suffix(field_key: str, field: RagCredentialField | None = None) -> str:
    """解析凭证字段对应的环境变量后缀。

    参数:
        field_key: RAG 模板中的凭证字段 key。
        field: 可选的字段定义，优先使用其中显式配置的 env_suffix。

    返回:
        大写并使用下划线分隔的环境变量后缀。
    """
    if field is not None and field.env_suffix:
        return field.env_suffix.strip().upper()
    return field_key.strip().upper().replace("-", "_")


def credential_env_var_name(env_prefix: str | None, field_key: str, field: RagCredentialField | None = None) -> str:
    """拼接凭证字段完整环境变量名。

    参数:
        env_prefix: 模板级环境变量前缀。
        field_key: RAG 模板中的凭证字段 key。
        field: 可选的字段定义。

    返回:
        完整环境变量名；缺少前缀时返回空字符串。
    """
    prefix = (env_prefix or "").strip()
    if not prefix:
        return ""
    return f"{prefix}_{credential_env_suffix(field_key, field)}"


def read_env_credential(env_prefix: str | None, field_key: str, field: RagCredentialField | None = None) -> str:
    """读取单个凭证字段在环境变量中的值。

    参数:
        env_prefix: 模板级环境变量前缀。
        field_key: RAG 模板中的凭证字段 key。
        field: 可选的字段定义。

    返回:
        去除首尾空白后的环境变量值；未配置时返回空字符串。
    """
    name = credential_env_var_name(env_prefix, field_key, field)
    if not name:
        return ""
    return (os.getenv(name) or "").strip()


def wiki_filter_default_from_template(template: RagIntegrationTemplateItem | None) -> float:
    """从模板或环境变量读取知识库命中过滤阈值。

    参数:
        template: RAG 接入模板，允许为空。

    返回:
        wiki_filter_score 的浮点阈值；无配置或配置非法时返回默认值 0.82。
    """
    if template is None:
        return 0.82
    for field in template.credential_fields:
        if field.key == "wiki_filter_score":
            env_raw = read_env_credential(template.env_prefix, field.key, field)
            if env_raw:
                try:
                    return float(env_raw)
                except ValueError:
                    pass
            if field.default is not None:
                return float(field.default)
            break
    return 0.82


def env_var_names_for_template(template: RagIntegrationTemplateItem | None) -> list[str]:
    """列出模板所有凭证字段对应的环境变量名。

    参数:
        template: RAG 接入模板，允许为空。

    返回:
        按模板字段顺序生成的环境变量名列表。
    """
    if template is None or not (template.env_prefix or "").strip():
        return []
    return [
        credential_env_var_name(template.env_prefix, field.key, field)
        for field in template.credential_fields
        if credential_env_var_name(template.env_prefix, field.key, field)
    ]


def env_var_names_for_secrets(template: RagIntegrationTemplateItem | None) -> list[str]:
    """列出模板中敏感凭证字段对应的环境变量名。

    参数:
        template: RAG 接入模板，允许为空。

    返回:
        密码类字段和核心鉴权字段对应的环境变量名列表。
    """
    if template is None:
        return []
    names: list[str] = []
    for field in template.credential_fields:
        if field.type == "password" or field.key in {"app_id", "api_key", "api_secret"}:
            name = credential_env_var_name(template.env_prefix, field.key, field)
            if name:
                names.append(name)
    return names


def read_env_credentials_map(template: RagIntegrationTemplateItem | None) -> dict[str, str]:
    """读取模板中所有已配置的环境变量凭证。

    参数:
        template: RAG 接入模板，允许为空。

    返回:
        以模板字段 key 为键的凭证字典，未配置字段不会出现在结果中。
    """
    if template is None:
        return {}
    values: dict[str, str] = {}
    for field in template.credential_fields:
        raw = read_env_credential(template.env_prefix, field.key, field)
        if raw:
            values[field.key] = raw
    return values


def merge_db_and_env_credentials(
    template: RagIntegrationTemplateItem | None,
    *,
    app_id: str = "",
    api_secret: str = "",
    base_url: str = "",
) -> dict[str, str]:
    """合并数据库凭证和环境变量凭证。

    参数:
        template: RAG 接入模板，允许为空。
        app_id: 数据库中保存的应用 ID。
        api_secret: 数据库中保存的 API 密钥或 Secret。
        base_url: 数据库中保存的服务地址。

    返回:
        合并后的凭证字典；数据库值优先，缺失时回退到环境变量。
    """
    merged: dict[str, str] = {}
    if app_id:
        merged["app_id"] = app_id
    if api_secret:
        merged["api_secret"] = api_secret
    if base_url:
        merged["base_url"] = base_url
    for key, value in read_env_credentials_map(template).items():
        if value and not merged.get(key):
            merged[key] = value
    return merged


def resolve_app_id_and_secret(template: RagIntegrationTemplateItem | None, creds: dict[str, str]) -> tuple[str, str]:
    """从凭证字典中解析应用 ID 和密钥。

    参数:
        template: RAG 接入模板，当前用于保持调用契约兼容。
        creds: 已合并的凭证字典。

    返回:
        应用 ID 与密钥二元组；密钥字段兼容 api_secret 和 api_key。
    """
    app_id = (creds.get("app_id") or "").strip()
    api_secret = (creds.get("api_secret") or creds.get("api_key") or "").strip()
    return app_id, api_secret


def has_env_credentials(template: RagIntegrationTemplateItem | None) -> bool:
    """判断模板是否具备可用的环境变量凭证。

    参数:
        template: RAG 接入模板，允许为空。

    返回:
        存在必要身份字段或敏感字段时返回 True。
    """
    env_map = read_env_credentials_map(template)
    if not env_map:
        return False
    if template is None:
        return False
    identity_keys = {field.key for field in template.credential_fields if field.type != "password"}
    secret_keys = {field.key for field in template.credential_fields if field.type == "password"}
    has_identity = any(env_map.get(key) for key in identity_keys)
    has_secret = any(env_map.get(key) for key in secret_keys)
    if secret_keys:
        return has_secret
    return has_identity


def missing_credentials_message(template: RagIntegrationTemplateItem | None, *, doc_url: str = "") -> str:
    """生成缺少知识库凭证时的中文提示。

    参数:
        template: RAG 接入模板，允许为空。
        doc_url: 可选的配置文档地址。

    返回:
        面向管理员的缺失凭证提示文案。
    """
    names = env_var_names_for_secrets(template)
    hint = f"（{', '.join(names)}）" if names else ""
    suffix = f" 文档 {doc_url}" if doc_url else ""
    return f"知识库凭证未配置{hint}，请在管理端填写或在 .env 中配置对应环境变量。{suffix}".strip()
