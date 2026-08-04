from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, ensure_course_access, get_current_user, resolve_user_from_token
from app.core.rate_limit import RateLimitExceeded, check_resource_rate_limit
from app.schemas.resource import (
    ResourceArchiveCourseRequest,
    ResourceAssetUploadResponse,
    ResourceBatchDeleteRequest,
    ResourceBatchDeleteResponse,
    ResourceCommunitySubmitResponse,
    Resource as ResourceDTO,
    ResourceDeleteResult,
    ResourceGenerateRequest,
    ResourceGenerationTask,
    ResourceGenerationTaskListResponse,
    ResourceGenerationTaskNotFound,
    ResourceHallResponse,
    ResourceListResponse,
    ResourceNotFoundResponse,
    ResourceTaskOutlineUpdate,
    ResourceTaskRerunRequest,
    ResourceUpdateRequest,
    ResourceVersionListResponse,
    CommunityResourceListResponse,
)
from app.services.idempotency.repository import IdempotencyRepository
from app.services.resource.queue import enqueue_resource_generation
from app.services.resource.repository import ResourceRepository
from app.services.resource.asset_service import ReferenceImageUploadPayload, ResourceAssetService
from app.services.resource.prompts import DIFFICULTY_LABELS, TYPE_LABELS
from app.core.config import settings

router = APIRouter()
task_router = APIRouter()
RESOURCE_IDEMPOTENCY_SCOPE = "resource.generate"
ALLOWED_REFERENCE_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
RESOURCE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_RESOURCE_UPLOAD_EXTENSIONS = {".md", ".markdown", ".txt", ".text"}
ALLOWED_RESOURCE_UPLOAD_MIME_TYPES = {"", "text/plain", "text/markdown", "application/octet-stream"}


