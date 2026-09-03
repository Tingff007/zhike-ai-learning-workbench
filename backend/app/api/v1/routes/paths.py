from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.path import (
    CourseProfileSummaryResponse,
    LearningPathGenerateResponse,
    LearningPathResponse,
    MasteryResponse,
    PathNodeMasteryResponse,
    PathNodeStatusResponse,
    PathStatusUpdate,
)
from app.services.learning.repository import LearningRepository

router = APIRouter()
_PATH_NODE_NOT_FOUND_RESPONSES: dict[int, dict[str, str]] = {
    404: {"description": "学习路径节点不存在，或当前用户无权访问该节点。"},
}


@router.get("/courses/{course_id}/path", response_model=LearningPathResponse)
async def get_learning_path(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningPathResponse:
    """返回当前用户在指定课程下的学习路径。

    参数:
        course_id: 课程 slug。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        包含课程标识和学习路径节点列表的响应模型。
    """
    return LearningPathResponse(
        course_id=course_id,
        items=LearningRepository(db).get_path_nodes(course_id, current_user.id),
    )


@router.post("/courses/{course_id}/path/generate", response_model=LearningPathGenerateResponse)
async def generate_learning_path(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningPathGenerateResponse:
    """重新生成当前用户在指定课程下的学习路径。

    参数:
        course_id: 课程 slug。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        包含生成状态和最新路径节点列表的响应模型。
    """
    result = LearningRepository(db).generate_path(course_id, current_user.id)
    return LearningPathGenerateResponse(**result)


@router.put(
    "/path-nodes/{node_id}/status",
    response_model=PathNodeStatusResponse,
    responses=_PATH_NODE_NOT_FOUND_RESPONSES,
)
async def update_path_node_status(
    node_id: str,
    payload: PathStatusUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PathNodeStatusResponse:
    """更新学习路径节点状态。

    参数:
        node_id: 路径节点业务编码。
        payload: 节点状态更新请求体。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        节点业务编码和更新后的状态。

    异常:
        HTTPException: 当节点不存在或当前用户无权访问时返回 404。
    """
    result = LearningRepository(db).update_node_status(node_id, payload.status, current_user.id)
    if not result:
        raise HTTPException(status_code=404, detail="学习路径节点不存在或无权访问")
    return PathNodeStatusResponse(**result)


@router.get(
    "/path-nodes/{node_id}/mastery",
    response_model=PathNodeMasteryResponse,
    responses=_PATH_NODE_NOT_FOUND_RESPONSES,
)
async def get_path_node_mastery(
    node_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PathNodeMasteryResponse:
    """返回单个学习路径节点的掌握度快照。

    参数:
        node_id: 路径节点业务编码。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        节点掌握度、状态、证据和更新时间。

    异常:
        HTTPException: 当节点不存在或当前用户无权访问时返回 404。
    """
    result = LearningRepository(db).get_path_node_mastery(node_id, current_user.id)
    if not result:
        raise HTTPException(status_code=404, detail="学习路径节点不存在或无权访问")
    return PathNodeMasteryResponse(**result)


@router.get("/courses/{course_id}/mastery", response_model=MasteryResponse)
async def get_mastery(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MasteryResponse:
    """返回当前用户在指定课程下的掌握度摘要。

    参数:
        course_id: 课程 slug。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        课程总体掌握度、维度掌握度和路径画像信号。
    """
    return MasteryResponse(**LearningRepository(db).get_mastery(course_id, current_user.id))


@router.get("/courses/{course_id}/profile", response_model=CourseProfileSummaryResponse)
async def get_profile(
    course_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseProfileSummaryResponse:
    """返回当前用户在指定课程下的画像摘要。

    参数:
        course_id: 课程 slug。
        current_user: 已通过鉴权解析出的当前用户上下文。
        db: 当前请求生命周期内的数据库会话。

    返回:
        课程学习画像摘要、置信度和维度明细。
    """
    return CourseProfileSummaryResponse(**LearningRepository(db).get_profile_summary(course_id, current_user.id))
