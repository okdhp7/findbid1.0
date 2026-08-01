from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import NotificationPost


class NotificationRepository:
    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def to_dict(model: NotificationPost) -> dict[str, object]:
        published_at = model.published_at
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        return {
            "id": model.id,
            "publisher": model.publisher,
            "content": model.content,
            "publishedAt": published_at.isoformat().replace("+00:00", "Z"),
        }

    def list(self, limit: int = 100) -> list[dict[str, object]]:
        statement = (
            select(NotificationPost)
            .order_by(NotificationPost.published_at.desc(), NotificationPost.id.desc())
            .limit(limit)
        )
        return [self.to_dict(model) for model in self.session.scalars(statement)]

    def create(self, publisher: str, content: str) -> dict[str, object]:
        model = NotificationPost(publisher=publisher, content=content)
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)
        return self.to_dict(model)

    def update(
        self, notification_id: int, publisher: str, content: str
    ) -> dict[str, object] | None:
        model = self.session.get(NotificationPost, notification_id)
        if model is None:
            return None
        model.publisher = publisher
        model.content = content
        self.session.commit()
        self.session.refresh(model)
        return self.to_dict(model)

    def delete(self, notification_id: int) -> bool:
        model = self.session.get(NotificationPost, notification_id)
        if model is None:
            return False
        self.session.delete(model)
        self.session.commit()
        return True
