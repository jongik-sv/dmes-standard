#!/bin/bash
# CSV(round,time,target,mode,metric,value,rc,load1)를 모드×지표×대상 중앙값으로 요약한다.
# 사용: summarize.sh <csv> [지표이름(생략하면 전부)]    rc!=0 행과 빈 값은 제외하고 개수를 따로 보인다.
f="${1:?csv 경로}"; metric="${2:-}"
[ -s "$f" ] || { echo "CSV 없음: $f" >&2; exit 1; }
awk -F, -v m="$metric" '
NR==1 { next }
m != "" && $5 != m { next }
{ key=$4 SUBSEP $5 SUBSEP $3
  if (!(key in seen)) { seen[key]=1; order[++n]=key }
  all[key]++
  if ($7 == 0 && $6 != "") { c[key]++; v[key, c[key]]=$6+0; ls[key]+=$8 }
}
function median(key,   i,j,k,t,a) {
  k=c[key]; if (k==0) return "-"
  for (i=1;i<=k;i++) a[i]=v[key,i]
  for (i=2;i<=k;i++) { t=a[i]; for (j=i-1;j>=1 && a[j]>t;j--) a[j+1]=a[j]; a[j+1]=t }
  return (k%2) ? a[(k+1)/2] : (a[k/2]+a[k/2+1])/2
}
END {
  printf "%-6s %-34s %-6s %10s %6s %6s %8s %8s\n", "mode","metric","target","median","ok","all","min","max"
  for (i=1;i<=n;i++) { key=order[i]; split(key, p, SUBSEP)
    mn="-"; mx="-"
    for (j=1;j<=c[key];j++) { x=v[key,j]; if (mn=="-"||x<mn) mn=x; if (mx=="-"||x>mx) mx=x }
    printf "%-6s %-34s %-6s %10s %6d %6d %8s %8s  load=%.1f\n", p[1],p[2],p[3],median(key),c[key],all[key],mn,mx,(c[key]?ls[key]/c[key]:0)
    med[p[1] SUBSEP p[2] SUBSEP p[3]]=median(key)
  }
  # A 대비 B 증감(%)
  for (i=1;i<=n;i++) { split(order[i], p, SUBSEP)
    if (p[3]!="B") continue
    a=med[p[1] SUBSEP p[2] SUBSEP "A"]; b=med[p[1] SUBSEP p[2] SUBSEP "B"]
    if (a!="" && a!="-" && b!="-" && a+0!=0) printf "B vs A  %-6s %-34s %+.1f%%  (A=%s -> B=%s)\n", p[1],p[2],(b-a)/a*100,a,b
  }
}' "$f"
