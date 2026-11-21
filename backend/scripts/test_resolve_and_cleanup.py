"""Verify resolve endpoint and 3-day SQL deletion."""

import asyncio
from datetime import datetime, timezone
import json
import urllib.request

from sqlalchemy import select, text
from core.db import AsyncSessionLocal
from models import Incident


async def test_all():
    print("1. Testing GET /api/incidents...")
    req = urllib.request.urlopen("http://localhost:8000/api/incidents")
    incidents = json.loads(req.read().decode())
    assert isinstance(incidents, list), "Expected list of incidents"
    print(f"   Found {len(incidents)} incidents.")

    # Find active incident
    active = [i for i in incidents if not i.get("is_resolved") and i.get("status") in ["Assigned", "WorkInProgress"]]
    if active:
        target = active[0]
        inc_id = target["id"]
        print(f"2. Testing POST /api/incidents/{inc_id}/resolve...")
        resolve_req = urllib.request.Request(f"http://localhost:8000/api/incidents/{inc_id}/resolve", method="POST")
        res = urllib.request.urlopen(resolve_req)
        data = json.loads(res.read().decode())
        assert data["status"] == "Resolved", f"Expected Resolved, got {data['status']}"
        assert data["is_resolved"] is True, "Expected is_resolved to be True"
        assert data["completionDate"] is not None, "Expected completionDate to be set"
        print(f"   Successfully resolved {inc_id}!")

    print("3. Testing SQL-level 3-day cleanup function and trigger...")
    async with AsyncSessionLocal() as session:
        # Create an incident resolved 4 days ago
        await session.execute(text("""
            INSERT INTO incidents (
                sys_id, id, state, state_enum, state_id, state_reason_id,
                submit_date, completion_date, header, description, short_description,
                assigned_group_name, assigned_employee, assigned_employee_login,
                initiator_name, initiator_login, is_effect, is_reason, is_double, is_master,
                inc_type, service_type_id, service_type, priority_id, priority,
                urgency_id, urgency, impact_id, impact, is_root_incident,
                product_name, product_id, product_master_id, service, scenario_name,
                receiving_channel, solution, source_payload, tags, updated_at
            ) VALUES (
                'test_exp_sys', 'INC_TEST_EXPIRED_SQL', 'Решён', 'Resolved', 7, '1',
                NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days',
                'Header', 'Desc', 'Short', 'Group', 'Emp', 'login', 'Init', 'ilogin',
                false, false, false, false, 'МИ', 10, 'Client', 2, 'Medium', 2, 'Medium', 2, 'Medium',
                false, 'Prod', 'p1', 'pm1', 'Serv', 'Scen', 'Chan', 'Sol', '{}', '[]',
                NOW() - INTERVAL '4 days'
            )
        """))
        await session.commit()

        # The AFTER INSERT trigger should have deleted it immediately!
        res = await session.execute(text("SELECT id FROM incidents WHERE id = 'INC_TEST_EXPIRED_SQL'"))
        row = res.scalar_one_or_none()
        assert row is None, "Trigger did not delete resolved incident older than 3 days!"
        print("   Trigger immediately purged expired incident upon INSERT: PASSED")

        # Now test an incident resolved 2 days ago (should NOT be deleted)
        await session.execute(text("""
            INSERT INTO incidents (
                sys_id, id, state, state_enum, state_id, state_reason_id,
                submit_date, completion_date, header, description, short_description,
                assigned_group_name, assigned_employee, assigned_employee_login,
                initiator_name, initiator_login, is_effect, is_reason, is_double, is_master,
                inc_type, service_type_id, service_type, priority_id, priority,
                urgency_id, urgency, impact_id, impact, is_root_incident,
                product_name, product_id, product_master_id, service, scenario_name,
                receiving_channel, solution, source_payload, tags, updated_at
            ) VALUES (
                'test_valid_sys', 'INC_TEST_VALID_2DAYS', 'Решён', 'Resolved', 7, '1',
                NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days',
                'Header', 'Desc', 'Short', 'Group', 'Emp', 'login', 'Init', 'ilogin',
                false, false, false, false, 'МИ', 10, 'Client', 2, 'Medium', 2, 'Medium', 2, 'Medium',
                false, 'Prod', 'p1', 'pm1', 'Serv', 'Scen', 'Chan', 'Sol', '{}', '[]',
                NOW() - INTERVAL '2 days'
            )
        """))
        await session.commit()

        res = await session.execute(text("SELECT id FROM incidents WHERE id = 'INC_TEST_VALID_2DAYS'"))
        assert res.scalar_one_or_none() == 'INC_TEST_VALID_2DAYS', "Recent incident should not be deleted!"
        print("   Incident resolved 2 days ago preserved correctly: PASSED")

        # Now update it to 4 days ago - trigger AFTER UPDATE should delete it!
        await session.execute(text("""
            UPDATE incidents
            SET completion_date = NOW() - INTERVAL '4 days'
            WHERE id = 'INC_TEST_VALID_2DAYS'
        """))
        await session.commit()

        res = await session.execute(text("SELECT id FROM incidents WHERE id = 'INC_TEST_VALID_2DAYS'"))
        assert res.scalar_one_or_none() is None, "Trigger did not delete incident on update past 3 days!"
        print("   Trigger immediately purged expired incident upon UPDATE past 3 days: PASSED")

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(test_all())
