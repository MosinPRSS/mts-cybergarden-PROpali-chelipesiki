"""Keep resolved incidents for history and AI context.

Revision ID: 0006
Revises: 0005
"""

from importlib import import_module

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_delete_expired_resolved_incidents ON incidents")
    op.execute("DROP FUNCTION IF EXISTS trigger_delete_expired_resolved_incidents()")
    op.execute("DROP FUNCTION IF EXISTS delete_expired_resolved_incidents()")


def downgrade() -> None:
    import_module("migrations.versions.0003_delete_resolved_after_3_days").upgrade()
