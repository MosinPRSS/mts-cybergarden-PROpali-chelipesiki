"""Make the five initial accounts coordinators and revoke other roles' sessions."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("""
        UPDATE users SET role = 'coordinator'
        WHERE lower(login) IN ('admin', 'coordinator', 'engineer1', 'engineer2', 'observer')
    """))
    op.execute(sa.text("""
        DELETE FROM user_sessions
        WHERE user_id IN (SELECT id FROM users WHERE role <> 'coordinator')
    """))


def downgrade():
    # Preserve current account roles and credentials when rolling back the schema.
    pass
