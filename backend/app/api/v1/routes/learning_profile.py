from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, ensure_course_access, get_current_user
from app.schemas.onboarding import PresetChipSubmitRequest, PresetChipSubmitResponse
from app.schemas.profile import (
    LearningProfileQueryScope,
    LearningProfileResponseDTO,
    ProfileCorrectionRequest,
    ProfileCorrectionResponse,
)
from app.services.onboarding.service import OnboardingService
from app.services.profile.repository import LearningProfileRepository

router = APIRouter()


@router.get("", response_model=LearningProfileResponseDTO)
async def get_learning_profile(
    scope: LearningProfileQueryScope = Query(default="all"),
    course_id: str | None = Query(default=None),
    conversation_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningProfileResponseDTO:
    """读取当前用户的多层学习画像。"""
    if course_id:
        ensure_course_access(db, current_user, course_id)
    return LearningProfileRepository(db).get_learning_profile(
        user_external_id=current_user.id,
        scope=scope,
        course_id=course_id,
        conversation_id=conversation_id,
    )


@router.post("/corrections", response_model=ProfileCorrectionResponse)
async def correct_learning_profile(
    payload: ProfileCorrectionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileCorrectionResponse:
    """提交用户画像纠偏。"""
    if payload.course_id:
        ensure_course_access(db, current_user, payload.course_id)
    return LearningProfileRepository(db).apply_correction(user_external_id=current_user.id, payload=payload)


@router.post("/onboarding/submit-chip", response_model=PresetChipSubmitResponse)
async def submit_preset_chip(
    payload: PresetChipSubmitRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PresetChipSubmitResponse:
    """预设 chip 直写：不走 LLM，直接写入画像维度并返回下一轮模板话术。"""
    service = OnboardingService(db)
    return service.apply_preset_chip(
        user_external_id=current_user.id,
        chip=payload.chip,
        round_num=payload.round,
        history=payload.history,
    )
