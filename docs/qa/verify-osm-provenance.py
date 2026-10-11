# -*- coding: utf-8 -*-
"""
Independent OpenStreetMap provenance check of the Planner data (planner-data.json)
==================================================================================
Verifies every Planner place against the Geofabrik extracts it names, offline: no geocoder, no Google,
no network. It reads only this repository and the extracts you supply.

What it checks
  extracts      each supplied file matches its official Geofabrik MD5 and its header carries the data date
  active        coordSource names an OSM object that exists in that extract, at the recorded version;
                the final point follows the recorded method:
                  existing_representative_point_within_osm_geometry  point kept, and inside the polygon
                  existing_point_within_tolerance_of_osm_object      point kept, and within 25 m of the object
                  direct_place_object / entrance_or_station (node)   the object's own location
                  geometry_centroid / entrance_or_station (polygon)  centroid (representative point if outside)
                  geometry_representative_point                      shapely representative_point
                  nearest_point_on_geometry, derived_entrance_...    nearest point of the object to the prior point
                  street_intersection                                intersection of the two recorded ways
                precision agrees with the OSM accuracy (exact -> exact, approximate -> approx)
  moves         a coordinate differs from the pre-remediation point only for the exact transitions in
                approved-coordinate-changes.json; every other active point is unchanged
  closed        closed places keep their pre-remediation point and are marked not map-eligible
  totals        161 places, 157 active, 4 closed, 118 exact, 39 approximate, 18 moves, 139 preserved
Exit code 0 only if everything passes.

Approved state (management decision of 10 Oct 2026)
  OSM data date  2026-10-08T20:21:06Z (osmosis_replication_timestamp in every file header)
  extracts       download.geofabrik.de/europe/united-kingdom/england/
                   greater-london-261008.osm.pbf  129,400,218 bytes  md5 62e3fe97f93a9fcc279df9f71073d31d
                   berkshire-261008.osm.pbf        22,551,326 bytes  md5 52e1db3c59853eba2033cef7a7fa7132
                   hertfordshire-261008.osm.pbf    39,083,931 bytes  md5 cc663278ea2391e4e3264c5f6eb4be3f
  source         DS-VideoArt/golondon-kids-journal, tag coordinate-remediation-approved-2026-10-10 (17c3c33)

Usage (do not commit the .pbf files or the virtual environment)
  python3 -m venv /tmp/osm-venv && /tmp/osm-venv/bin/pip install osmium shapely
  /tmp/osm-venv/bin/python docs/qa/verify-osm-provenance.py <folder with the three .pbf files>
  /tmp/osm-venv/bin/python docs/qa/verify-osm-provenance.py <folder> --corruption-test
Options
  --data <file>       Planner data to check (default: planner-data.json in this repository)
  --baseline <file>   pre-remediation Planner data (default: git show ea07ff4:planner-data.json)
  --corruption-test   after the real check, corrupts copies in memory and confirms each corruption is caught
Dependencies: pyosmium (import osmium, 4.x) and shapely 2.x. Python standard library otherwise.
"""
import copy, hashlib, json, math, os, subprocess, sys, collections

import osmium
from shapely import wkb as swkb
from shapely.geometry import Point
from shapely.ops import nearest_points, transform

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DATA_DATE = '2026-10-08T20:21:06Z'
EXTRACTS = {
    'greater-london-261008.osm.pbf': '62e3fe97f93a9fcc279df9f71073d31d',
    'berkshire-261008.osm.pbf': '52e1db3c59853eba2033cef7a7fa7132',
    'hertfordshire-261008.osm.pbf': 'cc663278ea2391e4e3264c5f6eb4be3f',
}
PRE_REMEDIATION_REF = 'ea07ff4'
EXPECT = {'places': 161, 'active': 157, 'closed': 4, 'exact': 118, 'approximate': 39, 'moved': 18, 'preserved': 139}
KX, KY = 111320 * math.cos(math.radians(51.5)), 110540


def metres(a, b):
    t = lambda x, y, z=None: (x * KX, y * KY)
    return transform(t, a).distance(transform(t, b))


def haversine(lat1, lon1, lat2, lon2):
    r, p1, p2 = 6371008.8, math.radians(lat1), math.radians(lat2)
    return 2 * r * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2))


class Collect(osmium.SimpleHandler):
    def __init__(self, want):
        super().__init__()
        self.want, self.geom, self.ver, self.f = want, {}, {}, osmium.geom.WKBFactory()

    def node(self, n):
        k = ('node', n.id)
        if k in self.want:
            self.geom[k] = [self.f.create_point(n)]
            self.ver[k] = n.version

    def way(self, w):
        k = ('way', w.id)
        if k in self.want:
            self.ver[k] = w.version
            try:
                self.geom.setdefault(k, []).append(self.f.create_linestring(w))
            except Exception:
                pass

    def area(self, a):
        k = ('way' if a.from_way() else 'relation', a.orig_id())
        if k in self.want:
            self.ver[k] = a.version
            self.geom.setdefault(k, []).insert(0, self.f.create_multipolygon(a))


