from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import ConceptMastery, ConceptPrerequisite, Course, CourseConcept, CourseProfile, LearningEvent, LearningPath, PathNode, ProfileDimension, User
from app.services.learning.events import LearningEventRecorder


DIFFICULTY_WEIGHT = {"basic": 1.0, "medium": 1.25, "intermediate": 1.25, "advanced": 1.55}


class LearningRepository:
    """学习路径与掌握度的数据访问服务。

    参数:
        db: 当前请求或任务使用的 SQLAlchemy 会话。

    返回值:
        服务实例本身不直接返回业务数据，具体数据由各方法返回。

    副作用/失败模式:
        部分方法会写入学习路径、节点、掌握度和学习事件；数据库异常会向上抛出。
    """

    def __init__(self, db: Session) -> None:
        """初始化学习仓储。

        参数:
            db: 用于查询和提交学习相关数据的数据库会话。

        返回值:
            无。

        副作用/失败模式:
            仅保存会话引用，不主动访问数据库；传入失效会话时后续查询会失败。
        """
        self.db = db

    def _course(self, slug: str) -> Course | None:
        """按课程标识查找课程。

        参数:
            slug: 课程的稳定业务标识。

        返回值:
            找到时返回课程模型，否则返回 None。

        副作用/失败模式:
            会读取数据库；数据库查询异常会向上抛出。
        """
        return self.db.execute(select(Course).where(Course.slug == slug)).scalar_one_or_none()

    def _user(self, external_id: str) -> User | None:
        """按外部用户标识查找用户。

        参数:
            external_id: 前端或身份系统传入的用户外部标识。

        返回值:
            找到时返回用户模型，否则返回 None。

        副作用/失败模式:
            会读取数据库；数据库查询异常会向上抛出。
        """
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _concepts(self, course: Course) -> list[CourseConcept]:
        """获取课程已发布知识点并按依赖关系排序。

        参数:
            course: 需要构建学习路径的课程模型。

        返回值:
            拓扑排序后的课程知识点列表。

        副作用/失败模式:
            会读取数据库；依赖图存在环时会跳过当前递归分支，数据库异常会向上抛出。
        """
        concepts = list(
            self.db.execute(
                select(CourseConcept)
                .where(CourseConcept.course_id == course.id, CourseConcept.status == "published")
                .order_by(CourseConcept.recommended_order, CourseConcept.created_at)
            ).scalars().all()
        )
        return self._topological_concepts(concepts)

    def _prerequisite_codes(self, concept: CourseConcept) -> list[str]:
        """获取知识点的前置知识点编码。

        参数:
            concept: 需要查询前置依赖的知识点。

        返回值:
            前置知识点编码列表；关系表无记录时回退到知识点 JSON 字段。

        副作用/失败模式:
            会读取数据库；数据库异常会向上抛出。
        """
        rows = self.db.execute(
            select(CourseConcept.code)
            .join(ConceptPrerequisite, ConceptPrerequisite.prerequisite_id == CourseConcept.id)
            .where(ConceptPrerequisite.concept_id == concept.id)
            .order_by(CourseConcept.recommended_order)
        ).scalars().all()
        return list(rows) if rows else list(concept.prerequisites_json or [])

    def _topological_concepts(self, concepts: list[CourseConcept]) -> list[CourseConcept]:
        """按前置依赖对知识点做稳定拓扑排序。

        参数:
            concepts: 同一课程下待排序的知识点列表。

        返回值:
            前置知识点尽量排在后续知识点之前的列表。

        副作用/失败模式:
            排序过程会读取前置关系；遇到循环依赖时避免无限递归并保留可用顺序。
        """
        by_code = {concept.code: concept for concept in concepts}
        visited: set[str] = set()
        visiting: set[str] = set()
        ordered: list[CourseConcept] = []

        def visit(concept: CourseConcept) -> None:
            """递归访问前置知识点，并在循环依赖时安全返回。"""
            if concept.code in visited:
                return
            if concept.code in visiting:
                return
            visiting.add(concept.code)
            for prereq_code in self._prerequisite_codes(concept):
                prereq = by_code.get(prereq_code)
                if prereq:
                    visit(prereq)
            visiting.remove(concept.code)
            visited.add(concept.code)
            ordered.append(concept)

        for concept in sorted(concepts, key=lambda item: (item.recommended_order, item.difficulty, item.title)):
            visit(concept)
        return ordered

    def _mastery_map(self, course: Course, user: User) -> dict[str, ConceptMastery]:
        """读取用户在课程内的知识点掌握度映射。

        参数:
            course: 目标课程。
            user: 目标用户。

        返回值:
            以知识点编码为键、掌握度模型为值的字典。

        副作用/失败模式:
            会读取数据库；数据库异常会向上抛出。
        """
        rows = self.db.execute(
            select(ConceptMastery, CourseConcept)
            .join(CourseConcept, CourseConcept.id == ConceptMastery.concept_id)
            .where(ConceptMastery.course_id == course.id, ConceptMastery.user_id == user.id)
        ).all()
        return {concept.code: mastery for mastery, concept in rows}

    def _active_path(self, course: Course, user: User) -> LearningPath | None:
        """获取用户当前激活的最新学习路径。

        参数:
            course: 目标课程。
            user: 目标用户。

        返回值:
            最新激活路径；不存在时返回 None。

        副作用/失败模式:
            会读取数据库；数据库异常会向上抛出。
        """
        return self.db.execute(
            select(LearningPath)
            .where(LearningPath.course_id == course.id, LearningPath.user_id == user.id, LearningPath.status == "active")
            .order_by(LearningPath.version.desc())
        ).scalars().first()

    def _path_needs_rebuild(self, path: LearningPath | None, concepts: list[CourseConcept]) -> bool:
        """判断学习路径是否需要按课程知识点重建。

        参数:
            path: 当前激活路径，可能不存在。
            concepts: 课程当前已发布知识点列表。

        返回值:
            需要重建时返回 True，否则返回 False。

        副作用/失败模式:
            会读取路径节点；数据库异常会向上抛出。
        """
        if not path:
            return bool(concepts)
        rows = self.db.execute(
            select(PathNode.title, PathNode.is_remedial)
            .where(PathNode.learning_path_id == path.id)
            .order_by(PathNode.order_index)
        ).all()
        if not rows and concepts:
            return True
        normal_count = sum(1 for _title, is_remedial in rows if not is_remedial)
        if concepts and normal_count != len(concepts):
            return True
        placeholder_tokens = ("临时路径", "获取临时路径", "temporary", "placeholder")
        return any(not title or any(token in title for token in placeholder_tokens) for title, _is_remedial in rows)

    @staticmethod
    def _status_from_mastery(value: int, unlocked: bool, current: bool) -> str:
        """根据掌握度和解锁状态推导路径节点状态。

        参数:
            value: 当前掌握度百分比。
            unlocked: 前置依赖是否已满足。
            current: 是否为当前推荐学习节点。

        返回值:
            节点状态字符串。

        副作用/失败模式:
            无外部副作用；输入超出常规范围时仍按阈值规则返回状态。
        """
        if value >= 80:
            return "mastered"
        if current and unlocked:
            return "learning"
        if value >= 50:
            return "review"
        return "not_started"

    @staticmethod
    def _node_code(concept: CourseConcept) -> str:
        """生成学习路径节点编码。

        参数:
            concept: 节点关联的课程知识点。

        返回值:
            基于知识点编码生成的路径节点编码。

        副作用/失败模式:
            无外部副作用；知识点编码为空时仍会生成带前缀的字符串。
        """
        return f"node_{concept.code}"

    @staticmethod
    def _needs_remediation(mastery: ConceptMastery) -> bool:
        """判断掌握度记录是否需要补救训练节点。

        参数:
            mastery: 用户对某个知识点的掌握度记录。

        返回值:
            需要补救训练时返回 True，否则返回 False。

        副作用/失败模式:
            无外部副作用；证据结构缺字段时按默认分数处理。
        """
        latest = (mastery.evidence_json or [])[-1] if mastery.evidence_json else {}
        return 0 < mastery.mastery < 40 or int(latest.get("score", 100)) < 50

    def _ensure_mastery(self, course: Course, user: User, concept: CourseConcept, mastery_map: dict[str, ConceptMastery]) -> ConceptMastery:
        """确保指定知识点存在用户掌握度记录。

        参数:
            course: 目标课程。
            user: 目标用户。
            concept: 目标知识点。
            mastery_map: 当前已加载的掌握度映射，会在创建新记录后同步更新。

        返回值:
            已存在或新建的掌握度模型。

        副作用/失败模式:
            可能新增掌握度记录并刷新会话；数据库写入异常会向上抛出。
        """
        existing = mastery_map.get(concept.code)
        if existing:
            return existing
        mastery = ConceptMastery(
            course_id=course.id,
            user_id=user.id,
            concept_id=concept.id,
            mastery=0,
            status="not_started",
            evidence_json=[],
        )
        self.db.add(mastery)
        self.db.flush()
        mastery_map[concept.code] = mastery
        return mastery

    def _create_path_from_concepts(self, course: Course, user: User, source: str = "PathPlanningAgent") -> LearningPath:
        """根据课程知识图谱创建新的个性化学习路径。

        参数:
            course: 目标课程。
            user: 目标用户。
            source: 记录路径来源的 Agent 或服务名称。

        返回值:
            已提交并刷新的学习路径模型。

        副作用/失败模式:
            会归档旧激活路径、新增路径节点、更新掌握度并写入学习事件；数据库异常会向上抛出。
        """
        from app.services.profile.repository import LearningProfileRepository

        concepts = self._concepts(course)
        mastery_map = self._mastery_map(course, user)
        profile_context = LearningProfileRepository(self.db).resolve_context(
            user_external_id=user.external_id,
            course_id=course.slug,
            task_type="learning_path",
        ).format_for_prompt()
        previous_version = self.db.execute(
            select(func.max(LearningPath.version)).where(LearningPath.course_id == course.id, LearningPath.user_id == user.id)
        ).scalar_one()
        active_paths = self.db.execute(
            select(LearningPath).where(LearningPath.course_id == course.id, LearningPath.user_id == user.id, LearningPath.status == "active")
        ).scalars().all()
        for active_path in active_paths:
            active_path.status = "archived"

        version = int(previous_version or 0) + 1
        path = LearningPath(
            course_id=course.id,
            user_id=user.id,
            title=f"{course.title}个性化路径",
            version=version,
            status="active",
            source=source,
            meta_json={"generated_by": source, "concept_count": len(concepts), "profile_context_snapshot": profile_context[:1000]},
        )
        self.db.add(path)
        self.db.flush()

        concept_to_node_code = {concept.code: self._node_code(concept) for concept in concepts}
        current_assigned = False
        order_index = 1
        for concept in concepts:
            mastery = self._ensure_mastery(course, user, concept, mastery_map)
            prereq_codes = self._prerequisite_codes(concept)
            unlocked = all((mastery_map.get(item).mastery if mastery_map.get(item) else 0) >= 70 for item in prereq_codes)
            current = not current_assigned and mastery.mastery < 80 and unlocked
            status = self._status_from_mastery(mastery.mastery, unlocked, current)
            if current:
                current_assigned = True
            mastery.status = status
            node_code = concept_to_node_code[concept.code]
            self.db.add(
                PathNode(
                    learning_path_id=path.id,
                    course_id=course.id,
                    concept_id=concept.id,
                    code=node_code,
                    title=concept.title,
                    status=status,
                    mastery=mastery.mastery,
                    is_remedial=False,
                    order_index=order_index,
                    prerequisites_json=[concept_to_node_code[item] for item in prereq_codes if item in concept_to_node_code],
                    recommendation_json={
                        "next_action": "开始学习" if status == "learning" else "查看详情",
                        "difficulty": concept.difficulty,
                        "sequence_index": order_index,
                        "is_remediation": False,
                        "remediate_for_concept_id": None,
                        "estimated_minutes": 95 if concept.difficulty == "advanced" else 70 if concept.difficulty in {"medium", "intermediate"} else 45,
                        "reason": "Inserted from course knowledge graph; status is recalculated from prerequisites, latest mastery and profile context.",
                        "profile_context_summary": profile_context[:240],
                        "mastery_snapshot": mastery.mastery,
                        "closure_writes": ["concept_mastery", "path_node", "learning_event"],
                    },
                )
            )
            order_index += 1
            if self._needs_remediation(mastery):
                self.db.add(
                    PathNode(
                        learning_path_id=path.id,
                        course_id=course.id,
                        concept_id=concept.id,
                        code=f"{node_code}_remedial",
                        title=f"{concept.title}补救训练",
                        status="needs_remedial",
                        mastery=mastery.mastery,
                        is_remedial=True,
                        order_index=order_index,
                        prerequisites_json=[concept_to_node_code[item] for item in prereq_codes if item in concept_to_node_code],
                        recommendation_json={
                            "next_action": "完成补救训练",
                            "difficulty": "basic",
                            "remediate_for_concept": concept.code,
                            "sequence_index": order_index,
                            "is_remediation": True,
                            "remediate_for_concept_id": concept.code,
                            "estimated_minutes": 35,
                            "reason": "Inserted because latest assessment, mastery evidence or profile weak points indicate remediation is required.",
                            "profile_context_summary": profile_context[:240],
                            "mastery_snapshot": mastery.mastery,
                            "closure_writes": ["concept_mastery", "path_node", "learning_event"],
                        },
                    )
                )
                order_index += 1

        LearningEventRecorder(self.db).record(
            course_id=course.id,
            user_id=user.id,
            concept_id=None,
            event_type="path_regenerated",
            source_type="learning_path",
            source_id=str(path.id),
            evidence={
                "version": path.version,
                "source": source,
                "concept_count": len(concepts),
                "node_count": max(0, order_index - 1),
                "remedial_count": max(0, order_index - 1 - len(concepts)),
                "adjustment_reason": "course graph, profile evidence and concept mastery recalculated",
            },
        )
        self.db.commit()
        self.db.refresh(path)
        return path

    def get_path_nodes(self, course_slug: str, user_external_id: str) -> list[dict]:
        """获取用户在课程中的学习路径节点列表。

        参数:
            course_slug: 课程业务标识。
            user_external_id: 用户外部标识。

        返回值:
            前端可直接消费的路径节点字典列表；课程或用户不存在时返回空列表。

        副作用/失败模式:
            可能在路径缺失、过期或为空课程归档时写入数据库；数据库异常会向上抛出。
        """
        course = self._course(course_slug)
        user = self._user(user_external_id)
        if not course or not user:
            return []
        concepts = self._concepts(course)
        path = self._active_path(course, user)
        if not concepts:
            if path:
                path.status = "archived"
                self.db.commit()
            return []
        if self._path_needs_rebuild(path, concepts):
            path = self._create_path_from_concepts(course, user, source="PathPlanningAgent")
        if not path:
            return []
        rows = self.db.execute(
            select(PathNode, CourseConcept, ConceptMastery)
            .outerjoin(CourseConcept, CourseConcept.id == PathNode.concept_id)
            .outerjoin(
                ConceptMastery,
                and_(
                    ConceptMastery.course_id == course.id,
                    ConceptMastery.user_id == user.id,
                    ConceptMastery.concept_id == PathNode.concept_id,
                ),
            )
            .where(PathNode.learning_path_id == path.id)
            .order_by(PathNode.order_index)
        ).all()
        return [
            {
                "id": node.code,
                "course_id": course.slug,
                "title": node.title,
                "concept_id": concept.code if concept else None,
                "concept_name": concept.title if concept else node.title,
                "status": node.status,
                "mastery": node.mastery,
                "mastery_score": node.mastery,
                "is_remedial": node.is_remedial,
                "isRemedial": node.is_remedial,
                "is_remediation": node.is_remedial,
                "sequence_index": node.order_index,
                "remediate_for_concept_id": (node.recommendation_json or {}).get("remediate_for_concept_id"),
                "prerequisites": node.prerequisites_json or [],
                "prerequisite_edges": [
                    {"id": prerequisite, "dependency_type": "strong"}
                    for prerequisite in (node.prerequisites_json or [])
                ],
                "recommendation": node.recommendation_json or {},
                "evidence": mastery.evidence_json if mastery else [],
                "updated_at": node.updated_at.isoformat() if node.updated_at else None,
            }
            for node, concept, mastery in rows
        ]

    def generate_path(self, course_slug: str, user_external_id: str) -> dict:
        """强制为用户重新生成课程学习路径。

        参数:
            course_slug: 课程业务标识。
            user_external_id: 用户外部标识。

        返回值:
            包含生成状态和路径节点列表的字典；课程或用户不存在时返回 not_found 状态。

        副作用/失败模式:
            会归档旧路径、创建新路径并提交事务；数据库异常会向上抛出。
        """
        course = self._course(course_slug)
        user = self._user(user_external_id)
        if not course or not user:
            return {"course_id": course_slug, "status": "not_found", "items": []}
        self._create_path_from_concepts(course, user, source="PathPlanningAgent")
        return {"course_id": course.slug, "status": "generated", "items": self.get_path_nodes(course.slug, user.external_id)}

    def update_node_status(self, node_code: str, status: str, user_external_id: str) -> dict | None:
        """更新当前用户激活学习路径中的节点状态。

        参数:
            node_code: 路径节点编码。
            status: 目标节点状态。
            user_external_id: 用户外部标识。

        返回值:
            更新成功时返回节点编码和状态；用户或节点不存在时返回 None。

        副作用/失败模式:
            会更新路径节点，必要时同步知识点掌握度并写入学习事件；数据库异常会向上抛出。
        """
        user = self._user(user_external_id)
        if not user:
            return None
        node = self.db.execute(
            select(PathNode)
            .join(LearningPath, LearningPath.id == PathNode.learning_path_id)
            .where(
                PathNode.code == node_code,
                LearningPath.status == "active",
                LearningPath.user_id == user.id,
            )
            .order_by(LearningPath.version.desc(), PathNode.updated_at.desc())
        ).scalars().first()
        if not node:
            return None
        path = self.db.get(LearningPath, node.learning_path_id)
        previous_status = node.status
        previous_mastery = node.mastery
        event_time = datetime.now(timezone.utc).isoformat()
        node.status = status
        if status == "mastered":
            node.mastery = max(node.mastery, 85)
            if node.concept_id:
                where_clauses = [
                    ConceptMastery.course_id == node.course_id,
                    ConceptMastery.concept_id == node.concept_id,
                ]
                if path:
                    where_clauses.append(ConceptMastery.user_id == path.user_id)
                mastery = self.db.execute(
                    select(ConceptMastery).where(*where_clauses)
                ).scalars().first()
                if mastery:
                    mastery.mastery = max(mastery.mastery, node.mastery)
                    mastery.status = "mastered"
                    mastery.evidence_json = (mastery.evidence_json or []) + [
                        {"source": "path_node", "node_id": node.code, "status": status, "mastery": mastery.mastery, "old_mastery": previous_mastery, "new_mastery": mastery.mastery, "created_at": event_time}
                    ]
        LearningEventRecorder(self.db).record(
            course_id=node.course_id,
            user_id=path.user_id if path else None,
            concept_id=node.concept_id,
            event_type="path_node_status_updated",
            source_type="path_node",
            source_id=node.code,
            evidence={
                "previous_status": previous_status,
                "new_status": status,
                "old_mastery": previous_mastery,
                "mastery": node.mastery,
                "mastery_delta": node.mastery - previous_mastery,
                "created_at": event_time,
                "is_remedial": node.is_remedial,
                "writes": ["path_node", "concept_mastery" if status == "mastered" else "learning_event"],
            },
        )
        self.db.commit()
        return {"node_id": node.code, "status": node.status, "mastery_score": node.mastery}

    def get_path_node_mastery(self, node_code: str, user_external_id: str) -> dict | None:
        """获取当前用户激活路径中单个节点的掌握度快照。

        参数:
            node_code: 路径节点业务编码。
            user_external_id: 用户外部标识。

        返回值:
            找到时返回节点掌握度快照；用户或节点不存在时返回 None。

        副作用/失败模式:
            仅读取数据库，不修改路径状态；数据库异常会向上抛出。
        """
        user = self._user(user_external_id)
        if not user:
            return None
        row = self.db.execute(
            select(PathNode, LearningPath, Course, CourseConcept, ConceptMastery)
            .join(LearningPath, LearningPath.id == PathNode.learning_path_id)
            .join(Course, Course.id == PathNode.course_id)
            .outerjoin(CourseConcept, CourseConcept.id == PathNode.concept_id)
            .outerjoin(
                ConceptMastery,
                and_(
                    ConceptMastery.course_id == PathNode.course_id,
                    ConceptMastery.user_id == user.id,
                    ConceptMastery.concept_id == PathNode.concept_id,
                ),
            )
            .where(
                PathNode.code == node_code,
                LearningPath.status == "active",
                LearningPath.user_id == user.id,
            )
            .order_by(LearningPath.version.desc(), PathNode.updated_at.desc())
        ).first()
        if not row:
            return None

        node, _path, course, concept, mastery = row
        mastery_value = int(node.mastery or 0)
        return {
            "node_id": node.code,
            "course_id": course.slug,
            "concept_id": concept.code if concept else None,
            "title": node.title,
            "status": node.status,
            "mastery": mastery_value,
            "mastery_score": mastery_value,
            "is_remedial": node.is_remedial,
            "evidence": mastery.evidence_json if mastery else [],
            "updated_at": node.updated_at.isoformat() if node.updated_at else None,
        }

    @staticmethod
    def _clamp_percent(value: int | float | None) -> int:
        """将数值限制在百分比范围内。

        参数:
            value: 待转换的数值，允许为空。

        返回值:
            0 到 100 之间的整数。

        副作用/失败模式:
            无外部副作用；无法转换为数值的输入会抛出类型或值错误。
        """
        return max(0, min(100, int(round(value or 0))))

    @staticmethod
    def _event_mastery_delta(evidence: dict) -> int:
        """从学习事件证据中提取掌握度变化量。

        参数:
            evidence: 学习事件记录中的证据字典。

        返回值:
            掌握度变化整数；缺少相关字段时返回 0。

        副作用/失败模式:
            无外部副作用；字段值无法转换为整数时会抛出异常。
        """
        if "mastery_delta" in evidence:
            return int(evidence.get("mastery_delta") or 0)
        if "new_mastery" in evidence and "old_mastery" in evidence:
            return int(evidence.get("new_mastery") or 0) - int(evidence.get("old_mastery") or 0)
        if "mastery" in evidence and "old_mastery" in evidence:
            return int(evidence.get("mastery") or 0) - int(evidence.get("old_mastery") or 0)
        return 0

    def _mastery_delta_since(self, course: Course, user: User, since: datetime) -> int:
        """计算指定时间之后的加权掌握度变化。

        参数:
            course: 目标课程。
            user: 目标用户。
            since: 统计起始时间。

        返回值:
            按知识点难度加权后的掌握度变化整数。

        副作用/失败模式:
            会读取学习事件和知识点数据；数据库异常或证据格式异常会向上抛出。
        """
        event_rows = self.db.execute(
            select(LearningEvent.evidence_json, CourseConcept.difficulty)
            .outerjoin(CourseConcept, CourseConcept.id == LearningEvent.concept_id)
            .where(
                LearningEvent.course_id == course.id,
                LearningEvent.user_id == user.id,
                LearningEvent.created_at >= since,
                LearningEvent.event_type.in_(("assessment_completed", "path_node_status_updated")),
            )
        ).all()
        if not event_rows:
            return 0

        course_weights = self.db.execute(
            select(CourseConcept.difficulty).where(CourseConcept.course_id == course.id, CourseConcept.status == "published")
        ).scalars().all()
        weight_total = sum(DIFFICULTY_WEIGHT.get(difficulty, 1.0) for difficulty in course_weights)
        weighted_delta = sum(
            self._event_mastery_delta(evidence or {}) * DIFFICULTY_WEIGHT.get(difficulty, 1.0)
            for evidence, difficulty in event_rows
        )
        return int(round(weighted_delta / weight_total)) if weight_total else int(round(weighted_delta))

    def _profile_path_signals(self, course: Course, user: User, fallback_overall: int) -> tuple[int | None, int | None]:
        """读取学习画像中与路径展示相关的辅助指标。

        参数:
            course: 目标课程。
            user: 目标用户。
            fallback_overall: 缺少画像维度分数时使用的总体掌握度。

        返回值:
            同伴百分位和路径置信度；画像不存在时两者均为 None。

        副作用/失败模式:
            会读取画像和维度数据；数据库异常会向上抛出。
        """
        profile = self.db.execute(
            select(CourseProfile).where(CourseProfile.course_id == course.id, CourseProfile.user_id == user.id)
        ).scalar_one_or_none()
        if not profile:
            return None, None

        knowledge_score = self.db.execute(
            select(ProfileDimension.score)
            .where(ProfileDimension.profile_id == profile.id, ProfileDimension.dimension_key.in_(("knowledge_base", "knowledge_mastery")))
            .order_by(ProfileDimension.dimension_key)
        ).scalars().first()
        peer_percentile = self._clamp_percent(knowledge_score if knowledge_score is not None else fallback_overall)
        path_confidence = self._clamp_percent((profile.confidence or 0) * 100)
        return peer_percentile, path_confidence

    def get_mastery(self, course_slug: str, user_external_id: str) -> dict:
        """获取用户在课程中的总体和分维度掌握度。

        参数:
            course_slug: 课程业务标识。
            user_external_id: 用户外部标识。

        返回值:
            包含总体掌握度、知识点维度、近一天变化和画像信号的字典。

        副作用/失败模式:
            会读取数据库；课程或用户不存在时返回空指标，数据库异常会向上抛出。
        """
        course = self._course(course_slug)
        user = self._user(user_external_id)
        if not course or not user:
            return {"course_id": course_slug, "overall": 0, "dimensions": {}, "overall_delta": None, "peer_percentile": None, "path_confidence": None}
        rows = self.db.execute(
            select(CourseConcept.title, ConceptMastery.mastery)
            .join(ConceptMastery, ConceptMastery.concept_id == CourseConcept.id)
            .where(ConceptMastery.course_id == course.id, ConceptMastery.user_id == user.id)
            .order_by(CourseConcept.recommended_order)
        ).all()
        dimensions = {title: mastery for title, mastery in rows}
        weight_rows = self.db.execute(
            select(CourseConcept.difficulty, ConceptMastery.mastery)
            .join(ConceptMastery, ConceptMastery.concept_id == CourseConcept.id)
            .where(ConceptMastery.course_id == course.id, ConceptMastery.user_id == user.id)
        ).all()
        weighted_sum = sum(mastery * DIFFICULTY_WEIGHT.get(difficulty, 1.0) for difficulty, mastery in weight_rows)
        weight_total = sum(DIFFICULTY_WEIGHT.get(difficulty, 1.0) for difficulty, _mastery in weight_rows)
        overall = int(round(weighted_sum / weight_total)) if weight_total else 0
        since = datetime.now(timezone.utc) - timedelta(days=1)
        overall_delta = self._mastery_delta_since(course, user, since)
        peer_percentile, path_confidence = self._profile_path_signals(course, user, overall)
        return {
            "course_id": course_slug,
            "overall": overall,
            "dimensions": dimensions,
            "overall_delta": overall_delta,
            "peer_percentile": peer_percentile,
            "path_confidence": path_confidence,
        }

    def get_profile_summary(self, course_slug: str, user_external_id: str) -> dict:
        """获取课程学习画像摘要。

        参数:
            course_slug: 课程业务标识。
            user_external_id: 用户外部标识。

        返回值:
            学习画像仓储返回的课程画像摘要字典。

        副作用/失败模式:
            会读取画像相关数据；下游仓储异常会向上抛出。
        """
        from app.services.profile.repository import LearningProfileRepository

        return LearningProfileRepository(self.db).get_course_profile_summary(course_slug, user_external_id)
