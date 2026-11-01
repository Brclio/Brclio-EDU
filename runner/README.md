# Brclio EDU isolated execution service

This service is the authenticated loopback backend for the Cloudflare `/api/run`
proxy. Anonymous learners never receive its bearer token. It starts one fresh
Docker container per request. Student programs never execute on the host.

## Protocol

`POST /run` (also `/__brclio_edu_runner/run`) accepts JSON:

```json
{
  "language": "cpp",
  "code": "#include <iostream>\nint main(){std::cout << 6;}",
  "stdin": "",
  "files": [{"file_name": "data/example.txt", "content": "example"}],
  "testcases": [{"case_no": 1, "input": "", "output": "6"}]
}
```

Headers: `Authorization: Bearer <RUNNER_TOKEN>`, `Content-Type: application/json`,
`Content-Length`, and trusted `X-Client-Id` (16–128 ASCII alphanumeric, `_`, `-`).
The Cloudflare proxy supplies a hash of the client address. The body cannot supply
the image, compiler, command, resource settings, or container name.

Results include `stdout`, `stderr`, `exitCode`, `timedOut`; compilation errors add
`compileError`. Public cases add `testResults` with `case_no`, `input`,
`expected_output`, `actual_output`, `succeeded`, and `reason`. Output converts CRLF
and lone CR to LF, matching the original API. Judging removes trailing whitespace
only, preserving significant leading space. Stdin bytes retain their CR characters.
`GET /health` reports configured language names and bounds without secrets.

Supported aliases are defined in `protocol.py`: C, C++/cpp, Java, Go/golang/go-1165,
JavaScript/js/node, Python/py/python3/python38, SQL/sqlite, sh/shell/bash,
TypeScript/ts, C#/cs/csharp, Ruby/rb, Rust/rs, PHP, Swift. Swift uses a separately
configured compiler image. The base image reports Swift unavailable if it is not
configured. This is explicit in the response rather than pretending execution
succeeded.

Primary filenames are selected by language; Java public-class and package names
are derived from source declarations. Additional files preserve safe relative
paths. C/C++/Java/C# source attachments compile together; Go compiles `.go` files
in the primary directory (all must be the same package). TypeScript/Rust and
interpreted languages resolve imported local files normally. No dependency
downloads or external network calls are available inside execution.

Python `requests` and `urllib` can read exact URLs from the audited, immutable
classroom fixture manifest. `runner/stage-fixtures.py` copies the public manifest
and referenced bytes into the image build context without fetching anything.
`offline/sitecustomize.py` installs adapters for student Python processes only;
headers and original charset are preserved. Unknown URLs and non-GET/HEAD requests
fail explicitly, and Docker networking remains disabled. These are archived
teaching responses, not live websites. Requests, BeautifulSoup and lxml are supplied
by Debian packages for the crawler examples.
Two old novel-site URLs now serve changed HTML; their teaching fixtures retain
retrieved text but adapt selectors/GBK encoding to the lesson. Manifest `adapted`
metadata and `X-Brclio-Fixture: adapted` distinguish these from unchanged archives.

## Resource and security bounds

- Bind `127.0.0.1:18731`; constant-time bearer comparison; no request/body logs.
- One nonblocking execution slot; busy requests receive 503 with Retry-After.
  A shared advisory lock in the service directory enforces that same limit across
  the HTTP service and explicitly invoked administrator audits.
- At most six accepted requests per trusted client per minute; bounded 2,048-client
  in-memory rate cache. Restart resets the cache. Proxy credentials stay server-side.
- JSON body 256 KiB, code 128 KiB, stdin 64 KiB, at most 32 attachments totaling
  128 KiB, at most eight test cases. All limits count UTF-8 bytes.
- Paths reject absolute names, backslashes, dot/parent/empty segments, NUL and
  control characters. Compiler argv uses absolute paths and never a shell.
- Containers: no network, read-only root, no host volumes or Docker socket,
  non-root UID/GID 65534, all capabilities dropped, no-new-privileges, 64 processes,
  384 MiB RAM including tmpfs, no additional swap, CPU quota 0.35.
- Docker logging driver is disabled; program output is only attached to the
  bounded request pipe, not retained in Docker's disk logs.
- `/work` is a fresh 64 MiB executable tmpfs; `/tmp` is a fresh 32 MiB tmpfs.
  Everything disappears when the container is removed. No learner-code cache.
- Host wall deadline 40 seconds; container shared budget 38 seconds, compile at
  most 30 seconds, each public test at most five seconds within that shared budget.
  Output is bounded to 64 KiB per child process; results are bounded at the host.
- Timeout/output overflow kills the subprocess group and force-removes only this
  request's server-generated container name. Normal completion also removes it.
- A read-only Go standard-library cache is prebuilt into the image; each request
  gets private symlinks plus its own writable tmpfs entries.

Docker is an OS isolation boundary, not a guarantee against kernel/runtime
vulnerabilities. Keep Docker and the host kernel updated. The service itself needs
Docker access; do not expose its loopback port directly to the internet.

## Build and deployment

Python 3.10+ stdlib only on the host. `requirements.txt` intentionally has no pip
dependencies. Deploy the entire `runner/` directory, not only `server.py`.

```sh
python3 runner/stage-fixtures.py
docker buildx build --builder brclio-edu-builder --load -t brclio-edu-runner:1 runner
docker buildx build --builder brclio-edu-builder --load -f runner/Dockerfile.swift -t brclio-edu-swift:1 runner
```

