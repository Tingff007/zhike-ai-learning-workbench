"""讯飞星火知识库 ChatDoc 错误码与文档链接。

官方 API 文档：https://www.xfyun.cn/doc/spark/ChatDoc-API.html
控制台 / 在线文档：https://chatdoc.xfyun.cn/docs#/
"""

from __future__ import annotations

from typing import Any

DOC_URL = "https://chatdoc.xfyun.cn/docs#/"
API_DOC_URL = "https://www.xfyun.cn/doc/spark/ChatDoc-API.html"
AUTH_DOC_URL = "https://www.xfyun.cn/doc/spark/ChatDoc-API.html#%E4%BA%8C%E3%80%81%E9%89%B4%E6%9D%83%E8%AE%A4%E8%AF%81"

CHATDOC_HTTP_ERROR_HINTS: dict[int, str] = {
    401: "鉴权失败：检查 AppId、APISecret、秒级 timestamp 及签名算法（MD5(appId+timestamp) 后 HmacSHA1）",
    403: "服务器时间与标准时间相差超过 5 分钟，或鉴权时间戳无效",
    405: "AppId 未开通 ChatDoc 授权，请在讯飞控制台开通星火知识库",
}

# ChatDoc API 文档 §七、错误码
CHATDOC_BUSINESS_ERROR_HINTS: dict[int, str] = {
    10013: "问答的问题或引用文段有敏感违规信息，检查问题或文件内容",
    10014: "问答的输出有敏感违规信息，尝试换个问法",
    10019: "问答的问题或引用文段可能涉政，检查问题或文件内容",
    60001: "文件类型不对，仅支持 doc/docx、pdf、md、txt",
    60002: "文件大小超限（单文件不超过 20MB）",
    60003: "文件上传失败，请重试或检查网络",
    60005: "无文件权限，检查 fileId / repoId 是否属于当前 AppId",
    60011: "文件字数超限（不超过 100 万字符）",
    60012: "文件无有效字符，检查 PDF/OCR 解析结果",
    60014: "检索或问答未传入 fileId，检查入参",
    62001: "未找到相关文本段，调整提问或确认文档已向量化（vectored）",
    64001: "知识库名称（repoName）在该 AppId 下已存在；与上传文件名无关，可复用已有 repo 或更换课程 slug",
    68003: "操作过于频繁，稍后重试",
    99999: "ChatDoc 内部错误，携带 sid 联系讯飞技术支持",
}


def format_chatdoc_vendor_raw(
    *,
    http_status: int | None = None,
    body: dict[str, Any] | None = None,
    response_text: str | None = None,
    path: str | None = None,
) -> str:
    """格式化讯飞 HTTP/JSON 原始错误内容。

    参数:
        http_status: 可选的 HTTP 状态码。
        body: 可选的 JSON 响应体。
        response_text: 可选的原始响应文本。
        path: 可选的 ChatDoc 接口路径。

    返回:
        仅包含供应商原文的错误摘要，不附加本系统 hint 与文档链接。
    """
    import json

    lines: list[str] = []
    if http_status is not None:
        lines.append(f"HTTP {http_status}")
    if isinstance(body, dict) and body:
        emitted = False
        for key in ("code", "desc", "message", "msg", "sid"):
            if key in body and body[key] not in (None, ""):
                lines.append(f"{key}={body[key]}")
                emitted = True
        if not emitted:
            try:
                lines.append(json.dumps(body, ensure_ascii=False)[:2000])
            except (TypeError, ValueError):
                lines.append(str(body)[:2000])
    else:
        text = (response_text or "").strip()
        if text:
            lines.append(text[:2000])
    if path:
        lines.append(f"path={path}")
    return "\n".join(lines) if lines else "（讯飞未返回可读错误内容）"


def format_chatdoc_error(
    *,
    code: int | str | None = None,
    message: str | None = None,
    sid: str | None = None,
    http_status: int | None = None,
    path: str | None = None,
) -> str:
    """拼接面向系统日志和用户提示的 ChatDoc 错误信息。

    参数:
        code: ChatDoc 业务错误码，允许保留供应商返回的字符串形式。
        message: ChatDoc 返回的错误描述。
        sid: 讯飞侧请求追踪 ID。
        http_status: 可选的 HTTP 状态码。
        path: 可选的 ChatDoc 接口路径。

    返回:
        包含错误码、提示、文档链接和追踪信息的可读字符串。
    """
    try:
        numeric = int(code) if code is not None else -1
    except (TypeError, ValueError):
        numeric = -1

    hint = CHATDOC_BUSINESS_ERROR_HINTS.get(numeric)
    if hint is None and http_status is not None:
        hint = CHATDOC_HTTP_ERROR_HINTS.get(http_status)

    parts: list[str] = []
    if http_status is not None:
        parts.append(f"ChatDoc HTTP {http_status}")
    if code is not None:
        parts.append(f"code={code}")
    if message:
        parts.append(message)
    if hint:
        parts.append(hint)
    parts.append(f"文档 {DOC_URL}")
    if sid:
        parts.append(f"sid={sid}")
    if path:
        parts.append(f"path={path}")
    return " — ".join(parts)
