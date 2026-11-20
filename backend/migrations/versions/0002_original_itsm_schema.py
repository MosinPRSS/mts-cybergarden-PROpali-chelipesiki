"""Preserve demo rows in legacy_incidents and introduce the actual ITSM schema.

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preserve the previous demo rows and their original user relationships.
    op.rename_table("incidents", "legacy_incidents")
    op.execute("ALTER INDEX ix_incidents_id RENAME TO ix_legacy_incidents_id")
    op.execute("ALTER TABLE legacy_incidents RENAME CONSTRAINT incidents_pkey TO legacy_incidents_pkey")
    op.create_table(
        "incidents",
        sa.Column("sys_id", sa.String(64), nullable=False),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("state", sa.String(100), nullable=False),
        sa.Column("state_enum", sa.Enum("Assigned", "WorkInProgress", "Resolved", "Closed", "Research", name="incident_state_enum", native_enum=False, create_constraint=True), nullable=False),
        sa.Column("state_id", sa.Integer(), nullable=False),
        sa.Column("state_reason", sa.Text(), nullable=True),
        sa.Column("state_reason_id", sa.String(32), nullable=False),
        sa.Column("submit_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completion_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_assignment_to_team_date_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("header", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("short_description", sa.Text(), nullable=False),
        sa.Column("assigned_group_name", sa.String(255), nullable=False),
        sa.Column("assigned_employee", sa.String(255), nullable=False),
        sa.Column("assigned_employee_login", sa.String(128), nullable=False),
        sa.Column("initiator_name", sa.String(255), nullable=False),
        sa.Column("initiator_login", sa.String(128), nullable=False),
        sa.Column("is_effect", sa.Boolean(), nullable=False),
        sa.Column("is_reason", sa.Boolean(), nullable=False),
        sa.Column("is_double", sa.Boolean(), nullable=False),
        sa.Column("is_master", sa.Boolean(), nullable=False),
        sa.Column("inc_type", sa.String(32), nullable=False),
        sa.Column("service_type_id", sa.Integer(), nullable=False),
        sa.Column("service_type", sa.String(100), nullable=False),
        sa.Column("priority_id", sa.Integer(), nullable=False),
        sa.Column("priority", sa.String(100), nullable=False),
        sa.Column("urgency_id", sa.Integer(), nullable=False),
        sa.Column("urgency", sa.String(100), nullable=False),
        sa.Column("impact_id", sa.Integer(), nullable=False),
        sa.Column("impact", sa.String(100), nullable=False),
        sa.Column("waiting_exit_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_root_incident", sa.Boolean(), nullable=False),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("product_id", sa.String(64), nullable=False),
        sa.Column("product_master_id", sa.String(64), nullable=False),
        sa.Column("product_url", sa.Text(), nullable=True),
        sa.Column("service", sa.String(255), nullable=False),
        sa.Column("service_id", sa.String(64), nullable=True),
        sa.Column("scenario_name", sa.String(255), nullable=False),
        sa.Column("is_need_up", sa.Boolean(), nullable=True),
        sa.Column("elimination_type", sa.Text(), nullable=True),
        sa.Column("elimination_type_id", sa.String(64), nullable=True),
        sa.Column("receiving_channel", sa.String(255), nullable=False),
        sa.Column("solution", sa.Text(), nullable=False),
        sa.Column("source_payload", postgresql.JSONB(), nullable=False),
        sa.Column("ai_recommendation", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("priority_id BETWEEN 1 AND 4", name="ck_incidents_priority"),
        sa.CheckConstraint("urgency_id BETWEEN 1 AND 4", name="ck_incidents_urgency"),
        sa.CheckConstraint("impact_id BETWEEN 1 AND 4", name="ck_incidents_impact"),
        sa.CheckConstraint("service_type_id IN (10, 20, 30)", name="ck_incidents_service_type"),
        sa.CheckConstraint("(state_id = 0 AND state_enum = 'Assigned') OR (state_id = 2 AND state_enum = 'WorkInProgress') OR (state_id = 7 AND state_enum = 'Resolved') OR (state_id = 10 AND state_enum = 'Closed') OR (state_id = 20 AND state_enum = 'Research')", name="ck_incidents_state_pair"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incidents_sys_id", "incidents", ["sys_id"], unique=True)
    op.create_index("ix_incidents_state_id", "incidents", ["state_id"])
    op.create_index("ix_incidents_assigned_group_name", "incidents", ["assigned_group_name"])
    op.create_index("ix_incidents_assigned_employee_login", "incidents", ["assigned_employee_login"])
    op.create_index("ix_incidents_initiator_login", "incidents", ["initiator_login"])
    op.create_index("ix_incidents_priority_id", "incidents", ["priority_id"])


def downgrade() -> None:
    # Imported ITSM rows belong to this revision. The archived demo table survives.
    op.drop_table("incidents")
    op.execute("ALTER TABLE legacy_incidents RENAME CONSTRAINT legacy_incidents_pkey TO incidents_pkey")
    op.execute("ALTER INDEX ix_legacy_incidents_id RENAME TO ix_incidents_id")
    op.rename_table("legacy_incidents", "incidents")
