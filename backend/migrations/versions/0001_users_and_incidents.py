"""Create users and incidents.

Revision ID: 0001
Revises:
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("login", sa.String(100), nullable=False),
        sa.Column("pass_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("surname", sa.String(100), nullable=False),
        sa.Column("middlename", sa.String(100), nullable=True),
        sa.Column(
            "role",
            sa.Enum("admin", "coordinator", "engineer", "observer",
                    name="user_role_enum", native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_login", "users", ["login"], unique=True)
    op.create_table(
        "incidents",
        sa.Column("id", sa.String(50), nullable=False),
        sa.Column("priority", sa.String(30), nullable=False),
        sa.Column(
            "status",
            sa.Enum("Open", "In Progress", "Resolved", "Closed",
                    name="incident_status_enum", native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.Column("service", sa.String(100), nullable=False),
        sa.Column("area", sa.String(100), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("team", sa.String(100), nullable=True),
        sa.Column("sla", sa.Integer(), nullable=False),
        sa.Column("affected", sa.String(100), nullable=True),
        sa.Column("ai_recommendation", sa.Text(), nullable=True),
        sa.Column("assignee_id", sa.Integer(), nullable=True),
        sa.Column("groups", sa.JSON(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incidents_id", "incidents", ["id"])


def downgrade() -> None:
    op.drop_index("ix_incidents_id", table_name="incidents")
    op.drop_table("incidents")
    op.drop_index("ix_users_login", table_name="users")
    op.drop_table("users")
