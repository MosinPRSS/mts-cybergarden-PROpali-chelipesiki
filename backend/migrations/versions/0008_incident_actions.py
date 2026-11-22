"""Record incident completion and undo history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("incident_actions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_login", sa.String(128), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("previous", postgresql.JSONB(), nullable=False),
        sa.Column("incident_version", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_incident_actions_incident_id", "incident_actions", ["incident_id"])


def downgrade():
    op.drop_table("incident_actions")
