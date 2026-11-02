"""Exact JSON structural differences for live source verification."""

def changed_fields(old,current,trail=''):
 # Preserve container shape, scalar types and missing/null distinctions.
 if type(old) is not type(current):return [trail or '/']
 if isinstance(old,dict):
  changes=[]
  for key in sorted(old.keys()|current.keys()):
   child=trail+'/'+key.replace('~','~0').replace('/','~1')
   changes.extend([child] if key not in old or key not in current else changed_fields(old[key],current[key],child))
  return changes
 if isinstance(old,list):
  if len(old)!=len(current):return [trail or '/']
  return [p for i,(a,b) in enumerate(zip(old,current)) for p in changed_fields(a,b,trail+'/'+str(i))]
 return [] if old==current else [trail or '/']
