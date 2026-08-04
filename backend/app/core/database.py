from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """提供 FastAPI 依赖注入使用的数据库会话。

    生成:
        Session: 当前请求生命周期内的 SQLAlchemy 会话，结束后会自动关闭。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