def objects_of(c):
    return [(c['osm_type'], c['osm_id'], c['osm_version'])] + [(o['osm_type'], o['osm_id'], o['osm_version']) for o in c.get('objects', [])[1:]]


def load_osm(folder, places):
    """Checks the extracts and loads the geometry of every object the data names."""
    want = collections.defaultdict(set)
    for a in places:
        if a.get('closed'):
            continue
        c = a.get('coordSource') or {}
        if c.get('extract') and c.get('osm_type') and c.get('osm_id'):
            for t, i, _ in objects_of(c):
                want[c['extract']].add((t, i))
    geom, ver, headers, errors = {}, {}, {}, []
    for ex, md5 in EXTRACTS.items():
        path = os.path.join(folder, ex)
        if not os.path.exists(path):
            errors.append('missing extract ' + ex)
            continue
        h = hashlib.md5()
        with open(path, 'rb') as fh:
            for chunk in iter(lambda: fh.read(1 << 22), b''):
                h.update(chunk)
        if h.hexdigest() != md5:
            errors.append('%s md5 %s != %s' % (ex, h.hexdigest(), md5))
        headers[ex] = osmium.io.Reader(path, osmium.osm.osm_entity_bits.NOTHING).header().get('osmosis_replication_timestamp')
        if headers[ex] != DATA_DATE:
            errors.append('%s header date %s != %s' % (ex, headers[ex], DATA_DATE))
        if want.get(ex):
            col = Collect(want[ex])
            col.apply_file(path, locations=True, idx='flex_mem')
            for k, g in col.geom.items():
                geom[(ex,) + k] = swkb.loads(g[0], hex=True)
            for k, v in col.ver.items():
                ver[(ex,) + k] = v
    return geom, ver, headers, errors


def verify(places, base, approved, geom, ver):
    fails, moves, n = [], [], collections.Counter()
    base_by = {a['id']: a for a in base}

    def bad(pid, m):
        fails.append(pid + ': ' + m)

    n['places'] = len(places)
    if sorted(a['id'] for a in places) != sorted(base_by):
        bad('*', 'place ids differ from the pre-remediation data')
    for a in places:
        pid, c = a['id'], a.get('coordSource') or {}
        b = base_by.get(pid)
        if b is None:
            continue
        prior = Point(b['lng'], b['lat'])
        final = Point(a['lng'], a['lat'])
        moved = (a['lat'], a['lng']) != (b['lat'], b['lng'])
        if a.get('closed'):
            n['closed'] += 1
            if not b.get('closed'):
                bad(pid, 'closed here but not in the pre-remediation data')
            if moved:
                bad(pid, 'closed place point changed')
            if c.get('map_eligible') is not False or c.get('status') != 'closed_not_map_eligible':
                bad(pid, 'closed place must be marked not map-eligible')
            continue
        n['active'] += 1
        errs = []
        if c.get('provider') != 'OpenStreetMap':
            errs.append('no OpenStreetMap provenance')
        else:
            if c.get('source_date') != DATA_DATE:
                errs.append('source_date %s' % c.get('source_date'))
            if c.get('extract') not in EXTRACTS:
                errs.append('unknown extract %s' % c.get('extract'))
            if c.get('objects') and (c['objects'][0]['osm_type'], c['objects'][0]['osm_id']) != (c['osm_type'], c['osm_id']):
                errs.append('objects[0] is not the primary object')
            gs = []
            for t, i, v in objects_of(c):
                k = (c['extract'], t, i)
                if k not in geom:
                    errs.append('%s/%s not found in %s' % (t, i, c['extract']))
                    continue
                if ver.get(k) != v:
                    errs.append('%s/%s version %s != recorded %s' % (t, i, ver.get(k), v))
                gs.append(geom[k])
            m = c.get('method')
            if gs and not errs:
                g = gs[0]
                poly = g.geom_type in ('Polygon', 'MultiPolygon')
                if m == 'existing_representative_point_within_osm_geometry':
                    ok = not moved and poly and g.contains(prior)
                elif m == 'existing_point_within_tolerance_of_osm_object':
                    ok = not moved and metres(prior, g) <= 25
                else:
                    if m == 'direct_place_object' or (m == 'entrance_or_station' and g.geom_type == 'Point'):
                        target = g
                    elif m in ('geometry_centroid', 'entrance_or_station') and poly:
                        target = g.centroid if g.contains(g.centroid) else g.representative_point()
                    elif m == 'geometry_representative_point':
                        target = g.representative_point()
                    elif m in ('nearest_point_on_geometry', 'derived_entrance_nearest_site_point_to_address'):
                        target = nearest_points(g, prior)[0]
                    elif m == 'street_intersection' and len(gs) > 1:
                        target = gs[0].intersection(gs[1])
                    else:
                        target = None
                        errs.append('unknown method ' + str(m))
                    ok = target is not None and not target.is_empty and metres(final, target) < 1
                if not ok:
                    errs.append('final point does not follow ' + str(m))
            acc = c.get('accuracy')
            if acc not in ('exact', 'approximate'):
                errs.append('accuracy %s' % acc)
            else:
                n[acc] += 1
                if a.get('precision') != ('exact' if acc == 'exact' else 'approx'):
                    errs.append('precision %s disagrees with OSM accuracy %s' % (a.get('precision'), acc))
        ap = approved.get(pid)
        if moved:
            n['moved'] += 1
            if not ap or (b['lat'], b['lng']) != (ap['from']['lat'], ap['from']['lng']) or (a['lat'], a['lng']) != (ap['to']['lat'], ap['to']['lng']):
                errs.append('coordinate moved without approval')
            moves.append((pid, b['lat'], b['lng'], a['lat'], a['lng'], round(haversine(b['lat'], b['lng'], a['lat'], a['lng']), 1)))
        else:
            n['preserved'] += 1
            if ap:
                errs.append('approved move not applied')
        for e in errs:
            bad(pid, e)
    for k, v in EXPECT.items():
        if n[k] != v:
            bad('*', '%s = %d, expected %d' % (k, n[k], v))
    return fails, moves, n


