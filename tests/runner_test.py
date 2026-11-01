"""Host-side validation only. Compiler execution belongs to isolated Docker smoke tests."""
import http.client
import fcntl
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runner"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runner/offline"))
import execute
import protocol
import server
from process_utils import ProcessResult, bounded_run
import offline_transport


def request(**kwargs):
    return protocol.validate_request({"language": "python", "code": "print('ok')", **kwargs})


class ValidationTests(unittest.TestCase):
    def test_all_aliases_are_normalized(self):
        for alias, language in protocol.ALIASES.items():
            self.assertEqual(request(language=alias.upper())["language"], language)

    def test_byte_limits_and_schema(self):
        for change in [dict(code="中" * 50000), dict(stdin="a" * 65537),
                       dict(files=[{"file_name":"a", "content":"a"*65537}, {"file_name":"b", "content":"b"*65537}]),
                       dict(testcases=[{"output":""}] * 9), dict(docker_args=["--privileged"]),
                       dict(language="$(id)"), dict(code="x\x00y")]:
            with self.subTest(change=list(change)), self.assertRaises(protocol.ValidationError):
                request(**change)
        self.assertEqual(len(request(code="a" * protocol.MAX_CODE)["code"]), protocol.MAX_CODE)

    def test_paths_cannot_escape_or_inject(self):
        for path in ["../x", "/x", "a/../../x", "a\\b", "a//b", "./a", "a/./b", "a\nb", ""]:
            with self.subTest(path=path), self.assertRaises(protocol.ValidationError):
                request(files=[{"file_name":path,"content":"x"}])
        with self.assertRaises(protocol.ValidationError):
            request(files=[{"file_name":"a","content":"x"}] * 2)
        self.assertEqual(protocol.safe_filename("src/helper.py"), "src/helper.py")

    def test_public_test_variants(self):
        value = request(testcases=[{"case_no":"1", "input":"1\n", "output":"2\n"}])
        self.assertEqual(value["testcases"], [{"case_no":"1", "stdin":"1\n", "expected_output":"2\n"}])
        with self.assertRaises(protocol.ValidationError):
            request(testcases=[{"input":"1"}])


class DockerBoundaryTests(unittest.TestCase):
    NAME = "brclio-edu-run-" + "a" * 24

    def test_resource_and_privilege_flags(self):
        args = server.docker_command(self.NAME)
        for key, value in {"--network":"none", "--log-driver":"none", "--cap-drop":"ALL", "--security-opt":"no-new-privileges",
                           "--pids-limit":"64", "--memory":"384m", "--memory-swap":"384m", "--cpus":"0.35",
                           "--user":"65534:65534", "--workdir":"/work"}.items():
            self.assertEqual(args[args.index(key)+1], value)
        for flag in ["--read-only", "--rm", "-i"]:
            self.assertIn(flag, args)
        self.assertNotIn("--privileged", args)
        self.assertNotIn("--volume", args)
        self.assertNotIn("-v", args)
        self.assertNotIn("/var/run/docker.sock", " ".join(args))
        self.assertNotIn("-e", args)
        self.assertEqual(args[-1], server.IMAGE)

    def test_cleanup_only_own_generated_name(self):
        for name in ["production", "brclio-edu-run-", self.NAME + ";id"]:
            with self.assertRaises(ValueError):
                server.remove_container(name)
            with self.assertRaises(ValueError):
                server.docker_command(name)

    def test_swift_uses_only_deployment_configured_image(self):
        with patch.object(server, "SWIFT_IMAGE", "brclio-edu-swift:1"):
            self.assertEqual(server.docker_command(self.NAME, "swift")[-1], "brclio-edu-swift:1")
            self.assertEqual(server.docker_command(self.NAME, "--privileged")[-1], server.IMAGE)

    def test_container_results_are_bounded_again_on_host(self):
        result = server.bounded_result({"stdout":"中"*50000,"stderr":"","exitCode":0,"timedOut":False,
                                       "secret":"not a permitted response field", "testResults":[{"actual_output":"x"*10000,"succeeded":True}]*30})
        self.assertLessEqual(len(result["stdout"].encode()),65536)
        self.assertTrue(result["outputTruncated"])
        self.assertNotIn("secret",result)
        self.assertEqual(len(result["testResults"]),8)
        self.assertEqual(len(result["testResults"][0]["actual_output"]),8192)

    def test_docker_json_input_and_timeout_cleanup(self):
        with patch.object(server, "bounded_run", return_value=ProcessResult(b"", b"", -9, True)) as run, patch.object(server, "remove_container") as remove:
            status, result = server.execute_request(request(code="print('do not execute on host')"))
            self.assertEqual(status, 200)
            self.assertTrue(result["timedOut"])
            argv, payload, _ = run.call_args.args
            self.assertEqual(json.loads(payload)["code"], "print('do not execute on host')")
            self.assertFalse(any("do not execute" in arg for arg in argv))
            self.assertEqual(remove.call_args.args[0], argv[argv.index("--name") + 1])

    def test_administrator_and_http_share_process_lock(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server,"LOCK_FILE",Path(tmp)/"execution.lock"), patch.object(server,"execute_isolated") as execute_call:
            with open(server.LOCK_FILE,"w") as held:
                fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
                self.assertEqual(server.execute_request(request())[0],503)
                execute_call.assert_not_called()
            execute_call.return_value=(200,{"stdout":"","stderr":"","exitCode":0,"timedOut":False})
            self.assertEqual(server.execute_request(request())[0],200)
            execute_call.assert_called_once()


