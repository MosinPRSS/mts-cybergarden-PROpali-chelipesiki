import copy
import json
import unittest
from collections import Counter
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from domain.incidents import COORDINATOR_TEAM, IncidentSource, incident_groups, sla_details
from scripts.seed import FIXTURE_PATH
from services.incidents import validate_export


class OriginalExportTests(unittest.TestCase):
    def setUp(self):
        self.records = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_all_44_records_and_all_46_fields_are_supported(self):
        records = validate_export(self.records)
        self.assertEqual(len(records), 44)
        self.assertEqual({field.alias for field in IncidentSource.model_fields.values()}, set(self.records[0]))
        self.assertEqual(Counter(record.state_enum.value for record in records), {"Assigned": 14, "WorkInProgress": 10, "Resolved": 10, "Closed": 5, "Research": 5})
        self.assertTrue(all(isinstance(record.sys_id, str) for record in records))

    def test_observed_state_codes_override_the_erroneous_dictionary_description(self):
        records = validate_export(self.records)
        self.assertEqual({r.state_enum.value for r in records if r.state_id == 7}, {"Resolved"})
        self.assertEqual({r.state_enum.value for r in records if r.state_id == 10}, {"Closed"})
        self.assertEqual({r.state_enum.value for r in records if r.state_id == 20}, {"Research"})

    def test_sentinel_and_tri_state_flags_are_preserved_semantically(self):
        records = validate_export(self.records)
        self.assertTrue(all(record.waiting_exit_date is None for record in records))
        self.assertEqual(Counter(record.is_need_up for record in records), {None: 23, False: 20, True: 1})
        self.assertEqual(sum(record.deadline is None for record in records), 3)
        self.assertEqual(sum(record.service_id is None for record in records), 7)
        for text, expected in [("Да", True), ("Нет", False)]:
            row = copy.deepcopy(self.records[0])
            row["isNeedUp"] = text
            self.assertIs(IncidentSource.model_validate(row).is_need_up, expected)

    def test_invalid_types_and_codes_are_rejected(self):
        cases = [("priorityId", 0), ("priorityId", 5), ("priorityId", True), ("stateId", 999), ("stateEnum", "Open"), ("isDouble", "false"), ("sysId", 179413934903718013), ("deadline", "not-a-date"), ("submitDate", "2026-11-08T12:02:29")]
        for field, value in cases:
            row = copy.deepcopy(self.records[0])
            row[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                validate_export([row])

    def test_duplicate_ids_and_system_ids_are_rejected(self):
        for field in ("id", "sysId"):
            rows = copy.deepcopy(self.records[:2])
            rows[1][field] = rows[0][field]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "Duplicate"):
                validate_export(rows)

    def test_solution_text_does_not_determine_resolution(self):
        row = self.records[0]
        self.assertTrue(row["solution"])
        self.assertEqual(incident_groups(row["stateEnum"], row["priorityId"], row["assignedGroupName"]), ["На координаторах"])


class GroupTests(unittest.TestCase):
    def test_active_critical_coordinator_appears_in_both_groups(self):
        self.assertEqual(incident_groups("Assigned", 4, COORDINATOR_TEAM), ["Критические", "На координаторах"])

    def test_research_is_resolved_and_can_still_be_on_coordinators(self):
        self.assertEqual(incident_groups("Research", 4, COORDINATOR_TEAM), ["На координаторах", "Исследование ситуации"])

    def test_assigned_status_does_not_mean_assigned_to_coordinators(self):
        self.assertEqual(incident_groups("Assigned", 1, "Другая команда"), [])
        self.assertEqual(incident_groups("Assigned", 1, COORDINATOR_TEAM + " другая"), [])

    def test_resolved_and_closed_are_not_research_or_active_high_priority(self):
        for state in ("Resolved", "Closed"):
            self.assertEqual(incident_groups(state, 4, COORDINATOR_TEAM),
                ["Исследование ситуации"] if state == "Resolved" else [])

    def test_high_priority_is_three_and_urgency_does_not_make_it_critical(self):
        self.assertEqual(incident_groups("WorkInProgress", 3, "Другая команда"), ["Высокий приоритет"])
        self.assertEqual(incident_groups("WorkInProgress", 2, "Другая команда"), [])


class SLADeadlineTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 21, tzinfo=timezone.utc)

    def test_remaining_time_comes_from_absolute_deadline(self):
        deadline = self.now + timedelta(minutes=5)
        self.assertEqual(sla_details("Assigned", deadline, None, now=self.now), (300, "remaining"))
        self.assertEqual(sla_details("Assigned", deadline, None, now=self.now + timedelta(minutes=2)), (180, "remaining"))

    def test_expired_deadline_is_not_reported_as_met(self):
        self.assertEqual(sla_details("Assigned", self.now - timedelta(seconds=60), None, now=self.now), (-60, "overdue"))
        self.assertEqual(sla_details("Assigned", self.now, None, now=self.now), (0, "overdue"))

    def test_resolved_sla_is_fixed_at_completion_not_current_time(self):
        deadline = self.now - timedelta(days=7)
        for state in ("Resolved", "Closed", "Research"):
            self.assertEqual(sla_details(state, deadline, deadline - timedelta(seconds=60), now=self.now), (60, "met"))
            self.assertEqual(sla_details(state, deadline, deadline + timedelta(seconds=60), now=self.now), (-60, "breached"))

    def test_missing_deadline_or_completion_is_unknown_not_success(self):
        self.assertEqual(sla_details("Research", None, self.now), (None, "no_deadline"))
        self.assertEqual(sla_details("Resolved", self.now, None), (None, "unknown"))
