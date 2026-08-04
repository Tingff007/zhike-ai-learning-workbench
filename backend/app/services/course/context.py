from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.services.course.repository import CourseRepository


@dataclass
class CourseContext:
    """课程相关 AI 编排上下文。

    参数:
        course_id: 课程业务标识，通用学习场景可为空字符串。
        course_title: 展示或提示词中使用的课程标题。
        concept_id: 可选的知识点标识。
        path_node_id: 可选的学习路径节点标识。
        conversation_id: 可选的会话标识。
        profile_scope: 学习画像的读取范围。
        resource_scope: 学习资源的检索范围。
        model_config_id: 模型配置标识。

    返回值:
        数据类实例，用于在课程、画像、资源和模型调用之间传递上下文。

    副作用/失败模式:
        创建实例本身无外部副作用；字段值由调用方负责传入合法业务标识。
    """

    course_id: str
    course_title: str
    concept_id: str | None = None
    path_node_id: str | None = None
    conversation_id: str | None = None
    profile_scope: str = "course"
    resource_scope: str = "course"
    model_config_id: str = "platform_default"


class CourseContextService:
    """课程上下文构建服务。

    参数:
        无构造参数。

    返回值:
        服务实例本身不直接返回业务数据，具体上下文由 build 方法返回。

    副作用/失败模式:
        构建课程上下文时会读取课程仓储；数据库或下游仓储异常会向上抛出。
    """

    def build(
        self,
        db: Session,
        course_id: str | None = None,
        concept_id: str | None = None,
        path_node_id: str | None = None,
        conversation_id: str | None = None,
    ) -> CourseContext:
        """构建课程或通用学习上下文。

        参数:
            db: 用于读取课程信息的数据库会话。
            course_id: 可选课程业务标识；为空时构建通用学习上下文。
            concept_id: 可选知识点标识。
            path_node_id: 可选学习路径节点标识。
            conversation_id: 可选会话标识。

        返回值:
            课程上下文数据类实例。

        副作用/失败模式:
            传入课程标识时会读取课程仓储；课程不存在时返回未知课程标题，数据库异常会向上抛出。
        """
        if not course_id:
            return CourseContext(
                course_id="",
                course_title="通用学习",
                concept_id=None,
                path_node_id=None,
                conversation_id=conversation_id,
                profile_scope="global",
                resource_scope="general",
                model_config_id="platform_default",
            )

        course = CourseRepository(db).get_course(course_id)
        return CourseContext(
            course_id=course_id,
            course_title=course["title"] if course else "未知课程",
            concept_id=concept_id,
            path_node_id=path_node_id,
            conversation_id=conversation_id,
            profile_scope="course",
            resource_scope="course",
        )
