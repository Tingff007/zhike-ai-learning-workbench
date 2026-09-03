from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class MindmapContractError(ValueError):
    """思维导图结构化输出未通过契约校验。"""


class MindmapMermaidPayload(BaseModel):
    """模型生成的 Mermaid 思维导图 JSON 外层契约。"""

    model_config = ConfigDict(extra="forbid")

    chart_type: Literal["mindmap"] = "mindmap"
    syntax: Literal["mermaid"] = "mermaid"
    source_code: str = Field(min_length=20)

    @field_validator("source_code")
    @classmethod
    def validate_source_code(cls, value: str) -> str:
        """在 Pydantic 层先做 Mermaid mindmap 基础语法校验。"""

        source = clean_mermaid_source(value)
        validate_mermaid_mindmap_source(source)
        return source


def clean_mermaid_source(value: str) -> str:
    """清理模型输出中可能混入的 Markdown 代码围栏和首尾空白。"""

    source = (value or "").replace("\r\n", "\n").strip()
    source = re.sub(r"^```(?:mermaid)?\s*", "", source, flags=re.I).strip()
    source = re.sub(r"\s*```$", "", source).strip()
    lines = [line.rstrip() for line in source.split("\n") if line.strip()]
    return "\n".join(lines).strip()


def _extract_json_object(raw: str) -> dict[str, Any]:
    """从模型回复中提取唯一 JSON 对象，兼容供应商未严格遵守 json_mode 的情况。"""

    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise MindmapContractError("未找到 JSON 对象") from None
        try:
            payload = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise MindmapContractError(f"JSON 无法解析：{exc.msg}") from exc
    if not isinstance(payload, dict):
        raise MindmapContractError("JSON 顶层必须是对象")
    return payload


def validate_mermaid_mindmap_source(source: str) -> dict[str, int]:
    """校验 Mermaid mindmap 源码的关键结构并返回分支统计。"""

    lines = clean_mermaid_source(source).split("\n")
    if not lines or lines[0].strip() != "mindmap":
        raise MindmapContractError("Mermaid 源码必须以 mindmap 开头")
    node_lines = [line for line in lines[1:] if line.strip()]
    if not node_lines:
        raise MindmapContractError("Mermaid mindmap 至少需要一个根节点")
    if not re.match(r"^\s{2}root\(\([^()\n]{1,40}\)\)\s*$", node_lines[0]):
        raise MindmapContractError("根节点必须使用两空格缩进的 root((知识点名称))")

    branch_count = 0
    leaf_count = 0
    previous_indent = 2
    for line in node_lines[1:]:
        indent = len(line) - len(line.lstrip(" "))
        text = line.strip()
        if "\t" in line:
            raise MindmapContractError("禁止使用 Tab 缩进，请使用两个空格")
        if indent % 2 != 0 or indent < 4 or indent > 6:
            raise MindmapContractError("节点缩进只允许 4 或 6 个空格")
        if indent - previous_indent > 2:
            raise MindmapContractError("节点层级不能跳级")
        previous_indent = indent
        if re.search(r"[{}<>|`#\[\]]", text):
            raise MindmapContractError(f"节点文本包含 Mermaid 易冲突符号：{text[:24]}")
        if len(text) > 28:
            raise MindmapContractError(f"节点文本过长，请压缩为短节点：{text[:24]}")
        if indent == 4:
            branch_count += 1
        elif indent == 6:
            leaf_count += 1

    if branch_count < 5:
        raise MindmapContractError("二级分支至少需要 5 个")
    if leaf_count < branch_count:
        raise MindmapContractError("每个主要分支至少应有一个下级说明节点")
    return {"branch_count": branch_count, "leaf_count": leaf_count}


def parse_mindmap_mermaid_payload(raw: str) -> MindmapMermaidPayload:
    """解析并校验模型生成的 Mermaid JSON 外壳。"""

    try:
        return MindmapMermaidPayload.model_validate(_extract_json_object(raw))
    except ValidationError as exc:
        details = "; ".join(error.get("msg", "字段错误") for error in exc.errors()[:4])
        raise MindmapContractError(details or "思维导图 JSON 契约校验失败") from exc


def render_mindmap_payload(payload: MindmapMermaidPayload) -> str:
    """把已校验的导图契约稳定序列化为资源正文。"""

    return json.dumps(payload.model_dump(), ensure_ascii=False, indent=2)
