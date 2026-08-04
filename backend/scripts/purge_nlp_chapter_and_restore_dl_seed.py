"""移除误导入的 NLP 第 9 章大纲数据，并恢复 deep_learning_001 种子结构。

用法（在 backend/ 目录执行）:
    python scripts/purge_nlp_chapter_and_restore_dl_seed.py
    python scripts/purge_nlp_chapter_and_restore_dl_seed.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import delete, or_, select, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.models import (
    ConceptMastery,
    ConceptPrerequisite,
    Course,
    CourseConcept,
    CourseSection,
    LearningPath,
    PathNode,
)

COURSE_SLUG = "deep_learning_001"

# 以下 ID 与 alembic/versions/0002_seed_deep_learning_demo_data.py 中的确定性种子数据保持一致。
IDS = {
    "course_dl": "77a4dad0-af04-5fe2-813d-724a4ffb56ea",
    "user_zhang": "c030ebbb-d09d-5b5f-b720-7a60950abd8e",
    "section_dl_1": "7443155d-0279-5c83-bc8b-a76f24336d80",
    "section_dl_2": "627daa1c-5640-558a-adfd-f4dbbc70158c",
    "section_dl_3": "dab8744f-7481-5876-9516-0dfa7a26c754",
    "section_dl_4": "497e5428-3fc3-5dff-aff7-2a5362ef5b16",
    "section_dl_5": "fc6d9115-3ee3-50e0-860e-08d788e2fbd9",
    "section_dl_6": "920ba059-7e98-58e6-981b-2a43dd5f9bfc",
    "section_dl_7": "bff325ef-736f-539a-a49e-3aac12f40d23",
    "section_dl_8": "b5580cd8-dfbb-5970-a854-f81126128059",
    "concept_nn": "55cdf13a-0a58-50d0-bee0-3e2286bb2549",
    "concept_bp": "07725b03-d76b-5dfd-8dd1-1cc20c6dc9c2",
    "concept_reg": "92ecc8d4-3b39-516d-b765-0039764d991b",
    "concept_cnn": "9bd625d6-9fbb-5c51-a836-6df10806b34c",
    "concept_rnn": "e3ce6cfc-0770-5c92-8100-ddc861c7a1b7",
    "concept_attention": "9b885add-e75d-5811-921f-9dd9fb2b4cdc",
    "concept_autoencoder": "03756fe2-f055-51b3-8b15-0567d0b9d720",
    "concept_project": "3da78808-2868-5ab9-b6f4-d4ad6222e252",
    "path_dl_user_zhang": "43598f87-6a41-5131-8ecd-0c8a89b7a59f",
    "node_001": "e7a023bb-0c38-5d6d-ac6a-94484993179e",
    "node_002": "c8a69d56-a2cd-5dee-9aa5-f1748c638a7e",
    "node_002_r": "a038beb1-e781-5341-a6b8-490875cbcf61",
    "node_003": "f799af4e-4c65-590d-ab3b-f1103002833f",
    "node_004": "d143bac7-4f0f-5436-bacc-6e9e0c135c5a",
    "node_005": "1af770e6-2191-596f-844c-97a29a6d1ad5",
    "node_006": "6aad4fbf-0448-5a66-8dd7-f2aba45c014c",
    "node_007": "d95d964a-5dca-5da4-8306-029efc90f446",
    "node_008": "cc23cf92-7a03-54a2-9f23-8b6230926df4",
}

NLP_SECTION_CODES = {"ch_9"}
NLP_CONCEPT_CODES = {"h_9_13"}


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def purge_and_restore(*, dry_run: bool) -> dict:
    db = SessionLocal()
    stats: dict[str, int] = {}
    try:
        course = db.execute(select(Course).where(Course.slug == COURSE_SLUG)).scalar_one_or_none()
        if not course:
            raise SystemExit(f"Course not found: {COURSE_SLUG}")

        course_id = course.id
        nlp_sections = db.execute(
            select(CourseSection).where(
                CourseSection.course_id == course_id,
                or_(
                    CourseSection.code.in_(NLP_SECTION_CODES),
                    CourseSection.title.ilike("%自然语言%"),
                    CourseSection.title.ilike("%第9章%"),
                    CourseSection.title.ilike("%第九章%"),
                ),
            )
        ).scalars().all()
        nlp_section_ids = {row.id for row in nlp_sections}

        concept_filters = [
            CourseConcept.code.in_(NLP_CONCEPT_CODES),
            CourseConcept.title.ilike("%9.13%"),
            CourseConcept.title.ilike("%本章附录%"),
        ]
        if nlp_section_ids:
            concept_filters.append(CourseConcept.section_id.in_(nlp_section_ids))
        nlp_concepts = db.execute(
            select(CourseConcept).where(CourseConcept.course_id == course_id, or_(*concept_filters))
        ).scalars().all()
        nlp_concept_ids = {row.id for row in nlp_concepts}

        path_filters = [PathNode.code.like("node_h_%"), PathNode.title.ilike("9.%")]
        if nlp_concept_ids:
            path_filters.append(PathNode.concept_id.in_(nlp_concept_ids))
        import_path_nodes = db.execute(
            select(PathNode.id).where(PathNode.course_id == course_id, or_(*path_filters))
        ).scalars().all()
        stats["import_path_nodes"] = len(import_path_nodes)

        if dry_run:
            db.rollback()
            return {
                "dry_run": True,
                "nlp_sections": [row.code for row in nlp_sections],
                "nlp_concepts": [row.code for row in nlp_concepts],
                **stats,
            }

        if nlp_concept_ids:
            db.execute(delete(ConceptPrerequisite).where(ConceptPrerequisite.concept_id.in_(nlp_concept_ids)))
            db.execute(delete(ConceptPrerequisite).where(ConceptPrerequisite.prerequisite_id.in_(nlp_concept_ids)))
            db.execute(delete(ConceptMastery).where(ConceptMastery.concept_id.in_(nlp_concept_ids)))
            db.execute(delete(CourseConcept).where(CourseConcept.id.in_(nlp_concept_ids)))
            stats["nlp_concepts_deleted"] = len(nlp_concept_ids)

        if nlp_section_ids:
            db.execute(delete(CourseSection).where(CourseSection.id.in_(nlp_section_ids)))
            stats["nlp_sections_deleted"] = len(nlp_section_ids)

        # 清理该课程中由大纲导入流程污染出的学习路径节点。
        deleted_paths = db.execute(
            delete(PathNode).where(PathNode.course_id == course_id, PathNode.code.like("node_h_%"))
        )
        stats["path_nodes_deleted"] = deleted_paths.rowcount or 0

        # 删除重复自动生成的学习路径；存在标准种子路径时只保留该路径。
        db.execute(
            delete(LearningPath).where(
                LearningPath.course_id == course_id,
                LearningPath.id != IDS["path_dl_user_zhang"],
            )
        )

        _restore_seed_outline(db)
        _restore_seed_path(db)
        db.commit()
        return {"dry_run": False, **stats}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _restore_seed_outline(db) -> None:
    course_id = IDS["course_dl"]
    sections = [
        (IDS["section_dl_1"], "dl_ch_01", "第 1 章 神经网络基础", 1),
        (IDS["section_dl_2"], "dl_ch_02", "第 2 章 反向传播与优化", 2),
        (IDS["section_dl_3"], "dl_ch_03", "第 3 章 正则化与泛化", 3),
        (IDS["section_dl_4"], "dl_ch_04", "第 4 章 卷积神经网络", 4),
        (IDS["section_dl_5"], "dl_ch_05", "第 5 章 循环神经网络与序列建模", 5),
        (IDS["section_dl_6"], "dl_ch_06", "第 6 章 注意力机制与 Transformer", 6),
        (IDS["section_dl_7"], "dl_ch_07", "第 7 章 自编码器与生成模型", 7),
        (IDS["section_dl_8"], "dl_ch_08", "第 8 章 深度学习实验与项目实践", 8),
    ]
    for section_id, code, title, order_index in sections:
        db.execute(
            text(
                """
                INSERT INTO course_sections (id, course_id, code, title, description, order_index)
                VALUES (:id, :course_id, :code, :title, :description, :order_index)
                ON CONFLICT (id) DO UPDATE SET
                    code = EXCLUDED.code,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    order_index = EXCLUDED.order_index
                """
            ),
            {
                "id": section_id,
                "course_id": course_id,
                "code": code,
                "title": title,
                "description": "深度学习 MVP 示例课程章节",
                "order_index": order_index,
            },
        )

    concepts = [
        (IDS["concept_nn"], IDS["section_dl_1"], "nn_basic", "神经网络基础", "掌握感知机、多层感知机、激活函数与前向传播。", "basic", 1, []),
        (IDS["concept_bp"], IDS["section_dl_2"], "backpropagation", "反向传播与优化", "反向传播通过链式法则高效计算损失函数对网络参数的梯度，是训练神经网络的核心方法。", "medium", 2, ["nn_basic"]),
        (IDS["concept_reg"], IDS["section_dl_3"], "regularization", "正则化与泛化", "理解 L1/L2、Dropout、数据增强和泛化误差。", "medium", 3, ["backpropagation"]),
        (IDS["concept_cnn"], IDS["section_dl_4"], "cnn_convolution", "卷积神经网络", "理解卷积层、池化层、局部感受野、权重共享和经典 CNN 架构。", "medium", 4, ["regularization"]),
        (IDS["concept_rnn"], IDS["section_dl_5"], "rnn_transformer", "循环神经网络与序列建模", "理解 RNN、LSTM、GRU 和序列建模基本思想。", "advanced", 5, ["cnn_convolution"]),
        (IDS["concept_attention"], IDS["section_dl_6"], "transformer_attention", "注意力机制与 Transformer", "理解自注意力、位置编码、多头注意力和 Transformer 编码器结构。", "advanced", 6, ["rnn_transformer"]),
        (IDS["concept_autoencoder"], IDS["section_dl_7"], "autoencoder_generative", "自编码器与生成模型", "理解自编码器、VAE、GAN 和生成模型基本思想。", "advanced", 7, ["transformer_attention"]),
        (IDS["concept_project"], IDS["section_dl_8"], "deep_learning_project", "深度学习实验与项目实践", "围绕 PyTorch 实验、项目复现、调试和结果分析建立实践能力。", "advanced", 8, ["cnn_convolution", "transformer_attention"]),
    ]
    for concept in concepts:
        db.execute(
            text(
                """
                INSERT INTO course_concepts (id, course_id, section_id, code, title, definition, difficulty, recommended_order, prerequisites_json, status)
                VALUES (:id, :course_id, :section_id, :code, :title, :definition, :difficulty, :recommended_order, CAST(:prerequisites AS JSONB), 'published')
                ON CONFLICT (id) DO UPDATE SET
                    section_id = EXCLUDED.section_id,
                    code = EXCLUDED.code,
                    title = EXCLUDED.title,
                    definition = EXCLUDED.definition,
                    difficulty = EXCLUDED.difficulty,
                    recommended_order = EXCLUDED.recommended_order,
                    prerequisites_json = EXCLUDED.prerequisites_json,
                    status = 'published'
                """
            ),
            {
                "id": concept[0],
                "course_id": course_id,
                "section_id": concept[1],
                "code": concept[2],
                "title": concept[3],
                "definition": concept[4],
                "difficulty": concept[5],
                "recommended_order": concept[6],
                "prerequisites": dumps(concept[7]),
            },
        )


def _restore_seed_path(db) -> None:
    db.execute(
        text(
            """
            INSERT INTO learning_paths (id, course_id, user_id, title, version, status, source, meta_json)
            VALUES (:id, :course_id, :user_id, '深度学习个性化路径', 1, 'active', 'seed', CAST(:meta AS JSONB))
            ON CONFLICT (id) DO UPDATE SET status = 'active', source = 'seed'
            """
        ),
        {
            "id": IDS["path_dl_user_zhang"],
            "course_id": IDS["course_dl"],
            "user_id": IDS["user_zhang"],
            "meta": dumps({"overall_mastery": 64, "generated_by": "PathPlanningAgent"}),
        },
    )
    nodes = [
        (IDS["node_001"], "node_001", "神经网络基础", IDS["concept_nn"], "mastered", 92, False, 1, []),
        (IDS["node_002"], "node_002", "反向传播与优化", IDS["concept_bp"], "learning", 68, False, 2, ["node_001"]),
        (IDS["node_002_r"], "node_002_r", "链式求导与梯度理解", IDS["concept_bp"], "needs_remedial", 35, True, 3, ["node_001"]),
        (IDS["node_003"], "node_003", "正则化与泛化", IDS["concept_reg"], "review", 75, False, 4, ["node_002"]),
        (IDS["node_004"], "node_004", "卷积神经网络", IDS["concept_cnn"], "mastered", 88, False, 5, ["node_003"]),
        (IDS["node_005"], "node_005", "循环神经网络与序列建模", IDS["concept_rnn"], "not_started", 0, False, 6, ["node_004"]),
        (IDS["node_006"], "node_006", "注意力机制与 Transformer", IDS["concept_attention"], "not_started", 0, False, 7, ["node_005"]),
        (IDS["node_007"], "node_007", "自编码器与生成模型", IDS["concept_autoencoder"], "not_started", 0, False, 8, ["node_006"]),
        (IDS["node_008"], "node_008", "深度学习实验与项目实践", IDS["concept_project"], "not_started", 0, False, 9, ["node_004"]),
    ]
    for node in nodes:
        db.execute(
            text(
                """
                INSERT INTO path_nodes (id, learning_path_id, course_id, concept_id, code, title, status, mastery, is_remedial, order_index, prerequisites_json, recommendation_json)
                VALUES (:id, :path_id, :course_id, :concept_id, :code, :title, :status, :mastery, :is_remedial, :order_index, CAST(:prerequisites AS JSONB), CAST(:recommendation AS JSONB))
                ON CONFLICT (id) DO UPDATE SET
                    learning_path_id = EXCLUDED.learning_path_id,
                    concept_id = EXCLUDED.concept_id,
                    code = EXCLUDED.code,
                    title = EXCLUDED.title,
                    status = EXCLUDED.status,
                    mastery = EXCLUDED.mastery,
                    is_remedial = EXCLUDED.is_remedial,
                    order_index = EXCLUDED.order_index,
                    prerequisites_json = EXCLUDED.prerequisites_json,
                    recommendation_json = EXCLUDED.recommendation_json
                """
            ),
            {
                "id": node[0],
                "path_id": IDS["path_dl_user_zhang"],
                "course_id": IDS["course_dl"],
                "concept_id": node[3],
                "code": node[1],
                "title": node[2],
                "status": node[4],
                "mastery": node[5],
                "is_remedial": node[6],
                "order_index": node[7],
                "prerequisites": dumps(node[8]),
                "recommendation": dumps({"next_action": "去学习" if node[4] in ["learning", "needs_remedial"] else "查看详情"}),
            },
        )
        db.execute(
            text(
                """
                INSERT INTO concept_mastery (id, course_id, user_id, concept_id, mastery, status, evidence_json)
                VALUES (gen_random_uuid(), :course_id, :user_id, :concept_id, :mastery, :status, CAST(:evidence AS JSONB))
                ON CONFLICT (course_id, user_id, concept_id) DO UPDATE SET
                    mastery = EXCLUDED.mastery,
                    status = EXCLUDED.status,
                    evidence_json = EXCLUDED.evidence_json
                """
            ),
            {
                "course_id": IDS["course_dl"],
                "user_id": IDS["user_zhang"],
                "concept_id": node[3],
                "mastery": node[5],
                "status": node[4],
                "evidence": dumps([{"source": "seed_path", "node": node[1]}]),
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report planned changes without committing")
    args = parser.parse_args()
    result = purge_and_restore(dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
