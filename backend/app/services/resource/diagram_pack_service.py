from __future__ import annotations

import logging
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, Resource, ResourceAsset, ResourceGenerationTask
from app.services.model_gateway.router import ModelGateway
from app.services.safety.guardrail import SafetyGuardrail
from app.services.resource import task_metadata
from app.services.resource.asset_service import ResourceAssetService
from app.services.resource.image_generation import ImageGenerationInput, ImageGenerationService
from app.services.resource.prompts import build_personalization_metadata, resolve_effective_resource_type
from app.services.resource.upload_service import current_utc_iso


logger = logging.getLogger(__name__)

DiagramPackDraftUpdater = Callable[[str, int], None]
ImageServiceFactory = Callable[[Session], ImageGenerationService]
UtcIsoFactory = Callable[[], str]

DIAGRAM_PACK_TYPES = [
    {
        "diagram_type": "concept",
        "title": "概念示意图",
        "focus": "用核心对象、关系箭头和少量标注解释概念本身。",
    },
    {
        "diagram_type": "process",
        "title": "流程图",
        "focus": "用步骤、输入输出和关键判断展示学习主题的运行流程。",
    },
    {
        "diagram_type": "contrast",
        "title": "易错对比图",
        "focus": "左右对比正确理解与常见误区，突出差异点和纠错提示。",
    },
]


@dataclass(slots=True)
class DiagramPackImageGenerationResult:
    """教学图解包图片生成结果，供仓储继续执行安全审查和资源保存。"""

    assets: list[ResourceAsset]
    completed_count: int
    content: str
    image_context: dict[str, Any]
    reference_asset_ids: list[str]
    provider_code: str | None
    image_provider: str | None


class DiagramPackStepUpdater(Protocol):
    """教学图解包任务步骤更新回调，避免任务编排服务直接依赖仓储门面。"""

    def __call__(
        self,
        task: ResourceGenerationTask,
        index: int,
        status: str,
        detail: str | None = None,
        progress: int | None = None,
        citations: list[dict[str, Any]] | None = None,
    ) -> None:
        """更新任务步骤状态，并由调用方决定如何持久化和推送进度。"""


class DiagramPackTaskDraftUpdater(Protocol):
    """教学图解包草稿更新回调，用于复用既有任务草稿落库逻辑。"""

    def __call__(self, task: ResourceGenerationTask, content: str, progress: int | None = None) -> None:
        """写入任务草稿内容和可选进度。"""


class DiagramPackRetrieveNode(Protocol):
    """课程资料检索节点回调，由资源生成检索服务提供真实实现。"""

    def __call__(self, state: dict[str, Any]) -> Awaitable[dict[str, Any]]:
        """执行检索节点并返回可合并到任务状态的字段。"""


