from app.services.resource.task_worker import ResourceGenerationWorker, run_resource_generation_worker_sync


async def parse_document_task(document_id: str) -> dict:
    """返回文档解析任务的兼容占位结果。

    参数:
        document_id: 待解析文档的业务标识。

    返回值:
        包含文档标识、跳过状态和说明消息的字典。

    副作用/失败模式:
        当前实现不执行本地解析或数据库写入；文档解析由云端知识库服务承担。
    """
    return {
        "document_id": document_id,
        "status": "skipped",
        "message": "文档解析与向量化由云端知识库服务完成。",
    }


async def generate_resource_task(task_id: str) -> dict:
    """执行单个资源生成任务。

    参数:
        task_id: 资源生成任务的业务标识。

    返回值:
        包含任务标识和处理状态的字典；无法领取任务时返回 skipped。

    副作用/失败模式:
        会创建数据库会话、领取任务并触发资源生成流程；处理异常会向上抛出，会话始终会关闭。
    """
    worker = ResourceGenerationWorker()
    from app.core.database import SessionLocal
    from app.services.resource.repository import process_resource_generation_task

    db = SessionLocal()
    try:
        task = worker.claim_task(db, task_id)
        if not task:
            return {"task_id": task_id, "status": "skipped"}
        await process_resource_generation_task(task_id)
        return {"task_id": task_id, "status": "processed"}
    finally:
        db.close()


__all__ = [
    "ResourceGenerationWorker",
    "generate_resource_task",
    "parse_document_task",
    "run_resource_generation_worker_sync",
]