class ContainerPreparationTests(unittest.TestCase):
    def test_java_class_detection_ignores_comments_and_strings(self):
        name, main = execute.java_source('/* public class Wrong {} */ package example; public final class Demo { String s = "class Nope"; }')
        self.assertEqual((name, main), ("Demo.java", "example.Demo"))

    def test_java_multiple_public_types_use_separate_source_files(self):
        source='package demo; import java.util.Scanner; public class Converter { public static class Nested {} }\npublic class Program { public static void main(String[] args) { System.out.print(Converter.class.getName()); } }'
        files,entry=execute.java_files(source)
        self.assertEqual(entry,"demo.Program")
        self.assertEqual(set(files),{"Converter.java","Program.java"})
        self.assertIn("public static class Nested",files["Converter.java"])
        self.assertNotIn("public class Program",files["Converter.java"])
        self.assertIn("package demo;",files["Program.java"])
        self.assertIn("import java.util.Scanner;",files["Program.java"])
        with tempfile.TemporaryDirectory() as tmp,patch.object(execute,"WORK",Path(tmp)):
            compiler,_,_,_=execute.prepare(request(language="java",code=source))
            self.assertIn(str(Path(tmp)/"Converter.java"),compiler)
            self.assertIn(str(Path(tmp)/"Program.java"),compiler)

    def test_actual_java604_reference_solution_is_split_without_source_edits(self):
        fixture=json.loads((Path(__file__).resolve().parents[1]/"public/content/challenges/604.json").read_text())
        source=fixture["code_templates"][0]["solution_code"]
        files,entry=execute.java_files(source)
        self.assertEqual(entry,"Program")
        self.assertEqual(set(files),{"Program.java","Converter.java"})
        self.assertIn("public class Converter",files["Converter.java"])
        self.assertNotIn("public class Converter",files["Program.java"])

    def test_java_package_private_main_is_the_execution_entry(self):
        source='public class Animal { void bark(){System.out.println("Woof-Woof");} } class MyClass { public static void main(String[] args){new Animal().bark();} }'
        files,entry=execute.java_files(source)
        self.assertEqual(entry,"MyClass")
        self.assertEqual(files,{"Animal.java":source})

    def test_multifile_compiler_argv(self):
        for language, primary, extra in [("c","main.c","lib.c"), ("cpp","main.cpp","lib.cpp"),
                                          ("java","Main.java","pkg/Helper.java"), ("go","main.go","helper.go"),
                                          ("csharp","Main.cs","Helper.cs")]:
            with self.subTest(language=language), tempfile.TemporaryDirectory() as tmp, patch.object(execute, "WORK", Path(tmp)), patch.object(execute, "seed_go_cache"):
                value = request(language=language, code="public class Main {}" if language == "java" else "fixture", files=[{"file_name":extra,"content":"fixture"}])
                compiler, _, _, _ = execute.prepare(value)
                self.assertIn(str(Path(tmp) / primary), compiler)
                self.assertIn(str(Path(tmp) / extra), compiler)
                self.assertEqual((Path(tmp) / extra).read_text(), "fixture")

    def test_leading_whitespace_is_not_ignored_by_judge(self):
        self.assertNotEqual(execute.normalize(" 4\n"), execute.normalize("4\n"))
        self.assertEqual(execute.normalize("4\r\n\n"), "4")
        self.assertEqual(execute.normalize("Player1\r (Level 4)\n"), "Player1\n (Level 4)")
        self.assertEqual(execute.text(b"Player1\r (Level 4)\r\n"), "Player1\n (Level 4)\n")
        with patch.object(execute, "prepare", return_value=(None,["fixture"],None,{})), patch.object(execute, "bounded_run", return_value=ProcessResult(b" 4\n",b"",0)):
            result = execute.execute(request(testcases=[{"output":"4\n"}]))
            self.assertFalse(result["testResults"][0]["succeeded"])

    def test_compile_failure_does_not_run(self):
        with patch.object(execute, "prepare", return_value=(["compiler"],["program"],None,{})), patch.object(execute, "bounded_run", return_value=ProcessResult(b"",b"syntax error",1)) as run:
            result = execute.execute(request(language="c"))
            self.assertEqual(result["compileError"], "syntax error")
            self.assertEqual(run.call_count, 1)


