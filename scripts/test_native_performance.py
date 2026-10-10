import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import native_performance as perf


def report(index, version='before'):
    return {'kind': 'wear-os-native-performance', 'validForComparison': True,
            'traceSha256': f'{version}-{index}',
            'capture': {'installedXmlVerified': True, 'artifactsReviewed': True, 'serial': 'watch', 'buildFingerprint': 'build', 'rendererProcess': 'runtime',
                        'package': 'face', 'layerFilter': 'Wallpaper', 'scenario': 'three-slots',
                        'mode': 'interactive', 'spool': '0', 'refreshHz': 60, 'isEmulator': False,
                        'requestedDurationSeconds': 6, 'faceSha256': version, 'analysisSecondWindow': [58, 60]},
            'frames': {'jankPercent': 0, 'frameDurationP95Ms': 14, 'expectedBudgetMedianMs': 16.67},
            'rendererCpuMsPerSecond': 80}


class NativePerformanceTests(unittest.TestCase):
    def test_missing_frames_are_not_zero_jank(self):
        self.assertIsNone(perf.frame_metrics([]))

    def test_unknown_jank_is_rejected(self):
        with self.assertRaises(ValueError):
            perf.frame_metrics([{'jank_type': 'Unknown'}])

    def test_native_frame_metrics(self):
        rows = [{'dur': str(n * 1e6), 'expected_dur': '16670000', 'jank_type': jank}
                for n, jank in [(8, 'None'), (12, 'None'), (25, 'App Deadline Missed')]]
        result = perf.frame_metrics(rows)
        self.assertEqual(result['jankyFrames'], 1)
        self.assertAlmostEqual(result['jankPercent'], 100 / 3)
        self.assertEqual(result['frameDurationP95Ms'], 25)

    def test_memory_formats(self):
        self.assertEqual(perf.memory_pss('TOTAL PSS: 57915 TOTAL RSS: 92349'), 57915)
        self.assertEqual(perf.memory_pss('   TOTAL   421  22  32'), 421)
        self.assertIsNone(perf.memory_pss('Permission denied'))

    def test_browser_report_rejected(self):
        rows = [report(i) for i in range(3)]
        rows[0]['kind'] = 'browser-performance'
        with self.assertRaises(ValueError):
            perf.comparison(rows, [report(i, 'after') for i in range(3)])

    def test_missing_evidence_rejected(self):
        rows = [report(i) for i in range(3)]
        rows[0]['frames'] = None
        with self.assertRaises(ValueError):
            perf.comparison(rows, [report(i, 'after') for i in range(3)])

    def test_unverified_or_unreviewed_capture_rejected(self):
        for key in ('installedXmlVerified', 'artifactsReviewed'):
            before = [report(i) for i in range(3)]
            before[0]['capture'][key] = False
            with self.subTest(key=key), self.assertRaises(ValueError):
                perf.comparison(before, [report(i, 'after') for i in range(3)])

    def test_mismatched_conditions_rejected(self):
        for key, value in [('spool', '2'), ('serial', 'other'), ('analysisSecondWindow', None), ('isEmulator', True)]:
            before, after = [report(i) for i in range(3)], [report(i, 'after') for i in range(3)]
            after[0]['capture'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                perf.comparison(before, after)

    def test_duplicate_capture_rejected(self):
        with self.assertRaises(ValueError):
            perf.comparison([report(0)] * 3, [report(i, 'after') for i in range(3)])

    def test_refresh_budget_mismatch_rejected(self):
        after = [report(i, 'after') for i in range(3)]
        after[0]['frames']['expectedBudgetMedianMs'] = 33.3
        with self.assertRaises(ValueError):
            perf.comparison([report(i) for i in range(3)], after)

    def test_compare_repeated_runs_zero_baseline(self):
        before, after = [report(i) for i in range(3)], [report(i, 'after') for i in range(3)]
        for r in after:
            r['rendererCpuMsPerSecond'] = 40
        result = perf.comparison(before, after)
        self.assertIsNone(result['metrics']['jankPercent']['changePercent'])
        self.assertEqual(result['metrics']['rendererCpuMsPerSecond']['changePercent'], -50)
        self.assertIsNone(result['powerMeasurement'])

    def test_scenario_preserves_native_cadence_and_canonical_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            face = root / 'canonical'
            face.mkdir()
            xml = '<WatchFace><Scene><Transform value="[HOUR_1_12]+[MINUTE]+[SECOND]+[MILLISECOND]"/></Scene></WatchFace>'
            (face / 'watchface.xml').write_text(xml)
            before = perf.fingerprint(face)
            args = SimpleNamespace(face=str(face), output=str(root / 'staged'), scenario='three-slots', gradle_init=None, spool=None)
            perf.stage_scenario(args)
            staged = (root / 'staged' / 'watchface.xml').read_text()
            self.assertIn('12+59+[SECOND]+[MILLISECOND]', staged)
            self.assertEqual(before, perf.fingerprint(face))
            with self.assertRaises(ValueError):
                perf.stage_scenario(args)

    def test_static_inventory_exposes_ungated_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            face = Path(directory)
            (face / 'watchface.xml').write_text('<WatchFace width="450" height="450"><Scene><Group renderMode="MASK"><Transform value="sin([MILLISECOND])"/></Group></Scene></WatchFace>')
            inventory = perf.inspect_face(face)
            self.assertEqual(inventory['millisecondExpressionCount'], 1)
            self.assertEqual(len(inventory['ungatedMillisecondExpressions']), 1)
            self.assertEqual(inventory['declaredLayerRgbaBytes'], 450 * 450 * 4)
            self.assertEqual(inventory['kind'], 'static-wff-cost-inventory')


if __name__ == '__main__':
    unittest.main()
