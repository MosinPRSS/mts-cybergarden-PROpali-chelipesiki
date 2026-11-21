"""Auto-delete resolved incidents after 3 days.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQL function to delete resolved incidents older than 3 days
    op.execute("""
    CREATE OR REPLACE FUNCTION delete_expired_resolved_incidents()
    RETURNS INTEGER AS $$
    DECLARE
        deleted_count INTEGER;
    BEGIN
        DELETE FROM incidents
        WHERE (state_id IN (7, 10) OR state_enum IN ('Resolved', 'Closed'))
          AND COALESCE(completion_date, updated_at) < NOW() - INTERVAL '3 days';
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
    """)

    # SQL trigger function for automatic execution upon changes
    op.execute("""
    CREATE OR REPLACE FUNCTION trigger_delete_expired_resolved_incidents()
    RETURNS TRIGGER AS $$
    BEGIN
        PERFORM delete_expired_resolved_incidents();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """)

    # Statement-level trigger on incidents
    op.execute("""
    DROP TRIGGER IF EXISTS trg_delete_expired_resolved_incidents ON incidents;
    CREATE TRIGGER trg_delete_expired_resolved_incidents
        AFTER INSERT OR UPDATE ON incidents
        FOR EACH STATEMENT
        EXECUTE FUNCTION trigger_delete_expired_resolved_incidents();
    """)

    # Initial purge of any already expired records
    op.execute("SELECT delete_expired_resolved_incidents();")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_delete_expired_resolved_incidents ON incidents;")
    op.execute("DROP FUNCTION IF EXISTS trigger_delete_expired_resolved_incidents();")
    op.execute("DROP FUNCTION IF EXISTS delete_expired_resolved_incidents();")