class ProcessBoundaryTests(unittest.TestCase):
    # These are authored plumbing fixtures, never downloaded/student programs.
    def test_piped_input_and_separate_output(self):
        result = bounded_run([sys.executable, "-c", "import sys;sys.stdout.buffer.write(sys.stdin.buffer.read());sys.stderr.write('stderr')"], b"x"*100000, 3, output_limit=120000)
        self.assertEqual(result.stdout, b"x"*100000)
        self.assertEqual(result.stderr, b"stderr")
        self.assertEqual(result.returncode, 0)

    def test_timeout_cancels_process(self):
        called=[]
        result = bounded_run([sys.executable,"-c","import time;time.sleep(10)"], b"", .08, on_abort=lambda: called.append(True))
        self.assertTrue(result.timed_out)
        self.assertEqual(called, [True])
        self.assertIsNotNone(result.returncode)

    def test_output_cap_cancels_process(self):
        result = bounded_run([sys.executable,"-c","import sys;sys.stdout.buffer.write(b'x'*100000)"], b"", 3, output_limit=4096)
        self.assertTrue(result.output_limited)
        self.assertLessEqual(len(result.stdout) + len(result.stderr), 4096)


class OfflineFixtureTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root=Path(self.directory.name)
        (root/"content").mkdir()
        (root/"content/example.html").write_bytes("你好".encode("gbk"))
        self.root_patch=patch.object(offline_transport,"ROOT",root)
        self.index_patch=patch.object(offline_transport,"INDEX",{"https://example.test/page":{"path":"/content/example.html","contentType":"text/html; charset=gbk"}})
        self.root_patch.start();self.index_patch.start()
        self.addCleanup(self.root_patch.stop);self.addCleanup(self.index_patch.stop)

    def test_bytes_charset_head_and_unknown_url(self):
        from urllib.error import URLError
        body,headers=offline_transport.fixture("https://example.test/page")
        self.assertEqual(body.decode("gbk"),"你好")
        self.assertEqual(headers.get_content_charset(),"gbk")
        self.assertEqual(offline_transport.fixture("https://example.test/page","HEAD")[0],b"")
        for url,method in [("https://example.test/page?different=1","GET"),("https://example.test/page","POST"),("file:///etc/passwd","GET")]:
            with self.assertRaises(URLError):
                offline_transport.fixture(url,method)

    def test_requests_and_urllib_use_bytes_without_network(self):
        import urllib.request
        try:
            import requests
        except ImportError:
            self.skipTest("requests is installed in the Docker image; unavailable in this host environment")
        with patch.object(urllib.request.OpenerDirector,"open"), patch.object(requests.sessions.Session,"send"), patch("socket.create_connection",side_effect=AssertionError("unexpected network")):
            offline_transport.install()
            response=requests.get("https://example.test/page")
            self.assertEqual(response.text,"你好")
            self.assertEqual(response.status_code,200)
            self.assertEqual(b"".join(response.iter_content(2)),"你好".encode("gbk"))
            with urllib.request.urlopen("https://example.test/page") as response:
                self.assertEqual(response.read().decode("gbk"),"你好")
            with self.assertRaises(requests.exceptions.ConnectionError):
                requests.get("https://unarchived.test/")

    def test_manifest_path_cannot_escape_fixture_root(self):
        from urllib.error import URLError
        offline_transport.INDEX["https://example.test/bad"]={"path":"/content/../../secret"}
        with self.assertRaises(URLError):
            offline_transport.fixture("https://example.test/bad")


