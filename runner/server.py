#!/usr/bin/env python3
"""Loopback-only authenticated launcher. User programs never execute on the host."""
from __future__ import annotations
import collections
import fcntl
import hmac
import json
import os
import re
import subprocess
import threading
import time
import uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from protocol import MAX_BODY, SUPPORTED, ValidationError, validate_request
from process_utils import bounded_run

IMAGE = os.environ.get("RUNNER_IMAGE", "brclio-edu-runner:1")
SWIFT_IMAGE = os.environ.get("RUNNER_SWIFT_IMAGE", "")
DOCKER = os.environ.get("RUNNER_DOCKER", "/usr/bin/docker")
WALL_TIMEOUT = min(40, max(5, int(os.environ.get("RUNNER_WALL_TIMEOUT", "40"))))
CONCURRENCY = threading.BoundedSemaphore(1)
CLIENT_RE = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
NAME_RE = re.compile(r"^brclio-edu-run-[a-f0-9]{24}$")
LOCK_FILE = Path(__file__).resolve().parent / ".execution.lock"

def bounded_result(value: dict) -> dict:
    # A learner process shares the container UID with its entrypoint and could
    # write directly to its stdout. Reapply result bounds outside that boundary.
    truncated = bool(value.get("outputTruncated"))
    def limit(text, maximum=64 * 1024):
        nonlocal truncated
        data = str(text).encode("utf-8", errors="replace")
        truncated = truncated or len(data) > maximum
        return data[:maximum].decode("utf-8", errors="ignore")
    result = {"stdout": limit(value["stdout"]), "stderr": limit(value["stderr"]),
              "exitCode": value["exitCode"], "timedOut": value["timedOut"]}
    if isinstance(value.get("compileError"), str):
        result["compileError"] = limit(value["compileError"])
    if value.get("unsupported") is True:
        result["unsupported"] = True
    if isinstance(value.get("testResults"), list):
        result["testResults"] = []
        for case in value["testResults"][:8]:
            if not isinstance(case, dict):
                continue
            result["testResults"].append({"case_no": limit(case.get("case_no", ""), 64),
                "input": limit(case.get("input", ""), 4096), "expected_output": limit(case.get("expected_output", ""), 8192),
                "actual_output": limit(case.get("actual_output", ""), 8192), "reason": limit(case.get("reason", ""), 4096),
                "succeeded": case.get("succeeded") is True})
    if truncated:
        result["outputTruncated"] = True
    return result

class RateLimiter:
    def __init__(self, count=6, period=60, capacity=2048, clock=time.monotonic):
        self.count, self.period, self.capacity, self.clock = count, period, capacity, clock
        self.clients = collections.OrderedDict()
        self.lock = threading.Lock()

    def allow(self, client: str) -> tuple[bool, int]:
        now = self.clock()
        with self.lock:
            history = self.clients.pop(client, collections.deque())
            while history and history[0] <= now - self.period:
                history.popleft()
            allowed = len(history) < self.count
            if allowed:
                history.append(now)
            self.clients[client] = history
            while len(self.clients) > self.capacity:
                self.clients.popitem(last=False)
            retry = max(1, int(self.period - (now - history[0])) + 1) if not allowed else 0
            return allowed, retry

LIMITER = RateLimiter()

def docker_command(name: str, language: str = "python") -> list[str]:
    if not NAME_RE.fullmatch(name):
        raise ValueError("invalid generated container name")
    return [DOCKER, "run", "--rm", "-i", "--name", name, "--log-driver", "none",
            "--network", "none", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "--pids-limit", "64",
            "--memory", "384m", "--memory-swap", "384m", "--cpus", "0.35",
            "--ulimit", "nofile=128:128", "--ulimit", "fsize=67108864:67108864",
            "--tmpfs", "/work:rw,exec,nosuid,size=64m,uid=65534,gid=65534",
            "--tmpfs", "/tmp:rw,nosuid,size=32m",
            "--user", "65534:65534", "--workdir", "/work", SWIFT_IMAGE if language == "swift" and SWIFT_IMAGE else IMAGE]

