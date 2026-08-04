from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any


ResourceWorkflowState = dict[str, Any]
ResourceWorkflowNode = Callable[[ResourceWorkflowState], ResourceWorkflowState | Awaitable[ResourceWorkflowState]]


async def _resolve_node_result(result: ResourceWorkflowState | Awaitable[ResourceWorkflowState]) -> ResourceWorkflowState:
    """兼容同步节点和异步节点，统一返回工作流状态。"""

    if inspect.isawaitable(result):
        return await result
    return result


async def run_sequential_resource_generation_workflow(
    state: ResourceWorkflowState,
    *,
    retrieve_node: ResourceWorkflowNode,
    profile_node: ResourceWorkflowNode,
    generate_node: ResourceWorkflowNode,
    cite_check_node: ResourceWorkflowNode,
    safety_node: ResourceWorkflowNode,
    save_node: ResourceWorkflowNode,
) -> ResourceWorkflowState:
    """在 LangGraph 不可用时按固定节点顺序执行资源生成工作流。"""

    state = {**state, **await _resolve_node_result(retrieve_node(state))}
    state = {**state, **await _resolve_node_result(profile_node(state))}
    state = {**state, **await _resolve_node_result(generate_node(state))}
    state = {**state, **await _resolve_node_result(cite_check_node(state))}
    state = {**state, **await _resolve_node_result(safety_node(state))}
    state = {**state, **await _resolve_node_result(save_node(state))}
    return state


async def run_resource_generation_workflow(
    state: ResourceWorkflowState,
    *,
    resource_type: str,
    has_course: bool,
    state_schema: Any,
    state_graph: Any,
    end_marker: Any,
    run_diagram_pack_generation_task: ResourceWorkflowNode,
    run_general_generation_task: ResourceWorkflowNode,
    run_generation_without_graph: ResourceWorkflowNode,
    retrieve_node: ResourceWorkflowNode,
    profile_node: ResourceWorkflowNode,
    generate_node: ResourceWorkflowNode,
    cite_check_node: ResourceWorkflowNode,
    safety_node: ResourceWorkflowNode,
    save_node: ResourceWorkflowNode,
) -> ResourceWorkflowState:
    """根据资源类型、课程范围和 LangGraph 可用性执行资源生成工作流。

    参数:
        state: 当前任务状态载荷。
        resource_type: 资源类型，用于识别教学图解包等特殊流程。
        has_course: 是否绑定课程；通用资源不进入课程 RAG 工作流。
        state_schema: LangGraph 使用的状态结构声明。
        state_graph: 可选的 LangGraph StateGraph 类；为空时使用顺序执行器。
        end_marker: LangGraph 结束节点标记。
        run_diagram_pack_generation_task: 教学图解包特殊流程节点。
        run_general_generation_task: 通用资源生成流程节点。
        run_generation_without_graph: 兼容仓储旧顺序执行入口。
        retrieve_node: 课程资料检索节点。
        profile_node: 学习画像节点。
        generate_node: 正文生成节点。
        cite_check_node: 引用核验节点。
        safety_node: 安全审查节点。
        save_node: 资源保存节点。

    返回:
        执行完成后的资源生成状态。
    """

    if resource_type == "diagram_pack":
        return await _resolve_node_result(run_diagram_pack_generation_task(state))
    if not has_course:
        return await _resolve_node_result(run_general_generation_task(state))
    if state_graph is None:
        return await _resolve_node_result(run_generation_without_graph(state))

    graph = state_graph(state_schema)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("profile", profile_node)
    graph.add_node("generate", generate_node)
    graph.add_node("cite_check", cite_check_node)
    graph.add_node("safety", safety_node)
    graph.add_node("save", save_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "profile")
    graph.add_edge("profile", "generate")
    graph.add_edge("generate", "cite_check")
    graph.add_edge("cite_check", "safety")
    graph.add_edge("safety", "save")
    graph.add_edge("save", end_marker)
    return await graph.compile().ainvoke(state)
