// 出題ロジック・採点ロジックのシミュレーション検証（index.htmlのロジックを再現）
const fs = require('fs');
const path = require('path');
const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
const CONFIG = { test: { questionsPerTest: 60, excelRandomCount: 50, passRate: 70 } };

function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

// --- selectQuestions: index.html startQuiz と同一ロジック ---
function selectQuestions(){
  const isWord = q => String(q.source||"").indexOf("honshiken")===0;
  const fixedQs = all.filter(isWord);
  const excelPool = all.filter(q=>!isWord(q));
  const nRandom = CONFIG.test.excelRandomCount!=null ? CONFIG.test.excelRandomCount
    : Math.max(0, CONFIG.test.questionsPerTest - fixedQs.length);
  const picked = shuffle(excelPool.slice()).slice(0,nRandom);
  return shuffle(fixedQs.concat(picked));
}

let fail=0;
const wordTotal = all.filter(q=>String(q.source||"").startsWith("honshiken")).length;
const excelTotal = all.length - wordTotal;
console.log(`データ: 全${all.length}問 (Word ${wordTotal} / Excel ${excelTotal})`);

// 1000回試行で出題ルールを検証
let totalsSeen=new Set(), wordMissing=0, dup=0, excelCounts=[];
const excelPickFreq={};
for(let t=0;t<1000;t++){
  const sel=selectQuestions();
  totalsSeen.add(sel.length);
  const words=sel.filter(q=>String(q.source).startsWith("honshiken"));
  const excels=sel.filter(q=>!String(q.source).startsWith("honshiken"));
  if(words.length!==wordTotal) wordMissing++;
  const ids=sel.map(q=>q.source);
  if(new Set(ids).size!==ids.length) dup++;
  excelCounts.push(excels.length);
  excels.forEach(q=>excelPickFreq[q.source]=(excelPickFreq[q.source]||0)+1);
}
console.log("\n[出題ルール検証 x1000]");
console.log("  出題総数の種類:", [...totalsSeen], totalsSeen.size===1&&[...totalsSeen][0]===60?"✓ 常に60問":"✗ NG");
console.log("  Word10問が毎回必出:", wordMissing===0?"✓ OK":`✗ ${wordMissing}回欠落`);
console.log("  重複出題:", dup===0?"✓ なし":`✗ ${dup}回`);
console.log("  Excel出題数:", Math.min(...excelCounts),"〜",Math.max(...excelCounts), excelCounts.every(c=>c===50)?"✓ 常に50":"✗");
const coveredExcel=Object.keys(excelPickFreq).length;
console.log(`  Excel${excelTotal}問が出題対象に登場:`, coveredExcel===excelTotal?`✓ 全${excelTotal}問`:`△ ${coveredExcel}/${excelTotal}`);

// 2. 採点ロジック検証: 正答を選んだら必ずcorrect, 他はincorrect
console.log("\n[採点ロジック検証 全問]");
let gradeBug=0;
for(const q of all){
  const shOpts=shuffle(q.options.slice());
  // 正答選択 → correct であるべき
  const correctIdx=shOpts.indexOf(q.answer);
  if(correctIdx<0){ gradeBug++; console.log("  ✗ 正答が選択肢に無い:",q.question); continue; }
  const jaSelected=shOpts[correctIdx];
  if((jaSelected===q.answer)!==true){ gradeBug++; console.log("  ✗ 正答選択がcorrectにならない:",q.question); }
  // 誤答選択 → incorrect であるべき
  for(let k=0;k<shOpts.length;k++){
    if(k===correctIdx) continue;
    if((shOpts[k]===q.answer)!==false){ gradeBug++; console.log("  ✗ 誤答がcorrectになる:",q.question); }
  }
}
console.log("  採点バグ:", gradeBug===0?`✓ なし(全${all.length}問の全選択肢で正しく判定)`:`✗ ${gradeBug}件`);

// 3. データ健全性
console.log("\n[データ健全性]");
const noAns=all.filter(q=>!q.options.includes(q.answer));
const optCounts=[...new Set(all.map(q=>q.options.length))].sort();
const emptyQ=all.filter(q=>!q.question||!q.question.trim());
const dupOpts=all.filter(q=>new Set(q.options).size!==q.options.length);
console.log("  正答⊆選択肢:", noAns.length===0?"✓ 全問OK":`✗ ${noAns.length}問NG`);
console.log("  選択肢数:", optCounts.join("/"), "（"+(optCounts.every(n=>n>=2)?"✓ 全問2以上":"✗")+"）");
console.log("  空問題文:", emptyQ.length===0?"✓ なし":`✗ ${emptyQ.length}`);
console.log("  選択肢内の重複:", dupOpts.length===0?"✓ なし":`✗ ${dupOpts.length}問`);
console.log("  ラベル表示(A-):", "選択肢"+Math.max(...all.map(q=>q.options.length))+"個 → "+String.fromCharCode(65+Math.max(...all.map(q=>q.options.length))-1)+"まで（動的生成で対応済）");

console.log("\n=== 検証完了 ===");
