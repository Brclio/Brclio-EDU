#!/usr/bin/env python3
"""Run authored fixtures through the authenticated HTTP/Docker boundary, never locally."""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

FIXTURES = {
    "c": '#include <stdio.h>\nint main(void){int a,b;scanf("%d%d",&a,&b);printf("%d\\n",a+b);}',
    "cpp": '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
    "java": 'import java.util.Scanner; public class Example { public static void main(String[] args){ Scanner s=new Scanner(System.in); System.out.println(s.nextInt()+s.nextInt()); }}',
    "go-1165": 'package main\nimport "fmt"\nfunc main(){var a,b int;fmt.Scan(&a,&b);fmt.Println(a+b)}',
    "js": 'let a=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a[0]+a[1]);',
    "python": 'a,b=map(int,input().split());print(a+b)',
    "sql": 'SELECT 2+4;',
    "sh": 'read a b\nprintf "%s\\n" "$((a+b))"',
    "bash": 'read a b\nprintf "%s\\n" "$((a+b))"',
    "ts": 'let a: number = 2; let b: number = 4; console.log(a+b);',
    "cs": 'using System; class Example { static void Main(){string[] a=Console.ReadLine().Split();Console.WriteLine(int.Parse(a[0])+int.Parse(a[1]));}}',
    "ruby": 'a,b=STDIN.read.split.map(&:to_i); puts a+b',
    "rust": 'use std::io::{self,Read};fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();let a:Vec<i32>=s.split_whitespace().map(|x|x.parse().unwrap()).collect();println!("{}",a[0]+a[1]);}',
    "php": '<?php $a=preg_split("/\\s+/",trim(file_get_contents("php://stdin"))); echo ($a[0]+$a[1])."\\n";',
    "swift": 'import Swift\nfunc add(p1: Int,p2: Int)->Int{return p1+p2}\nprint(add(p1:2,p2:4))',
}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--base",default="http://127.0.0.1:18731")
    parser.add_argument("--languages",default=",".join(FIXTURES))
    args=parser.parse_args()
    token=os.environ.get("RUNNER_TOKEN")
    if not token:
        raise SystemExit("Set RUNNER_TOKEN in the process environment without logging it.")
    batch=uuid.uuid4().hex
    failures=0
    for language in args.languages.split(","):
        code=FIXTURES[language]
        payload={"language":language,"code":code,"stdin":"2 4\n","testcases":[{"case_no":"smoke","input":"2 4\n","output":"6\n"}]}
        headers={"Authorization":"Bearer "+token,"Content-Type":"application/json",
                 "X-Client-Id":hashlib.sha256((batch+language).encode()).hexdigest()}
        started=time.monotonic()
        try:
            req=urllib.request.Request(args.base.rstrip("/")+"/run",json.dumps(payload).encode(),headers)
            with urllib.request.urlopen(req,timeout=60) as response:
                result=json.load(response)
            passed=result.get("exitCode")==0 and not result.get("timedOut") and all(case.get("succeeded") for case in result.get("testResults",[])) and result.get("stdout","").rstrip()=="6"
            record={"language":language,"passed":passed,"seconds":round(time.monotonic()-started,2),"exitCode":result.get("exitCode"),"timedOut":result.get("timedOut")}
            if not passed:
                record["stderr"]=result.get("stderr","")[:500]
        except (urllib.error.URLError,ValueError,TimeoutError) as error:
            passed=False
            record={"language":language,"passed":False,"error":str(error)}
        print(json.dumps(record,ensure_ascii=False),flush=True)
        failures+=not passed
    return int(failures>0)

if __name__ == "__main__":
    sys.exit(main())
