export function lineDiff(before='',after='',limit=240){
  const a=String(before).split('\n'),b=String(after).split('\n'),out=[];
  if(a.length*b.length>120000){
    let start=0,endA=a.length,endB=b.length;
    while(start<endA&&start<endB&&a[start]===b[start])start++;
    while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--}
    for(let i=Math.max(0,start-3);i<start;i++)out.push(['same','  '+a[i]]);
    for(let i=start;i<endA&&out.length<limit;i++)out.push(['del','- '+a[i]]);
    for(let i=start;i<endB&&out.length<limit;i++)out.push(['add','+ '+b[i]]);
    if(endA-start+endB-start>limit)out.push(['same','… عرض مختصر؛ افتح الملف لمراجعة المحتوى الكامل …']);
    return out;
  }
  const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  let i=0,j=0;
  while((i<a.length||j<b.length)&&out.length<limit){
    if(i<a.length&&j<b.length&&a[i]===b[j]){out.push(['same','  '+a[i]]);i++;j++}
    else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j]))out.push(['add','+ '+b[j++]]);
    else out.push(['del','- '+a[i++]]);
  }
  if(i<a.length||j<b.length)out.push(['same','… عرض مختصر …']);return out;
}
