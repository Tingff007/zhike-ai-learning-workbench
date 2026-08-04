from __future__ import annotations

import json
import logging
from copy import deepcopy
from typing import Any

logger = logging.getLogger(__name__)


def _stage_body(config: dict[str, Any] | None, stage_id: str) -> dict[str, Any]:
    """从流水线配置中读取指定阶段的请求体。

    参数:
        config: 已保存或前端提交的流水线配置。
        stage_id: 需要读取的阶段标识。

    返回:
        阶段 body 字典；兼容 document.<stage_id>.body 和顶层 <stage_id>.body 两种历史形态。

    副作用/失败:
        不修改输入配置；结构缺失或类型不匹配时返回空字典作为安全兜底。
    """
    if not config:
        return {}
    document = config.get("document")
    if isinstance(document, dict):
        stage = document.get(stage_id)
        if isinstance(stage, dict):
            body = stage.get("body")
            return body if isinstance(body, dict) else {}
    stage = config.get(stage_id)
    if isinstance(stage, dict):
        body = stage.get("body")
        return body if isinstance(body, dict) else {}
    return {}


def _upload_section(body: dict[str, Any]) -> dict[str, Any]:
    """读取 ChatDoc 上传阶段配置段。

    参数:
        body: 上传预处理阶段的 body 字典。

    返回:
        优先返回官方路径键 `/openapi/v1/file/upload` 下的配置，其次兼容旧版 `upload`，
        最后把 body 自身视为上传配置。

    副作用/失败:
        只做结构选择，不修改输入；缺少嵌套配置时按原 body 兜底。
    """
    upload = body.get("/openapi/v1/file/upload")
    if isinstance(upload, dict):
        return upload
    if isinstance(body.get("upload"), dict):
        return body["upload"]
    return body


def _split_section(body: dict[str, Any]) -> dict[str, Any]:
    """读取 ChatDoc 文件切分阶段配置段。

    参数:
        body: 上传预处理阶段的 body 字典。

    返回:
        官方路径键 `/openapi/v1/file/split` 下的配置；缺失或类型不匹配时返回空字典。

    副作用/失败:
        不修改输入配置，也不抛出结构异常。
    """
    split = body.get("/openapi/v1/file/split")
    return split if isinstance(split, dict) else {}


def _use_vendor_default_wiki_split(body: dict[str, Any]) -> bool:
    """判断上传时是否使用讯飞内置切分配置。

    参数:
        body: 上传预处理阶段的 body 字典。

    返回:
        当 split 或 upload 配置中显式声明 `isSplitDefault` 时返回对应布尔值；未声明时返回 False。

    副作用/失败:
        只读取配置，不修改输入。返回 True 时上传字段构造会跳过自定义 `extend`，避免同时提交默认切分和
        自定义切分参数。
    """
    split = _split_section(body)
    if "isSplitDefault" in split:
        return bool(split.get("isSplitDefault"))
    upload = _upload_section(body)
    if "isSplitDefault" in upload:
        return bool(upload.get("isSplitDefault"))
    return False


def _retrieval_section(body: dict[str, Any]) -> dict[str, Any]:
    """读取 ChatDoc 检索阶段配置段。

    参数:
        body: retrieval 阶段的 body 字典。

    返回:
        兼容直接配置 `content/topN/chatExtends` 和官方路径键 `/openapi/v1/vector/search`
        两种形态；无法识别嵌套结构时返回 body 本身，保持旧配置可继续生效。

    副作用/失败:
        不修改输入配置；类型不匹配时不抛出异常。
    """
    if body.get("content") or body.get("topN") or body.get("chatExtends"):
        return body
    nested = body.get("/openapi/v1/vector/search")
    return nested if isinstance(nested, dict) else body


def upload_form_fields_from_pipeline(config: dict[str, Any] | None) -> dict[str, str]:
    """把已保存的流水线 JSON 映射为 ChatDoc 上传表单字段。

    参数:
        config: 已保存的流水线配置对象；为空时使用默认上传字段。

    返回:
        可传给 ChatDoc multipart 上传接口的字符串字段字典。

    副作用/失败:
        不修改输入配置；extend 为非字符串对象时会序列化为 JSON，序列化失败会向上抛出 TypeError。
    """
    body = _stage_body(config, "upload_preprocess")
    upload = _upload_section(body)
    if not upload:
        return {}

    fields: dict[str, str] = {}
    for key in ("parseType", "fileType", "callbackUrl"):
        value = upload.get(key)
        if value is not None and str(value).strip():
            fields[key] = str(value)

    if "stepByStep" in upload:
        fields["stepByStep"] = "true" if bool(upload.get("stepByStep")) else "false"

    if not _use_vendor_default_wiki_split(body):
        extend = upload.get("extend")
        if extend is not None:
            if isinstance(extend, str):
                fields["extend"] = extend
            else:
                fields["extend"] = json.dumps(extend, ensure_ascii=False)

    return fields


