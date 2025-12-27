from sqlalchemy import Column, String, BigInteger, JSON, DateTime, Sequence, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from .database import Base

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Use a sequence for monotonic seq
    seq = Column(BigInteger, Sequence('notification_seq'), unique=True, index=True, nullable=False)
    type = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": str(self.id),
            "seq": self.seq,
            "type": self.type,
            "payload": self.payload,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
