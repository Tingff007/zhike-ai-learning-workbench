"""助教端：随堂测验（路由 + 判分统计纯函数）。"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_ta
from ._shared import (
    TaClass,
    TaQuiz,
    TaQuizAttempt,
    TaQuizQuestion,
    User,
    _apply_page,
    _class_student_ids,
    _create_notifications,
    _require_uuid,
    _user_internal_id,
)

router = APIRouter(prefix="/ta", tags=["ta-portal"])


class QuizQuestionInput(BaseModel):
    """测验题目输入。"""
    prompt: str
    question_type: str = "single_choice"
    options: list[str] | None = None
    answer: str
    score: float = 10


class QuizCreateRequest(BaseModel):
    """创建测验请求体（题目嵌套）。"""
    title: str
    class_id: str
    course_id: str | None = None
    description: str | None = None
    questions: list[QuizQuestionInput] = Field(min_length=1)


class QuizUpdateRequest(BaseModel):
    """编辑测验请求体（仅标题/描述/题目，题目整体替换）。"""
    title: str | None = None
    description: str | None = None
    questions: list[QuizQuestionInput] | None = None


def _quiz_stats_by_question(
    attempts: list[Any],
    questions: list[Any],
) -> list[dict[str, Any]]:
    """每题正确率统计：返回 [{question_id, prompt, correct_count, total_count, accuracy}]。"""
    stats: list[dict[str, Any]] = []
    for q in questions:
        qid = str(q.id)
        total = len(attempts)
        correct = sum(
            1 for a in attempts
            if (a.answers or {}).get(qid) == q.answer
        )
        stats.append({
            "question_id": qid,
            "prompt": q.prompt,
            "correct_count": correct,
            "total_count": total,
            "accuracy": round(correct / total, 2) if total else None,
        })
    return stats


def _quiz_to_dict(q: TaQuiz) -> dict[str, Any]:
    """测验 ORM → 响应 dict。"""
    return {
        "id": str(q.id),
        "title": q.title,
        "description": q.description,
        "class_id": str(q.class_id),
        "course_id": str(q.course_id) if q.course_id else None,
        "status": q.status,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }


def _save_quiz_questions(db: Session, quiz_id: uuid.UUID, questions: list[QuizQuestionInput]) -> None:
    """全量替换测验题目（先删后插）。"""
    db.execute(delete(TaQuizQuestion).where(TaQuizQuestion.quiz_id == quiz_id))
    for idx, qi in enumerate(questions):
        db.add(TaQuizQuestion(
            quiz_id=quiz_id,
            order_index=idx,
            question_type=qi.question_type,
            prompt=qi.prompt,
            options=qi.options,
            answer=qi.answer,
            score=qi.score,
        ))


@router.post("/quizzes")
async def create_quiz(
    payload: QuizCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """创建测验 + 嵌套题目；校验班级与题目一致性。"""
    user_id = _user_internal_id(db, current_user.id)
    if user_id is None:
        raise HTTPException(status_code=403, detail="当前用户不存在")
    class_id_uuid = _require_uuid(payload.class_id, "班级不存在")
    cls = db.get(TaClass, class_id_uuid)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")
    for qi in payload.questions:
        if qi.question_type not in {"single_choice", "true_false"}:
            raise HTTPException(status_code=400, detail=f"不支持的题型: {qi.question_type}")
        if qi.question_type == "true_false" and qi.answer not in {"T", "F"}:
            raise HTTPException(status_code=400, detail="判断题答案须为 T 或 F")
    quiz = TaQuiz(
        ta_user_id=user_id,
        class_id=class_id_uuid,
        course_id=_require_uuid(payload.course_id, "课程不存在") if payload.course_id else None,
        title=payload.title,
        description=payload.description,
    )
    db.add(quiz)
    db.flush()
    for idx, qi in enumerate(payload.questions):
        db.add(TaQuizQuestion(
            quiz_id=quiz.id, order_index=idx, question_type=qi.question_type,
            prompt=qi.prompt, options=qi.options, answer=qi.answer, score=qi.score,
        ))
    db.commit()
    return _quiz_to_dict(quiz)


@router.get("/quizzes")
async def list_quizzes(
    class_id: str | None = None,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """测验列表（可按班级过滤，时间倒序）。"""
    stmt = select(TaQuiz)
    if class_id:
        class_id_uuid = _require_uuid(class_id, "班级不存在")
        stmt = stmt.where(TaQuiz.class_id == class_id_uuid)
    stmt = stmt.order_by(TaQuiz.created_at.desc())
    stmt = _apply_page(stmt, limit, offset)
    quizzes = db.execute(stmt).scalars().all()
    return [_quiz_to_dict(q) for q in quizzes]


@router.get("/quizzes/{quiz_id}")
async def get_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """测验详情：含题目（不含答案）。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    questions = db.execute(
        select(TaQuizQuestion).where(TaQuizQuestion.quiz_id == quiz.id).order_by(TaQuizQuestion.order_index)
    ).scalars().all()
    result = _quiz_to_dict(quiz)
    result["questions"] = [
        {
            "id": str(q.id), "order_index": q.order_index,
            "question_type": q.question_type, "prompt": q.prompt,
            "options": q.options or [], "score": q.score,
        }
        for q in questions
    ]
    return result


