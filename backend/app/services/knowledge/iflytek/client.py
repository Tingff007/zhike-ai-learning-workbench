from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.knowledge.iflytek.chatdoc_auth import chatdoc_auth_headers
from app.services.knowledge.iflytek.chatdoc_errors import DOC_URL, format_chatdoc_error, format_chatdoc_vendor_raw
from app.services.knowledge.integration_templates import get_template, template_key_for_rag_backend
from app.services.knowledge.rag_env_credentials import missing_credentials_message


logger = logging.getLogger(__name__)


class IflytekChatDocError(RuntimeError):
    """讯飞 ChatDoc 调用异常。

    用途:
        同时保存面向排障的完整错误说明和供应商原始响应片段。

    副作用/失败:
        仅封装异常信息；vendor_raw 用于日志或管理端排障，不应直接暴露敏感凭据。
    """

    def __init__(self, detail: str, *, vendor_raw: str | None = None) -> None:
        """初始化 ChatDoc 异常。

        参数:
            detail: 面向应用日志或 API 错误处理的错误详情。
            vendor_raw: 可选供应商原始 HTTP/JSON 响应摘要；为空时使用 detail。

        返回:
            None。

        副作用/失败:
            仅设置异常字段，不执行 I/O。
        """
        super().__init__(detail)
        self.vendor_raw = (vendor_raw or detail).strip()

    @property
    def detail(self) -> str:
        """返回异常详情文本。

        返回:
            构造异常时传入的 detail；缺失时返回空字符串。

        副作用/失败:
            无副作用，不抛出额外异常。
        """
        return str(self.args[0]) if self.args else ""