def vector_search_payload_from_pipeline(
    config: dict[str, Any] | None,
    *,
    file_ids: list[str],
    content: str,
    top_n: int,
    wiki_filter_score: float,
) -> dict[str, Any]:
    """构建 ChatDoc vector/search 请求体。

    参数:
        config: 可选流水线配置对象，存在 retrieval 阶段时覆盖默认检索参数。
        file_ids: ChatDoc fileId 列表。
        content: 检索文本。
        top_n: 默认返回数量。
        wiki_filter_score: 默认知识库过滤分数。

    返回:
        可发送给 ChatDoc vector/search 的 JSON 字典。

    副作用/失败:
        不修改输入配置；非法 topN 会被忽略并保留默认值。
    """
    payload: dict[str, Any] = {
        "fileIds": file_ids,
        "content": content,
        "topN": top_n,
        "chatExtends": {"wikiFilterScore": wiki_filter_score},
    }

    body = _retrieval_section(_stage_body(config, "retrieval"))
    if not body:
        return payload

    if body.get("topN") is not None:
        try:
            payload["topN"] = int(body["topN"])
        except (TypeError, ValueError):
            logger.debug("流水线检索阶段 topN 无法转换为整数，已保留默认值：topN=%r", body.get("topN"), exc_info=True)

    if "embedding" in body:
        payload["embedding"] = bool(body.get("embedding"))
    if "es" in body:
        payload["es"] = bool(body.get("es"))

    extends = body.get("chatExtends")
    if isinstance(extends, dict):
        merged = dict(payload.get("chatExtends") or {})
        merged.update(extends)
        payload["chatExtends"] = merged

    return payload


def wiki_filter_score_from_pipeline(config: dict[str, Any] | None, fallback: float) -> float:
    """从流水线配置中读取知识库过滤分数。

    参数:
        config: 可选流水线配置对象。
        fallback: 配置缺失或非法时使用的默认分数。

    返回:
        retrieval 或 qa_query 阶段中的 wikiFilterScore；无法解析时返回 fallback。

    副作用/失败:
        不修改输入配置；非法数值会被忽略，不抛出转换异常。
    """
    body = _retrieval_section(_stage_body(config, "retrieval"))
    extends = body.get("chatExtends") if isinstance(body.get("chatExtends"), dict) else {}
    raw = extends.get("wikiFilterScore")
    try:
        if raw is not None:
            return float(raw)
    except (TypeError, ValueError):
        logger.debug("流水线 retrieval 阶段 wikiFilterScore 无法转换为数字，准备检查 qa_query 兜底值：value=%r", raw, exc_info=True)
    qa_body = _stage_body(config, "qa_query")
    qa_extends = qa_body.get("chatExtends") if isinstance(qa_body.get("chatExtends"), dict) else {}
    raw_qa = qa_extends.get("wikiFilterScore")
    try:
        if raw_qa is not None:
            return float(raw_qa)
    except (TypeError, ValueError):
        logger.debug("流水线 qa_query 阶段 wikiFilterScore 无法转换为数字，已使用默认值：value=%r", raw_qa, exc_info=True)
    return fallback


def step_by_step_from_pipeline(config: dict[str, Any] | None, fallback: bool) -> bool:
    """从上传预处理阶段读取分步处理开关。

    参数:
        config: 可选流水线配置对象。
        fallback: 配置缺失时使用的默认值。

    返回:
        stepByStep 字段的布尔值；字段不存在时返回 fallback。

    副作用/失败:
        不修改输入配置，也不访问外部服务。
    """
    body = _stage_body(config, "upload_preprocess")
    upload = _upload_section(body)
    if "stepByStep" not in upload:
        return fallback
    return bool(upload.get("stepByStep"))