def _optional_current_user(authorization: str | None, db: Session) -> CurrentUser | None:
    """从请求头解析可选用户，用于资源大厅的个性化聚合。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    return resolve_user_from_token(db, token)


async def _create_resource_task(
    payload: ResourceGenerateRequest,
    current_user: CurrentUser,
    db: Session,
    x_idempotency_key: str | None,
) -> dict[str, object]:
    """创建资源生成任务，统一处理课程权限、限流和幂等缓存。"""
    if payload.scope == "course" or payload.course_id:
        ensure_course_access(db, current_user, payload.course_id or "")
    try:
        check_resource_rate_limit(current_user.id, payload.course_id or "general")
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={"message": "资源生成任务配额已用尽", "scope": exc.scope, "retry_after_seconds": exc.retry_after_seconds},
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    idempotency = IdempotencyRepository(db)
    if x_idempotency_key:
        cached = idempotency.get(RESOURCE_IDEMPOTENCY_SCOPE, x_idempotency_key)
        if cached:
            return cached

    task = ResourceRepository(db).create_generation_task(payload, current_user.id)
    if task.get("task_id") and task.get("status") == "queued":
        enqueue_resource_generation(task["task_id"])
        if x_idempotency_key:
            idempotency.put(RESOURCE_IDEMPOTENCY_SCOPE, x_idempotency_key, task)
    return task


@router.post("/generate", response_model=ResourceGenerationTask)
async def generate_resource(
    payload: ResourceGenerateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
) -> ResourceGenerationTask:
    """创建资源生成任务并返回标准任务状态。"""
    return ResourceGenerationTask.model_validate(await _create_resource_task(payload, current_user, db, x_idempotency_key))


@task_router.post("", response_model=ResourceGenerationTask)
async def create_resource_task(
    payload: ResourceGenerateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
) -> ResourceGenerationTask:
    """创建资源生成任务并返回标准任务状态。"""
    return ResourceGenerationTask.model_validate(await _create_resource_task(payload, current_user, db, x_idempotency_key))


def _is_admin(current_user: CurrentUser) -> bool:
    """判断当前用户是否具备管理员权限。"""
    return current_user.role == "admin"


def _raise_forbidden(exc: PermissionError) -> None:
    """把仓储层权限异常转换成 HTTP 403。"""
    raise HTTPException(status_code=403, detail=str(exc)) from exc


def _clean_form_value(value: str | None) -> str | None:
    """清理表单字符串，空白内容统一转为 None。"""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _validate_resource_upload_taxonomy(resource_type: str, difficulty: str) -> None:
    """校验上传资源的类型与难度枚举，避免写入不可筛选数据。"""
    if resource_type not in TYPE_LABELS:
        raise HTTPException(status_code=400, detail={"message": "不支持的资源类型", "resource_type": resource_type})
    if difficulty not in DIFFICULTY_LABELS:
        raise HTTPException(status_code=400, detail={"message": "不支持的资源难度", "difficulty": difficulty})


async def _read_uploaded_resource_text(file: UploadFile | None) -> tuple[str | None, str | None]:
    """读取资源上传文件，仅接受 UTF-8 Markdown / TXT。"""
    if file is None or not file.filename:
        return None, None
    filename = file.filename
    suffix = Path(filename).suffix.lower()
    mime_type = (file.content_type or "").lower()
    if suffix not in ALLOWED_RESOURCE_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail={"message": "资源上传仅支持 Markdown / TXT 文件", "filename": filename})
    if mime_type not in ALLOWED_RESOURCE_UPLOAD_MIME_TYPES:
        raise HTTPException(status_code=400, detail={"message": "资源文件 MIME 类型不受支持", "filename": filename})
    data = await file.read(RESOURCE_UPLOAD_MAX_BYTES + 1)
    if len(data) > RESOURCE_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail={"message": "资源文件过大，请控制在 2MB 以内", "filename": filename})
    try:
        content = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail={"message": "资源文件须为 UTF-8 编码", "filename": filename}) from exc
    if not content.strip():
        raise HTTPException(status_code=400, detail={"message": "资源文件内容为空", "filename": filename})
    return content.strip(), filename


@router.get("/tasks", response_model=ResourceGenerationTaskListResponse)
async def list_generation_tasks(
    course_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceGenerationTaskListResponse:
    """列出当前用户可见的资源生成任务。"""
    return ResourceGenerationTaskListResponse.model_validate(
        {
            "items": ResourceRepository(db).list_generation_tasks(
                course_id,
                user_external_id=current_user.id,
                include_all=_is_admin(current_user),
            )
        }
    )


@router.get("/tasks/{task_id}", response_model=ResourceGenerationTask | ResourceGenerationTaskNotFound)
async def get_generation_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceGenerationTask | ResourceGenerationTaskNotFound:
    """读取资源生成任务详情，保留 not_found 兼容响应。"""
    try:
        task = ResourceRepository(db).get_generation_task(task_id, current_user.id, is_admin=_is_admin(current_user))
        if not task:
            return ResourceGenerationTaskNotFound(task_id=task_id)
        return ResourceGenerationTask.model_validate(task)
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.post("/tasks/{task_id}/run", response_model=ResourceGenerationTask | ResourceGenerationTaskNotFound)
async def rerun_generation_task(
    task_id: str,
    payload: ResourceTaskRerunRequest | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceGenerationTask | ResourceGenerationTaskNotFound:
    """重新排队执行资源生成任务，保留 not_found 兼容响应。"""
    try:
        task = ResourceRepository(db).rerun_generation_task(
            task_id,
            need_course_evidence=payload.need_course_evidence if payload else None,
            user_external_id=current_user.id,
            is_admin=_is_admin(current_user),
        )
    except PermissionError as exc:
        _raise_forbidden(exc)
    if not task:
        return ResourceGenerationTaskNotFound(task_id=task_id)
    if task.get("status") == "queued":
        enqueue_resource_generation(task_id)
    return ResourceGenerationTask.model_validate(task)


@router.post("/tasks/{task_id}/cancel", response_model=ResourceGenerationTask | ResourceGenerationTaskNotFound)
async def cancel_generation_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceGenerationTask | ResourceGenerationTaskNotFound:
    """取消资源生成任务，保留 not_found 兼容响应。"""
    try:
        task = ResourceRepository(db).cancel_generation_task(task_id, current_user.id, is_admin=_is_admin(current_user))
        if not task:
            return ResourceGenerationTaskNotFound(task_id=task_id)
        return ResourceGenerationTask.model_validate(task)
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.patch("/tasks/{task_id}/outline", response_model=ResourceGenerationTask | ResourceGenerationTaskNotFound)
async def update_generation_task_outline(
    task_id: str,
    payload: ResourceTaskOutlineUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceGenerationTask | ResourceGenerationTaskNotFound:
    """更新资源生成任务的大纲顺序，保留 not_found 兼容响应。"""
    try:
        task = ResourceRepository(db).update_generation_task_outline(
            task_id,
            [section.model_dump() for section in payload.sections],
            current_user.id,
            is_admin=_is_admin(current_user),
        )
        if not task:
            return ResourceGenerationTaskNotFound(task_id=task_id)
        return ResourceGenerationTask.model_validate(task)
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.get("", response_model=ResourceListResponse)
async def list_resources(
    course_id: str | None = Query(default=None),
    concept_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceListResponse:
    """列出当前用户可见的课程或知识点资源，避免私有资源跨用户串读。"""
    if course_id:
        ensure_course_access(db, current_user, course_id)
    return ResourceListResponse.model_validate(
        {
            "items": ResourceRepository(db).list_resources(
                course_id,
                concept_id,
                user_external_id=current_user.id,
                include_all=_is_admin(current_user),
            )
        }
    )


@router.get("/community/list", response_model=CommunityResourceListResponse)
async def community_resources(
    course_id: str | None = None,
    concept_id: str | None = None,
    type: str | None = None,
    difficulty: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityResourceListResponse:
    """列出公开社区资源并回显筛选条件。"""
    if course_id:
        ensure_course_access(db, current_user, course_id)
    return CommunityResourceListResponse.model_validate(
        {
            "items": ResourceRepository(db).list_resources(
                course_id,
                concept_id,
                type,
                difficulty,
                public_only=True,
                require_knowledge_link=bool(course_id),
            ),
            "filters": {"course_id": course_id, "concept_id": concept_id, "type": type, "difficulty": difficulty},
        }
    )


@router.get("/hall", response_model=ResourceHallResponse)
async def resource_hall(
    course_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
    scope: str = Query(default="all"),
    type: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=6, le=48),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ResourceHallResponse:
    """返回资源大厅列表、筛选器、精选资源和分页信息。"""
    current_user = _optional_current_user(authorization, db)
    return ResourceRepository(db).list_resource_hall(
        course_slug=course_id,
        current_user_external_id=current_user.id if current_user else None,
        query=q.strip() if q and q.strip() else None,
        scope=scope,
        resource_type=type,
        difficulty=difficulty,
        page=page,
        page_size=page_size,
    )


@router.post("/upload", response_model=ResourceDTO)
async def upload_resource(
    title: str = Form(...),
    summary: str | None = Form(default=None),
    content: str | None = Form(default=None),
    resource_type: str = Form(default="reading"),
    difficulty: str = Form(default="basic"),
    course_id: str | None = Form(default=None),
    concept_id: str | None = Form(default=None),
    path_node_id: str | None = Form(default=None),
    submit_for_review: bool = Form(default=False),
    file: UploadFile | None = File(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO:
    """上传 Markdown/TXT 或粘贴正文，并创建可编辑的个人资源草稿。"""
    clean_title = _clean_form_value(title)
    if not clean_title:
        raise HTTPException(status_code=400, detail={"message": "资源标题不能为空"})
    _validate_resource_upload_taxonomy(resource_type, difficulty)
    clean_course_id = _clean_form_value(course_id)
    if clean_course_id:
        ensure_course_access(db, current_user, clean_course_id)

    file_content, source_filename = await _read_uploaded_resource_text(file)
    manual_content = _clean_form_value(content)
    if manual_content and len(manual_content.encode("utf-8")) > RESOURCE_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail={"message": "资源正文过长，请控制在 2MB 以内"})
    if file_content and manual_content:
        final_content = f"{file_content}\n\n---\n\n## 上传补充说明\n\n{manual_content}"
    else:
        final_content = file_content or manual_content
    if not final_content:
        raise HTTPException(status_code=400, detail={"message": "请上传 Markdown/TXT 文件，或粘贴资源正文"})

    repo = ResourceRepository(db)
    resource = repo.create_uploaded_resource(
        title=clean_title,
        summary=_clean_form_value(summary),
        content=final_content,
        resource_type=resource_type,
        difficulty=difficulty,
        course_id=clean_course_id,
        concept_id=_clean_form_value(concept_id),
        path_node_id=_clean_form_value(path_node_id),
        user_external_id=current_user.id,
        source_filename=source_filename,
        submit_for_review=submit_for_review,
    )
    if not resource:
        raise HTTPException(status_code=404, detail={"message": "课程不存在", "course_id": clean_course_id})
    return ResourceDTO.model_validate(resource)


@router.post("/assets/references", response_model=ResourceAssetUploadResponse)
async def upload_reference_images(
    files: list[UploadFile] = File(...),
    course_id: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceAssetUploadResponse:
    """上传资源生成参考图并返回资产列表。"""
    if not files:
        raise HTTPException(status_code=400, detail={"message": "请至少上传 1 张参考图"})
    if len(files) > settings.RESOURCE_REFERENCE_IMAGE_MAX_COUNT:
        raise HTTPException(status_code=400, detail={"message": f"参考图最多 {settings.RESOURCE_REFERENCE_IMAGE_MAX_COUNT} 张"})
    repo = ResourceRepository(db)
    if course_id:
        ensure_course_access(db, current_user, course_id)
    uploads: list[ReferenceImageUploadPayload] = []
    for index, file in enumerate(files):
        mime_type = (file.content_type or "").lower()
        if mime_type not in ALLOWED_REFERENCE_IMAGE_MIME_TYPES:
            raise HTTPException(status_code=400, detail={"message": "参考图仅支持 PNG、JPEG、WebP", "filename": file.filename})
        data = await file.read(settings.RESOURCE_REFERENCE_IMAGE_MAX_BYTES + 1)
        if len(data) > settings.RESOURCE_REFERENCE_IMAGE_MAX_BYTES:
            raise HTTPException(status_code=413, detail={"message": "参考图过大，请压缩到 8MB 以内", "filename": file.filename})
        uploads.append(
            {
                "data": data,
                "filename": file.filename or f"reference-{index + 1}",
                "mime_type": mime_type,
                "sort_order": index,
            }
        )
    result = repo.upload_reference_image_assets(uploads, course_id=course_id, user_external_id=current_user.id)
    if result is None:
        raise HTTPException(status_code=404, detail={"message": "课程不存在", "course_id": course_id})
    return ResourceAssetUploadResponse.model_validate(result)


@router.get("/assets/{asset_id}/file", response_model=None, response_class=FileResponse)
async def get_resource_asset_file(
    asset_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    """返回资源图片资产文件。"""
    asset_service = ResourceAssetService(db)

    def _check_course_access(course_id: str) -> bool:
        """复用课程访问依赖的既有副作用与 HTTP 错误语义。"""

        ensure_course_access(db, current_user, course_id)
        return True

    try:
        file_result = asset_service.resolve_asset_file(
            asset_id,
            user_external_id=current_user.id,
            is_admin=_is_admin(current_user),
            course_access_checker=_check_course_access,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"message": str(exc)}) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"message": "图片文件不存在", "asset_id": asset_id}) from exc
    if not file_result:
        raise HTTPException(status_code=404, detail={"message": "图片资产不存在", "asset_id": asset_id})
    return FileResponse(
        str(file_result["path"]),
        media_type=file_result["media_type"],
        filename=file_result["filename"],
    )


@router.delete("/batch", response_model=ResourceBatchDeleteResponse)
async def batch_delete_resources(
    payload: ResourceBatchDeleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceBatchDeleteResponse:
    """批量软删除当前用户拥有的资源。"""
    try:
        return ResourceRepository(db).batch_delete_own_resources(payload.resource_ids, current_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/{resource_id}/versions", response_model=ResourceVersionListResponse)
async def get_resource_versions(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceVersionListResponse:
    """列出资源历史版本，并阻止跨用户读取私有版本正文。"""
    try:
        return ResourceVersionListResponse.model_validate(
            ResourceRepository(db).list_versions(resource_id, current_user.id, is_admin=_is_admin(current_user))
        )
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.post("/{resource_id}/versions/{version}/restore", response_model=ResourceDTO)
async def restore_resource_version(
    resource_id: str,
    version: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO:
    """恢复资源到指定历史版本，并生成新的当前版本。"""
    try:
        result = ResourceRepository(db).restore_version(
            resource_id,
            version,
            current_user.id,
            is_admin=_is_admin(current_user),
        )
    except PermissionError as exc:
        _raise_forbidden(exc)
    if not result:
        raise HTTPException(status_code=404, detail={"message": "资源或版本不存在", "resource_id": resource_id, "version": version})
    return ResourceDTO.model_validate(result)


@router.post("/{resource_id}/copy", response_model=ResourceDTO | ResourceNotFoundResponse)
async def copy_resource(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO | ResourceNotFoundResponse:
    """复制资源为当前用户的个人草稿，保留 not_found 兼容响应。"""
    result = ResourceRepository(db).copy_resource(resource_id, current_user.id)
    if not result:
        return ResourceNotFoundResponse(resource_id=resource_id)
    return ResourceDTO.model_validate(result)


@router.delete("/{resource_id}", response_model=ResourceDeleteResult)
async def delete_resource(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDeleteResult:
    """软删除当前用户拥有的资源。"""
    try:
        result = ResourceRepository(db).delete_own_resource(resource_id, current_user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="资源不存在")
    return ResourceDeleteResult.model_validate(result)


@router.get("/{resource_id}", response_model=ResourceDTO | ResourceNotFoundResponse)
async def get_resource(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO | ResourceNotFoundResponse:
    """读取资源详情，保留 not_found 兼容响应，并阻止跨用户读取私有资源。"""
    try:
        result = ResourceRepository(db).get_resource(resource_id, current_user.id, is_admin=_is_admin(current_user))
        if not result:
            return ResourceNotFoundResponse(id=resource_id)
        return ResourceDTO.model_validate(result)
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.put("/{resource_id}", response_model=ResourceDTO | ResourceNotFoundResponse)
async def update_resource(
    resource_id: str,
    payload: ResourceUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO | ResourceNotFoundResponse:
    """更新资源基础信息或正文内容，保留 not_found 兼容响应。"""
    try:
        result = ResourceRepository(db).update_resource(
            resource_id,
            payload,
            current_user.id,
            is_admin=_is_admin(current_user),
        )
        if not result:
            return ResourceNotFoundResponse(id=resource_id)
        return ResourceDTO.model_validate(result)
    except PermissionError as exc:
        _raise_forbidden(exc)


@router.post("/{resource_id}/submit-community", response_model=ResourceCommunitySubmitResponse)
async def submit_community(
    resource_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceCommunitySubmitResponse:
    """把个人资源提交到社区审核队列。"""
    return ResourceCommunitySubmitResponse.model_validate(ResourceRepository(db).submit_community(resource_id, current_user.id))


@router.post("/{resource_id}/archive-course", response_model=ResourceDTO)
async def archive_resource_to_course(
    resource_id: str,
    payload: ResourceArchiveCourseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceDTO:
    """把通用资源归档绑定到指定课程。"""
    ensure_course_access(db, current_user, payload.course_id)
    result = ResourceRepository(db).archive_resource_to_course(
        resource_id,
        course_id=payload.course_id,
        concept_id=payload.concept_id,
        path_node_id=payload.path_node_id,
        user_external_id=current_user.id,
    )
    if not result:
        raise HTTPException(status_code=404, detail={"message": "资源或课程不存在", "resource_id": resource_id})
    return ResourceDTO.model_validate(result)
