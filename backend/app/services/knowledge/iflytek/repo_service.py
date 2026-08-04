"""讯飞 ChatDoc 知识库仓库绑定与调试服务。"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models import Course
from app.services.knowledge.iflytek.client import IflytekChatDocClient, IflytekChatDocError
from app.services.knowledge.iflytek.client_factory import chatdoc_client_for_db
from app.services.knowledge.iflytek.response_utils import extract_chatdoc_scalar

CHATDOC_REPO_NAME_DUPLICATE_CODE = 64001
CHATDOC_REPO_NAME_CONFIG_KEY = "chatdoc_repo_name"
_REPO_LIST_PAGE_SIZE = 50
_REPO_LIST_KEYS = ("items", "list", "rows", "records", "repoList", "repo_list", "dataList")


def course_chatdoc_repo_name(course_slug: str) -> str:
    """生成课程默认使用的 ChatDoc 知识库名称。

    参数:
        course_slug: 课程唯一标识。

    返回:
        可传给 ChatDoc repo/create 的知识库名称。

    副作用/失败模式:
        纯字符串拼接，无副作用，也不会主动校验课程是否存在。
    """
    return f"course_{course_slug}"


def alternate_chatdoc_repo_name(course_slug: str) -> str:
    """生成课程备用的 ChatDoc 知识库名称。

    参数:
        course_slug: 课程唯一标识。

    返回:
        在默认名称冲突时使用的备用知识库名称。

    副作用/失败模式:
        纯字符串拼接，无副作用，也不会访问数据库或远端服务。
    """
    return f"{course_chatdoc_repo_name(course_slug)}_zhike"


class IflytekRepoService:
    """管理课程与讯飞 ChatDoc 知识库 Repo 的绑定关系。

    该服务负责查找、创建、绑定和调试课程对应的 ChatDoc 知识库。调用公开方法时可能访问
    讯飞开放接口，并在绑定成功后写入课程记录和提交当前数据库事务。
    """

    def __init__(self, db: Session, client: IflytekChatDocClient | None = None) -> None:
        """初始化知识库 Repo 服务。

        参数:
            db: 当前请求或任务使用的数据库会话。
            client: 可选的 ChatDoc 客户端，未传入时按数据库配置创建默认客户端。

        返回:
            无返回值。

        副作用/失败模式:
            保存数据库会话引用；默认客户端创建过程依赖本地配置，但不会立即发起远端请求。
        """
        self.db = db
        self.client = client or chatdoc_client_for_db(db)

    @staticmethod
    def _is_repo_name_duplicate_error(exc: IflytekChatDocError) -> bool:
        """判断 ChatDoc 错误是否表示知识库名称重复。

        参数:
            exc: ChatDoc 客户端抛出的异常。

        返回:
            若错误码或原始响应文本命中名称重复特征，则返回 True。

        副作用/失败模式:
            仅读取异常内容，无副作用；异常结构不完整时按普通错误处理。
        """
        haystack = f"{exc.vendor_raw}\n{exc}"
        if str(CHATDOC_REPO_NAME_DUPLICATE_CODE) in haystack:
            return True
        if "知识库名称重复" in haystack and "repo/create" in haystack:
            return True
        return False

    @staticmethod
    def _repo_list_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
        """从 ChatDoc repo/list 响应中提取仓库列表。

        参数:
            payload: ChatDoc 返回的原始 JSON 字典。

        返回:
            只包含字典行的仓库列表。

        副作用/失败模式:
            不修改输入数据；未知响应结构会返回空列表。
        """
        for key in _REPO_LIST_KEYS:
            items = payload.get(key)
            if isinstance(items, list):
                return [row for row in items if isinstance(row, dict)]
        data = payload.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return []

    @staticmethod
    def _repo_id_from_row(row: dict[str, Any], repo_name: str) -> str | None:
        """从单条仓库记录中提取匹配名称的 Repo ID。

        参数:
            row: ChatDoc repo/list 返回的一条仓库记录。
            repo_name: 期望匹配的知识库名称。

        返回:
            名称匹配时返回 Repo ID，否则返回 None。

        副作用/失败模式:
            不修改输入数据；缺失 ID 或名称不匹配时返回 None。
        """
        name = str(row.get("repoName") or row.get("repo_name") or "").strip()
        if name.casefold() != repo_name.casefold():
            return None
        return extract_chatdoc_scalar(row, "repoId", "repo_id", "id") or None

    async def _list_repo_page(self, *, repo_name: str | None, page: int) -> list[dict[str, Any]]:
        """分页查询 ChatDoc 知识库列表。

        参数:
            repo_name: 可选的仓库名称过滤条件。
            page: 要查询的页码，从 1 开始。

        返回:
            当前页解析后的仓库记录列表。

        副作用/失败模式:
            会向 ChatDoc repo/list 发起网络请求；客户端错误会按原异常向上传递。
        """
        body: dict[str, Any] = {"currentPage": page, "pageSize": _REPO_LIST_PAGE_SIZE}
        if repo_name:
            body["repoName"] = repo_name
        payload = await self.client.post_json("/openapi/v1/repo/list", body)
        return self._repo_list_items(payload)

    async def find_existing_repo_id(self, repo_name: str) -> str | None:
        """查找已存在的 ChatDoc 知识库 Repo ID。

        参数:
            repo_name: 需要匹配的知识库名称。

        返回:
            找到时返回 Repo ID，未找到时返回 None。

        副作用/失败模式:
            会分页调用 ChatDoc repo/list；先按名称过滤查询，再退回全量分页查询。远端请求失败会抛出
            ChatDoc 客户端异常。
        """
        for page in range(1, 11):
            rows = await self._list_repo_page(repo_name=repo_name, page=page)
            if not rows:
                break
            for row in rows:
                repo_id = self._repo_id_from_row(row, repo_name)
                if repo_id:
                    return repo_id
            if len(rows) < _REPO_LIST_PAGE_SIZE:
                break

        for page in range(1, 11):
            rows = await self._list_repo_page(repo_name=None, page=page)
            if not rows:
                break
            for row in rows:
                repo_id = self._repo_id_from_row(row, repo_name)
                if repo_id:
                    return repo_id
            if len(rows) < _REPO_LIST_PAGE_SIZE:
                break
        return None

    async def list_all_repos(self, *, limit: int = 100) -> list[dict[str, str]]:
        """列出当前 ChatDoc 账号可见的知识库摘要。

        参数:
            limit: 最多返回的仓库数量。

        返回:
            包含 repo_id 与 repo_name 的字典列表。

        副作用/失败模式:
            会分页调用 ChatDoc repo/list；远端请求失败会抛出 ChatDoc 客户端异常。
        """
        rows: list[dict[str, str]] = []
        for page in range(1, 11):
            batch = await self._list_repo_page(repo_name=None, page=page)
            if not batch:
                break
            for row in batch:
                repo_id = extract_chatdoc_scalar(row, "repoId", "repo_id", "id")
                repo_name = str(row.get("repoName") or row.get("repo_name") or "").strip()
                if repo_id:
                    rows.append({"repo_id": repo_id, "repo_name": repo_name})
                if len(rows) >= limit:
                    return rows
            if len(batch) < _REPO_LIST_PAGE_SIZE:
                break
        return rows

    def _stored_repo_name(self, course: Course) -> str | None:
        """读取课程配置中保存的 ChatDoc 知识库名称。

        参数:
            course: 课程 ORM 实体。

        返回:
            已保存的仓库名称；未配置或为空时返回 None。

        副作用/失败模式:
            仅读取课程配置，无数据库写入。
        """
        cfg = course.display_config or {}
        raw = cfg.get(CHATDOC_REPO_NAME_CONFIG_KEY) or cfg.get("iflytek_repo_name")
        if raw is None:
            return None
        name = str(raw).strip()
        return name or None

    def _remember_repo_name(self, course: Course, repo_name: str) -> None:
        """把实际绑定的 ChatDoc 知识库名称写回课程配置。

        参数:
            course: 课程 ORM 实体。
            repo_name: 实际绑定成功的知识库名称。

        返回:
            无返回值。

        副作用/失败模式:
            修改 course.display_config，并在 ORM 实体可追踪时标记字段已变更；不会主动 flush 或 commit。
        """
        course.display_config = {**(course.display_config or {}), CHATDOC_REPO_NAME_CONFIG_KEY: repo_name}
        if hasattr(course, "_sa_instance_state"):
            flag_modified(course, "display_config")

    def _persist_repo_id(self, course: Course, repo_id: str) -> str:
        """持久化课程绑定的 ChatDoc Repo ID。

        参数:
            course: 课程 ORM 实体。
            repo_id: ChatDoc 返回或查找到的 Repo ID。

        返回:
            已保存的 Repo ID。

        副作用/失败模式:
            会修改课程实体并执行 flush 与 commit；数据库写入失败时会抛出 SQLAlchemy 相关异常。
        """
        course.iflytek_repo_id = repo_id
        self.db.flush()
        self.db.commit()
        return repo_id

    async def _create_repo(self, course: Course, repo_name: str) -> str:
        """在 ChatDoc 远端创建课程知识库。

        参数:
            course: 需要创建知识库的课程实体。
            repo_name: 准备提交给 ChatDoc 的知识库名称。

        返回:
            ChatDoc 返回的 Repo ID。

        副作用/失败模式:
            会调用 ChatDoc repo/create；远端错误或响应缺少 Repo ID 时抛出 IflytekChatDocError。
        """
        payload = await self.client.post_json(
            "/openapi/v1/repo/create",
            {"repoName": repo_name, "repoDesc": course.title or course.slug},
        )
        repo_id = extract_chatdoc_scalar(payload, "repoId", "repo_id", "id")
        if not repo_id:
            raise IflytekChatDocError(f"ChatDoc repo/create 未返回 repoId：{payload}")
        return repo_id

    async def _bind_or_create(self, course: Course, repo_name: str) -> str:
        """绑定已存在的知识库，或在不存在时创建后绑定。

        参数:
            course: 需要绑定知识库的课程实体。
            repo_name: 期望绑定或创建的知识库名称。

        返回:
            最终绑定到课程的 Repo ID。

        副作用/失败模式:
            可能调用 ChatDoc repo/list 与 repo/create，并在成功时提交数据库事务；名称重复时会按退避间隔
            重试查找，其他 ChatDoc 错误会继续向上传递。
        """
        existing = await self.find_existing_repo_id(repo_name)
        if existing:
            self._remember_repo_name(course, repo_name)
            return self._persist_repo_id(course, existing)
        try:
            repo_id = await self._create_repo(course, repo_name)
            self._remember_repo_name(course, repo_name)
            return self._persist_repo_id(course, repo_id)
        except IflytekChatDocError as exc:
            if not self._is_repo_name_duplicate_error(exc):
                raise
            # 处理竞态或最终一致性延迟：按退避间隔重试。
            for delay in (0.5, 1.5, 3.0):
                await asyncio.sleep(delay)
                existing = await self.find_existing_repo_id(repo_name)
                if existing:
                    self._remember_repo_name(course, repo_name)
                    return self._persist_repo_id(course, existing)
            raise

    async def ensure_repo(self, course_slug: str) -> str:
        """确保课程存在可用的 ChatDoc 知识库绑定。

        参数:
            course_slug: 课程唯一标识。

        返回:
            课程绑定的 ChatDoc Repo ID。

        副作用/失败模式:
            会读取课程、调用 ChatDoc 查询或创建知识库，并在绑定成功后提交数据库事务。课程不存在、凭证未配置、
            远端创建失败或备用名称仍不可用时抛出 IflytekChatDocError。
        """
        course = self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
        if not course:
            raise IflytekChatDocError(f"课程不存在：{course_slug}")
        if course.iflytek_repo_id:
            return course.iflytek_repo_id
        if not self.client.configured:
            raise IflytekChatDocError("ChatDoc 凭证未配置，无法创建知识库 Repo")

        primary = self._stored_repo_name(course) or course_chatdoc_repo_name(course.slug)
        primary_exc: IflytekChatDocError | None = None
        try:
            return await self._bind_or_create(course, primary)
        except IflytekChatDocError as exc:
            if not self._is_repo_name_duplicate_error(exc):
                raise
            primary_exc = exc

        candidates = [
            alternate_chatdoc_repo_name(course.slug),
            f"{course_chatdoc_repo_name(course.slug)}_{uuid.uuid4().hex[:6]}",
        ]
        seen: set[str] = {primary.casefold()}
        last_exc = primary_exc
        for repo_name in candidates:
            if repo_name.casefold() in seen:
                continue
            seen.add(repo_name.casefold())
            try:
                return await self._bind_or_create(course, repo_name)
            except IflytekChatDocError as exc:
                last_exc = exc
                if not self._is_repo_name_duplicate_error(exc):
                    raise

        vendor_raw = last_exc.vendor_raw if last_exc else (primary_exc.vendor_raw if primary_exc else "")
        raise IflytekChatDocError(
            "无法创建或绑定讯飞知识库：默认名称已被占用且备用名称仍失败。"
            f"期望名称={primary}；请用 GET /api/v1/admin/knowledge/chatdoc-repo-debug?course_id={course_slug} 查看 repo/list。"
            f"原始错误：{vendor_raw}"
        ) from (last_exc or primary_exc)

    async def debug_course_repo(self, course_slug: str) -> dict[str, Any]:
        """返回课程 ChatDoc Repo 绑定的调试信息。

        参数:
            course_slug: 课程唯一标识。

        返回:
            包含课程信息、期望名称、已存 Repo ID、当前客户端配置状态和远端匹配结果的字典。

        副作用/失败模式:
            会查询本地课程；在客户端已配置时会调用 ChatDoc repo/list。课程不存在时返回 not_found 状态，
            远端查询失败会抛出 ChatDoc 客户端异常。
        """
        course = self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
        if not course:
            return {"course_id": course_slug, "status": "not_found"}
        primary = course_chatdoc_repo_name(course.slug)
        stored = self._stored_repo_name(course)
        repos = await self.list_all_repos(limit=50) if self.client.configured else []
        matched = [row for row in repos if row["repo_name"].casefold() in {primary.casefold(), (stored or "").casefold()}]
        return {
            "course_id": course.slug,
            "course_title": course.title,
            "expected_repo_name": primary,
            "stored_repo_name": stored,
            "iflytek_repo_id": course.iflytek_repo_id,
            "configured": self.client.configured,
            "app_id": self.client.app_id or None,
            "matched_repos": matched,
            "repo_total_listed": len(repos),
            "repos_sample": repos[:20],
        }
