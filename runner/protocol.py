"""Validated, language-neutral requests. No request fields become shell commands."""
from __future__ import annotations
import re
from pathlib import PurePosixPath

MAX_BODY = 256 * 1024
MAX_CODE = 128 * 1024
MAX_STDIN = 64 * 1024
MAX_FILES = 128 * 1024
MAX_TESTS = 8
ALIASES = {
    "c": "c", "c99": "c", "c11": "c",
    "c++": "cpp", "cpp": "cpp", "c++11": "cpp", "c++14": "cpp", "c++17": "cpp",
    "java": "java", "java8": "java", "java17": "java",
    "go": "go", "golang": "go", "go-1165": "go",
    "javascript": "javascript", "js": "javascript", "node": "javascript", "nodejs": "javascript",
    "python": "python", "py": "python", "python3": "python", "python38": "python",
    "sql": "sql", "sqlite": "sql", "sqlite3": "sql",
    "sh": "sh", "shell": "sh", "bash": "bash",
    "typescript": "typescript", "ts": "typescript",
    "c#": "csharp", "cs": "csharp", "csharp": "csharp",
    "ruby": "ruby", "rb": "ruby", "rust": "rust", "rs": "rust", "php": "php",
    "swift": "swift",
}
SUPPORTED = sorted(set(ALIASES.values()) - {"swift"})

class ValidationError(ValueError):
    pass

def bounded_text(value, limit: int, name: str) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{name} must be a string")
    if len(value.encode("utf-8")) > limit:
        raise ValidationError(f"{name} exceeds {limit} UTF-8 bytes")
    if "\x00" in value:
        raise ValidationError(f"{name} contains NUL")
    return value

def safe_filename(value) -> str:
    name = bounded_text(value, 240, "file_name")
    if not name or name.startswith("/") or "\\" in name or any(ord(c) < 32 for c in name):
        raise ValidationError("file_name must be a safe relative POSIX path")
    if any(part in ("", ".", "..") for part in name.split("/")):
        raise ValidationError("file_name contains an unsafe path segment")
    if PurePosixPath(name).is_absolute():
        raise ValidationError("absolute file paths are not allowed")
    return name

def validate_request(value) -> dict:
    if not isinstance(value, dict):
        raise ValidationError("request must be a JSON object")
    if set(value) - {"language", "code", "stdin", "files", "testcases"}:
        raise ValidationError("request contains unsupported fields")
    language = value.get("language")
    if not isinstance(language, str) or language.lower().strip() not in ALIASES:
        raise ValidationError("unsupported language")
    language = ALIASES[language.lower().strip()]
    code = bounded_text(value.get("code"), MAX_CODE, "code")
    stdin = bounded_text(value.get("stdin", ""), MAX_STDIN, "stdin")
    source_files = value.get("files", [])
    if not isinstance(source_files, list) or len(source_files) > 32:
        raise ValidationError("files must be a list of at most 32 files")
    files, names, total = [], set(), 0
    for item in source_files:
        if not isinstance(item, dict) or set(item) - {"file_name", "content"}:
            raise ValidationError("invalid file entry")
        name = safe_filename(item.get("file_name"))
        if name in names:
            raise ValidationError("duplicate file_name")
        names.add(name)
        content = bounded_text(item.get("content"), MAX_FILES, "file content")
        total += len(content.encode("utf-8"))
        if total > MAX_FILES:
            raise ValidationError("combined files exceed 128 KiB")
        files.append({"file_name": name, "content": content})
    source_tests = value.get("testcases", [])
    if not isinstance(source_tests, list) or len(source_tests) > MAX_TESTS:
        raise ValidationError("testcases must be a list of at most 8 tests")
    tests = []
    for index, item in enumerate(source_tests):
        if not isinstance(item, dict):
            raise ValidationError("invalid testcase")
        allowed = {"case_no", "input", "stdin", "output", "expected_output", "expectedOutput"}
        if set(item) - allowed:
            raise ValidationError("testcase contains unsupported fields")
        expected = next((item[key] for key in ("expected_output", "expectedOutput", "output") if key in item), None)
        if expected is None:
            raise ValidationError("testcase is missing expected output")
        case_no = item.get("case_no", index + 1)
        if not isinstance(case_no, (str, int)) or isinstance(case_no, bool) or len(str(case_no)) > 64:
            raise ValidationError("invalid testcase case_no")
        tests.append({"case_no": case_no, "stdin": bounded_text(item.get("stdin", item.get("input", "")), MAX_STDIN, "test stdin"),
                      "expected_output": bounded_text(expected, MAX_STDIN, "expected output")})
    return {"language": language, "code": code, "stdin": stdin, "files": files, "testcases": tests}
