from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.services.knowledge.iflytek.client import IflytekChatDocError
from app.schemas.metrics import (
    MetricsSummaryResponse,
    OperationsDashboardResponse,
    OperationsModelCallsResponse,
    OperationsRagReportResponse,
    OperationsTrendsResponse,
)
from app.schemas.course import (
    AdminCourseConceptMutationResponse,
    AdminCourseDeleteResponse,
    AdminCourseMutationResponse,
    AdminCourseSectionMutationResponse,
    AdminResourceReviewEchoResponse,
    AdminSectionDeleteResponse,
    CourseBuilderOutlineResponse,
    CourseConceptCreateRequest,
    CourseConceptUpdateRequest,
    CourseCreateRequest,
    CourseGenerateFromAIRequest,
    CourseGenerateFromAIResponse,
    CourseListResponse,
    CourseOutlineApplyResponse,
    CourseOutlineApplyRequest,
    CourseOutlineImportResponse,
    CourseOutlineImportRequest,
    CourseReadinessResponse,
    CourseSectionUpsertRequest,
    CourseUpdateRequest,
)
from app.services.course.ai_generator import CourseAIGenerator
from app.services.course.outline_importer import ReadmeOutlineImporter
from app.services.course.repository import CourseRepository
from app.services.metrics.repository import MetricsRepository

router = APIRouter()


@router.get("/metrics", response_model=MetricsSummaryResponse)
async def metrics(db: Session = Depends(get_db)) -> MetricsSummaryResponse:
    """读取管理端首页聚合指标。"""
    return MetricsSummaryResponse.model_validate(MetricsRepository(db).latest_metrics())


@router.get("/operations/dashboard", response_model=OperationsDashboardResponse)
async def operations_dashboard(course_id: str | None = None, days: int = 7, db: Session = Depends(get_db)) -> OperationsDashboardResponse:
    """读取运营监控总览数据。"""
    return OperationsDashboardResponse.model_validate(MetricsRepository(db).operations_dashboard(course_id=course_id, days=days))


@router.get("/operations/trends", response_model=OperationsTrendsResponse)
async def operations_trends(course_id: str | None = None, days: int = 7, db: Session = Depends(get_db)) -> OperationsTrendsResponse:
    """读取运营趋势序列数据。"""
    return OperationsTrendsResponse.model_validate({
        "items": MetricsRepository(db).operations_dashboard(course_id=course_id, days=days)["trends"],
        "course_id": course_id,
        "days": days,
    })


@router.get("/operations/model-calls", response_model=OperationsModelCallsResponse)
async def operations_model_calls(course_id: str | None = None, days: int = 7, db: Session = Depends(get_db)) -> OperationsModelCallsResponse:
    """读取模型调用运营统计。"""
    return OperationsModelCallsResponse.model_validate(
        MetricsRepository(db).operations_dashboard(course_id=course_id, days=days)["model_calls"]
    )


@router.get("/operations/rag-report", response_model=OperationsRagReportResponse)
async def operations_rag_report(course_id: str | None = None, days: int = 7, db: Session = Depends(get_db)) -> OperationsRagReportResponse:
    """读取 RAG 运营质量报告。"""
    return OperationsRagReportResponse.model_validate(
        MetricsRepository(db).operations_dashboard(course_id=course_id, days=days)["rag_report"]
    )


@router.get("/courses", response_model=CourseListResponse)
async def list_admin_courses(db: Session = Depends(get_db)) -> dict:
    """列出管理端可维护的课程。"""
    return {"items": CourseRepository(db).list_admin_courses()}


@router.get("/courses/deleted", response_model=CourseListResponse)
async def list_deleted_courses(db: Session = Depends(get_db)) -> dict:
    """列出已进入回收站的课程。"""
    return {"items": CourseRepository(db).list_deleted_courses()}


@router.post("/courses/{course_id}/restore", status_code=status.HTTP_200_OK, response_model=AdminCourseMutationResponse)
async def restore_course(course_id: str, db: Session = Depends(get_db)) -> dict:
    """从回收站恢复课程。"""
    course = CourseRepository(db).restore_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在或不在回收站中")
    return {"status": "restored", "course": course}


@router.delete("/courses/{course_id}", status_code=status.HTTP_200_OK, response_model=AdminCourseDeleteResponse)
async def delete_course(
    course_id: str,
    purge: bool = Query(default=False, description="true=物理删除课程及关联文档"),
    sync_chatdoc: bool = Query(default=True, description="物理删除时是否同步讯飞云端文档"),
    db: Session = Depends(get_db),
) -> dict:
    """软删除课程，或在确认后物理清理回收站课程。"""
    repo = CourseRepository(db)
    if purge:
        try:
            result = await repo.purge_course(course_id, sync_chatdoc=sync_chatdoc)
        except IflytekChatDocError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not result:
            raise HTTPException(status_code=404, detail="课程不存在或不在回收站中")
        return result
    if not repo.delete_course(course_id):
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return {"status": "deleted", "course_id": course_id}