def corruptions(places):
    """Each corruption must be caught. (name, mutate)"""
    yield 'wrong OSM version', lambda P: P['british-museum']['coordSource'].__setitem__('osm_version', P['british-museum']['coordSource']['osm_version'] + 1)
    yield 'wrong OSM object id', lambda P: P['tate-modern']['coordSource'].__setitem__('osm_id', 1)
    yield 'unapproved move of a preserved place', lambda P: P['big-ben'].__setitem__('lat', round(P['big-ben']['lat'] + 0.001, 6))
    yield 'approved place moved off its object', lambda P: P['postal-museum'].__setitem__('lng', round(P['postal-museum']['lng'] + 0.0005, 6))
    yield 'precision disagrees with accuracy', lambda P: P['horizon-22'].__setitem__('precision', 'approx')
    yield 'closed place marked map-eligible', lambda P: P['blitz-london']['coordSource'].__setitem__('map_eligible', True)
    yield 'provenance removed', lambda P: P['london-eye'].__setitem__('coordSource', {})
    yield 'method changed', lambda P: P['big-ben']['coordSource'].__setitem__('method', 'geometry_centroid')


def main(argv):
    if not argv or argv[0].startswith('-'):
        sys.exit(__doc__)
    folder, args = argv[0], argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    data_path = opt('--data') or os.path.join(ROOT, 'planner-data.json')
    places = json.load(open(data_path, encoding='utf-8'))['attractions']
    if opt('--baseline'):
        base = json.load(open(opt('--baseline'), encoding='utf-8'))['attractions']
    else:
        base = json.loads(subprocess.run(['git', '-C', ROOT, 'show', PRE_REMEDIATION_REF + ':planner-data.json'],
                                         capture_output=True, check=True).stdout)['attractions']
    approved = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'docs', 'qa', 'approved-coordinate-changes.json'), encoding='utf-8'))['changes']}

    geom, ver, headers, errors = load_osm(folder, places)
    for ex, h in headers.items():
        print('extract %s  header %s' % (ex, h))
    fails, moves, n = verify(places, base, approved, geom, ver)
    fails = errors + fails
    for mv in sorted(moves, key=lambda x: -x[5]):
        print('  moved  %-28s %s,%s -> %s,%s  %.1f m' % mv)
    active_ok = n['active'] - len({f.split(':')[0] for f in fails if not f.startswith('*')} & {a['id'] for a in places if not a.get('closed')})
    closed_ok = n['closed'] - len({f.split(':')[0] for f in fails} & {a['id'] for a in places if a.get('closed')})
    print('\nactive verified %d / %d, closed verified %d / %d | exact %d, approximate %d | moved %d, preserved %d'
          % (active_ok, n['active'], closed_ok, n['closed'], n['exact'], n['approximate'], n['moved'], n['preserved']))
    print('unknown 0, blocked 0, manual review 0: every active place is either verified or listed as a failure')
    print('failures: %d' % len(fails))
    for f in fails:
        print('  FAIL ' + f)
    rc = 1 if fails else 0

    if '--corruption-test' in args:
        print('\ncorruption test')
        missed = 0
        for name, mutate in corruptions(places):
            P = {a['id']: a for a in copy.deepcopy(places)}
            mutate(P)
            caught, _, _ = verify(list(P.values()), base, approved, geom, ver)
            print('  %-40s %s' % (name, ('caught (%d)' % len(caught)) if caught else 'MISSED'))
            missed += not caught
        print('corruptions missed: %d' % missed)
        rc = rc or (1 if missed else 0)
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