class IflytekChatDocClient:
    """讯飞星火 ChatDoc（chatdoc.xfyun.cn）的 HTTP 客户端。

    用途:
        封装鉴权、请求发送和响应解析，供知识库上传、检索、问答和状态同步复用。

    副作用/失败:
        请求方法会访问讯飞云端接口；凭据缺失、网络异常或供应商错误会抛出 IflytekChatDocError 或 httpx 异常。
    """

    BASE_URL = "https://chatdoc.xfyun.cn"

    def __init__(
        self,
        *,
        app_id: str | None = None,
        api_secret: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        """初始化 ChatDoc 客户端。

        参数:
            app_id: 讯飞 ChatDoc 应用 ID。
            api_secret: 讯飞 ChatDoc API Secret。
            timeout: HTTP 请求超时时间，单位为秒。

        返回:
            None。

        副作用/失败:
            仅保存配置，不校验凭据也不发起网络请求。
        """
        self.app_id = (app_id or "").strip()
        self.api_secret = (api_secret or "").strip()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        """判断客户端是否具备发起 ChatDoc 请求所需凭据。

        返回:
            app_id 和 api_secret 均非空时返回 True，否则返回 False。

        副作用/失败:
            无副作用，不访问数据库或网络。
        """
        return bool(self.app_id and self.api_secret)

    def _auth_headers(self, *, timestamp: int | None = None) -> dict[str, str]:
        if not self.configured:
            template = get_template(template_key_for_rag_backend("iflytek_chatdoc"))
            raise IflytekChatDocError(missing_credentials_message(template, doc_url=DOC_URL))
        return chatdoc_auth_headers(self.app_id, self.api_secret, timestamp=timestamp)

    async def post_json(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """向 ChatDoc 发送 JSON POST 请求。

        参数:
            path: ChatDoc API 路径，例如 /openapi/v1/file/list。
            payload: 可选 JSON 请求体；为空时发送空对象。

        返回:
            解析后的 data 字典；非对象 data 会按统一结构包装。

        副作用/失败:
            会发起外部网络请求；凭据缺失、HTTP 错误或供应商错误会抛出异常。
        """
        url = f"{self.BASE_URL}{path}"
        headers = {"Content-Type": "application/json", **self._auth_headers()}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, json=payload or {})
        return self._parse_response(response, path=path)

    async def post_form(self, path: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
        """向 ChatDoc 发送表单 POST 请求。

        参数:
            path: ChatDoc API 路径。
            fields: 可选表单字段，会统一转换为字符串。

        返回:
            解析后的 data 字典。

        副作用/失败:
            会发起外部网络请求；凭据缺失、HTTP 错误或供应商错误会抛出异常。部分接口要求表单格式，例如 file/status、embedding。
        """
        url = f"{self.BASE_URL}{path}"
        headers = self._auth_headers()
        form = {key: str(value) for key, value in (fields or {}).items()}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, data=form)
        return self._parse_response(response, path=path)

    async def get_json(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        """向 ChatDoc 发送 GET 查询请求。

        参数:
            path: ChatDoc API 路径。
            params: 可选查询参数，会统一转换为字符串。

        返回:
            解析后的 data 字典。

        副作用/失败:
            会发起外部网络请求；凭据缺失、HTTP 错误或供应商错误会抛出异常。
        """
        url = f"{self.BASE_URL}{path}"
        headers = self._auth_headers()
        query = {key: str(value) for key, value in (params or {}).items()}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, headers=headers, params=query)
        return self._parse_response(response, path=path)

    async def probe_connection(self) -> dict[str, Any]:
        """探测 ChatDoc 鉴权和接口可达性。

        返回:
            文件列表接口返回的解析结果。

        副作用/失败:
            会请求 ChatDoc 文件列表接口；凭据缺失、网络异常或供应商错误会向上抛出。
        """
        return await self.post_json(
            "/openapi/v1/file/list",
            {"currentPage": 1, "pageSize": 1},
        )

    # 文档问答（§3.3）与文件萃取接入成功后，调用 ChatdocVendorQuotaService
    # 记录 record_doc_qa() 或 record_extract() 用量。

    async def upload_file(
        self,
        *,
        filename: str,
        content: bytes,
        mime_type: str | None = None,
        file_type: str = "wiki",
        parse_type: str = "AUTO",
        step_by_step: bool = False,
        extra_fields: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """上传文件到讯飞 ChatDoc。

        参数:
            filename: 上传给 ChatDoc 的文件名。
            content: 文件二进制内容。
            mime_type: 可选 MIME 类型；为空时根据文件名推断。
            file_type: ChatDoc 文件类型，默认 wiki。
            parse_type: ChatDoc 解析类型，默认 AUTO。
            step_by_step: 是否启用分步处理模式。
            extra_fields: 可选额外表单字段，用于透传流水线配置。

        返回:
            ChatDoc 上传接口解析后的 data 字典。

        副作用/失败:
            会发起 multipart 上传请求；凭据缺失、网络异常、供应商错误或 MIME 推断异常会向上抛出。
        """
        from app.services.knowledge.iflytek.upload_utils import guess_upload_mime_type

        url = f"{self.BASE_URL}/openapi/v1/file/upload"
        headers = self._auth_headers()
        data = {
            "fileType": file_type,
            "parseType": parse_type,
            "stepByStep": "true" if step_by_step else "false",
            **(extra_fields or {}),
        }
        content_type = guess_upload_mime_type(filename, mime_type)
        files = {"file": (filename, content, content_type)}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=headers, data=data, files=files)
        return self._parse_response(response, path="/openapi/v1/file/upload")

    @staticmethod
    def _raise_chatdoc_error(
        *,
        http_status: int | None,
        body: dict | None,
        response_text: str,
        path: str | None,
    ) -> None:
        vendor_message = ""
        if isinstance(body, dict):
            vendor_message = str(body.get("desc") or body.get("message") or body.get("msg") or "")
        vendor_raw = format_chatdoc_vendor_raw(
            http_status=http_status,
            body=body if isinstance(body, dict) else None,
            response_text=response_text if not isinstance(body, dict) else None,
            path=path,
        )
        sid = body.get("sid") if isinstance(body, dict) else None
        code = body.get("code") if isinstance(body, dict) else None
        detail = format_chatdoc_error(
            code=code,
            message=vendor_message or (response_text[:500] if response_text else None),
            sid=str(sid) if sid else None,
            http_status=http_status,
            path=path,
        )
        raise IflytekChatDocError(detail, vendor_raw=vendor_raw)

    @staticmethod
    def _parse_response(response: httpx.Response, *, path: str | None = None) -> dict[str, Any]:
        response_text = response.text or ""
        try:
            body = response.json()
        except Exception:
            logger.warning(
                "解析 ChatDoc 响应 JSON 失败：path=%s http_status=%s body_preview=%s",
                path,
                response.status_code,
                response_text[:300],
                exc_info=True,
            )
            IflytekChatDocClient._raise_chatdoc_error(
                http_status=response.status_code,
                body=None,
                response_text=response_text,
                path=path,
            )
        if not isinstance(body, dict):
            body = {"raw": body}
        if response.status_code >= 400:
            IflytekChatDocClient._raise_chatdoc_error(
                http_status=response.status_code,
                body=body,
                response_text=response_text,
                path=path,
            )
        code = body.get("code")
        if code not in (None, 0, "0", 200, "200"):
            IflytekChatDocClient._raise_chatdoc_error(
                http_status=response.status_code,
                body=body,
                response_text=response_text,
                path=path,
            )
        data = body.get("data")
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {"items": data}
        if isinstance(data, (str, int, float, bool)) and data is not True and data is not False:
            return {"data": data}
        return {"raw": body}
