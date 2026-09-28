"""Bounded read-only smoke load against a local/staging API, using stdlib only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from time import perf_counter
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:6752/api')
    parser.add_argument('--requests', type=int, default=200)
    parser.add_argument('--workers', type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.requests <= 10000 or not 1 <= args.workers <= 100:
        parser.error('Use 1..10000 requests and 1..100 workers')

    def request(_):
        start = perf_counter()
        try:
            with urlopen(args.base.rstrip('/') + '/events?limit=50', timeout=10) as response:
                response.read()
                ok = response.status == 200
        except Exception:
            ok = False
        return (perf_counter() - start) * 1000, ok

    start = perf_counter()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(request, range(args.requests)))
    elapsed = perf_counter() - start
    times = sorted(r[0] for r in results)
    print(json.dumps({'requests': len(results), 'errors': sum(not r[1] for r in results),
                      'rps': round(len(results) / elapsed, 2),
                      'p50_ms': round(times[int((len(times)-1)*.50)], 2),
                      'p95_ms': round(times[int((len(times)-1)*.95)], 2)}))


if __name__ == '__main__':
    main()
