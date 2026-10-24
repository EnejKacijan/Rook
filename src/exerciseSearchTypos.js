// Interactive suggestions only. Import identity matching deliberately does not
// use this module. Work is bounded even for pasted queries and custom names.
export function prepareTypoText(normalized) {
  return {compact:normalized.replace(/\s+/g,''),words:normalized.split(' ').filter(Boolean),numbers:normalized.match(/\d+/g)||[]};
}

function boundedDistance(left,right,limit) {
  if(left===right)return 0;
  if(Math.abs(left.length-right.length)>limit)return Infinity;
  let previous=Array.from({length:right.length+1},(_,i)=>i),older;
  for(let i=1;i<=left.length;i++){
    const current=Array(right.length+1).fill(Infinity);current[0]=i;
    let minimum=current[0];
    for(let j=Math.max(1,i-limit);j<=Math.min(right.length,i+limit);j++){
      current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+Number(left[i-1]!==right[j-1]));
      if(i>1&&j>1&&left[i-1]===right[j-2]&&left[i-2]===right[j-1])current[j]=Math.min(current[j],older[j-2]+1);
      minimum=Math.min(minimum,current[j]);
    }
    if(minimum>limit)return Infinity;
    older=previous;previous=current;
  }
  return previous[right.length]<=limit?previous[right.length]:Infinity;
}
function distance(left,right,limit,cache) {
  const key=`${limit}:${left}:${right}`;
  if(!cache.has(key))cache.set(key,boundedDistance(left,right,limit));
  return cache.get(key);
}

function wordDistance(query,word,last,cache) {
  if(query===word||(last&&query.length>=2&&word.startsWith(query)))return 0;
  if(query.length<4)return Infinity;
  const limit=query.length>=8?2:1;
  let best=distance(query,word,limit,cache);
  // The last word may still be in progress, including a typo in its prefix.
  if(last&&word.length>query.length)for(const length of [query.length-1,query.length,query.length+1]){
    best=Math.min(best,distance(query,word.slice(0,length),limit,cache));
  }
  return best;
}

export function typoNameScore(name,query,cache) {
  if(query.compact.length<4||query.compact.length>96||query.words.length>8||name.compact.length<4||name.words.length>16)return Infinity;
  // A typed angle, number of arms, etc. must remain an exact numeric match.
  if(query.numbers.some(number=>!name.numbers.includes(number)))return Infinity;
  const budget=query.compact.length>=8?2:1;
  const best=distance(query.compact,name.compact,budget,cache)*1000;
  if(query.words.length>name.words.length)return best;
  const rows=query.words.map((word,index)=>name.words.map((candidate,i)=>({index:i,cost:wordDistance(word,candidate,index===query.words.length-1,cache)})).filter(item=>item.cost<=budget).sort((a,b)=>a.cost-b.cost));
  if(rows.some(row=>!row.length))return best;
  rows.sort((a,b)=>a.length-b.length);
  const lowerBound=rows.reduce((sum,row)=>sum+row[0].cost,0);
  if(lowerBound>budget)return best;
  let edits=Infinity;
  const visited=new Map();
  const visit=(row,used,total)=>{
    if(total>=edits||total>budget)return;
    if(visited.has(used)&&visited.get(used)<=total)return;
    visited.set(used,total);
    if(row===rows.length){edits=total;return;}
    for(const candidate of rows[row]){
      const bit=1<<candidate.index;
      if(!(used&bit))visit(row+1,used|bit,total+candidate.cost);
      if(edits===lowerBound)return;
    }
  };
  visit(0,0,0);
  return Math.min(best,edits*1000+(name.words.length-query.words.length)*10);
}