def doc_qa_payload_from_pipeline(
    config: dict[str, Any] | None,
    *,
    file_id: str,
    query: str,
) -> dict[str, Any]:
    """根据 qa_query 阶段构建 ChatDoc 文档问答或 WebSocket chat 请求体。

    参数:
        config: 可选流水线配置对象，qa_query 阶段可覆盖默认问答参数。
        file_id: 当前问答使用的 ChatDoc fileId。
        query: 用户问题文本。

    返回:
        符合 ChatDoc 官方格式的请求体字典。

    副作用/失败:
        不修改输入配置；非法 topN 会被忽略并保留默认请求体。

    使用官方 ChatDoc API 格式：
    - 使用 fileIds 列表而不是 fileId 字符串
    - 使用带 role/content 的 messages 数组，而不是裸 content 字符串
    """
    payload: dict[str, Any] = {
        "fileIds": [file_id],
        "messages": [{"role": "user", "content": query}],
        "chatExtends": {},
    }
    body = _stage_body(config, "qa_query")
    nested = body.get("/openapi/v1/qa/query")
    if isinstance(nested, dict):
        body = {**nested, **{k: v for k, v in body.items() if k != "/openapi/v1/qa/query"}}
    if not body:
        return payload

    if body.get("fileIds"):
        raw = body["fileIds"]
        payload["fileIds"] = raw if isinstance(raw, list) else [str(raw)]
    if body.get("topN") is not None:
        try:
            payload["topN"] = int(body["topN"])
        except (TypeError, ValueError):
            logger.debug("流水线问答阶段 topN 无法转换为整数，已保留默认请求体：topN=%r", body.get("topN"), exc_info=True)

    extends = body.get("chatExtends")
    if isinstance(extends, dict):
        merged = dict(payload.get("chatExtends") or {})
        merged.update(extends)
        payload["chatExtends"] = merged

    return payload


def extract_request_from_pipeline(config: dict[str, Any] | None, *, file_id: str) -> dict[str, Any] | None:
    """从流水线配置中构建问答萃取请求体。

    参数:
        config: 可选流水线配置对象。
        file_id: 需要萃取的 ChatDoc fileId，会覆盖配置中的 fileId。

    返回:
        可发送给 ChatDoc qa/extract 的请求体；未配置 extract_embed 阶段时返回 None。

    副作用/失败:
        会深拷贝配置中的萃取请求体，避免修改原始配置；深拷贝失败会向上抛出异常。
    """
    body = _stage_body(config, "extract_embed")
    extract = body.get("/openapi/v1/qa/extract")
    if not isinstance(extract, dict) or not extract:
        return None
    payload = deepcopy(extract)
    payload["fileId"] = file_id
    return payload


def config_with_stage_override(
    base: dict[str, Any] | None,
    *,
    stage_id: str,
    body: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """把单阶段请求体合并进流水线配置文档。

    参数:
        base: 原始流水线配置对象。
        stage_id: 需要覆盖的阶段 ID。
        body: 阶段请求体；为空时不修改配置。

    返回:
        合并后的流水线配置对象；body 为空时原样返回 base。

    副作用/失败:
        不修改 base 中的 document 字典原对象；输入不是预期结构时按空配置处理。
    """
    if not body:
        return base
    document: dict[str, Any] = {}
    if isinstance(base, dict) and isinstance(base.get("document"), dict):
        document = dict(base["document"])
    document[stage_id] = {"body": body}
    return {"document": document}


class PipelineConfigJsonError(ValueError):
    """前端传入的流水线阶段配置 JSON 解析异常。

    用途:
        让 API 层区分“严格阶段配置非法”和“宽松保存配置为空”的场景。

    副作用/失败:
        仅作为异常类型标记，不携带额外状态。
    """


def parse_pipeline_config_json(raw: str | None) -> dict[str, Any] | None:
    """宽松解析已保存的流水线配置 JSON。

    参数:
        raw: 数据库或配置来源中的 JSON 字符串。

    返回:
        解析出的 JSON 对象字典；空值、非法 JSON 或非对象 JSON 返回 None。

    副作用/失败:
        不抛出 JSONDecodeError，用于兼容历史脏数据或空配置。
    """
    if not raw or not str(raw).strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_pipeline_stage_json(raw: str | None) -> dict[str, Any] | None:
    """严格解析请求中的单阶段流水线配置 JSON。

    参数:
        raw: 前端表单或查询参数中的 JSON 字符串。

    返回:
        JSON 对象字典；空值或非对象 JSON 返回 None，保持旧接口兼容。

    抛出:
        PipelineConfigJsonError: 当输入不是合法 JSON 时抛出，由 API 层映射为 400。

    副作用:
        不修改外部状态，也不访问数据库或网络。
    """
    if not raw or not str(raw).strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PipelineConfigJsonError("pipeline_stage_json 不是合法 JSON") from exc
    return parsed if isinstance(parsed, dict) else None


def serialize_pipeline_config_json(data: dict[str, Any] | None) -> str | None:
    """把流水线配置对象序列化为数据库可保存的 JSON 字符串。

    参数:
        data: 待保存的流水线配置对象。

    返回:
        JSON 字符串；空对象或 None 返回 None。

    副作用/失败:
        不写入数据库；遇到不可 JSON 序列化的数据时抛出 TypeError。
    """
    if not data:
        return None
    return json.dumps(data, ensure_ascii=False)