class NativeAuditPlanTests(unittest.TestCase):
    def test_dedup_solutions_and_missing_input_are_explicit(self):
        spec=importlib.util.spec_from_file_location("native_audit",Path(__file__).resolve().parents[1]/"runner/native-audit.py")
        audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);pages=root/"public/content/pages";challenges=root/"public/content/challenges"
            pages.mkdir(parents=True);challenges.mkdir(parents=True)
            challenge={"challenge_id":1,"title":"test","code_templates":[{"language":"cpp","template":"// write code", "solution_code":"int main(){return 0;}"}],"testcases":[{"stdin":"","expected_output":""}]}
            code=lambda source,runnable=True:{"type":"Code","content":{"language":"c","content":source,"runnable":runnable}}
            (pages/"one.json").write_text(json.dumps({"title":"lesson","components":[code('int main(){return 0;}'),code('int main(){return 0;}'),code('int main(){int x;scanf("%d",&x);}'),code('// TODO'),code('syntax example',False),{"type":"ChallengeRef","resolved":challenge}]}))
            (challenges/"one.json").write_text(json.dumps(challenge))
            plan=audit.prepare(root)
            self.assertEqual(plan["summary"]["deduplicatedTasks"],2)
            self.assertEqual(plan["summary"]["publicTestCases"],1)
            reasons=plan["summary"]["skippedOccurrences"]
            self.assertEqual(reasons["requires_unspecified_stdin"],1)
            self.assertEqual(reasons["unfinished_template_candidate"],1)
            self.assertEqual(reasons["source_not_runnable"],1)
            self.assertTrue(all(len(task["origins"])==2 for task in plan["tasks"]))


class HttpBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.RunnerServer(("127.0.0.1",0), "test-token-" + "a" * 32)
        cls.thread = threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def setUp(self):
        self.limiter = patch.object(server, "LIMITER", server.RateLimiter())
        self.limiter.start()
        self.addCleanup(self.limiter.stop)

    def call(self, headers=None, body=None):
        default={"Authorization":"Bearer " + self.http.runner_token,"X-Client-Id":"a"*64,"Content-Type":"application/json"}
        default.update(headers or {})
        conn=http.client.HTTPConnection(*self.http.server_address, timeout=3)
        conn.request("POST","/run",json.dumps(body or {"language":"python","code":"fixture"}),default)
        response=conn.getresponse()
        status,data=response.status,json.loads(response.read())
        conn.close()
        return status,data

    def test_auth_and_trusted_identifier(self):
        self.assertEqual(self.call({"Authorization":"Bearer incorrect"})[0],401)
        self.assertEqual(self.call({"X-Client-Id":"bad"})[0],400)

    def test_body_and_type_rejected_before_execution(self):
        with patch.object(server,"execute_request") as run:
            self.assertEqual(self.call(body={"language":"c", "code":"x"*300000})[0],413)
            self.assertEqual(self.call({"Content-Type":"text/plain"})[0],415)
            self.assertEqual(self.call(body={"language":"c", "code":"", "files":[{"file_name":"../x","content":""}]})[0],400)
            run.assert_not_called()

    def test_busy_rate_limit_and_valid_result(self):
        with patch.object(server,"execute_request", return_value=(200,{"stdout":"ok\n","stderr":"","exitCode":0,"timedOut":False})) as run:
            for _ in range(6):
                self.assertEqual(self.call()[0],200)
            self.assertEqual(self.call()[0],429)
            self.assertEqual(run.call_count,6)
            server.CONCURRENCY.acquire()
            try:
                self.assertEqual(self.call({"X-Client-Id":"b"*64})[0],503)
            finally:
                server.CONCURRENCY.release()

    def test_rate_expiry_and_bounded_client_memory(self):
        now=[10]
        limiter=server.RateLimiter(count=2,capacity=2,clock=lambda:now[0])
        self.assertTrue(limiter.allow("a")[0])
        self.assertTrue(limiter.allow("a")[0])
        self.assertFalse(limiter.allow("a")[0])
        now[0]=71
        self.assertTrue(limiter.allow("a")[0])
        limiter.allow("b");limiter.allow("c")
        self.assertEqual(len(limiter.clients),2)


if __name__ == "__main__":
    unittest.main()
