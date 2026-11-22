"""Notify live dashboards about committed incident changes from any writer."""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    # Preserve explicit API versions (also stored in incident_actions), while
    # advancing the version for writers that only change a business field.
    op.execute("""
        CREATE FUNCTION version_incident_change() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW IS DISTINCT FROM OLD AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
                NEW.updated_at := GREATEST(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER incidents_version_change BEFORE UPDATE ON incidents
        FOR EACH ROW EXECUTE FUNCTION version_incident_change()
    """)
    op.execute("""
        CREATE FUNCTION notify_incident_change() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM pg_notify('incidents_changed', COALESCE(current_setting('mts.incident_origin', true), ''));
            RETURN NULL;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER incidents_notify_write AFTER INSERT OR DELETE ON incidents
        FOR EACH ROW EXECUTE FUNCTION notify_incident_change()
    """)
    op.execute("""
        CREATE TRIGGER incidents_notify_update AFTER UPDATE ON incidents
        FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW)
        EXECUTE FUNCTION notify_incident_change()
    """)
    op.execute("""
        CREATE TRIGGER incidents_notify_truncate AFTER TRUNCATE ON incidents
        FOR EACH STATEMENT EXECUTE FUNCTION notify_incident_change()
    """)


def downgrade():
    for name in ("incidents_notify_truncate", "incidents_notify_update", "incidents_notify_write", "incidents_version_change"):
        op.execute(f"DROP TRIGGER {name} ON incidents")
    op.execute("DROP FUNCTION notify_incident_change()")
    op.execute("DROP FUNCTION version_incident_change()")
