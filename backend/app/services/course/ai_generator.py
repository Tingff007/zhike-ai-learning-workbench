from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.models import ConceptPrerequisite, Course, CourseConcept, CourseMembership, CourseSection, User
from app.schemas.course import CourseGenerateFromAIRequest
from app.services.course.repository import CourseRepository
from app.services.model_gateway.router import ModelGateway


class GeneratedConcept(BaseModel):
    """AI 生成的课程知识点结构。

    参数:
        name: 知识点名称。
        difficulty: AI 返回的难度等级，可为数字或文本。
        prerequisites: 前置知识点名称列表。
        description: 知识点说明。

    返回值:
        Pydantic 模型实例，用于后续清洗和落库。

    副作用/失败模式:
        创建实例时会执行字段校验；字段不合法会抛出校验异常。
    """

    name: str = Field(min_length=1, max_length=200)
    difficulty: int | str = 2
    prerequisites: list[str] = Field(default_factory=list)
    description: str | None = None


class GeneratedSection(BaseModel):
    """AI 生成的课程章节结构。

    参数:
        title: 章节标题。
        concepts: 章节内的知识点列表。

    返回值:
        Pydantic 模型实例，用于组织课程知识图谱。

    副作用/失败模式:
        创建实例时会执行字段校验；字段不合法会抛出校验异常。
    """

    title: str = Field(min_length=1, max_length=200)
    concepts: list[GeneratedConcept] = Field(default_factory=list)


class GeneratedCourseGraph(BaseModel):
    """AI 生成的课程知识图谱结构。

    参数:
        sections: 课程章节列表。

    返回值:
        Pydantic 模型实例，作为课程生成流程的中间表示。

    副作用/失败模式:
        创建实例时会执行字段校验；字段不合法会抛出校验异常。
    """

    sections: list[GeneratedSection] = Field(default_factory=list)


