from __future__ import annotations

import re


class ResourceTaskCancelled(RuntimeError):
    """资源任务已被用户取消。"""


def compact_root_cause(message: str | None) -> str | None:
    """从已存储异常中提取适合前端展示的短根因。"""
    if not message or not str(message).strip():
        return None
    raw = str(message).strip()
    lower = raw.lower()
    candidates: list[str] = []
    for line in raw.splitlines():
        text = line.strip()
        if not text or text.lower().startswith("traceback"):
            continue
        if 'file "' in text.lower() or text.endswith(".py\""):
            continue
        candidates.append(text)
    chosen = candidates[-1] if candidates else raw.splitlines()[0].strip()
    if not chosen:
        return None
    if len(chosen) > 220:
        chosen = f"{chosen[:217]}..."
    if len(raw) > 180 and ("traceback" in lower or 'file "' in lower) and chosen == raw.splitlines()[0].strip():
        return None
    return chosen


def parse_generation_error(message: str | None) -> tuple[str | None, str | None]:
    """返回任务接口使用的用户提示和可选根因。"""
    summary = sanitize_generation_error_message(message)
    root = compact_root_cause(message)
    if summary and root and summary.strip() == root.strip():
        root = None
    return summary, root


def sanitize_generation_error_message(message: str | None) -> str | None:
    """将内部异常映射为资源任务接口的中文用户提示。"""
    if not message or not str(message).strip():
        return None
    raw = str(message).strip()
    lower = raw.lower()

    if (
        "ai_model_unavailable" in lower
        or "ai_model_not_configured" in lower
        or "chatprovider" in lower
        or "真实大模型调用" in raw
        or "missing api key" in lower
        or "缺少 api key" in raw.lower()
        or "local fallback" in lower
        or "本地降级" in raw
        or "本地模板" in raw
    ):
        return "AI 模型服务未完成真实调用，资源未生成；请检查模型网关配置、网络连接和供应商 API 状态。"
    if "has no attribute" in lower or "attributeerror" in lower:
        return "课程知识检索服务异常，请联系管理员检查知识库与后端版本。"
    if "iflytek" in lower or "chatdoc" in lower:
        return "知识库检索服务暂不可用，请检查讯飞 ChatDoc 凭证与网络连接。"
    if "rag_backend" in lower or "仅支持 rag_backend" in lower:
        return "检索后端未正确配置，请在环境变量中设置 RAG_BACKEND=iflytek_chatdoc。"
    if "no active provider" in lower or "model gateway" in lower or "provider" in lower and "not found" in lower:
        return "模型网关未配置可用模型，请在「模型网关」中为当前课程绑定并测试连接。"
    if "course not found" in lower or "课程不存在" in raw:
        return "课程不存在或无权访问，请重新选择课程。"
    if "course evidence unavailable" in lower:
        return "当前课程资料还未完成云端向量化，无法基于课件生成。你可以继续使用普通 AI 生成，但不会带课程资料引用。"
    if "safety_blocked" in lower:
        return "安全审查未通过，资源正文未保存。请调整生成要求后重试。"
    if "cancelled" in lower or "已取消" in raw:
        return "资源生成任务已取消。"
    if "connection" in lower or "timeout" in lower or "timed out" in lower:
        return "连接模型或知识库超时，请检查网络后重试。"
    if "rate limit" in lower or "429" in raw:
        return "请求过于频繁，请稍后再试。"
    if len(raw) > 180 or 'file "' in raw or '.py"' in lower or "traceback" in lower:
        return "服务器处理失败，请稍后重试；若持续失败请联系管理员查看日志。"
    if re.search(r"^[A-Za-z_]+Error:", raw):
        return "服务器处理失败，请稍后重试或联系管理员。"

    return raw
