"""写入资源审核演示队列数据

Revision ID: 0004_seed_resource_review_demo
Revises: 0003_document_vector_ingestion
Create Date: 2026-05-25 18:15:00
"""
from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0004_seed_resource_review_demo"
down_revision = "0003_document_vector_ingestion"
branch_labels = None
depends_on = None


def dumps(value: dict | list) -> str:
    return json.dumps(value, ensure_ascii=False)


IDS = {
    "course_dl": "77a4dad0-af04-5fe2-813d-724a4ffb56ea",
    "user_zhang": "c030ebbb-d09d-5b5f-b720-7a60950abd8e",
    "user_admin": "4221d673-7425-5a1a-ac26-1feaa3689d54",
    "concept_bp": "07725b03-d76b-5dfd-8dd1-1cc20c6dc9c2",
    "concept_reg": "92ecc8d4-3b39-516d-b765-0039764d991b",
    "concept_attention": "9b885add-e75d-5811-921f-9dd9fb2b4cdc",
    "node_002": "c8a69d56-a2cd-5dee-9aa5-f1748c638a7e",
    "node_003": "f799af4e-4c65-590d-ab3b-f1103002833f",
    "node_006": "6aad4fbf-0448-5a66-8dd7-f2aba45c014c",
    "doc_ch8": "8a9f7093-6537-5ec7-a3db-928bfa2a2e6a",
    "chunk_bp": "a6b77918-b80c-5628-a96a-38f9698fe676",
    "chunk_reg": "8464b790-af2d-5140-b91c-609c4ab4d16f",
    "review_res_bp": "40c4e2fa-5efb-58ef-b2e0-d1f5ce63a030",
    "review_res_reg": "8e3aab8c-b499-50c2-8869-84dcde2aaeda",
    "review_res_attn": "720efaa9-2a31-555e-8d2f-d9c9da195ea5",
    "review_comm_bp": "74429472-ef19-583c-9fed-c717f28f0687",
    "review_comm_reg": "a692c538-c1a6-53ef-8a3f-bf0ea2d3994c",
    "review_comm_attn": "edb7fa36-e4da-5e93-ae41-21b58417a699",
    "review_ver_bp": "2bc011a7-8415-5d2e-973e-9d891fe7d65e",
    "review_ver_reg": "ea24c138-0a7c-5607-8130-816c29809941",
    "review_ver_attn": "fa1760ce-8feb-5368-ac97-5dbce0124ed1",
}