On the small production host, build sequentially with the dedicated builder's
CPU/memory quotas. Do not build or stress-test both images concurrently. Check
actual free disk and image size after each build before starting the next one.
The official Swift 5.10.1 Jammy amd64 image is pinned by digest; its registry layers
total 829,460,706 compressed bytes. Unpacked size and peak memory must be measured
on the deployment host. Runtime-only Swift `-slim` images cannot compile source.

Service environment (token must be a randomly generated secret, never committed):

```text
RUNNER_TOKEN=<at least 32 random characters>
RUNNER_IMAGE=brclio-edu-runner:1
RUNNER_SWIFT_IMAGE=brclio-edu-swift:1
RUNNER_WALL_TIMEOUT=40
```

Set `RUNNER_SWIFT_IMAGE` only after its image passes the same resource-limited
execution smoke test. Start `python /path/to/runner/server.py` from the dedicated
Baota Python project/venv. Configure only a dedicated HTTPS reverse-proxy endpoint
to this service, preserving authorization, Content-Length and X-Client-Id; leave
existing sites unchanged. Configure the matching secret/endpoint only on the
Cloudflare Worker. Do not publish either token to browser assets.

After the trusted toolchain image exists, `Dockerfile.update` can overlay only
reviewed runner code and fixture files from the local build context using a fixed
local base tag, `--pull=false --network none` and the classic builder. It performs
no package installation and adds no host mounts. Apply the same build CPU/memory
limits and retain the previously verified image until the replacement passes.

## Verification

Local validation (no Docker and no student program execution):

```sh
python3 -m unittest discover -s tests -p 'runner_test.py' -v
```

It covers real HTTP authentication, byte/path/schema limits, per-client rate limit,
nonblocking busy behavior, safe Docker argv/cleanup names, compiler file selection,
leading-whitespace judging, and process cancellation/output bounds using authored
plumbing fixtures. It does not establish that compilers work inside Docker.

On the deployed host, export the token without echoing it and run:

```sh
python3 tests/runner_smoke.py --base http://127.0.0.1:18731
```

This sends only authored fixtures through HTTP and the actual isolated containers,
using separate trusted test-client identifiers, and checks stdout, exit status and
public-case correctness. `--languages c,cpp,java,go-1165` selects a subset. Tokens
and submitted source are not printed. Also verify timeout, output flood, denied
network, read-only-root, non-root identity and a multiprocessing example before
claiming production isolation coverage.

The repository's 1,190 lesson-page attachment scan found 36 `python3`, 13
`python38` and one `shell` component with attachments, and no C/C++/Java/Go
attachment components. The sole Swift template is the optional Swift tab in
`public/content/pages/005-205.json`; the smoke fixture reproduces its `add(2,4)`.

## Full native-course execution audit

`native-audit.py --prepare` reads all public lesson/challenge JSON and writes a
deduplicated plan. It uses public challenge reference solutions and public cases,
retains all origin locations, and separately lists non-runnable examples, missing
stdin and incomplete-template candidates. It does not run any source.

After smoke checks finish, deploy the plan alongside the existing runner and run
the explicit administrator command from that same service installation:

```sh
python native-audit.py --execute --plan runner-native-plan.json --output runner-native-results.json
```

Use `--resume` after interruption, or `--languages c,cpp`/`--limit 5` for a bounded
subset. `--retry-failed` retries non-passing records after a justified fix, keeping
prior results in `previousAttempts` for evidence. The command does not start another service or use the public HTTP endpoint.
It calls the same `execute_request`, shares its filesystem lock with HTTP, and
preserves all container quotas, cleanup and deadlines. Results are saved after
each task. Failed compilation, runtime errors, timeouts and mismatched public
outputs are labeled for review; teaching-error context does not turn them into
passes. A successful program without a known expected result is explicitly
`executed_without_expected_output`, not a correctness claim.

The 2026-11-02 production audit is recorded in
`tests/runner-native-final-results.json`: 416 unique jobs, including 63 jobs with
90/90 known expected-output checks and 343 execution-only examples. The remaining
10 jobs are individually reviewed source errors or deliberate error examples in
`tests/runner-native-review.json`; they are not counted as passing programs.
The input review retains 22 unique examples requiring learner-provided stdin.
The two examples with explicit source input/output samples were executed.

`author-audit.py` separately covers the native author judges, whose assertions are
returned inside the original `<__educative_test_results__>` JSON envelope:

```sh
python3 runner/author-audit.py --prepare
python3 runner/author-audit.py --prepare --negative --plan tests/runner-author-negative-plan.json
# On the existing deployed service installation, after copying the script/plan:
python author-audit.py --execute --plan runner-author-plan.json --output runner-author-baseline.json
python author-audit.py --execute --plan runner-author-negative-plan.json --output runner-author-negative.json
```

All eight enabled C++/Java judges passed their 34 original assertions using the
unchanged public reference answers and unchanged prefix/author/framework fields.
Two additional stale C++ judge scripts have `judge:false` and are excluded.
The negative audit replaces returns in the duplicate-number reference answer
with `-999`, leaving the judge unchanged: both languages compile successfully,
and all eight assertions reject the wrong result. No template unescaping is
needed. The original public C++ judge API also passed the same four assertions;
the original Java endpoint failed due to a missing Arrays import in its own
generated EdTestRunner. Both responses are preserved for comparison, without
treating that original-server defect as a requirement for this implementation.