@router.delete(
    "/courses/{course_id}/sections/{section_id}",
    status_code=status.HTTP_200_OK,
    response_model=AdminSectionDeleteResponse,
)
async def delete_section(course_id: str, section_id: str, db: Session = Depends(get_db)) -> dict:
    """删除课程章节。"""
    if not CourseRepository(db).delete_section(course_id, section_id):
        raise HTTPException(status_code=404, detail="课程或章节不存在")
    return {"status": "deleted", "course_id": course_id, "section_id": section_id}


@router.get("/courses/{course_id}/builder", response_model=CourseBuilderOutlineResponse)
async def course_builder_outline(course_id: str, db: Session = Depends(get_db)) -> dict:
    """读取课程构建器所需的大纲、切片预览和准备度。"""
    outline = CourseRepository(db).get_course_builder_outline(course_id)
    if not outline:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return outline


@router.get("/courses/{course_id}/readiness", response_model=CourseReadinessResponse)
async def course_readiness(course_id: str, db: Session = Depends(get_db)) -> dict:
    """读取课程发布前准备度检查。"""
    readiness = CourseRepository(db).course_readiness(course_id)
    if not readiness:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return readiness


@router.post("/courses", status_code=status.HTTP_201_CREATED, response_model=AdminCourseMutationResponse)
async def create_course(
    payload: CourseCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建课程并把创建者加入课程成员关系。"""
    try:
        course = CourseRepository(db).create_course(payload, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "created", "course": course}


@router.post("/courses/generate-from-ai", status_code=status.HTTP_201_CREATED, response_model=CourseGenerateFromAIResponse)
async def generate_course_from_ai(
    payload: CourseGenerateFromAIRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseGenerateFromAIResponse:
    """根据课程主题调用模型生成课程、章节和知识点图谱。"""
    try:
        return CourseGenerateFromAIResponse.model_validate(await CourseAIGenerator(db).generate(payload, current_user.id))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/courses/{course_id}/outline/import", response_model=CourseOutlineImportResponse)
async def import_course_outline(course_id: str, payload: CourseOutlineImportRequest, db: Session = Depends(get_db)) -> dict:
    """从 README 或目录文本预览课程大纲导入结果。"""
    if not CourseRepository(db).get_course(course_id):
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    try:
        return ReadmeOutlineImporter().preview(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/courses/{course_id}/outline/apply", response_model=CourseOutlineApplyResponse)
async def apply_course_outline(course_id: str, payload: CourseOutlineApplyRequest, db: Session = Depends(get_db)) -> dict:
    """应用课程大纲草稿，批量创建或更新章节和知识点。"""
    result = CourseRepository(db).apply_outline_draft(course_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return result


@router.put("/courses/{course_id}", response_model=AdminCourseMutationResponse)
async def update_course(course_id: str, payload: CourseUpdateRequest, db: Session = Depends(get_db)) -> dict:
    """更新课程基础信息和发布状态。"""
    try:
        course = CourseRepository(db).update_course(course_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return {"status": "updated", "course_id": course_id, "course": course}


@router.post(
    "/courses/{course_id}/sections",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminCourseSectionMutationResponse,
)
async def create_or_update_section(course_id: str, payload: CourseSectionUpsertRequest, db: Session = Depends(get_db)) -> dict:
    """创建或按 code 更新课程章节。"""
    section = CourseRepository(db).upsert_section(course_id, payload)
    if not section:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return {"status": "saved", "section": section}


@router.put("/courses/{course_id}/sections/{section_id}", response_model=AdminCourseSectionMutationResponse)
async def update_section(course_id: str, section_id: str, payload: CourseSectionUpsertRequest, db: Session = Depends(get_db)) -> dict:
    """更新指定课程章节。"""
    section = CourseRepository(db).upsert_section(course_id, payload, section_id)
    if not section:
        raise HTTPException(status_code=404, detail="课程或章节不存在")
    return {"status": "updated", "section": section}


@router.post(
    "/courses/{course_id}/concepts",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminCourseConceptMutationResponse,
)
async def create_concept(course_id: str, payload: CourseConceptCreateRequest, db: Session = Depends(get_db)) -> dict:
    """创建课程知识点。"""
    try:
        concept = CourseRepository(db).create_concept(course_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not concept:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    return {"status": "created", "concept": concept}


@router.put("/courses/{course_id}/concepts/{concept_id}", response_model=AdminCourseConceptMutationResponse)
async def update_concept(course_id: str, concept_id: str, payload: CourseConceptUpdateRequest, db: Session = Depends(get_db)) -> dict:
    """更新课程知识点。"""
    concept = CourseRepository(db).update_concept(course_id, concept_id, payload)
    if not concept:
        raise HTTPException(status_code=404, detail="课程或知识点不存在")
    return {"status": "updated", "concept": concept}


@router.put("/community/resources/{resource_id}/review", response_model=AdminResourceReviewEchoResponse)
async def review_resource(resource_id: str, payload: dict) -> dict:
    """回显管理端资源审核请求，保留历史占位接口兼容性。"""
    return {"resource_id": resource_id, "review": payload, "status": "updated"}
