from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.auth import AuthResponse, AuthUser, AuthUserResponse, LoginRequest, LogoutResponse, RegisterRequest, UpdateMeRequest
from app.services.auth.service import (
    AuthService,
    AuthServiceError,
    CurrentUserNotFoundError,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidDisplayNameError,
    InvalidEmailError,
)

router = APIRouter()


def _raise_auth_service_error(exc: AuthServiceError) -> None:
    """把认证服务业务异常转换为 HTTP 响应。"""

    if isinstance(exc, InvalidEmailError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if isinstance(exc, EmailAlreadyRegisteredError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if isinstance(exc, InvalidCredentialsError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if isinstance(exc, InvalidDisplayNameError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if isinstance(exc, CurrentUserNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthResponse:
    """注册学生账号并创建登录会话。"""
    try:
        return AuthService(db).register(payload, authorization)
    except AuthServiceError as exc:
        _raise_auth_service_error(exc)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthResponse:
    """校验邮箱密码并创建登录会话。"""
    try:
        return AuthService(db).login(payload, authorization)
    except AuthServiceError as exc:
        _raise_auth_service_error(exc)


@router.get("/me", response_model=AuthUserResponse)
async def me(current_user: CurrentUser = Depends(get_current_user)) -> AuthUserResponse:
    """读取当前登录用户的公开资料。"""
    return AuthUserResponse(
        user=AuthUser(
            id=current_user.id,
            name=current_user.name,
            role=current_user.role,
            email=current_user.email,
        )
    )


@router.patch("/me", response_model=AuthUserResponse)
async def update_me(
    payload: UpdateMeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUserResponse:
    """更新当前登录用户可编辑的身份资料。"""
    try:
        return AuthService(db).update_current_user(payload, current_user)
    except AuthServiceError as exc:
        _raise_auth_service_error(exc)


@router.post("/logout", response_model=LogoutResponse)
async def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> LogoutResponse:
    """撤销当前会话令牌；缺少令牌时保持幂等成功。"""
    return AuthService(db).logout(authorization)