@router.put("/quizzes/{quiz_id}")
async def update_quiz(
    quiz_id: str,
    payload: QuizUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """编辑测验：仅草稿可编辑，题目整体替换。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    if quiz.status != "draft":
        raise HTTPException(status_code=403, detail="仅草稿测验可编辑")
    if payload.title is not None:
        quiz.title = payload.title
    if payload.description is not None:
        quiz.description = payload.description
    if payload.questions is not None:
        _save_quiz_questions(db, quiz.id, payload.questions)
    db.commit()
    return _quiz_to_dict(quiz)


@router.post("/quizzes/{quiz_id}/publish")
async def publish_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """发布测验：draft→published，向该班学生生成 quiz 通知。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    if quiz.status == "published":
        return _quiz_to_dict(quiz)
    if quiz.status == "closed":
        raise HTTPException(status_code=403, detail="测验已关闭，无法发布")
    quiz.status = "published"
    student_ids = _class_student_ids(db, quiz.class_id)
    _create_notifications(
        db,
        student_ids,
        title=f"新测验：{quiz.title}",
        body=f"《{quiz.title}》随堂测验已发布，请尽快完成作答。",
        notification_type="quiz",
        source_type="quiz",
        source_id=str(quiz.id),
        class_id=quiz.class_id,
    )
    db.commit()
    db.refresh(quiz)
    return _quiz_to_dict(quiz)


@router.post("/quizzes/{quiz_id}/close")
async def close_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """关闭测验：published→closed，禁止再提交。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    if quiz.status == "draft":
        raise HTTPException(status_code=403, detail="草稿测验无需关闭")
    if quiz.status == "closed":
        return _quiz_to_dict(quiz)
    quiz.status = "closed"
    db.commit()
    db.refresh(quiz)
    return _quiz_to_dict(quiz)


@router.get("/quizzes/{quiz_id}/stats")
async def quiz_stats(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """测验统计：每题正确率 + 班级均分 + 提交人数（确定性计算）。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    questions = db.execute(
        select(TaQuizQuestion).where(TaQuizQuestion.quiz_id == quiz.id).order_by(TaQuizQuestion.order_index)
    ).scalars().all()
    attempts = db.execute(
        select(TaQuizAttempt).where(TaQuizAttempt.quiz_id == quiz.id)
    ).scalars().all()
    per_question = _quiz_stats_by_question(attempts, questions)
    scores = [a.score for a in attempts if a.score is not None]
    total_score = sum(q.score for q in questions)
    return {
        "quiz_id": str(quiz.id),
        "title": quiz.title,
        "submission_count": len(attempts),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "full_score": total_score,
        "questions": per_question,
    }


@router.get("/quizzes/{quiz_id}/attempts")
async def quiz_attempts(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """测验作答明细：学生/得分/提交时间。"""
    quiz_id_uuid = _require_uuid(quiz_id, "测验不存在")
    quiz = db.get(TaQuiz, quiz_id_uuid)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    attempts = db.execute(
        select(TaQuizAttempt).where(TaQuizAttempt.quiz_id == quiz.id).order_by(TaQuizAttempt.submitted_at.desc())
    ).scalars().all()
    student_ids = [a.student_id for a in attempts]
    users = db.execute(select(User).where(User.id.in_(student_ids))).scalars().all() if student_ids else []
    name_by_id = {u.id: (u.display_name or str(u.id)) for u in users}
    return [
        {
            "student_id": str(a.student_id),
            "student_name": name_by_id.get(a.student_id, "未知"),
            "score": a.score,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        }
        for a in attempts
    ]