def upgrade() -> None:
    conn = op.get_bind()
    resources = [
        {
            "id": IDS["review_res_bp"],
            "concept_id": IDS["concept_bp"],
            "path_node_id": IDS["node_002"],
            "code": "review_bp_lecture_001",
            "title": "反向传播链式法则速记讲义",
            "resource_type": "lecture",
            "difficulty": "basic",
            "status": "pending_review",
            "summary": "学生提交的反向传播基础讲义，适合基础薄弱学习者，但需要管理员确认引用完整性。",
            "quality_score": 82,
            "citations": [{"source_id": IDS["doc_ch8"], "source_title": "深度学习讲义第 8 章.pdf", "page_no": 86, "chunk_id": IDS["chunk_bp"], "similarity": 0.79, "snippet": "反向传播算法利用链式法则从输出层向输入层逐层传播误差信号。"}],
            "quality": {"grade": "B+", "citation_complete": True, "summary": "引用基本完整，建议补充推导步骤。"},
            "community_id": IDS["review_comm_bp"],
            "review_status": "pending_review",
            "review": {"submitted_reason": "希望进入资源大厅，帮助同学快速复习反向传播。"},
            "version_id": IDS["review_ver_bp"],
            "content": "# 反向传播链式法则速记讲义\n\n## 适用对象\n基础薄弱，正在学习神经网络训练流程的同学。\n\n## 核心内容\n反向传播把整体损失对参数的梯度拆成多个局部梯度相乘。\n\n## 易错点\n- 只记公式，不理解计算图。\n- 混淆前向传播的值和反向传播的梯度。\n\n## 引用依据\n- 深度学习讲义第 8 章：反向传播使用链式法则传播误差信号。",
        },
        {
            "id": IDS["review_res_reg"],
            "concept_id": IDS["concept_reg"],
            "path_node_id": IDS["node_003"],
            "code": "review_reg_quiz_001",
            "title": "Dropout 与 L2 正则化辨析题",
            "resource_type": "quiz",
            "difficulty": "medium",
            "status": "changes_requested",
            "summary": "一组正则化辨析题，题目质量较好，但答案解析需要补充课程来源。",
            "quality_score": 74,
            "citations": [{"source_id": IDS["doc_ch8"], "source_title": "深度学习讲义第 8 章.pdf", "page_no": 92, "chunk_id": IDS["chunk_reg"], "similarity": 0.76, "snippet": "正则化通过约束模型复杂度、随机失活或数据增强等方式减轻过拟合。"}],
            "quality": {"grade": "B", "citation_complete": True, "summary": "需补充答案解析和页码说明。"},
            "community_id": IDS["review_comm_reg"],
            "review_status": "changes_requested",
            "review": {"comment": "请补充每道题的错因归纳，并把答案和引用材料对应起来。", "reviewed_at": "2026-05-25T18:05:00", "quality_score": 74, "quality_grade": "B"},
            "version_id": IDS["review_ver_reg"],
            "content": "# Dropout 与 L2 正则化辨析题\n\n1. Dropout 的主要作用是什么？\n2. L2 正则化和 Weight Decay 是否完全等价？请说明。\n3. 当训练集准确率高、验证集准确率低时，应优先考虑哪些正则化策略？\n\n## 待补充\n每题的答案解析和错因归纳。",
        },
        {
            "id": IDS["review_res_attn"],
            "concept_id": IDS["concept_attention"],
            "path_node_id": IDS["node_006"],
            "code": "review_attention_mindmap_001",
            "title": "Transformer 注意力机制思维导图",
            "resource_type": "mindmap",
            "difficulty": "advanced",
            "status": "pending_review",
            "summary": "围绕 Q/K/V、缩放点积注意力和多头注意力组织的 Markmap 大纲，暂缺课程引用。",
            "quality_score": 68,
            "citations": [],
            "quality": {"grade": "C", "citation_complete": False, "summary": "暂缺课程引用，需管理员确认或退回。"},
            "community_id": IDS["review_comm_attn"],
            "review_status": "pending_review",
            "review": {"submitted_reason": "想作为 Transformer 章节导学图。", "citation_complete": False},
            "version_id": IDS["review_ver_attn"],
            "content": "# Transformer 注意力机制\n\n## Q/K/V\n## Scaled Dot-Product Attention\n## Multi-Head Attention\n## 位置编码\n## 常见误区\n- 把注意力权重理解成固定规则。\n- 忽视维度变化。\n\n> 当前版本需要补充课程资料引用。",
        },
    ]
    for item in resources:
        conn.execute(
            sa.text(
                """
                INSERT INTO resources (id, course_id, concept_id, path_node_id, code, title, resource_type, difficulty, status, summary, generation_basis_json, citations_json, quality_check_result, safety_status, quality_score, view_count, copied_count, created_by_user_id)
                VALUES (:id, :course_id, :concept_id, :path_node_id, :code, :title, :resource_type, :difficulty, :status, :summary, CAST(:basis AS JSONB), CAST(:citations AS JSONB), CAST(:quality AS JSONB), 'passed', :quality_score, 0, 0, :user_id)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": item["id"],
                "course_id": IDS["course_dl"],
                "concept_id": item["concept_id"],
                "path_node_id": item["path_node_id"],
                "code": item["code"],
                "title": item["title"],
                "resource_type": item["resource_type"],
                "difficulty": item["difficulty"],
                "status": item["status"],
                "summary": item["summary"],
                "basis": dumps({"source": "student_submission", "demo": True}),
                "citations": dumps(item["citations"]),
                "quality": dumps(item["quality"]),
                "quality_score": item["quality_score"],
                "user_id": IDS["user_zhang"],
            },
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO resource_versions (id, resource_id, version, content, meta_json)
                VALUES (:id, :resource_id, 1, :content, CAST(:meta AS JSONB))
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": item["version_id"], "resource_id": item["id"], "content": item["content"], "meta": dumps({"source": "review_demo_seed"})},
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO community_resources (id, resource_id, course_id, submitted_by_user_id, review_status, review_result_json, reviewed_by_user_id)
                VALUES (:id, :resource_id, :course_id, :submitted_by, :review_status, CAST(:review AS JSONB), :reviewed_by)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": item["community_id"],
                "resource_id": item["id"],
                "course_id": IDS["course_dl"],
                "submitted_by": IDS["user_zhang"],
                "review_status": item["review_status"],
                "review": dumps(item["review"]),
                "reviewed_by": IDS["user_admin"] if item["review_status"] == "changes_requested" else None,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    delete_groups = [
        ("community_resources", [IDS["review_comm_bp"], IDS["review_comm_reg"], IDS["review_comm_attn"]]),
        ("resource_versions", [IDS["review_ver_bp"], IDS["review_ver_reg"], IDS["review_ver_attn"]]),
        ("resources", [IDS["review_res_bp"], IDS["review_res_reg"], IDS["review_res_attn"]]),
    ]
    for table, values in delete_groups:
        for value in values:
            conn.execute(sa.text(f"DELETE FROM {table} WHERE id = :id"), {"id": value})