#!/usr/bin/env python3
"""Prepare public-course fixtures, or audit them serially through isolated Docker.

Preparation is read-only over public curriculum JSON. Execution is an explicitly
invoked administrator command, using the exact service launcher and shared lock.
It never runs course code on the host and never starts an HTTP service.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import time
from protocol import ALIASES, ValidationError, validate_request

NATIVE = {"c", "cpp", "java", "go", "sh", "bash", "typescript", "csharp", "ruby", "rust", "php", "swift"}

def json_list(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return value if isinstance(value, list) else []

def stripped(code):
    return re.sub(r"/\*[\s\S]*?\*/|//[^\n]*|(?m:^\s*#[^\n]*)", " ", code)

def missing_input(language, code):
    patterns = {
        "c": r"\b(?:scanf|getchar|gets)\s*\(|\bf(?:gets|getc)\s*\([^;\n]*\bstdin\b",
        "cpp": r"\b(?:scanf|getchar|gets)\s*\(|\bf(?:gets|getc)\s*\([^;\n]*\bstdin\b|\bgetline\s*\([^;\n]*\bcin\b|\bcin\s*>>",
        "java": r"System\.in|\breadLine\s*\(",
        "go": r"\bfmt\.Scan(?:ln|f)?\s*\(|os\.Stdin",
        "sh": r"\bread\s+", "bash": r"\bread\s+",
        "python": r"\binput\s*\(|sys\.stdin",
    }
    return bool(re.search(patterns.get(language, r"(?!)"), stripped(code)))

def incomplete(code):
    return not code.strip() or bool(re.search(r"\bTODO\b|\b___+\b|\?\?\?|(?:完成|编写|填写|补充|实现|写下).{0,10}(?:代码|函数)|(?:your code|write code|complete the code)", code, re.I))

def prepare(repository: Path):
    tasks, skipped, occurrences = {}, [], Counter()

    def add(code_data, origin, tests=None, challenge=False):
        language = ALIASES.get(str(code_data.get("language", "")).lower().strip())
        content = str(code_data.get("content", ""))
        multiprocessing = language == "python" and bool(re.search(r"\bmultiprocessing\b|\bProcessPoolExecutor\b", content))
        if language not in NATIVE and not multiprocessing:
            return
        occurrences[language] += 1
        origin = {**origin, "componentId": code_data.get("comp_id", code_data.get("id")), "language": language}
        if not challenge and code_data.get("runnable") is not True:
            skipped.append({**origin, "reason":"source_not_runnable"})
            return
        if challenge:
            solution = code_data.get("solution_code", "")
            if not isinstance(solution, str) or not solution.strip():
                skipped.append({**origin, "reason":"unfinished_template_without_public_solution"})
                return
            content = solution
            origin["variant"] = "public_challenge_solution"
        elif incomplete(content):
            solution = code_data.get("solution_content", "")
            if isinstance(solution, str) and solution.strip():
                content = solution
                origin["variant"] = "public_lesson_solution"
            else:
                skipped.append({**origin, "reason":"unfinished_template_candidate", "sourcePreview":content[:220]})
                return
        else:
            origin["variant"] = "runnable_lesson_example"
        hidden = code_data.get("hidden_code_content") or {}
        prefix = hidden.get("prepend_code") or code_data.get("prepend_code") or code_data.get("template_head") or ""
        suffix = hidden.get("append_code") or code_data.get("append_code") or code_data.get("template_tail") or ""
        content = "\n".join(part for part in [prefix, content, suffix] if part)
        files=[]
        for item in json_list(code_data.get("additional_content") or code_data.get("additional_files") or []):
            if isinstance(item,dict) and isinstance(item.get("content"),str):
                files.append({"file_name":item.get("file_name",item.get("name")),"content":item["content"]})
        public_tests=[]
        for case in json_list(tests or code_data.get("testcases") or []):
            expected=case.get("expected_output",case.get("output"))
            if expected is not None:
                public_tests.append({"case_no":case.get("case_no",len(public_tests)+1),"input":str(case.get("stdin",case.get("input",""))),"output":str(expected)})
        if not public_tests and missing_input(language,content):
            skipped.append({**origin,"reason":"requires_unspecified_stdin","sourcePreview":content[:220]})
            return
        origin["teachingErrorCandidate"] = bool(re.search(r"(?:运行|编译|语法|类型).{0,8}(?:错误|报错)|会报错|cannot compile|compilation error",origin.get("context",""),re.I))
        batches=[public_tests[index:index+8] for index in range(0,len(public_tests),8)] or [[]]
        for index, cases in enumerate(batches):
            payload={"language":language,"code":content,"stdin":"","files":files,"testcases":cases}
            try:
                payload=validate_request(payload)
            except ValidationError as error:
                skipped.append({**origin,"reason":"protocol_limit_or_invalid_source_fields","detail":str(error)})
                continue
            digest=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
            if digest not in tasks:
                tasks[digest]={"id":digest,"language":language,"publicTestCount":len(cases),"request":payload,"origins":[]}
            tasks[digest]["origins"].append({**origin,"testBatch":index+1})

    def walk(value, origin):
        if isinstance(value,dict):
            if "challenge_id" in value and isinstance(value.get("code_templates"),list):
                for template in value["code_templates"]:
                    add(template,{**origin,"challengeId":value["challenge_id"],"title":value.get("title",origin["title"])},value.get("testcases"),True)
                return
            if value.get("type")=="Code" and isinstance(value.get("content"),dict):
                add(value["content"],origin)
                return
            if value.get("type")=="TabbedCode" and isinstance(value.get("content"),dict):
                data=value["content"]
                for block in data.get("code_contents",data.get("code_templates",[])):
                    add(block,origin,data.get("testcases"))
                return
            for child in value.values():
                walk(child,origin)
        elif isinstance(value,list):
            context=""
            for child in value:
                if isinstance(child,dict) and child.get("type")=="MarkdownEditor":
                    context=str(child.get("content",{}).get("text",""))[-600:]
                walk(child,{**origin,"context":context})

    paths=sorted((repository/"public/content/pages").glob("*.json"))+sorted((repository/"public/content/challenges").glob("*.json"))
    for path in paths:
        data=json.loads(path.read_text(encoding="utf-8"))
        walk(data,{"file":"/"+str(path.relative_to(repository/"public")),"title":data.get("title","")})
    tasks=list(tasks.values())
    # Validate public solutions first: they provide stronger correctness evidence.
    tasks.sort(key=lambda task:(not bool(task["publicTestCount"]),task["language"],task["id"]))
    return {"preparedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"summary":{
        "sourceFiles":len(paths),"nativeOccurrencesIncludingNonRunnable":dict(occurrences),
        "deduplicatedTasks":len(tasks),"byLanguage":dict(Counter(task["language"] for task in tasks)),
        "publicTestCases":sum(task["publicTestCount"] for task in tasks),"skippedOccurrences":dict(Counter(item["reason"] for item in skipped))},
        "tasks":tasks,"skipped":skipped,
        "limitations":["Reference solutions are public source metadata; passing their public cases does not establish hidden-judge equivalence.","Code without a public expected result receives execution-only status, never an inferred correctness pass.","Input requirements and unfinished-template markers are conservative static candidates, retained for manual review.","Teaching-error context is a review hint, not an automatic success verdict."]}

def run(plan, output: Path, languages=None, limit=None, resume=False, retry_failed=False):
    from server import execute_request
    results, previous_attempts=[], []
    if resume and output.exists():
        old=json.loads(output.read_text())
        previous_attempts=old.get("previousAttempts",[])
        for row in old.get("results",[]):
            retry=(not languages or row["language"] in languages) and (row["status"] in ("service_unavailable","deferred_busy") or (retry_failed and row["status"] not in ("public_tests_passed","executed_without_expected_output")))
            (previous_attempts if retry else results).append(row)
    done={row["id"] for row in results}
    tasks=[task for task in plan["tasks"] if task["id"] not in done and (not languages or task["language"] in languages)]
    if limit is not None:
        tasks=tasks[:limit]
    def save():
        report={"planSummary":plan["summary"],"updatedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"results":results,"previousAttempts":previous_attempts,
                "summary":{"executedTasks":len(results),"statuses":dict(Counter(row["status"] for row in results)),"publicCases":sum(len(row.get("result",{}).get("testResults",[])) for row in results),
                           "passedCases":sum(case.get("succeeded") is True for row in results for case in row.get("result",{}).get("testResults",[]))},"limitations":plan["limitations"]}
        temporary=output.with_suffix(output.suffix+".tmp")
        temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temporary.replace(output)
    try:
        for task in tasks:
            started=time.monotonic()
            request=validate_request(task["request"])
            status,result=execute_request(request)
            while status==503 and time.monotonic()-started<65:
                time.sleep(1)
                status,result=execute_request(request)
            if status!=200:
                verdict="service_unavailable" if status!=503 else "deferred_busy"
            elif result.get("unsupported"):
                verdict="unsupported_toolchain"
            elif result.get("timedOut"):
                verdict="timeout_needs_review"
            elif result.get("compileError"):
                verdict="compile_error_needs_review"
            elif result.get("exitCode"):
                verdict="runtime_error_needs_review"
            elif task["publicTestCount"]:
                verdict="public_tests_passed" if len(result.get("testResults",[]))==task["publicTestCount"] and all(case.get("succeeded") for case in result["testResults"]) else "public_test_mismatch_needs_review"
            else:
                verdict="executed_without_expected_output"
            row={"id":task["id"],"language":task["language"],"status":verdict,"seconds":round(time.monotonic()-started,3),"origins":task["origins"],"httpEquivalentStatus":status,"result":result}
            results.append(row)
            save()
            print(json.dumps({"completed":len(results),"language":task["language"],"status":verdict,"seconds":row["seconds"]}),flush=True)
            time.sleep(.2)
    finally:
        save()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--prepare",action="store_true")
    parser.add_argument("--execute",action="store_true")
    parser.add_argument("--repository",type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument("--plan",type=Path,default=Path("tests/runner-native-plan.json"))
    parser.add_argument("--output",type=Path,default=Path("tests/runner-native-results.json"))
    parser.add_argument("--languages")
    parser.add_argument("--limit",type=int)
    parser.add_argument("--resume",action="store_true")
    parser.add_argument("--retry-failed",action="store_true")
    args=parser.parse_args()
    if args.prepare:
        plan=prepare(args.repository.resolve())
        args.plan.parent.mkdir(parents=True,exist_ok=True)
        args.plan.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(plan["summary"],ensure_ascii=False))
    if args.execute:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        run(json.loads(args.plan.read_text(encoding="utf-8")),args.output,set(args.languages.split(",")) if args.languages else None,args.limit,args.resume or args.retry_failed,args.retry_failed)
    if not args.prepare and not args.execute:
        parser.error("Use --prepare for read-only inventory or --execute for the authorized isolated administrative audit.")

if __name__=="__main__":
    main()
