from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.notification import NotificationPost
from app.repositories.notification_repository import NotificationRepository


def test_notification_repository_supports_admin_crud_and_public_ordering() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[NotificationPost.__table__])

    with Session(engine) as session:
        repository = NotificationRepository(session)
        first = repository.create("관리자", "첫 번째 알림")
        second = repository.create("운영자", "두 번째 알림")

        items = repository.list()
        assert [item["id"] for item in items] == [second["id"], first["id"]]
        assert items[0]["publisher"] == "운영자"
        assert items[0]["publishedAt"].endswith("Z")

        updated = repository.update(int(first["id"]), "FindBid", "수정된 알림")
        assert updated is not None
        assert updated["publisher"] == "FindBid"
        assert updated["content"] == "수정된 알림"

        assert repository.delete(int(second["id"])) is True
        assert repository.delete(int(second["id"])) is False
        assert [item["id"] for item in repository.list()] == [first["id"]]
