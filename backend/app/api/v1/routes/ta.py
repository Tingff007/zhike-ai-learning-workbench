from uuid import uuid4
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_ta
from app.models.user import User
from app.models.ta_class import TaClass
from app.models.ta_class_student import TaClassStudent
from app.models.ta_lesson_plan import TaLessonPlan
from app.models.ta_grading_record import TaGradingRecord
from app.models.student_learning_event import StudentLearningEvent
from app.models.ta_alert_record import TaAlertRecord

router = APIRouter(prefix="/ta", tags=["ta-portal"])

# ===== 班级管理 =====

@router.get("/classes")
async def list_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """获取当前助教的班级列表。"""
    stmt = select(TaClass).where(TaClass.ta_user_id == current_user.id, TaClass.is_active == True)
    classes = db.execute(stmt).scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "course_id": c.course_id,
            "student_count": len(c.students) if c.students else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in classes
    ]

@router.post("/classes")
async def create_class(
    name: str,
    description: str | None = None,
    course_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """创建新班级。"""
    cls = TaClass(name=name, description=description, course_id=course_id, ta_user_id=current_user.id)
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {"id": cls.id, "name": cls.name, "message": "班级创建成功"}

@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, str]:
    """删除班级（软删除）。"""
    cls = db.get(TaClass, class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")
    cls.is_active = False
    db.commit()
    return {"message": "班级已删除"}

@router.post("/classes/{class_id}/students/{student_id}")
async def add_student(
    class_id: str, student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, str]:
    """添加学生到班级。"""
    membership = TaClassStudent(class_id=class_id, student_id=student_id)
    db.add(membership)
    db.commit()
    return {"message": "学生已加入班级"}

@router.delete("/classes/{class_id}/students/{student_id}")
async def remove_student(
    class_id: str, student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, str]:
    """从班级移除学生。"""
    stmt = select(TaClassStudent).where(
        TaClassStudent.class_id == class_id,
        TaClassStudent.student_id == student_id,
    )
    membership = db.execute(stmt).scalar_one_or_none()
    if membership:
        db.delete(membership)
        db.commit()
    return {"message": "学生已移除"}

@router.get("/classes/{class_id}/students")
async def list_students(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """查看班级学生列表。"""
    members = db.execute(
        select(TaClassStudent).where(TaClassStudent.class_id == class_id)
    ).scalars().all()
    result = []
    for m in members:
        user = db.execute(select(User).where(User.id == m.student_id)).scalar_one_or_none()
        result.append({
            "student_id": m.student_id,
            "name": user.name if user else "未知",
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        })
    return result

# ===== 智能备课 =====

@router.get("/lesson-plans")
async def list_lesson_plans(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """获取备课列表。"""
    stmt = select(TaLessonPlan).where(TaLessonPlan.created_by == current_user.id)
    if course_id:
        stmt = stmt.where(TaLessonPlan.course_id == course_id)
    stmt = stmt.order_by(TaLessonPlan.updated_at.desc())
    plans = db.execute(stmt).scalars().all()
    return [
        {
            "id": p.id, "title": p.title, "course_id": p.course_id,
            "chapter": p.chapter, "version": p.version, "is_published": p.is_published,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in plans
    ]

@router.get("/lesson-plans/{plan_id}")
async def get_lesson_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """获取教案详情。"""
    plan = db.get(TaLessonPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="教案不存在")
    return {
        "id": plan.id, "title": plan.title, "course_id": plan.course_id,
        "chapter": plan.chapter, "content": plan.content, "outline": plan.outline,
        "version": plan.version, "is_published": plan.is_published,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }

@router.post("/lesson-plans/generate")
async def generate_lesson_plan(
    title: str, course_id: str | None = None,
    chapter: str | None = None, requirements: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """AI 生成教案（占位，后续接入 LLM 完整生成）。"""
    plan = TaLessonPlan(
        title=title, course_id=course_id, chapter=chapter,
        outline=f"# {title}\n\n## 教学目标\n\n## 教学重点\n\n## 教学过程\n\n## 作业布置\n",
        created_by=current_user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "title": plan.title, "message": "教案生成成功（占位内容，可继续编辑）"}

# ===== 作业批改 =====

@router.get("/grading/list")
async def list_grading(
    class_id: str | None = None, status: str | None = "pending",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """获取批改列表。"""
    stmt = select(TaGradingRecord)
    if status:
        stmt = stmt.where(TaGradingRecord.status == status)
    if class_id:
        stmt = stmt.where(TaGradingRecord.class_id == class_id)
    stmt = stmt.order_by(TaGradingRecord.created_at.desc()).limit(50)
    records = db.execute(stmt).scalars().all()
    return [
        {
            "id": r.id, "title": r.title, "student_id": r.student_id,
            "question_type": r.question_type, "score": r.score,
            "total_score": r.total_score, "status": r.status,
            "grader_type": r.grader_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]

@router.post("/grading/ai-grade")
async def ai_grade_submission(
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """AI 自动批改（占位，后续接入 LLM 评分）。"""
    record = db.get(TaGradingRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.status = "graded"
    record.grader_type = "ai_assisted"
    record.score = record.total_score * 0.85 if record.total_score else 85
    record.ai_comment = "AI 自动批改（占位评分，请补充完整评分逻辑）"
    db.commit()
    return {"id": record.id, "score": record.score, "message": "AI 批改完成（占位）"}

@router.post("/grading/manual-grade")
async def manual_grade(
    record_id: str, score: float, ta_comment: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, str]:
    """助教手动评分。"""
    record = db.get(TaGradingRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    record.score = score
    record.ta_comment = ta_comment
    record.status = "graded"
    record.grader_type = "manual"
    db.commit()
    return {"message": "评分完成"}

@router.get("/grading/stats")
async def grading_stats(
    class_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """批改统计看板。"""
    stmt = select(TaGradingRecord)
    if class_id:
        stmt = stmt.where(TaGradingRecord.class_id == class_id)
    records = db.execute(stmt).scalars().all()
    total, graded, pending = len(records), 0, 0
    scores = []
    for r in records:
        if r.status == "graded" and r.score is not None:
            graded += 1
            scores.append(r.score)
        elif r.status == "pending":
            pending += 1
    avg_score = sum(scores) / len(scores) if scores else 0
    return {
        "total": total, "graded": graded, "pending": pending,
        "avg_score": round(avg_score, 1),
    }

# ===== 学情诊断 =====

@router.get("/diagnosis/class/{class_id}")
async def class_diagnosis(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """班级学情概览。"""
    members = db.execute(
        select(TaClassStudent).where(TaClassStudent.class_id == class_id)
    ).scalars().all()
    student_ids = [m.student_id for m in members]
    return {"class_id": class_id, "student_count": len(student_ids), "students": student_ids}

@router.get("/diagnosis/class/{class_id}/weak-points")
async def class_weak_points(
    class_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """班级薄弱知识点识别（占位，后续接入画像分析）。"""
    return [
        {"concept": "反向传播算法", "weak_rate": 0.65, "student_count": 12},
        {"concept": "卷积神经网络", "weak_rate": 0.52, "student_count": 9},
        {"concept": "注意力机制", "weak_rate": 0.48, "student_count": 8},
    ]

@router.get("/diagnosis/student/{student_id}")
async def student_diagnosis(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """学生个体画像诊断。"""
    events = db.execute(
        select(StudentLearningEvent)
        .where(StudentLearningEvent.student_id == student_id)
        .order_by(StudentLearningEvent.created_at.desc()).limit(20)
    ).scalars().all()
    alerts = db.execute(
        select(TaAlertRecord).where(
            TaAlertRecord.student_id == student_id,
            TaAlertRecord.resolved == False,
        )
    ).scalars().all()
    return {
        "student_id": student_id,
        "recent_events": [
            {"type": e.event_type, "course_id": e.course_id,
             "time": e.created_at.isoformat() if e.created_at else None}
            for e in events
        ],
        "active_alerts": len(alerts),
        "alerts": [
            {"title": a.title, "severity": a.severity, "type": a.alert_type}
            for a in alerts
        ],
    }

# ===== 预警管理 =====

@router.get("/alerts")
async def list_alerts(
    resolved: bool | None = False,
    class_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> list[dict[str, Any]]:
    """获取预警列表。"""
    stmt = select(TaAlertRecord)
    if resolved is not None:
        stmt = stmt.where(TaAlertRecord.resolved == resolved)
    if class_id:
        stmt = stmt.where(TaAlertRecord.class_id == class_id)
    stmt = stmt.order_by(TaAlertRecord.created_at.desc()).limit(50)
    alerts = db.execute(stmt).scalars().all()
    return [
        {
            "id": a.id, "title": a.title, "alert_type": a.alert_type,
            "severity": a.severity, "student_id": a.student_id,
            "resolved": a.resolved,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]

@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, str]:
    """处理预警。"""
    alert = db.get(TaAlertRecord, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="预警不存在")
    alert.resolved = True
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "预警已处理"}

# ===== 助教首页统计 =====

@router.get("/dashboard")
async def ta_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ta),
) -> dict[str, Any]:
    """助教工作台首页统计。"""
    classes_count = db.execute(
        select(TaClass).where(TaClass.ta_user_id == current_user.id, TaClass.is_active == True)
    ).scalars().all()
    pending_count = db.execute(
        select(TaGradingRecord).where(TaGradingRecord.status == "pending")
    ).scalars().all()
    alert_count = db.execute(
        select(TaAlertRecord).where(TaAlertRecord.resolved == False)
    ).scalars().all()
    total_students = 0
    for c in classes_count:
        total_students += len(c.students) if c.students else 0
    return {
        "class_count": len(classes_count),
        "student_count": total_students,
        "pending_grading": len(pending_count),
        "active_alerts": len(alert_count),
    }
