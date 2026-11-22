"""Persist names of incident resolvers and closers."""
from alembic import op
import sqlalchemy as sa
revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("resolved_by", sa.String(320), nullable=True))
    op.add_column("incidents", sa.Column("closed_by", sa.String(320), nullable=True))
    op.add_column("incidents", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("""
        UPDATE incidents i SET resolved_by = COALESCE(
            NULLIF(concat_ws(' ', u.surname, u.name, u.middlename), ''), a.actor_login)
        FROM (SELECT DISTINCT ON (incident_id) incident_id, actor_id, actor_login
              FROM incident_actions WHERE action = 'resolve' ORDER BY incident_id, occurred_at DESC) a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE i.id = a.incident_id AND i.state_enum IN ('Research', 'Resolved', 'Closed')
    """))


def downgrade():
    op.drop_column("incidents", "closed_at")
    op.drop_column("incidents", "closed_by")
    op.drop_column("incidents", "resolved_by")
