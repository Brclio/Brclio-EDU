"""Invoke installed BaoTa project APIs for the isolated EDU runner only.

Run with the panel's Python interpreter from /www/server/panel. No credential
values are printed; the API token stays in /etc/brclio-edu-runner.env.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import sys

PANEL = '/www/server/panel'
NAME = 'brclio-edu-runner'
DOMAIN = 'edu-runner.bornforthis.cn'
ROOT = '/www/wwwroot/brclio-edu-runner'
PYTHON = '/www/server/pyporject_evn/brclio-edu-runner/bin/python'
os.chdir(PANEL)
sys.path[:0] = [PANEL + '/class', PANEL]
import public
from projectModel.pythonModel import main

model = main()
def args(**values):
    result = public.dict_obj()
    for key, value in values.items(): setattr(result, key, value)
    return result

def project():
    result = model.get_project_find(NAME)
    if not result: raise RuntimeError('Runner project is not registered')
    return result

operation = sys.argv[1]
if operation == 'register':
    if not Path(ROOT + '/server.py').is_file(): raise RuntimeError('Missing runner source')
    baseline = '/var/lib/brclio-edu-runner/vhost-baseline.json'
    Path('/var/lib/brclio-edu-runner').mkdir(mode=0o700, parents=True, exist_ok=True)
    if not Path(baseline).exists():
        files = Path(PANEL + '/vhost/nginx').glob('*.conf')
        Path(baseline).write_text(json.dumps({str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}, indent=2))
    if model.get_project_find(NAME):
        result = {'status': True, 'msg': 'Project already registered'}
    else:
        result = model.CreateProject(args(pjname=NAME, port=18731, stype='command', path=ROOT,
          python_bin=PYTHON, user='root', framework='python', requirement_path='',
          env_list=[], env_file='', auto_run=True,
          project_cmd=PYTHON + ' -u ' + ROOT + '/server-launch.py', release_firewall=False))
    print(json.dumps(result, ensure_ascii=False))
elif operation == 'restart':
    print(json.dumps(model.RestartProject(args(name=NAME)), ensure_ascii=False))
elif operation == 'launch':
    result = model.ChangeProjectConf(args(name=NAME, data={'env_file': '', 'project_cmd': PYTHON + ' -u ' + ROOT + '/server-launch.py'}))
    print(json.dumps(result, ensure_ascii=False))
elif operation == 'status':
    item = project()
    conf = item['project_config']
    print(json.dumps({'name': NAME, 'id': item['id'], 'prep_status': model.prep_status(conf),
      'running': model.get_project_run_state(NAME), 'domains': conf.get('domains'),
      'bind_extranet': conf.get('bind_extranet'), 'port': conf.get('port'), 'ssl_path': conf.get('ssl_path')}, ensure_ascii=False))
elif operation == 'bind':
    item = project()
    if model.prep_status(item['project_config']) != 'complete': raise RuntimeError('Preparation incomplete')
    print(json.dumps(model.AddProjectDomain(args(name=NAME, domains=[DOMAIN])), ensure_ascii=False))
    print(json.dumps(model.BindExtranet(args(name=NAME)), ensure_ascii=False))
elif operation == 'proxy':
    from BTPanel import app
    with app.app_context():
        result = model.add_server_proxy(args(site_name=NAME, status=1, proxy_path='/', proxy_port=18731))
        print(result.get_data(as_text=True) if hasattr(result, 'get_data') else json.dumps(result, ensure_ascii=False))
elif operation == 'probe':
    item = project()
    root = Path(item['project_config'].get('ssl_path') or '/www/wwwroot/java_node_ssl')
    challenge = root / '.well-known/acme-challenge/brclio-edu-runner-origin-probe'
    challenge.parent.mkdir(parents=True, exist_ok=True)
    challenge.write_text('brclio-edu-runner-origin-confirmed-20261101')
    print(json.dumps({'probe_path': str(challenge), 'url': 'http://' + DOMAIN + '/.well-known/acme-challenge/' + challenge.name}))
elif operation == 'certificate':
    import acme_v2
    import panelSite
    item = project()
    response = acme_v2.acme_v2().apply_cert_api(args(id=item['id'], domains=json.dumps([DOMAIN]),
       auth_type='http', auth_to=item['project_config'].get('ssl_path') or '/www/wwwroot/java_node_ssl', ca='letsencrypt'))
    if not response.get('status'):
        print(json.dumps({'status': False, 'msg': response.get('msg')}, ensure_ascii=False)); sys.exit(1)
    result = panelSite.panelSite().SetSSL(args(siteName=NAME, key=response['private_key'], csr=response['cert'] + response.get('root',''), type='1'))
    print(json.dumps({'status': result.get('status'), 'msg': result.get('msg'), 'domain': DOMAIN}, ensure_ascii=False))
elif operation == 'install-certificate':
    import panelSite
    private = Path('/var/lib/brclio-edu-runner/tls')
    response = panelSite.panelSite().SetSSL(args(siteName=NAME, key=(private/'privkey.pem').read_text(), csr=(private/'fullchain.pem').read_text(), type='1'))
    Path(PANEL + '/vhost/cert/' + NAME + '/privkey.pem').chmod(0o600)
    print(json.dumps({'status': response.get('status'), 'msg': response.get('msg'), 'domain': DOMAIN}, ensure_ascii=False))
elif operation == 'baseline':
    baseline = json.loads(Path('/var/lib/brclio-edu-runner/vhost-baseline.json').read_text())
    changes = [p for p, digest in baseline.items() if not Path(p).exists() or hashlib.sha256(Path(p).read_bytes()).hexdigest() != digest]
    print(json.dumps({'existing_vhost_changes': changes}, ensure_ascii=False))
else:
    raise RuntimeError('Unknown operation')
