s=open("comparison3.html",encoding="utf-8").read()
out="".join("&#%d;"%ord(c) if ord(c)>127 else c for c in s)
open("comparison3.html","w",encoding="utf-8").write(out)
print("entities applied; size %.0f KB"%(len(out)/1024))