class CourseAIGenerator:
    """课程 AI 生成服务。

    参数:
        db: 当前请求或任务使用的 SQLAlchemy 会话。

    返回值:
        服务实例本身不直接返回业务数据，具体数据由方法返回。

    副作用/失败模式:
        生成流程会调用模型网关并写入课程、章节、知识点和依赖关系；外部模型或数据库异常会向上抛出。
    """

    def __init__(self, db: Session) -> None:
        """初始化课程 AI 生成器。

        参数:
            db: 用于模型调用上下文和课程落库的数据库会话。

        返回值:
            无。

        副作用/失败模式:
            仅保存会话引用，不主动访问数据库；传入失效会话时后续操作会失败。
        """
        self.db = db

    async def generate(self, payload: CourseGenerateFromAIRequest, user_external_id: str | None = None) -> dict:
        """根据请求生成课程知识图谱并创建课程。

        参数:
            payload: AI 生成课程的输入请求。
            user_external_id: 可选的课程创建者外部用户标识。

        返回值:
            包含生成状态、课程信息、章节数量、知识点数量、依赖数量和生成来源的字典。

        副作用/失败模式:
            会调用模型网关、清洗结果并提交课程相关数据；模型解析失败或数据库异常会向上抛出。
        """
        raw_graph, generated_by = await self._generate_graph(payload)
        graph = self._sanitize_graph(raw_graph, payload)
        course = self._create_course(payload, graph, user_external_id)
        return {
            "status": "generated",
            "course": CourseRepository.course_to_dict(course),
            "sections_created": len(graph.sections),
            "concepts_created": sum(len(section.concepts) for section in graph.sections),
            "prerequisites_created": self.db.query(ConceptPrerequisite).filter(ConceptPrerequisite.course_id == course.id).count(),
            "generated_by": generated_by,
        }

    async def _generate_graph(self, payload: CourseGenerateFromAIRequest) -> tuple[GeneratedCourseGraph, str]:
        """调用模型网关生成课程知识图谱。

        参数:
            payload: AI 生成课程的输入请求。

        返回值:
            课程知识图谱和生成来源标识。

        副作用/失败模式:
            会调用模型网关；非兜底结果解析失败时抛出异常，兜底结果解析失败时返回本地兜底图谱。
        """
        messages = [
            {
                "role": "system",
                "content": (
                    "你是课程设计专家。输出必须是严格 JSON，不要 Markdown，不要解释。"
                    "JSON 顶层字段只能包含 sections。"
                    "每个章节包含 title 和 concepts；每个知识点包含 name、difficulty、prerequisites、description。"
                    "prerequisites 只能引用同章节或前序章节已经出现的知识点 name。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"为《{payload.course_name}》生成课程知识图谱。"
                    f"课程描述：{payload.description or '无'}。"
                    f"章节不超过 {payload.section_limit} 个，每章知识点不超过 {payload.concept_limit_per_section} 个。"
                    "difficulty 使用 1 到 5 的整数。输出示例："
                    '{"sections":[{"title":"第1章 ...","concepts":[{"name":"...","difficulty":2,"prerequisites":[],"description":"..."}]}]}'
                ),
            },
        ]
        result = await ModelGateway(self.db).complete_chat(
            messages=messages,
            course_slug=None,
            agent_name="课程知识图谱生成 Agent",
            temperature=0.1,
            max_tokens=2200,
            allow_fallback=True,
            json_mode=True,
        )
        try:
            return self._parse_graph(result.answer), "model_gateway" if not result.is_fallback else "local_fallback"
        except ValueError:
            if not result.is_fallback:
                raise
            return self._fallback_graph(payload), "local_fallback"

    def _parse_graph(self, raw_text: str) -> GeneratedCourseGraph:
        """解析模型返回的课程知识图谱文本。

        参数:
            raw_text: 模型返回的原始文本。

        返回值:
            校验后的课程知识图谱模型。

        副作用/失败模式:
            无外部副作用；未找到合法 JSON 或字段校验失败时抛出 ValueError。
        """
        raw_text = raw_text.strip()
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not match:
            raise ValueError("模型未返回合法 JSON")
        try:
            data = json.loads(match.group(0))
            return GeneratedCourseGraph.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ValueError(f"课程图谱 JSON 解析失败：{exc}") from exc

    def _sanitize_graph(self, graph: GeneratedCourseGraph, payload: CourseGenerateFromAIRequest) -> GeneratedCourseGraph:
        """清洗并裁剪 AI 生成的课程知识图谱。

        参数:
            graph: 模型返回并完成结构校验的课程知识图谱。
            payload: AI 生成课程的输入请求，用于限制章节和知识点数量。

        返回值:
            去重、裁剪并补齐描述后的课程知识图谱；清洗后为空时返回本地兜底图谱。

        副作用/失败模式:
            无数据库或网络副作用；字段对象本身异常时会向上抛出。
        """
        sections: list[GeneratedSection] = []
        known_names: set[str] = set()
        for section in graph.sections[: payload.section_limit]:
            concepts: list[GeneratedConcept] = []
            seen_in_section: set[str] = set()
            for concept in section.concepts[: payload.concept_limit_per_section]:
                name = concept.name.strip()
                if not name or name in known_names or name in seen_in_section:
                    continue
                prerequisites = [item for item in concept.prerequisites if item in known_names or item in seen_in_section]
                concepts.append(
                    GeneratedConcept(
                        name=name,
                        difficulty=concept.difficulty,
                        prerequisites=prerequisites,
                        description=concept.description or f"{payload.course_name}课程中的核心知识点：{name}",
                    )
                )
                seen_in_section.add(name)
            if concepts:
                sections.append(GeneratedSection(title=section.title.strip(), concepts=concepts))
                known_names.update(concept.name for concept in concepts)
        if not sections:
            return self._fallback_graph(payload)
        return GeneratedCourseGraph(sections=sections)

    def _create_course(self, payload: CourseGenerateFromAIRequest, graph: GeneratedCourseGraph, user_external_id: str | None) -> Course:
        """将清洗后的课程知识图谱写入数据库。

        参数:
            payload: AI 生成课程的输入请求。
            graph: 已清洗的课程知识图谱。
            user_external_id: 可选的课程创建者外部用户标识。

        返回值:
            已提交并刷新的课程模型。

        副作用/失败模式:
            会新增课程、章节、知识点、前置依赖和可选课程成员关系；数据库异常会向上抛出。
        """
        repository = CourseRepository(self.db)
        slug = repository.next_course_slug(payload.course_name)
        course = Course(
            slug=slug,
            title=payload.course_name.strip(),
            description=payload.description or f"由 AI 根据《{payload.course_name}》自动生成的课程知识图谱。",
            applicable_major="AI 生成课程",
            status="draft",
            is_default=False,
            display_config={"generated_by": "course_graph_agent"},
        )
        self.db.add(course)
        self.db.flush()

        user = self.db.query(User).filter(User.external_id == user_external_id).one_or_none() if user_external_id else None
        if user:
            self.db.add(CourseMembership(course_id=course.id, user_id=user.id, role="owner", status="active"))

        name_to_concept: dict[str, CourseConcept] = {}
        pending_prerequisites: list[tuple[CourseConcept, list[str]]] = []
        order_index = 1
        for section_index, section_graph in enumerate(graph.sections, start=1):
            section = CourseSection(
                course_id=course.id,
                code=f"section_{section_index:02d}",
                title=section_graph.title,
                description=f"{payload.course_name} AI 生成章节",
                order_index=section_index,
            )
            self.db.add(section)
            self.db.flush()
            for concept_graph in section_graph.concepts:
                concept = CourseConcept(
                    course_id=course.id,
                    section_id=section.id,
                    code=self._slug_token(concept_graph.name, f"concept_{order_index:03d}"),
                    title=concept_graph.name,
                    definition=concept_graph.description,
                    difficulty=self._difficulty_label(concept_graph.difficulty),
                    recommended_order=order_index,
                    prerequisites_json=[],
                    status="published",
                )
                self.db.add(concept)
                self.db.flush()
                name_to_concept[concept_graph.name] = concept
                pending_prerequisites.append((concept, concept_graph.prerequisites))
                order_index += 1

        for concept, prerequisite_names in pending_prerequisites:
            prerequisite_codes: list[str] = []
            for prerequisite_name in prerequisite_names:
                prerequisite = name_to_concept.get(prerequisite_name)
                if not prerequisite or prerequisite.id == concept.id:
                    continue
                prerequisite_codes.append(prerequisite.code)
                self.db.add(
                    ConceptPrerequisite(
                        course_id=course.id,
                        concept_id=concept.id,
                        prerequisite_id=prerequisite.id,
                        dependency_type="strong",
                    )
                )
            concept.prerequisites_json = prerequisite_codes

        self.db.commit()
        self.db.refresh(course)
        return course

    @staticmethod
    def _slug_token(value: str, fallback: str) -> str:
        """生成适合存储为编码的短标识。

        参数:
            value: 原始名称文本。
            fallback: 清洗后为空时使用的兜底编码。

        返回值:
            由英文数字和下划线组成的最多 80 字符编码。

        副作用/失败模式:
            无外部副作用；输入为空或不可转为编码时返回兜底值。
        """
        token = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
        return token[:80] or fallback

    @staticmethod
    def _difficulty_label(value: int | str) -> str:
        """将模型返回的难度值归一化为课程难度标签。

        参数:
            value: 数字或文本形式的难度值。

        返回值:
            basic、medium 或 advanced 之一。

        副作用/失败模式:
            无外部副作用；未知文本会按 medium 处理。
        """
        if isinstance(value, int):
            if value <= 2:
                return "basic"
            if value <= 4:
                return "medium"
            return "advanced"
        text = str(value).lower()
        if text in {"1", "2", "basic", "基础"}:
            return "basic"
        if text in {"5", "advanced", "进阶", "高级"}:
            return "advanced"
        return "medium"

    @staticmethod
    def _fallback_graph(payload: CourseGenerateFromAIRequest) -> GeneratedCourseGraph:
        """构造本地兜底课程知识图谱。

        参数:
            payload: AI 生成课程的输入请求。

        返回值:
            包含基础、核心方法和实践应用三章的课程知识图谱。

        副作用/失败模式:
            无外部副作用；字段校验失败时会由 Pydantic 抛出异常。
        """
        course = payload.course_name
        return GeneratedCourseGraph(
            sections=[
                GeneratedSection(
                    title=f"第1章 {course}基础",
                    concepts=[
                        GeneratedConcept(name="课程导论", difficulty=1, prerequisites=[], description=f"理解{course}的学习目标、应用场景和整体结构。"),
                        GeneratedConcept(name="核心术语", difficulty=2, prerequisites=["课程导论"], description=f"掌握{course}中高频出现的基本术语。"),
                    ],
                ),
                GeneratedSection(
                    title=f"第2章 {course}核心方法",
                    concepts=[
                        GeneratedConcept(name="基本原理", difficulty=3, prerequisites=["核心术语"], description=f"理解{course}的关键原理和方法框架。"),
                        GeneratedConcept(name="典型算法", difficulty=4, prerequisites=["基本原理"], description=f"掌握{course}中的代表性算法或技术路线。"),
                    ],
                ),
                GeneratedSection(
                    title=f"第3章 {course}实践应用",
                    concepts=[
                        GeneratedConcept(name="案例分析", difficulty=3, prerequisites=["典型算法"], description=f"通过案例理解{course}在真实问题中的应用。"),
                        GeneratedConcept(name="项目实践", difficulty=5, prerequisites=["案例分析"], description=f"完成一个{course}相关的小型项目并复盘结果。"),
                    ],
                ),
            ]
        )
