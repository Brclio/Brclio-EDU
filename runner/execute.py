#!/usr/bin/env python3
"""Container entrypoint. All source files live only in the fresh /work tmpfs."""
from __future__ import annotations
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path
from protocol import MAX_BODY, ValidationError, validate_request
from process_utils import bounded_run

WORK = Path("/work")
OUTPUT_LIMIT = 64 * 1024

def text(data: bytes, limit=OUTPUT_LIMIT) -> str:
    return data[:limit].decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")

def normalize(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").rstrip()

def seed_go_cache() -> None:
    seed = Path("/opt/go-seed-cache")
    target = WORK / ".go-cache"
    target.mkdir(exist_ok=True)
    if not seed.is_dir():
        return
    # Copy only names as symlinks: immutable compiler/stdlib cache stays in the image.
    # The Go compiler creates new cache files in the private tmpfs directory.
    for directory in seed.iterdir():
        if not directory.is_dir():
            continue
        destination = target / directory.name
        destination.mkdir(exist_ok=True)
        for item in directory.iterdir():
            if item.is_file() and not item.is_symlink():
                (destination / item.name).symlink_to(item)

def java_source(code: str) -> tuple[str, str]:
    # Ignore comments and string literals before looking for a declaration.
    stripped = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*', ' ', code)
    public = re.search(r"\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)", stripped)
    fallback = re.search(r"\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)", stripped)
    name = (public or fallback).group(1) if public or fallback else "Main"
    package = re.search(r"\bpackage\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;", stripped)
    return name + ".java", (package.group(1) + "." if package else "") + name

def java_files(code: str) -> tuple[dict[str, str], str]:
    primary, entry = java_source(code)
    # Preserve character positions while ignoring braces/declarations in literals.
    masked = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*', lambda match: " " * len(match.group()), code)
    package = entry.rsplit(".", 1)[0] + "." if "." in entry else ""
    # The public type can be a helper (Animal/Vehicle in the original lessons),
    # while a package-private MyClass owns main. Run that owning top-level type.
    for type_match in re.finditer(r"\b(?:class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)", masked):
        prefix = masked[:type_match.start()]
        if prefix.count("{") != prefix.count("}"):
            continue
        body = masked.find("{", type_match.end())
        if body < 0:
            continue
        depth, end = 1, body + 1
        while end < len(masked) and depth:
            depth += (masked[end] == "{") - (masked[end] == "}")
            end += 1
        for main in re.finditer(r"\bstatic\s+(?:final\s+)?void\s+main\s*\(", masked[body:end]):
            before = masked[body:body + main.start()]
            if before.count("{") - before.count("}") == 1:
                entry = package + type_match.group(1)
                break
    declaration = re.compile(r"\bpublic\s+(?:(?:final|abstract|strictfp|sealed|non-sealed)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)")
    declarations = []
    for match in declaration.finditer(masked):
        prefix = masked[:match.start()]
        if prefix.count("{") != prefix.count("}"):
            continue  # Nested public classes stay with their enclosing type.
        body = masked.find("{", match.end())
        if body < 0:
            return {primary: code}, entry
        depth, end = 1, body + 1
        while end < len(masked) and depth:
            depth += (masked[end] == "{") - (masked[end] == "}")
            end += 1
        if depth:
            return {primary: code}, entry
        declarations.append((match.group(1), match.start(), body, end))
    if len(declarations) < 2 or len({item[0] for item in declarations}) != len(declarations):
        return {primary: code}, entry
    imports = "\n".join(code[match.start():match.end()] for match in re.finditer(r"\b(?:package|import)\s+[^;]+;", masked[:declarations[0][1]]))
    files = {declarations[0][0] + ".java": code[:declarations[0][3]] + code[declarations[-1][3]:]}
    for previous, current in zip(declarations, declarations[1:]):
        files[current[0] + ".java"] = imports + "\n" + code[previous[3]:current[3]]
    return files, entry

def prepare(request: dict) -> tuple[list[str] | None, list[str], bytes | None, dict]:
    language, code = request["language"], request["code"]
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/work", "TMPDIR": "/tmp",
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1",
           "PYTHONPATH": "/opt/runner/offline",
           "GOMAXPROCS": "1", "GO111MODULE": "off", "GOCACHE": "/work/.go-cache", "GOTMPDIR": "/tmp",
           "NODE_OPTIONS": "--max-old-space-size=128"}
    for file in request["files"]:
        target = WORK / file["file_name"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(file["content"], encoding="utf-8")
    if language == "swift" and not shutil.which("swiftc", path=env["PATH"]):
        raise NotImplementedError("Swift execution image is not configured.")
    primary = {"c":"main.c", "cpp":"main.cpp", "go":"main.go", "javascript":"main.js", "python":"main.py",
               "sql":"main.sql", "sh":"main.sh", "bash":"main.sh", "typescript":"main.ts", "csharp":"Main.cs",
               "ruby":"main.rb", "rust":"main.rs", "php":"main.php", "swift":"main.swift"}.get(language)
    java_class = None
    generated_names = []
    if language == "java":
        generated, java_class = java_files(code)
        generated_names = list(generated)
        primary = generated_names[0]
        for name, source in generated.items():
            (WORK / name).write_text(source, encoding="utf-8")
    else:
        (WORK / primary).write_text(code, encoding="utf-8")
    def sources(*suffixes, same_directory=False):
        # Absolute argv paths cannot become compiler flags. Never expand a shell glob.
        names = [primary] + [name for name in generated_names if name != primary] + [f["file_name"] for f in request["files"]
                             if f["file_name"] != primary and Path(f["file_name"]).suffix in suffixes
                             and f["file_name"] not in generated_names
                             and (not same_directory or Path(f["file_name"]).parent == Path("."))]
        return [str(WORK / name) for name in names]
    compile_command = None
    source_stdin = None
    if language == "c":
        compile_command, command = ["gcc", "-std=c11", "-O0", "-pipe", *sources(".c"), "-lm", "-o", "/work/program"], ["/work/program"]
    elif language == "cpp":
        compile_command, command = ["g++", "-std=c++17", "-O0", "-pipe", *sources(".cpp", ".cc", ".cxx", ".c"), "-o", "/work/program"], ["/work/program"]
    elif language == "java":
        compile_command = ["javac", "-J-Xmx128m", "-J-XX:ActiveProcessorCount=1", "-J-XX:+UseSerialGC", "-J-XX:ReservedCodeCacheSize=32m",
                           "-encoding", "UTF-8", "-d", "/work", *sources(".java")]
        command = ["java", "-Xmx96m", "-XX:ActiveProcessorCount=1", "-XX:+UseSerialGC", "-XX:ReservedCodeCacheSize=32m", "-XX:MaxMetaspaceSize=64m", "-cp", "/work", java_class]
    elif language == "go":
        seed_go_cache()
        compile_command, command = ["go", "build", "-p", "1", "-o", "/work/program", *sources(".go", same_directory=True)], ["/work/program"]
    elif language == "typescript":
        compile_command = ["tsc", "--target", "ES2020", "--module", "commonjs", "--skipLibCheck", "--outDir", "/work/ts-build", "/work/main.ts"]
        command = ["node", "/work/ts-build/main.js"]
    elif language == "csharp":
        compile_command, command = ["mcs", "-out:/work/program.exe", *sources(".cs")], ["mono", "/work/program.exe"]
    elif language == "rust":
        compile_command, command = ["rustc", "--edition=2021", "-C", "opt-level=0", "/work/main.rs", "-o", "/work/program"], ["/work/program"]
    elif language == "swift":
        compile_command, command = ["swiftc", "-Onone", "-j", "1", "-module-cache-path", "/work/.swift-cache", *sources(".swift"), "-o", "/work/program"], ["/work/program"]
    else:
        command = {"javascript":["node","/work/main.js"], "python":["python3","-u","/work/main.py"],
                   "sql":["sqlite3","-batch",":memory:"], "sh":["sh","/work/main.sh"], "bash":["bash","--noprofile","--norc","/work/main.sh"],
                   "ruby":["ruby","/work/main.rb"], "php":["php","-f","/work/main.php"]}[language]
        if language == "sql":
            source_stdin = (code + "\n").encode("utf-8")
    return compile_command, command, source_stdin, env

def execute(request: dict, budget: float = 38) -> dict:
    started = time.monotonic()
    deadline = started + min(38, max(1, budget))
    result = {"stdout": "", "stderr": "", "exitCode": 0, "timedOut": False}
    try:
        compiler, command, source_stdin, env = prepare(request)
    except NotImplementedError as error:
        return {**result, "stderr": str(error), "exitCode": 127, "unsupported": True}
    except OSError:
        return {**result, "stderr": "Unable to prepare files inside the execution sandbox.", "exitCode": 1}
    if compiler:
        compiled = bounded_run(compiler, b"", min(30, max(0.01, deadline - time.monotonic())), cwd=WORK, env=env, output_limit=OUTPUT_LIMIT)
        if compiled.returncode or compiled.timed_out or compiled.output_limited:
            reason = text(compiled.stderr or compiled.stdout) or ("Compilation timed out." if compiled.timed_out else "Compilation failed.")
            return {**result, "stderr": reason, "exitCode": compiled.returncode or 1, "timedOut": compiled.timed_out,
                    "compileError": reason, "outputTruncated": compiled.output_limited}
    tests = request["testcases"]
    cases = tests or [{"stdin": request["stdin"]}]
    results, outputs, errors = [], bytearray(), bytearray()
    for index, case in enumerate(cases):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            result.update(exitCode=-1, timedOut=True)
            if tests:
                results.append({"case_no": case["case_no"], "input": text(case["stdin"].encode(),4096), "expected_output": text(case["expected_output"].encode(),8192),
                                "actual_output": "", "succeeded": False, "reason": "Shared time budget exhausted before this test."})
            continue
        stdin = source_stdin if source_stdin is not None else case["stdin"].encode("utf-8")
        completed = bounded_run(command, stdin, min(5, remaining), cwd=WORK, env=env, output_limit=OUTPUT_LIMIT)
        actual, error = text(completed.stdout), text(completed.stderr)
        outputs.extend(completed.stdout[:max(0, OUTPUT_LIMIT - len(outputs))])
        errors.extend(completed.stderr[:max(0, OUTPUT_LIMIT - len(errors))])
        if completed.returncode:
            result["exitCode"] = completed.returncode
        if completed.timed_out:
            result["timedOut"] = True
            error = error or "Program exceeded the 5-second execution limit."
        if completed.output_limited:
            result["outputTruncated"] = True
            error = error or "Program output exceeded 64 KiB."
        if tests:
            passed = not completed.returncode and not completed.timed_out and not completed.output_limited and normalize(actual) == normalize(case["expected_output"])
            results.append({"case_no": case["case_no"], "input": text(case["stdin"].encode(),4096), "expected_output": text(case["expected_output"].encode(),8192),
                            "actual_output": text(completed.stdout,8192), "succeeded": passed,
                            "reason": error if not passed and error else "" if passed else "Output does not match the public test case."})
        elif error and not errors:
            errors.extend(error.encode()[:OUTPUT_LIMIT])
    result.update(stdout=text(bytes(outputs)), stderr=text(bytes(errors)))
    if tests:
        result["testResults"] = results
    return result

if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(MAX_BODY + 4097)
        if len(raw) > MAX_BODY + 4096:
            raise ValidationError("Internal request too large")
        value = json.loads(raw)
        budget = value.pop("_budget_seconds", 38) if isinstance(value, dict) else 38
        request = validate_request(value)
        response = execute(request, float(budget))
    except Exception:
        response = {"stdout": "", "stderr": "Execution sandbox could not process this request.", "exitCode": 1, "timedOut": False}
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.flush()
