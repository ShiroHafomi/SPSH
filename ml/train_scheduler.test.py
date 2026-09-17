import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).parent))

import train


class TrainingSchedulerTests(unittest.TestCase):
    def make_data_file(self):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "students.csv"
        path.write_text("grade,final_score\nA,90\n", encoding="utf-8")
        self.addCleanup(directory.cleanup)
        return path

    def wait_for(self, predicate, timeout=1):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.005)
        self.fail("condition was not met before timeout")

    def test_interval_configuration_uses_two_minutes_by_default(self):
        self.assertEqual(train.get_train_interval_seconds({}), 120)
        self.assertEqual(train.get_train_interval_seconds({"TRAIN_INTERVAL_MINUTES": "2"}), 120)
        self.assertEqual(train.get_train_interval_seconds({"TRAIN_INTERVAL_MINUTES": "invalid"}), 120)

    def test_initial_training_and_unchanged_data_are_handled(self):
        data_path = self.make_data_file()
        train_fn = Mock()
        scheduler = train.TrainingScheduler(train_fn, data_path, interval_seconds=0.01)

        self.assertTrue(scheduler.start_training(force=True))
        scheduler.stop()
        self.assertEqual(train_fn.call_count, 1)
        self.assertFalse(scheduler.start_training())
        self.assertEqual(train_fn.call_count, 1)

    def test_changed_data_triggers_training_on_next_interval(self):
        data_path = self.make_data_file()
        train_fn = Mock()
        scheduler = train.TrainingScheduler(train_fn, data_path, interval_seconds=0.01)
        runner = threading.Thread(target=scheduler.run)
        runner.start()

        self.wait_for(lambda: train_fn.call_count == 1)
        data_path.write_text("grade,final_score\nA,91\n", encoding="utf-8")
        self.wait_for(lambda: train_fn.call_count == 2)
        scheduler.request_stop()
        runner.join(timeout=1)
        self.assertFalse(runner.is_alive())

    def test_overlapping_training_is_skipped(self):
        data_path = self.make_data_file()
        started = threading.Event()
        release = threading.Event()

        def train_job():
            started.set()
            release.wait(timeout=1)

        scheduler = train.TrainingScheduler(train_job, data_path, interval_seconds=0.01)
        self.assertTrue(scheduler.start_training(force=True))
        self.assertTrue(started.wait(timeout=1))
        self.assertFalse(scheduler.start_training(force=True))
        release.set()
        scheduler.stop()

    def test_failed_training_does_not_stop_scheduler(self):
        data_path = self.make_data_file()
        train_fn = Mock(side_effect=[RuntimeError("training failed"), None])
        scheduler = train.TrainingScheduler(train_fn, data_path, interval_seconds=0.01)

        self.assertTrue(scheduler.start_training(force=True))
        scheduler.stop()
        self.assertTrue(scheduler.start_training())
        scheduler.stop()
        self.assertEqual(train_fn.call_count, 2)

    def test_graceful_shutdown_waits_for_active_training(self):
        data_path = self.make_data_file()
        started = threading.Event()
        release = threading.Event()

        def train_job():
            started.set()
            release.wait(timeout=1)

        scheduler = train.TrainingScheduler(train_job, data_path, interval_seconds=60)
        runner = threading.Thread(target=scheduler.run)
        runner.start()
        self.assertTrue(started.wait(timeout=1))
        scheduler.request_stop()
        release.set()
        runner.join(timeout=1)
        self.assertFalse(runner.is_alive())


if __name__ == "__main__":
    unittest.main()