class DiagramPackProfileNode(Protocol):
    """学习画像节点回调，由资源生成上下文服务提供真实实现。"""

    def __call__(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行画像节点并返回可合并到任务状态的字段。"""


class DiagramPackResourceSaver(Protocol):
    """生成资源保存回调，隔离图解包编排和资源落库细节。"""

    def __call__(
        self,
        course: Course | None,
        concept: CourseConcept | None,
        task: ResourceGenerationTask,
        content: str,
        citations: list[dict[str, Any]],
        quality: dict[str, Any],
        safety_status: str,
        *,
        personalization: dict[str, Any] | None = None,
        profile_context_snapshot: str | None = None,
        extra_basis: dict[str, Any] | None = None,
    ) -> Resource:
        """保存生成资源并返回资源实体。"""


class DiagramPackAssetSerializer(Protocol):
    """图解包资产序列化回调，复用资源资产公开展示格式。"""

    def __call__(self, asset: ResourceAsset) -> dict[str, object]:
        """把图片资产实体转换为 API 可返回的字典。"""


def build_default_diagram_specs(task: ResourceGenerationTask, concept_title: str) -> list[dict[str, Any]]:
    """构造兜底图解规格，仅用于模型 JSON 结构不完整时补齐字段。"""

    return [
        {
            "diagram_type": item["diagram_type"],
            "title": f"{concept_title} · {item['title']}",
            "visual_brief": f"{item['focus']} 学习目标：{task.goal}",
            "key_labels": [concept_title, item["title"], "关键提示"],
            "teaching_note": item["focus"],
        }
        for item in DIAGRAM_PACK_TYPES
    ]


def normalize_diagram_specs(items: list[Any], defaults: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按固定三类图解补齐模型返回的规格，并限制字段长度。"""

    by_type = {str(item.get("diagram_type")): item for item in items if isinstance(item, dict)}
    normalized: list[dict[str, Any]] = []
    for default in defaults:
        raw = by_type.get(default["diagram_type"]) or {}
        labels = raw.get("key_labels") if isinstance(raw.get("key_labels"), list) else default["key_labels"]
        normalized.append(
            {
                "diagram_type": default["diagram_type"],
                "title": str(raw.get("title") or default["title"])[:120],
                "visual_brief": str(raw.get("visual_brief") or default["visual_brief"])[:1200],
                "key_labels": [str(item)[:40] for item in labels[:8]],
                "teaching_note": str(raw.get("teaching_note") or default["teaching_note"])[:400],
            }
        )
    return normalized


class DiagramPackSpecPlanner:
    """负责调用 Chat 模型规划教学图解包规格，并提供稳定兜底。"""

    def __init__(self, db: Session) -> None:
        """初始化图解规格规划器。"""

        self.db = db

    async def generate_specs(
        self,
        *,
        course: Course | None,
        concept: CourseConcept | None,
        task: ResourceGenerationTask,
        citations: list[dict[str, Any]],
        profile_summary: str | None,
        mastery_context: str | None,
        recent_dialog: str | None,
    ) -> list[dict[str, Any]]:
        """生成三张教学图解的脚本规格，模型异常或结构异常时回退默认规格。"""

        course_title = course.title if course else "通用学习"
        concept_title = concept.title if concept else (course_title if course else (task.goal or "通用学习主题"))
        defaults = build_default_diagram_specs(task, concept_title)
        prompt = self._build_prompt(
            course_title=course_title,
            concept_title=concept_title,
            task=task,
            citations=citations,
            profile_summary=profile_summary,
            mastery_context=mastery_context,
            recent_dialog=recent_dialog,
        )
        result = await ModelGateway(self.db).complete_chat(
            messages=[
                {"role": "system", "content": "你是教学可视化脚本设计专家，擅长把课程知识转成可直接用于图片生成的图解规格。"},
                {"role": "user", "content": prompt},
            ],
            course_slug=course.slug if course else None,
            agent_name="教学图解脚本规划 Agent",
            temperature=0.2,
            max_tokens=1200,
            allow_fallback=False,
            json_mode=True,
        )
        try:
            parsed = json.loads(result.answer)
            items = parsed.get("items") if isinstance(parsed, dict) else parsed
            if isinstance(items, list):
                normalized = normalize_diagram_specs(items, defaults)
                if len(normalized) == len(DIAGRAM_PACK_TYPES):
                    return normalized
        except (json.JSONDecodeError, TypeError, AttributeError):
            return defaults
        return defaults

    @staticmethod
    def _build_prompt(
        *,
        course_title: str,
        concept_title: str,
        task: ResourceGenerationTask,
        citations: list[dict[str, Any]],
        profile_summary: str | None,
        mastery_context: str | None,
        recent_dialog: str | None,
    ) -> str:
        """构造发送给 Chat 模型的教学图解规划提示词。"""

        evidence = "\n".join(
            f"- {item.get('source_title') or item.get('sourceTitle') or '课程资料'}：{str(item.get('snippet') or '')[:180]}"
            for item in citations[:5]
        ) or "- 暂无课程引用，按学习主题生成。"
        return f"""
请为教学图解包规划 3 张图。只输出 JSON，不输出 Markdown。

课程：{course_title}
知识点：{concept_title}
目标：{task.goal}
要求：{task.requirements or "无"}
学习画像：{profile_summary or "暂无画像"}
掌握度：{mastery_context or "暂无掌握度"}
近期对话：{recent_dialog or "暂无"}
引用依据：
{evidence}

固定图解类型：
1. concept：概念示意图
2. process：流程图
3. contrast：易错对比图

JSON 格式：
{{"items":[{{"diagram_type":"concept","title":"...","visual_brief":"...","key_labels":["..."],"teaching_note":"..."}}]}}
""".strip()


def build_diagram_image_prompt(
    spec: dict[str, Any],
    *,
    task: ResourceGenerationTask,
    course: Course | None,
    concept: CourseConcept | None,
    aspect_ratio: str,
    style_preset: str,
) -> str:
    """构造单张教学图解的图片生成提示词。"""

    course_title = course.title if course else "通用学习"
    concept_title = concept.title if concept else (task.goal or course_title)
    labels = "、".join(str(item) for item in spec.get("key_labels", []) if item)
    style_map = {
        "clean_edu": "清爽高校教材风，白底，蓝绿强调色，细线条，信息密度中等",
        "chalkboard": "黑板板书风，粉笔线条，强调推导路径",
        "isometric": "等距信息图风格，轻量 3D 层级，适合流程和结构",
        "paper_cut": "纸片拼贴风，层次清楚，适合概念关系",
    }
    style_text = style_map.get(style_preset, style_preset)
    return f"""
生成一张用于高校课程的教学图解，必须是完整可读的单张图片。

课程：{course_title}
知识点：{concept_title}
图解类型：{spec.get("diagram_type")} · {spec.get("title")}
教学目标：{task.goal}
视觉脚本：{spec.get("visual_brief")}
关键标注：{labels or "核心概念、关键步骤、易错点"}
教学提示：{spec.get("teaching_note")}
画面比例：{aspect_ratio}
风格：{style_text}

要求：
- 图片中可以有少量中文标签，但不要出现大段正文。
- 用箭头、分区、编号或左右对比表达知识结构。
- 不要生成照片感人物，不要生成水印、二维码、平台 Logo。
- 保持字体清晰、布局稳定、适合课堂投屏和资源大厅缩略图。
""".strip()


def build_diagram_pack_markdown(
    *,
    task: ResourceGenerationTask,
    specs: list[dict[str, Any]],
    assets: list[ResourceAsset],
) -> str:
    """构造教学图解包 Markdown 清单。"""

    assets_by_type = {asset.diagram_type: asset for asset in assets}
    lines = [
        "# 教学图解包",
        "",
        f"- 生成目标：{task.goal}",
        "- 图解类型：概念示意图、流程图、易错对比图",
        "",
    ]
    for spec in specs:
        asset = assets_by_type.get(spec["diagram_type"])
        lines.append(f"## {spec['title']}")
        if asset and asset.status == "completed" and asset.file_path:
            lines.append(f"![{asset.title}]({ResourceAssetService.asset_file_url(asset.id)})")
        elif asset and asset.status == "failed":
            lines.append("_该图生成失败，可在画廊中查看失败参数并重试。_")
        else:
            lines.append("_等待图片生成…_")
        lines.extend(
            [
                "",
                f"- 图解类型：{spec['diagram_type']}",
                f"- 视觉脚本：{spec['visual_brief']}",
                f"- 教学提示：{spec.get('teaching_note') or '无'}",
                "",
            ]
        )
    return "\n".join(lines).strip()


class DiagramPackGenerationService:
    """负责教学图解包的真实图片生成、失败资产记录和草稿更新。"""

    def __init__(
        self,
        db: Session,
        asset_service: ResourceAssetService | None = None,
        *,
        image_service_factory: ImageServiceFactory = ImageGenerationService,
    ) -> None:
        """初始化教学图解包服务。

        参数:
            db: 当前资源生成任务使用的数据库会话。
            asset_service: 可复用的资源资产服务，默认按当前会话创建。
            image_service_factory: 图片生成服务工厂，测试可注入 mock。
        """

        self.db = db
        self.asset_service = asset_service or ResourceAssetService(db)
        self.image_service_factory = image_service_factory

    async def generate_images(
        self,
        *,
        task: ResourceGenerationTask,
        course: Course | None,
        concept: CourseConcept | None,
        specs: list[dict[str, Any]],
        diagram_defaults: list[dict[str, str]],
        on_draft_update: DiagramPackDraftUpdater,
    ) -> DiagramPackImageGenerationResult:
        """按图解规格逐张调用图片供应商，并在每张图完成后刷新草稿。

        参数:
            task: 当前资源生成任务。
            course: 任务所属课程；通用图解包时为 None。
            concept: 任务关联知识点。
            specs: 已规划好的三张图解规格。
            diagram_defaults: 固定图解类型默认值，用于补齐标题和类型。
            on_draft_update: 草稿更新回调，由仓储负责实际落库和推送。

        返回:
            图片资产、生成数量、最终 Markdown 和保存资源所需图片元数据。
        """

        image_context = task_metadata.image_context_from_task(task)
        aspect_ratio = str(image_context.get("aspectRatio") or "1:1")
        style_preset = str(image_context.get("stylePreset") or "clean_edu")
        provider_code = task_metadata.image_provider_from_task(task, course)
        reference_assets = self.asset_service.reference_assets_for_task(task, image_context)
        reference_asset_ids = [str(asset.id) for asset in reference_assets]
        reference_paths = [
            str(path)
            for asset in reference_assets
            if (path := self.asset_service.absolute_asset_path(asset.file_path)) and path.exists()
        ]

        image_service = self.image_service_factory(self.db)
        assets: list[ResourceAsset] = []
        completed_count = 0
        for index, spec in enumerate(specs):
            default = diagram_defaults[index]
            diagram_type = str(spec.get("diagram_type") or default["diagram_type"])
            title = str(spec.get("title") or default["title"])
            prompt = build_diagram_image_prompt(
                spec,
                task=task,
                course=course,
                concept=concept,
                aspect_ratio=aspect_ratio,
                style_preset=style_preset,
            )
            try:
                generated = await image_service.generate(
                    ImageGenerationInput(
                        prompt=prompt,
                        aspect_ratio=aspect_ratio,
                        style_preset=style_preset,
                        provider_code=provider_code,
                        course_slug=course.slug if course else None,
                        agent_name="教学图解出图 Agent",
                        reference_paths=reference_paths,
                        extra_params={"diagram_type": diagram_type},
                    )
                )
                asset = await self.asset_service.persist_generated_image(
                    generated,
                    task=task,
                    course=course,
                    title=title,
                    diagram_type=diagram_type,
                    sort_order=index,
                    reference_asset_ids=reference_asset_ids,
                )
                completed_count += 1
            except Exception as exc:
                logger.warning(
                    "教学图解图片生成失败，将记录失败资产：task_id=%s diagram_type=%s sort_order=%s",
                    task.id,
                    diagram_type,
                    index,
                    exc_info=True,
                )
                asset = self.asset_service.record_failed_image_asset(
                    task=task,
                    course=course,
                    title=title,
                    diagram_type=diagram_type,
                    prompt=prompt,
                    sort_order=index,
                    error=str(exc)[:800],
                    reference_asset_ids=reference_asset_ids,
                )
            assets.append(asset)
            self.db.commit()
            on_draft_update(
                build_diagram_pack_markdown(task=task, specs=specs, assets=assets),
                min(82, 58 + (index + 1) * 8),
            )

        image_provider = next((asset.provider for asset in assets if asset.provider), provider_code)
        return DiagramPackImageGenerationResult(
            assets=assets,
            completed_count=completed_count,
            content=build_diagram_pack_markdown(task=task, specs=specs, assets=assets),
            image_context=image_context,
            reference_asset_ids=reference_asset_ids,
            provider_code=provider_code,
            image_provider=image_provider,
        )


class DiagramPackTaskRunner:
    """编排教学图解包资源生成任务，减少 ResourceRepository 的业务职责。"""

    def __init__(
        self,
        db: Session,
        asset_service: ResourceAssetService,
        *,
        update_task_step: DiagramPackStepUpdater,
        update_task_draft: DiagramPackTaskDraftUpdater,
        retrieve_node: DiagramPackRetrieveNode,
        profile_node: DiagramPackProfileNode,
        save_generated_resource: DiagramPackResourceSaver,
        asset_to_dict: DiagramPackAssetSerializer,
        image_service_factory: ImageServiceFactory | None = None,
        utc_iso: UtcIsoFactory = current_utc_iso,
    ) -> None:
        """初始化图解包任务编排器。

        参数:
            db: 当前任务使用的数据库会话。
            asset_service: 资源资产服务，用于图片生成后的资产读写。
            update_task_step: 更新任务步骤的回调。
            update_task_draft: 更新任务草稿的回调。
            retrieve_node: 课程资料检索节点回调。
            profile_node: 学习画像节点回调。
            save_generated_resource: 资源落库回调。
            asset_to_dict: 图片资产序列化回调。
            image_service_factory: 图片生成服务工厂，测试可注入 mock。
            utc_iso: UTC 时间字符串工厂，用于质量结果时间戳。
        """

        self.db = db
        self.asset_service = asset_service
        self.update_task_step = update_task_step
        self.update_task_draft = update_task_draft
        self.retrieve_node = retrieve_node
        self.profile_node = profile_node
        self.save_generated_resource = save_generated_resource
        self.asset_to_dict = asset_to_dict
        self.image_service_factory = image_service_factory or ImageGenerationService
        self.utc_iso = utc_iso

    async def run(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行教学图解包任务，并返回可合并到资源生成工作流的状态。"""

        task = state["task"]
        course = state.get("course")
        concept = state.get("concept")
        if course:
            state = {**state, **await self.retrieve_node(state)}
        else:
            topic = (task.goal or task.requirements or "通用学习主题").strip()[:120]
            self.update_task_step(task, 0, "completed", f"通用图解主题：{topic}", 28, citations=[])
            self.update_task_draft(task, f"# {topic} · 教学图解包\n\n_正在规划三张教学图解…_\n", progress=34)
            state["citations"] = []

        state = {**state, **self.profile_node(state)}
        self.update_task_step(task, 1, "running", "正在规划概念示意图、流程图和易错对比图", 46)
        specs = await DiagramPackSpecPlanner(self.db).generate_specs(
            course=course,
            concept=concept,
            task=task,
            citations=state.get("citations") or [],
            profile_summary=state.get("profile_summary"),
            mastery_context=state.get("mastery_context"),
            recent_dialog=state.get("recent_dialog"),
        )
        self.update_task_draft(task, build_diagram_pack_markdown(task=task, specs=specs, assets=[]), progress=52)
        self.update_task_step(task, 1, "completed", "已生成 3 张教学图解脚本", 52)

        self.update_task_step(task, 2, "running", "正在调用图片生成供应商批量出图", 58)
        generation = await DiagramPackGenerationService(
            self.db,
            self.asset_service,
            image_service_factory=self.image_service_factory,
        ).generate_images(
            task=task,
            course=course,
            concept=concept,
            specs=specs,
            diagram_defaults=DIAGRAM_PACK_TYPES,
            on_draft_update=lambda content, progress: self.update_task_draft(task, content, progress=progress),
        )
        assets = generation.assets
        completed_count = generation.completed_count

        if completed_count == 0:
            self.update_task_step(task, 2, "failed", "三张图均未生成成功，请检查图片供应商配置。", 82)
            raise RuntimeError("ImageProvider 图片生成失败：三张图均未生成成功。")
        detail = f"已生成 {completed_count}/3 张图" if completed_count < 3 else "3 张教学图解已生成"
        self.update_task_step(task, 2, "completed", detail, 84)

        content = generation.content
        safety = SafetyGuardrail().check_output(content)
        safety_status = safety.get("status", "passed")
        safety_detail = "未发现明显风险" if safety_status == "passed" else f"安全审查：{safety_status} · {', '.join(safety.get('flags') or [])}"
        if safety_status == "blocked":
            self.update_task_step(task, 3, "failed", safety_detail, 92)
            raise RuntimeError(f"SAFETY_BLOCKED: {safety_detail}")
        self.update_task_step(task, 3, "completed", safety_detail, 92)

        self.update_task_step(task, 4, "running", "正在保存图片包资源与版本", 97)
        quality = {
            "grade": "A" if completed_count == 3 else "B",
            "score": 92 if completed_count == 3 else 78,
            "summary": f"教学图解包已生成 {completed_count}/3 张图片",
            "citation_coverage": "covered" if state.get("citations") else None,
            "image_asset_count": completed_count,
            "checked_at": self.utc_iso(),
        }
        effective_type = resolve_effective_resource_type(task.resource_type, task.goal, task.requirements)
        personalization = build_personalization_metadata(state.get("profile_summary"), effective_type, task.difficulty)
        resource = self.save_generated_resource(
            course,
            concept,
            task,
            content,
            state.get("citations") or [],
            quality,
            safety_status,
            personalization=personalization,
            profile_context_snapshot=state.get("profile_context_snapshot"),
            extra_basis={
                "artifactKind": "image_pack",
                "image": {
                    **generation.image_context,
                    "count": 3,
                    "diagramTypes": [item["diagram_type"] for item in specs],
                    "referenceAssetIds": generation.reference_asset_ids,
                    "completedCount": completed_count,
                },
                "imageAssetIds": [str(asset.id) for asset in assets],
                "imageProvider": generation.image_provider,
            },
        )
        for asset in assets:
            asset.resource_id = resource.id
            self.db.add(asset)
        self.db.flush()
        self.update_task_step(task, 4, "completed", f"教学图解包已保存：{resource.code}", 99)
        return {
            "task": task,
            "content": content,
            "quality": quality,
            "safety_status": safety_status,
            "resource": resource,
            "assets": [self.asset_to_dict(asset) for asset in assets],
        }
