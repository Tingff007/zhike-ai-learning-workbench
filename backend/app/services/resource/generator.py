from __future__ import annotations

from uuid import uuid4

from app.schemas.resource import ResourceGenerateRequest


class ResourceGenerator:
    """资源生成任务创建器，保留给旧调用点使用。"""

    async def create_generation_task(self, payload: ResourceGenerateRequest) -> dict[str, object]:
        """根据生成请求构造排队中的资源任务摘要。"""
        return {
            "task_id": f"task_{uuid4().hex[:12]}",
            "status": "queued",
            "course_id": payload.course_id,
            "resource_type": payload.resource_type,
            "steps": ["读取课程上下文", "检索材料", "资源生成", "引用核验", "安全审查", "保存结果"],
        }
