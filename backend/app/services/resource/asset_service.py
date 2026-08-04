from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Callable, TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course, Resource, ResourceAsset, ResourceGenerationTask, User
from app.services.resource.image_generation import (
    GeneratedImage,
    detect_image_size,
    download_image_bytes,
    normalize_asset_title,
    safe_image_suffix,
    storage_relative_path,
)


logger = logging.getLogger(__name__)


class ReferenceImageUploadPayload(TypedDict):
    """参考图上传服务接收的已校验文件载荷。"""

    data: bytes
    filename: str
    mime_type: str
    sort_order: int


class ResourceAssetFileResult(TypedDict):
    """资产文件下载接口使用的已鉴权文件信息。"""

    path: Path
    media_type: str
    filename: str


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """安全解析 UUID，非法输入返回 None。"""
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceAssetService:
    """负责资源资产的存储、路径解析、查询和序列化。"""

    def __init__(self, db: Session) -> None:
        """初始化资源资产服务。

        参数:
            db: 当前请求或任务使用的数据库会话。
        """
        self.db = db

    @staticmethod
    def asset_file_url(asset_id: uuid.UUID | str) -> str:
        """生成受鉴权资产文件接口路径。

        参数:
            asset_id: 资源资产 ID。

        返回:
            可由资源接口鉴权后读取的文件 URL。
        """
        return f"/api/v1/resources/assets/{asset_id}/file"

    def asset_to_dict(self, asset: ResourceAsset) -> dict[str, object]:
        """将资源资产转换为前端画廊可消费的结构。

        参数:
            asset: 待序列化的资源资产。

        返回:
            前端资源资产字典。
        """
        return {
            "id": str(asset.id),
            "diagram_type": asset.diagram_type,
            "title": asset.title,
            "file_url": self.asset_file_url(asset.id) if asset.file_path and asset.status == "completed" else None,
            "width": asset.width,
            "height": asset.height,
            "mime_type": asset.mime_type,
            "prompt": asset.prompt,
            "revised_prompt": asset.revised_prompt,
            "provider": asset.provider,
            "model": asset.model,
            "status": asset.status,
            "raw_params": asset.raw_params_json or {},
        }

    def resource_asset_to_dict(self, asset: ResourceAsset) -> dict[str, object]:
        """对外序列化单个资源资产。

        参数:
            asset: 待序列化的资源资产。

        返回:
            资源资产字典。
        """
        return self.asset_to_dict(asset)

    def resource_assets_to_dict(self, assets: list[ResourceAsset]) -> list[dict[str, object]]:
        """对外批量序列化资源资产。

        参数:
            assets: 资源资产列表。

        返回:
            资源资产字典列表。
        """
        return [self.resource_asset_to_dict(asset) for asset in assets]

    def assets_for_resource(self, resource_id: uuid.UUID | None) -> list[dict[str, object]]:
        """读取资源下的图片资产，MagicMock 测试环境下返回空列表。

        参数:
            resource_id: 资源 ID。

        返回:
            按展示顺序排序后的资源资产字典列表。
        """
        if not resource_id:
            return []
        try:
            rows = self.db.execute(
                select(ResourceAsset)
                .where(ResourceAsset.resource_id == resource_id)
                .order_by(ResourceAsset.sort_order.asc(), ResourceAsset.created_at.asc())
            ).scalars().all()
        except Exception:
            logger.warning("读取资源图片资产失败：resource_id=%s", resource_id, exc_info=True)
            return []
        if not isinstance(rows, list):
            return []
        return [self.asset_to_dict(row) for row in rows]

    def assets_for_task(self, task_id: uuid.UUID | None) -> list[dict[str, object]]:
        """读取任务临时资产，任务完成前也可用于画布预览。

        参数:
            task_id: 资源生成任务 ID。

        返回:
            按展示顺序排序后的资源资产字典列表。
        """
        if not task_id:
            return []
        try:
            rows = self.db.execute(
                select(ResourceAsset)
                .where(ResourceAsset.task_id == task_id)
                .order_by(ResourceAsset.sort_order.asc(), ResourceAsset.created_at.asc())
            ).scalars().all()
        except Exception:
            logger.warning("读取任务临时图片资产失败：task_id=%s", task_id, exc_info=True)
            return []
        if not isinstance(rows, list):
            return []
        return [self.asset_to_dict(row) for row in rows]

    def storage_root(self) -> Path:
        """返回对象存储根目录，并确保目录存在。

        返回:
            已解析的对象存储根目录绝对路径。
        """
        root = Path(settings.OBJECT_STORAGE_ROOT)
        if not root.is_absolute():
            root = Path.cwd() / root
        root.mkdir(parents=True, exist_ok=True)
        return root.resolve()

    def absolute_asset_path(self, file_path: str | None) -> Path | None:
        """解析资产文件路径并确保仍在对象存储根目录内。

        参数:
            file_path: 数据库存储的资产相对路径或绝对路径。

        返回:
            合法的绝对路径；路径为空或越界时返回 None。
        """
        if not file_path:
            return None
        root = self.storage_root()
        candidate = Path(file_path)
        if not candidate.is_absolute():
            candidate = root / candidate
        resolved = candidate.resolve()
        if root not in resolved.parents and resolved != root:
            return None
        return resolved

    async def persist_generated_image(
        self,
        generated: GeneratedImage,
        *,
        task: ResourceGenerationTask,
        course: Course | None,
        title: str,
        diagram_type: str,
        sort_order: int,
        reference_asset_ids: list[str],
    ) -> ResourceAsset:
        """把供应商返回的图片下载或解码后保存到对象存储。

        参数:
            generated: 图片供应商返回的图片结果。
            task: 当前资源生成任务。
            course: 任务所属课程；通用资源时为 None。
            title: 资产标题。
            diagram_type: 图解类型。
            sort_order: 画廊展示顺序。
            reference_asset_ids: 本次生成引用的参考图资产 ID。

        返回:
            已写入数据库会话的资源资产。

        抛出:
            RuntimeError: 图片供应商没有返回可保存的文件内容。
        """
        image_bytes = generated.bytes_data
        mime_type = generated.mime_type
        if image_bytes is None and generated.url:
            image_bytes, mime_type = await download_image_bytes(generated.url)
        if image_bytes is None:
            raise RuntimeError("图片供应商未返回可保存的图片文件。")

        width, height, detected_mime = detect_image_size(image_bytes)
        mime_type = mime_type or detected_mime
        suffix = safe_image_suffix(mime_type)
        asset_id = uuid.uuid4()
        relative_path = storage_relative_path("diagram-packs", str(task.id), f"{asset_id}{suffix}")
        target = self.storage_root() / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(image_bytes)

        asset = ResourceAsset(
            id=asset_id,
            resource_id=None,
            task_id=task.id,
            course_id=course.id if course else None,
            created_by_user_id=task.requested_by_user_id,
            asset_kind="generated_image",
            diagram_type=diagram_type,
            title=normalize_asset_title(title),
            file_path=relative_path,
            mime_type=mime_type,
            width=generated.width or width,
            height=generated.height or height,
            provider=generated.provider,
            model=generated.model,
            prompt=generated.prompt,
            revised_prompt=generated.revised_prompt,
            source_asset_ids_json=reference_asset_ids,
            raw_params_json=generated.raw_params,
            status="completed",
            sort_order=sort_order,
        )
        self.db.add(asset)
        self.db.flush()
        return asset

    def record_failed_image_asset(
        self,
        *,
        task: ResourceGenerationTask,
        course: Course | None,
        title: str,
        diagram_type: str,
        prompt: str,
        sort_order: int,
        error: str,
        reference_asset_ids: list[str],
    ) -> ResourceAsset:
        """记录部分失败的图解资产，供前端展示失败态。

        参数:
            task: 当前资源生成任务。
            course: 任务所属课程；通用资源时为 None。
            title: 资产标题。
            diagram_type: 图解类型。
            prompt: 触发失败的图片提示词。
            sort_order: 画廊展示顺序。
            error: 失败原因。
            reference_asset_ids: 本次生成引用的参考图资产 ID。

        返回:
            已写入数据库会话的失败态资源资产。
        """
        asset = ResourceAsset(
            resource_id=None,
            task_id=task.id,
            course_id=course.id if course else None,
            created_by_user_id=task.requested_by_user_id,
            asset_kind="generated_image",
            diagram_type=diagram_type,
            title=normalize_asset_title(title),
            file_path=None,
            mime_type=None,
            provider=None,
            model=None,
            prompt=prompt,
            revised_prompt=None,
            source_asset_ids_json=reference_asset_ids,
            raw_params_json={"error": error},
            status="failed",
            sort_order=sort_order,
        )
        self.db.add(asset)
        self.db.flush()
        return asset

    def get_resource_asset(self, asset_id: str) -> ResourceAsset | None:
        """按 ID 读取资源资产。

        参数:
            asset_id: 资源资产 ID 字符串。

        返回:
            匹配的资源资产；ID 非法或不存在时返回 None。
        """
        parsed_id = _safe_uuid(asset_id)
        return self.db.get(ResourceAsset, parsed_id) if parsed_id else None

    def asset_file_path(self, asset: ResourceAsset) -> Path | None:
        """返回资产真实文件路径。

        参数:
            asset: 资源资产。

        返回:
            存在且为文件的绝对路径；不可访问时返回 None。
        """
        path = self.absolute_asset_path(asset.file_path)
        if not path or not path.exists() or not path.is_file():
            return None
        return path

    def resolve_asset_file(
        self,
        asset_id: str,
        *,
        user_external_id: str | None,
        is_admin: bool,
        course_access_checker: Callable[[str], bool],
    ) -> ResourceAssetFileResult | None:
        """解析当前用户可访问的资源资产文件。

        参数:
            asset_id: 待下载的资产 ID。
            user_external_id: 当前用户外部 ID。
            is_admin: 当前用户是否为管理员。
            course_access_checker: 课程权限检查回调；课程绑定资产必须通过该回调校验。

        返回:
            资产不存在时返回 None；资产存在且文件可访问时返回文件路径、MIME 类型和文件名。

        抛出:
            PermissionError: 当前用户无权读取该资产。
            FileNotFoundError: 资产记录存在但本地文件缺失。
        """

        asset = self.get_resource_asset(asset_id)
        if not asset:
            return None
        if not self._can_access_asset(
            asset,
            user_external_id=user_external_id,
            is_admin=is_admin,
            course_access_checker=course_access_checker,
        ):
            raise PermissionError("无权访问该图片资产")
        file_path = self.asset_file_path(asset)
        if not file_path:
            raise FileNotFoundError(asset_id)
        return {
            "path": file_path,
            "media_type": asset.mime_type or "image/png",
            "filename": file_path.name,
        }

    def _can_access_asset(
        self,
        asset: ResourceAsset,
        *,
        user_external_id: str | None,
        is_admin: bool,
        course_access_checker: Callable[[str], bool],
    ) -> bool:
        """按课程权限、公开状态和资产归属判断当前用户是否可读取资产。"""

        if is_admin:
            return True
        resource = self.db.get(Resource, asset.resource_id) if asset.resource_id else None
        course_id = resource.course_id if resource else asset.course_id
        if course_id:
            return course_access_checker(str(course_id))
        if resource and resource.status in {"published", "featured"}:
            return True
        user = self._user_by_external_id(user_external_id)
        return bool(user and asset.created_by_user_id and asset.created_by_user_id == user.id)

    def _user_by_external_id(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询用户，资产权限判断内部使用。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def create_reference_image_asset(
        self,
        *,
        data: bytes,
        filename: str,
        mime_type: str,
        course: Course | None,
        user: User | None,
        sort_order: int,
    ) -> ResourceAsset:
        """保存用户上传的参考图资产。

        参数:
            data: 图片二进制数据。
            filename: 原始文件名，用于生成展示标题。
            mime_type: 上传声明的 MIME 类型。
            course: 参考图所属课程；通用资源时为 None。
            user: 上传用户；匿名或系统导入时为 None。
            sort_order: 参考图排序值。

        返回:
            已写入数据库会话的参考图资产。
        """
        width, height, detected_mime = detect_image_size(data)
        safe_mime = mime_type or detected_mime
        suffix = safe_image_suffix(safe_mime)
        asset_id = uuid.uuid4()
        relative_path = storage_relative_path("references", f"{asset_id}{suffix}")
        target = self.storage_root() / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        asset = ResourceAsset(
            id=asset_id,
            resource_id=None,
            task_id=None,
            course_id=course.id if course else None,
            created_by_user_id=user.id if user else None,
            asset_kind="reference_image",
            diagram_type=None,
            title=normalize_asset_title(filename),
            file_path=relative_path,
            mime_type=safe_mime,
            width=width,
            height=height,
            provider=None,
            model=None,
            prompt=None,
            revised_prompt=None,
            source_asset_ids_json=[],
            raw_params_json={"source": "reference_upload"},
            status="completed",
            sort_order=sort_order,
        )
        self.db.add(asset)
        self.db.flush()
        return asset

    def create_reference_image_assets(
        self,
        uploads: list[ReferenceImageUploadPayload],
        *,
        course: Course | None,
        user: User | None,
    ) -> list[ResourceAsset]:
        """批量保存用户上传的参考图资产。

        参数:
            uploads: 已由路由层完成大小和 MIME 校验的参考图载荷。
            course: 参考图所属课程；通用资源时为 None。
            user: 上传用户；匿名或系统导入时为 None。

        返回:
            已写入数据库会话的参考图资产列表。
        """
        return [
            self.create_reference_image_asset(
                data=item["data"],
                filename=item["filename"],
                mime_type=item["mime_type"],
                course=course,
                user=user,
                sort_order=item["sort_order"],
            )
            for item in uploads
        ]

    def reference_assets_for_task(self, task: ResourceGenerationTask, image_context: dict) -> list[ResourceAsset]:
        """读取任务引用的参考图资产，并限制数量。

        参数:
            task: 当前资源生成任务。
            image_context: 任务编排元数据里的图片上下文。

        返回:
            通过课程和用户约束过滤后的参考图资产列表。

        抛出:
            ValueError: 参考图数量超过配置上限。
        """
        raw_ids = image_context.get("referenceAssetIds") or image_context.get("reference_asset_ids") or []
        if not isinstance(raw_ids, list):
            return []
        if len(raw_ids) > settings.RESOURCE_REFERENCE_IMAGE_MAX_COUNT:
            raise ValueError(f"参考图最多 {settings.RESOURCE_REFERENCE_IMAGE_MAX_COUNT} 张。")
        asset_ids = [_safe_uuid(str(item)) for item in raw_ids]
        valid_ids = [item for item in asset_ids if item]
        if not valid_ids:
            return []
        rows = self.db.execute(select(ResourceAsset).where(ResourceAsset.id.in_(valid_ids))).scalars().all()
        result: list[ResourceAsset] = []
        for asset in rows:
            if asset.asset_kind != "reference_image":
                continue
            if task.course_id and asset.course_id and asset.course_id != task.course_id:
                continue
            if task.requested_by_user_id and asset.created_by_user_id and asset.created_by_user_id != task.requested_by_user_id:
                continue
            result.append(asset)
        return result[: settings.RESOURCE_REFERENCE_IMAGE_MAX_COUNT]