def remove_container(name: str) -> None:
    if not NAME_RE.fullmatch(name):
        raise ValueError("refusing to remove a non-generated container name")
    try:
        subprocess.run([DOCKER, "rm", "-f", name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        pass

def execute_request(request: dict) -> tuple[int, dict]:
    # Thread semaphore protects HTTP admission; flock also protects against the
    # authorized one-off administrative audit process sharing this installation.
    try:
        descriptor = os.open(LOCK_FILE, os.O_RDWR | os.O_CREAT | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    except OSError:
        return 503, {"error": "Execution service admission is unavailable."}
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 503, {"error": "运行服务正在处理另一个任务，请稍后重试。"}
        return execute_isolated(request)
    finally:
        os.close(descriptor)

def execute_isolated(request: dict) -> tuple[int, dict]:
    name = "brclio-edu-run-" + uuid.uuid4().hex[:24]
    payload = json.dumps({**request, "_budget_seconds": max(1, WALL_TIMEOUT - 2)}, ensure_ascii=False).encode("utf-8")
    try:
        result = bounded_run(docker_command(name, request["language"]), payload, WALL_TIMEOUT, output_limit=2 * 1024 * 1024,
                             on_abort=lambda: remove_container(name))
        if result.timed_out:
            return 200, {"stdout": "", "stderr": "Execution exceeded the shared time budget.", "exitCode": -1, "timedOut": True}
        if result.output_limited:
            return 200, {"stdout": "", "stderr": "Execution output exceeded the service limit.", "exitCode": -1, "timedOut": False, "outputTruncated": True}
        try:
            value = json.loads(result.stdout)
        except (ValueError, UnicodeDecodeError):
            return 502, {"error": "Execution container did not return a valid result."}
        if not isinstance(value, dict) or not isinstance(value.get("stdout"), str) or not isinstance(value.get("stderr"), str) or not isinstance(value.get("exitCode"), int) or not isinstance(value.get("timedOut"), bool):
            return 502, {"error": "Execution container returned an invalid result shape."}
        return 200, bounded_result(value)
    except OSError:
        return 503, {"error": "Execution service is unavailable."}
    finally:
        # Also handles client disconnects, malformed container output, and daemon-side failures.
        remove_container(name)

class RunnerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    server_version = "BrclioRunner/1"

    def log_message(self, *_):
        # Never log request bodies, code, authorization headers, or client identifiers.
        return

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def respond(self, status: int, value: dict, extra=None):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        for key, value in (extra or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path not in ("/health", "/__brclio_edu_runner/health"):
            return self.respond(404, {"error": "Not found."})
        self.respond(200, {"ok": True, "service": "brclio-edu-runner", "languages": SUPPORTED + (["swift"] if SWIFT_IMAGE else []),
                           "unavailableLanguages": {} if SWIFT_IMAGE else {"swift": "Swift execution image is not configured."},
                           "maxConcurrency": 1, "wallTimeoutSeconds": WALL_TIMEOUT})

    def do_POST(self):
        if self.path not in ("/run", "/__brclio_edu_runner/run"):
            return self.respond(404, {"error": "Not found."})
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + self.server.runner_token
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            return self.respond(401, {"error": "Unauthorized."})
        client = self.headers.get("X-Client-Id", "")
        if not CLIENT_RE.fullmatch(client):
            return self.respond(400, {"error": "A trusted X-Client-Id is required."})
        if self.headers.get("Transfer-Encoding"):
            return self.respond(400, {"error": "Chunked request bodies are not supported."})
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not lengths[0].isdigit():
            return self.respond(411, {"error": "Content-Length is required."})
        length = int(lengths[0])
        if length > MAX_BODY:
            return self.respond(413, {"error": "Request exceeds 256 KiB."})
        if self.headers.get_content_type() != "application/json":
            return self.respond(415, {"error": "Use application/json."})
        allowed, retry = LIMITER.allow(client)
        if not allowed:
            return self.respond(429, {"error": "最多每分钟运行 6 次，请稍后重试。"}, {"Retry-After": retry})
        if not CONCURRENCY.acquire(blocking=False):
            return self.respond(503, {"error": "运行服务正在处理另一个任务，请稍后重试。"}, {"Retry-After": "5"})
        try:
            try:
                data = self.rfile.read(length)
                if len(data) != length:
                    return self.respond(400, {"error": "Incomplete request body."})
                request = validate_request(json.loads(data))
            except (ValueError, UnicodeDecodeError, ValidationError):
                return self.respond(400, {"error": "Invalid code, language, input, files or testcases."})
            except TimeoutError:
                return self.respond(408, {"error": "Request body timed out."})
            status, result = execute_request(request)
            self.respond(status, result, {"Retry-After": "5"} if status == 503 else None)
        finally:
            CONCURRENCY.release()

class RunnerServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8
    allow_reuse_address = True

    def __init__(self, address, token):
        super().__init__(address, RunnerHandler)
        self.runner_token = token
        self.connection_slots = threading.BoundedSemaphore(8)

    def process_request(self, request, client_address):
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()

if __name__ == "__main__":
    token = os.environ.get("RUNNER_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("RUNNER_TOKEN must contain at least 32 random characters.")
    if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/:@-]{0,240}", value) for value in [IMAGE] + ([SWIFT_IMAGE] if SWIFT_IMAGE else [])):
        raise SystemExit("Invalid configured runner image.")
    RunnerServer(("127.0.0.1", 18731), token).serve_forever()
