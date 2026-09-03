"""讯飞星火知识库 ChatDoc 鉴权（与官方文档一致）。

文档：https://www.xfyun.cn/doc/spark/ChatDoc-API.html#二、鉴权认证
1. timestamp：Unix 秒级时间戳（与服务端相差 5 分钟内）
2. auth = MD5(appId + timestamp) → 32 位小写十六进制
3. signature = Base64(HmacSHA1(auth, APISecret))
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time


def chatdoc_signature(app_id: str, api_secret: str, timestamp: int | None = None) -> tuple[str, str, str]:
    """生成 ChatDoc 鉴权三元组。

    参数:
        app_id: 讯飞控制台提供的 AppId。
        api_secret: 讯飞控制台提供的 APISecret。
        timestamp: 可选的秒级 Unix 时间戳；为空时使用当前时间。

    返回:
        依次返回规范化后的 appId、timestamp 字符串和 Base64 编码的 signature。
    """
    app = (app_id or "").strip()
    secret = (api_secret or "").strip()
    ts = int(timestamp) if timestamp is not None else int(time.time())
    ts_text = str(ts)
    auth = hashlib.md5(f"{app}{ts_text}".encode("utf-8")).hexdigest()
    digest = hmac.new(secret.encode("utf-8"), auth.encode("utf-8"), hashlib.sha1).digest()
    signature = base64.b64encode(digest).decode("utf-8")
    return app, ts_text, signature


def chatdoc_auth_headers(
    app_id: str,
    api_secret: str,
    *,
    timestamp: int | None = None,
) -> dict[str, str]:
    """构造 ChatDoc HTTP 请求使用的鉴权请求头。

    参数:
        app_id: 讯飞控制台提供的 AppId。
        api_secret: 讯飞控制台提供的 APISecret。
        timestamp: 可选的秒级 Unix 时间戳；为空时使用当前时间。

    返回:
        包含 appId、timestamp 和 signature 的请求头字段。
    """
    app, ts_text, signature = chatdoc_signature(app_id, api_secret, timestamp)
    return {
        "appId": app,
        "timestamp": ts_text,
        "signature": signature,
    }
