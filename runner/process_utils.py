"""Bounded subprocess I/O with one wall-clock deadline and process-group cleanup."""
from __future__ import annotations
import os
import selectors
import signal
import subprocess
import time
from dataclasses import dataclass
from typing import Callable

@dataclass
class ProcessResult:
    stdout: bytes
    stderr: bytes
    returncode: int
    timed_out: bool = False
    output_limited: bool = False

def kill_group(process: subprocess.Popen) -> None:
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)

def bounded_run(command: list[str], data: bytes, timeout: float, *, cwd=None, env=None,
                output_limit=64 * 1024, on_abort: Callable[[], None] | None = None) -> ProcessResult:
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               cwd=cwd, env=env, start_new_session=True, close_fds=True)
    selector = selectors.DefaultSelector()
    output = {"stdout": bytearray(), "stderr": bytearray()}
    position, total = 0, 0
    timed_out = output_limited = False
    deadline = time.monotonic() + max(0.01, timeout)
    try:
        for stream, label in ((process.stdout, "stdout"), (process.stderr, "stderr")):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, label)
        if data:
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
        else:
            process.stdin.close()
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break
            for key, _ in selector.select(min(remaining, 0.2)):
                if key.data == "stdin":
                    try:
                        position += os.write(key.fileobj.fileno(), data[position:position + 16384])
                    except BrokenPipeError:
                        position = len(data)
                    if position >= len(data):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                else:
                    chunk = os.read(key.fileobj.fileno(), 16384)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                        continue
                    available = max(0, output_limit - total)
                    output[key.data].extend(chunk[:available])
                    total += min(len(chunk), available)
                    if len(chunk) > available:
                        output_limited = True
                        break
            if output_limited:
                break
        if timed_out or output_limited:
            if on_abort:
                on_abort()
            kill_group(process)
        else:
            try:
                process.wait(timeout=max(0.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                timed_out = True
                if on_abort:
                    on_abort()
                kill_group(process)
        return ProcessResult(bytes(output["stdout"]), bytes(output["stderr"]), process.returncode,
                             timed_out, output_limited)
    finally:
        selector.close()
        kill_group(process)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream and not stream.closed:
                stream.close()
