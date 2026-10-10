#!/usr/bin/env python3
"""Wear OS measurements. The resource-only face APK is not the renderer process."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import statistics
import struct
import subprocess
import sys
import time
import shutil
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


def run(argv, *, input=None, timeout=30, optional=False):
    result = subprocess.run(argv, input=input, capture_output=True, timeout=timeout)
    if result.returncode and not optional:
        raise RuntimeError(f'{argv[0]} failed ({result.returncode}): {result.stderr.decode(errors="replace").strip()}')
    return result


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def fingerprint(face):
    files = [face / 'watchface.xml']
    for name in ('assets', 'fonts'):
        if (face / name).exists():
            files += sorted(p for p in (face / name).rglob('*') if p.is_file())
    if (face / 'strings.xml').exists():
        files.append(face / 'strings.xml')
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.relative_to(face).as_posix().encode() + b'\0')
        digest.update(path.read_bytes())
    return digest.hexdigest()


def inspect_face(face):
    root = ET.parse(face / 'watchface.xml').getroot()
    expressions, layers, images = [], [], {}
    def visit(el, path, condition_depth):
        path += '/' + (el.get('name') or el.tag)
        depth = condition_depth + int(el.tag == 'Condition')
        values = list(el.attrib.items())
        if el.tag == 'Expression':
            values.append(('text', el.text or ''))
        for name, value in values:
            sources = sorted(set(re.findall(r'\[([^\]]+)\]', value)))
            if sources:
                expressions.append({'path': path, 'attribute': name, 'sources': sources,
                                    'conditionDepth': depth, 'characters': len(value),
                                    'transcendentalCalls': len(re.findall(r'\b(?:pow|sin|cos|tan|sqrt)\s*\(', value))})
        if el.get('renderMode') in ('SOURCE', 'MASK') or el.get('blendMode'):
            width, height = float(el.get('width', root.get('width', '0'))), float(el.get('height', root.get('height', '0')))
            layers.append({'path': path, 'renderMode': el.get('renderMode'),
                           'declaredRgbaBytes': int(width * height * 4)})
        for child in el:
            visit(child, path, depth)
    visit(root, '', 0)
    for path in sorted((face / 'assets').rglob('*.png')):
        data = path.read_bytes()
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Invalid PNG: {path}')
        width, height = struct.unpack('>II', data[16:24])
        images[path.relative_to(face).as_posix()] = {'width': width, 'height': height,
                                                  'decodedRgbaBytes': width * height * 4,
                                                  'diskBytes': len(data)}
    millis = [e for e in expressions if 'MILLISECOND' in e['sources']]
    return {'kind': 'static-wff-cost-inventory', 'faceSha256': fingerprint(face),
            'limitations': ['Not native frame timing, power measurement, or the official WFF memory evaluator.',
                            'All XML branches/assets are inventoried; visibility, caching, cropping and native subscriptions are not simulated.',
                            'Condition nesting does not prove an expression stops updating on Wear OS.'],
            'xmlBytes': (face / 'watchface.xml').stat().st_size,
            'millisecondExpressionCount': len(millis),
            'ungatedMillisecondExpressions': [e for e in millis if e['conditionDepth'] == 0],
            'decodedPngRgbaBytes': sum(i['decodedRgbaBytes'] for i in images.values()),
            'declaredLayerRgbaBytes': sum(i['declaredRgbaBytes'] for i in layers),
            'layers': layers, 'images': images,
            'expressionHotspots': sorted(expressions, key=lambda e: (e['transcendentalCalls'], e['characters']), reverse=True)[:30]}


def config(duration, process):
    process = json.dumps(process)
    return f'''duration_ms: {round(duration * 1000)}
buffers {{ size_kb: 32768 fill_policy: RING_BUFFER }}
data_sources {{ config {{ name: "linux.ftrace" ftrace_config {{
  ftrace_events: "sched/sched_switch"
  ftrace_events: "sched/sched_waking"
  ftrace_events: "power/cpu_frequency"
  ftrace_events: "power/cpu_idle"
  atrace_categories: "gfx"
  atrace_categories: "view"
  atrace_categories: "wm"
  atrace_apps: {process}
}} }} }}
data_sources {{ config {{ name: "linux.process_stats" process_stats_config {{ scan_all_processes_on_start: true }} }} }}
data_sources {{ config {{ name: "android.surfaceflinger.frametimeline" }} }}
'''


def adb(args, *command, **kwargs):
    return run([args.adb, '-s', args.serial, *command], **kwargs)


def shell(args, *command, **kwargs):
    return adb(args, 'shell', *command, **kwargs).stdout.decode(errors='replace').strip()


def capture(args):
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+', args.process):
        raise ValueError('Use the exact renderer process name from discover')
    if not re.fullmatch(r'[A-Za-z0-9_.]+', args.package):
        raise ValueError('Invalid face package')
    features = shell(args, 'pm', 'list', 'features')
    if 'android.hardware.type.watch' not in features:
        raise ValueError('Target is not a Wear OS watch')
    package = shell(args, 'dumpsys', 'package', args.package)
    if f'Package [{args.package}]' not in package:
        raise ValueError('Face package is not installed')
    pid = shell(args, 'pidof', args.process)
    if not re.fullmatch(r'\d+', pid):
        raise ValueError('Renderer must resolve to exactly one running process; inspect discover output')
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=False)
    face = Path(args.face).resolve()
    manifest = {'schemaVersion': 1, 'kind': 'wear-os-native-capture', 'label': args.label,
                'scenario': args.scenario, 'mode': args.mode, 'spool': args.spool,
                'serial': args.serial, 'package': args.package, 'rendererProcess': args.process,
                'rendererPid': int(pid), 'layerFilter': args.layer, 'faceSha256': fingerprint(face),
                'buildFingerprint': shell(args, 'getprop', 'ro.build.fingerprint'),
                'model': shell(args, 'getprop', 'ro.product.model'),
                'androidVersion': shell(args, 'getprop', 'ro.build.version.release'),
                'isEmulator': shell(args, 'getprop', 'ro.kernel.qemu') == '1',
                'requestedDurationSeconds': args.duration, 'refreshHz': args.refresh_hz,
                'declarations': 'scenario, mode, spool and refreshHz are operator supplied; verify screenshots and raw state',
                'powerMeasurement': None}
    installed = shell(args, 'pm', 'path', args.package).splitlines()
    base = next((line[8:] for line in installed if line.endswith('/base.apk') and line.startswith('package:')), None)
    if not base:
        raise ValueError('Cannot identify the installed face APK')
    adb(args, 'pull', base, str(out / 'installed.apk'))
    manifest['apkSha256'] = hashlib.sha256((out / 'installed.apk').read_bytes()).hexdigest()
    if args.apk and manifest['apkSha256'] != hashlib.sha256(Path(args.apk).read_bytes()).hexdigest():
        raise ValueError('Installed APK differs from --apk')
    with zipfile.ZipFile(out / 'installed.apk') as archive:
        if archive.read('res/raw/watchface.xml') != (face / 'watchface.xml').read_bytes():
            raise ValueError('Installed APK XML differs from --face; install the intended version first')
    manifest['installedXmlVerified'] = True
    def snapshot(phase):
        for name, command in {'wallpaper': ['dumpsys', 'wallpaper'], 'display': ['dumpsys', 'display'],
                              'power': ['dumpsys', 'power'], 'battery': ['dumpsys', 'battery'],
                              'thermal': ['dumpsys', 'thermalservice'], 'meminfo': ['dumpsys', 'meminfo', pid]}.items():
            result = adb(args, 'shell', *command, optional=True)
            (out / f'{name}-{phase}.txt').write_bytes(result.stdout + result.stderr)
        result = adb(args, 'exec-out', 'screencap', '-p', optional=True)
        if result.returncode == 0:
            (out / f'screen-{phase}.png').write_bytes(result.stdout)
    snapshot('before')
    (out / 'package.txt').write_text(package)
    dump(out / 'static-costs.json', inspect_face(face))
    if args.start_clock:
        deadline = time.monotonic() + args.wait_timeout
        while shell(args, 'date', '+%H:%M:%S') != args.start_clock:
            if time.monotonic() >= deadline:
                raise RuntimeError('Timed out waiting for device clock; no performance result produced')
            time.sleep(0.1)
    elif args.start_second is not None:
        deadline = time.monotonic() + args.wait_timeout
        while int(shell(args, 'date', '+%S')) != args.start_second:
            if time.monotonic() >= deadline:
                raise RuntimeError('Timed out waiting for device seconds')
            time.sleep(0.1)
    manifest['capturedAt'] = datetime.now(timezone.utc).isoformat()
    if args.wake:
        shell(args, 'input', 'keyevent', '224')
    manifest['deviceStartTime'] = shell(args, 'date', '+%Y-%m-%dT%H:%M:%S%z')
    trace_config = config(args.duration, args.process)
    (out / 'perfetto.pbtxt').write_text(trace_config)
    dump(out / 'capture.json', manifest)
    trace = f'/data/misc/perfetto-traces/wff-{time.time_ns()}.pftrace'
    try:
        result = adb(args, 'shell', 'perfetto', '--txt', '-c', '-', '-o', trace,
                     input=trace_config.encode(), timeout=args.duration + 30)
        (out / 'perfetto-log.txt').write_bytes(result.stdout + result.stderr)
        adb(args, 'pull', trace, str(out / 'native.pftrace'))
    finally:
        adb(args, 'shell', 'rm', '-f', trace, optional=True)
    manifest['deviceEndTime'] = shell(args, 'date', '+%Y-%m-%dT%H:%M:%S%z')
    manifest['rendererPidAfter'] = shell(args, 'pidof', args.process)
    snapshot('after')
    dump(out / 'capture.json', manifest)
    print(f'Captured {out}. Analyze the native trace before comparing runs.')


def stage_scenario(args):
    face, out = Path(args.face).resolve(), Path(args.output).resolve()
    if out == face or face in out.parents or out.exists():
        raise ValueError('Scenario output must be a new directory outside the canonical face')
    shutil.copytree(face, out)
    minute = {'one-slot': 8, 'two-slots': 9, 'three-slots': 59}[args.scenario]
    path = out / 'watchface.xml'
    original = path.read_text()
    xml = original.replace('[HOUR_1_12]', '12' if minute == 59 else '10').replace('[MINUTE]', str(minute))
    if args.spool is not None:
        root = ET.fromstring(original)
        configuration = root.find("./UserConfigurations/ColorConfiguration[@id='spool']")
        if configuration is None:
            raise ValueError('--spool requires the thread-portrait spool configuration')
        option = configuration.find(f"./ColorOption[@id='{args.spool}']")
        if option is None:
            raise ValueError('Unknown spool')
        for index, color in enumerate(option.get('colors', '').split()):
            xml = xml.replace(f'[CONFIGURATION.spool.{index}]', color)
        xml = xml.replace('[CONFIGURATION.spool]', str(args.spool))
    path.write_text(xml)
    dump(out / 'scenario.json', {'kind': 'native-wff-forced-rollover', 'scenario': args.scenario,
                                 'canonicalFaceSha256': fingerprint(face), 'stagedFaceSha256': fingerprint(out),
                                 'injectedSources': {'HOUR_1_12': 12 if minute == 59 else 10, 'MINUTE': minute},
                                 'spool': args.spool,
                                 'preservedSources': ['SECOND', 'MILLISECOND'],
                                 'limitations': 'Repeats the transition once a minute, resetting to the old layout at :00. Measure :56 through :59.9; exclude the artificial :00 reset.'})
    if args.gradle_init:
        quoted = json.dumps(str(out))
        Path(args.gradle_init).write_text(f'''gradle.projectsEvaluated {{
    def face = new File({quoted})
    gradle.rootProject.project(':watchface').tasks.matching {{ it.name.startsWith('stage') && it.name.endsWith('WatchFace') }}.configureEach {{
        xml.set(new File(face, 'watchface.xml'))
        assets.set(new File(face, 'assets'))
        strings.set(new File(face, 'strings.xml'))
    }}
}}
''')
    print(f'Staged {args.scenario} in {out}; canonical files were not modified.')


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def query(tp, trace, sql, out):
    result = run([tp, '-Q', sql, str(trace)], timeout=120)
    out.write_bytes(result.stdout)
    return list(csv.DictReader(io.StringIO(result.stdout.decode())))


def percentile(values, p):
    if not values:
        return None
    values = sorted(values)
    return values[max(0, math.ceil(len(values) * p) - 1)]


def frame_metrics(rows):
    if not rows:
        return None
    if any(row.get('jank_type') in (None, '', '[NULL]', 'NULL', 'Unknown') for row in rows):
        raise ValueError('FrameTimeline lacks jank classifications')
    durations = [float(row['dur']) / 1e6 for row in rows]
    budgets = [float(row['expected_dur']) / 1e6 for row in rows if row.get('expected_dur') not in (None, '', '[NULL]', 'NULL')]
    return {'frameCount': len(rows), 'jankyFrames': sum(row['jank_type'] != 'None' for row in rows),
            'jankPercent': 100 * sum(row['jank_type'] != 'None' for row in rows) / len(rows),
            'frameDurationMedianMs': statistics.median(durations),
            'frameDurationP95Ms': percentile(durations, .95),
            'expectedBudgetMedianMs': statistics.median(budgets) if budgets else None,
            'scope': 'selected surface frames; FrameTimeline duration includes scheduling/presentation, not just draw time'}


def memory_pss(text):
    match = re.search(r'TOTAL PSS:\s*(\d+)', text) or re.search(r'^\s*TOTAL\s+(\d+)\s', text, re.M)
    return int(match[1]) if match else None


def analyze(args):
    out = Path(args.run)
    meta = json.loads((out / 'capture.json').read_text())
    if meta.get('kind') != 'wear-os-native-capture':
        raise ValueError('Only native captures can produce a native report')
    if str(meta['rendererPid']) != meta.get('rendererPidAfter'):
        raise ValueError('Renderer restarted during the run; discard this capture')
    trace = out / 'native.pftrace'
    pid = int(meta['rendererPid'])
    process = literal(meta['rendererProcess'])
    bounds = query(args.trace_processor, trace, 'SELECT start_ts, end_ts FROM trace_bounds', out / 'bounds.csv')[0]
    start, end = int(bounds['start_ts']), int(bounds['end_ts'])
    timing = query(args.trace_processor, trace,
                   "SELECT int_value FROM metadata WHERE name = 'tracing_started_ns'", out / 'timing.csv')
    if not timing:
        raise ValueError('Trace has no recording start marker')
    start = int(timing[0]['int_value'])
    end = min(end, start + round(meta['requestedDurationSeconds'] * 1e9))
    if args.second_window:
        low, high = args.second_window
        if not 0 <= low < high <= 60:
            raise ValueError('second-window must satisfy 0 <= start < end <= 60')
        clock = query(args.trace_processor, trace,
                      "SELECT ts, clock_value FROM clock_snapshot WHERE clock_name = 'REALTIME' ORDER BY ts LIMIT 1",
                      out / 'clock.csv')
        if not clock:
            raise ValueError('No realtime clock mapping; cannot isolate rollover')
        offset = int(clock[0]['clock_value']) - int(clock[0]['ts'])
        minute = ((start + offset) // 60_000_000_000) * 60_000_000_000
        window_start = minute + round(low * 1e9) - offset
        window_end = minute + round(high * 1e9) - offset
        if window_start < start:
            if window_end <= start:
                window_start += 60_000_000_000
                window_end += 60_000_000_000
        if window_start < start or window_end > end:
            raise ValueError('Capture does not fully cover the requested seconds window')
        start, end = window_start, window_end
    meta['analysisSecondWindow'] = args.second_window
    meta['artifactsReviewed'] = args.reviewed_artifacts
    frames = query(args.trace_processor, trace, f'''
SELECT a.id, a.ts, a.dur, a.jank_type, a.on_time_finish, a.present_type,
       a.layer_name, a.surface_frame_token,
       (SELECT MAX(e.dur) FROM expected_frame_timeline_slice e
        WHERE e.upid = a.upid AND e.surface_frame_token = a.surface_frame_token
          AND e.layer_name = a.layer_name) AS expected_dur
FROM actual_frame_timeline_slice a JOIN process p USING (upid)
WHERE p.pid = {pid} AND p.name = {process}
  AND a.surface_frame_token != 0 AND a.dur > 0
  AND a.ts >= {start} AND a.ts + a.dur <= {end}
  AND instr(a.layer_name, {literal(meta['layerFilter'])}) > 0
ORDER BY a.ts
''', out / 'frames.csv')
    seconds = (end - start) / 1e9
    if seconds <= 0:
        raise ValueError('Empty trace')
    cpu = query(args.trace_processor, trace, f'''
SELECT t.name, SUM(MIN(s.ts + s.dur, {end}) - MAX(s.ts, {start})) / 1000000.0 AS cpu_ms
FROM sched s JOIN thread t USING (utid) JOIN process p USING (upid)
WHERE p.pid = {pid} AND p.name = {process} AND s.dur > 0
  AND s.ts < {end} AND s.ts + s.dur > {start}
GROUP BY t.name ORDER BY cpu_ms DESC
''', out / 'cpu.csv')
    stats = query(args.trace_processor, trace,
                  "SELECT name, idx, value, severity FROM stats WHERE value != 0 AND severity IN ('error', 'data_loss')",
                  out / 'trace-health.csv')
    cpu_ms = sum(float(row['cpu_ms']) for row in cpu) if cpu else None
    issues = [f'Trace health: {row["name"]}={row["value"]}' for row in stats]
    if not meta.get('installedXmlVerified'):
        issues.append('Installed XML provenance was not verified.')
    if not args.reviewed_artifacts:
        issues.append('Review active face, display mode and thermal artifacts, then analyze with --reviewed-artifacts.')
    if not frames:
        issues.append('No frames on the selected renderer/surface. Missing evidence is not zero jank.')
    if not cpu:
        issues.append('No renderer scheduler slices. Missing evidence is not zero CPU use.')
    if not args.second_window and seconds < meta['requestedDurationSeconds'] * .9:
        issues.append('Trace is shorter than the requested capture window.')
    metrics = frame_metrics(frames)
    if metrics and metrics['expectedBudgetMedianMs'] is None:
        issues.append('No expected frame budgets for the selected surface.')
    report = {'schemaVersion': 1, 'kind': 'wear-os-native-performance', 'capture': meta,
              'traceSha256': hashlib.sha256(trace.read_bytes()).hexdigest(),
              'durationSeconds': seconds, 'frames': metrics,
              'rendererCpuMs': cpu_ms, 'rendererCpuMsPerSecond': cpu_ms / seconds if cpu_ms is not None else None,
              'rendererPssKbBefore': memory_pss((out / 'meminfo-before.txt').read_text()),
              'rendererPssKbAfter': memory_pss((out / 'meminfo-after.txt').read_text()),
              'powerMeasurement': None, 'issues': issues, 'validForComparison': not issues,
              'limitations': ['Renderer CPU/PSS can include shared runtime work; they are not exclusive face cost.',
                              'Scenario, spool, display state, thermal state and active face require review of capture artifacts.',
                              'CPU work is a battery-relevant proxy, not battery-life or energy measurement.',
                              'Emulator results do not establish physical-watch performance.']}
    dump(out / 'report.json', report)
    print(json.dumps(report, indent=2))


def comparison(before, after):
    reports = before + after
    if len(before) < 3 or len(after) < 3:
        raise ValueError('At least three native runs per version are required')
    keys = ('serial', 'buildFingerprint', 'rendererProcess', 'package', 'layerFilter',
            'scenario', 'mode', 'spool', 'refreshHz', 'isEmulator', 'requestedDurationSeconds', 'analysisSecondWindow')
    for report in reports:
        if report.get('kind') != 'wear-os-native-performance' or not report.get('validForComparison'):
            raise ValueError('Every run must be a valid native performance report')
        for key in keys:
            if key not in report['capture'] or report['capture'][key] != reports[0]['capture'][key]:
                raise ValueError(f'Incompatible native runs: {key}')
        if not report['capture'].get('installedXmlVerified') or not report['capture'].get('artifactsReviewed'):
            raise ValueError('Installed XML verification and artifact review are required')
        if not report.get('frames') or report.get('rendererCpuMsPerSecond') is None:
            raise ValueError('Frame and CPU evidence are required')
    for group in (before, after):
        if len({r['capture']['faceSha256'] for r in group}) != 1:
            raise ValueError('Do not mix different face versions within a run group')
    if len({r['traceSha256'] for r in reports}) != len(reports):
        raise ValueError('Duplicate traces are not independent runs')
    budget = [r['frames']['expectedBudgetMedianMs'] for r in reports]
    if any(v is None for v in budget) or max(budget) / min(budget) > 1.05:
        raise ValueError('Native frame budgets differ or are missing')
    result = {'kind': 'wear-os-native-comparison', 'beforeRuns': len(before), 'afterRuns': len(after),
              'scenario': reports[0]['capture']['scenario'], 'isEmulator': reports[0]['capture']['isEmulator'],
              'metrics': {}, 'powerMeasurement': None,
              'limitations': ['Medians and ranges across repeated runs; no significance or battery-life claim.',
                              'Review screenshots, wallpaper/display/power and thermal logs for comparable conditions.']}
    getters = {'jankPercent': lambda r: r['frames']['jankPercent'],
               'frameDurationP95Ms': lambda r: r['frames']['frameDurationP95Ms'],
               'rendererCpuMsPerSecond': lambda r: r['rendererCpuMsPerSecond']}
    for name, getter in getters.items():
        b, a = [getter(r) for r in before], [getter(r) for r in after]
        bm, am = statistics.median(b), statistics.median(a)
        result['metrics'][name] = {'beforeMedian': bm, 'afterMedian': am,
                                   'beforeRange': [min(b), max(b)], 'afterRange': [min(a), max(a)],
                                   'changePercent': (am / bm - 1) * 100 if bm else None}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    inspect = commands.add_parser('inspect-face', help='Static cost inventory; no native timing claim')
    inspect.add_argument('face')
    inspect.add_argument('--output')
    discover = commands.add_parser('discover', help='Find the actual renderer process and wallpaper surface')
    stage = commands.add_parser('stage-scenario', help='Force a rollover without changing the device clock')
    stage.add_argument('face')
    stage.add_argument('--scenario', choices=('one-slot', 'two-slots', 'three-slots'), required=True)
    stage.add_argument('--output', required=True)
    stage.add_argument('--gradle-init', help='Write an init script overriding watches StageWatchFace inputs')
    stage.add_argument('--spool', choices=[str(i) for i in range(9)], help='Freeze thread-portrait colours and weight selection')
    capture_parser = commands.add_parser('capture', help='Record an already installed and selected watch face')
    for target in (discover, capture_parser):
        target.add_argument('--serial', required=True)
        target.add_argument('--adb', default='adb')
    for name in ('package', 'process', 'layer', 'face', 'label', 'scenario', 'spool', 'output'):
        capture_parser.add_argument('--' + name, required=True)
    capture_parser.add_argument('--mode', choices=('interactive', 'ambient'), required=True)
    capture_parser.add_argument('--refresh-hz', type=float, required=True)
    capture_parser.add_argument('--duration', type=float, default=30)
    capture_parser.add_argument('--apk')
    capture_parser.add_argument('--wake', action='store_true', help='Wake immediately before an interactive capture')
    capture_parser.add_argument('--start-clock', help='Device-local HH:MM:SS; wait at most --wait-timeout seconds')
    capture_parser.add_argument('--start-second', type=int, help='Start at this device second in the next minute')
    capture_parser.add_argument('--wait-timeout', type=float, default=65)
    analyze_parser = commands.add_parser('analyze')
    analyze_parser.add_argument('run')
    analyze_parser.add_argument('--trace-processor', default='trace_processor_shell')
    analyze_parser.add_argument('--reviewed-artifacts', action='store_true', help='Attest that active face, mode and thermal artifacts were reviewed')
    analyze_parser.add_argument('--second-window', nargs=2, type=float, help='Isolate device seconds in a minute using trace clock snapshots')
    compare_parser = commands.add_parser('compare')
    compare_parser.add_argument('--before', nargs='+', required=True, help='report.json paths')
    compare_parser.add_argument('--after', nargs='+', required=True, help='report.json paths')
    compare_parser.add_argument('--output')
    args = parser.parse_args()
    if args.command == 'inspect-face':
        result = inspect_face(Path(args.face).resolve())
    elif args.command == 'stage-scenario':
        stage_scenario(args)
        return
    elif args.command == 'discover':
        for command in (('getprop', 'ro.build.fingerprint'), ('dumpsys', 'wallpaper'),
                        ('ps', '-A', '-o', 'PID,NAME'), ('dumpsys', 'SurfaceFlinger', '--list')):
            print(shell(args, *command))
        return
    elif args.command == 'capture':
        if not 3 <= args.duration <= 60 or not math.isfinite(args.refresh_hz) or args.refresh_hz <= 0:
            parser.error('duration must be 3–60 seconds; refresh-hz must be finite and positive')
        if args.start_clock and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d', args.start_clock):
            parser.error('start-clock must be HH:MM:SS')
        if args.wake and args.mode != 'interactive':
            parser.error('--wake changes ambient state; use it only for interactive runs')
        if args.start_second is not None and (not 0 <= args.start_second <= 59 or args.start_clock):
            parser.error('start-second must be 0–59 and cannot be combined with start-clock')
        capture(args)
        return
    elif args.command == 'analyze':
        analyze(args)
        return
    else:
        result = comparison([json.loads(Path(p).read_text()) for p in args.before],
                            [json.loads(Path(p).read_text()) for p in args.after])
    if args.output:
        dump(Path(args.output), result)
    else:
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as error:
        sys.exit(str(error))
