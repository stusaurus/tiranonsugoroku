(function () {
  "use strict";

  const MAX_TURNS = 12;
  const CARD_COUNTS = { 1: 4, 2: 4, 3: 4 };
  const STORAGE_KEYS = {
    strategyBestScore: "tiranon-strategy-best-score",
    stageStars: "tiranon-stage-stars"
  };
  const BOARD = {
    start: "start", goal: "goal",
    nodes: {
      start:{ x:0,y:3,label:"START",next:["a1"] }, a1:{x:1,y:3,next:["a2"]}, a2:{x:2,y:3,special:"meat",next:["b1"]},
      b1:{x:3,y:3,special:"branch",next:["u1","l1"],routes:["⭐ 近道","🍖 より道"]}, u1:{x:3,y:2,special:"pepper",next:["u2"]}, u2:{x:4,y:2,special:"star",next:["r1"]},
      l1:{x:3,y:4,special:"meat",next:["l2"]}, l2:{x:4,y:4,next:["l3"]}, l3:{x:5,y:4,special:"meat",next:["l4"]}, l4:{x:5,y:3,special:"star",next:["r1"]},
      r1:{x:5,y:2,next:["c1"]}, c1:{x:6,y:2,special:"pepper",next:["c2"]}, c2:{x:6,y:1,next:["b2"]},
      b2:{x:5,y:1,special:"branch",next:["v1","w1"],routes:["🛡️ 安全な道","⭐ 高得点の道"]}, v1:{x:4,y:1,next:["v2"]}, v2:{x:3,y:1,special:"meat",next:["r2"]},
      w1:{x:5,y:0,special:"star",next:["w2"]}, w2:{x:4,y:0,special:"pepper",next:["w3"]}, w3:{x:3,y:0,special:"star",next:["w4"]}, w4:{x:2,y:0,special:"pepper",next:["r2"]},
      r2:{x:2,y:1,next:["d1"]}, d1:{x:1,y:1,special:"meat",next:["d2"]}, d2:{x:0,y:1,special:"pepper",next:["goal"]}, goal:{x:0,y:0,label:"GOAL",special:"goal",next:[]}
    }
  };
  const SPECIALS = { meat:{icon:"🍖",points:1,name:"お肉"}, star:{icon:"⭐",points:3,name:"スター"}, pepper:{icon:"🫑",points:-2,name:"ピーマン"}, branch:{icon:"↔",points:0,name:"分岐"}, goal:{icon:"🏁",points:0,name:"GOAL"} };
  const COMMANDS = { forward:{label:"すすむ",icon:"⬆️"}, right:{label:"みぎ",icon:"↪️"}, left:{label:"ひだり",icon:"↩️"} };
  const DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]];
  const STAGES = [
    { title:"まずは まっすぐ", mission:"まっすぐ GOALへ！", start:[0,4], goal:[0,0], direction:0, path:[[0,4],[0,3],[0,2],[0,1],[0,0]], optimal:4 },
    { title:"みぎへ まがろう", mission:"みぎに まがって GOALへ！", start:[0,4], goal:[3,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2]], optimal:6 },
    { title:"ジグザグみち", mission:"2かい まがろう！", start:[0,4], goal:[3,0], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2],[3,1],[3,0]], optimal:9 },
    { title:"お肉を ゲット", mission:"お肉を とって GOALへ！", start:[0,4], goal:[4,0], meat:[2,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2],[4,2],[4,1],[4,0]], optimal:10 },
    { title:"ピーマンを よけろ", mission:"🫑を よけて GOALへ！", start:[0,4], goal:[4,0], pepper:[2,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[1,1],[2,1],[3,1],[3,2],[4,2],[4,1],[4,0]], optimal:12 },
    { title:"よくばりロード", mission:"遠回りして お肉をゲット！", start:[0,4], goal:[4,4], meat:[2,0], pepper:[3,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[2,1],[2,0],[3,0],[4,0],[4,1],[4,2],[4,3],[4,4]], optimal:16 }
  ];

  const Logic = {
    cardDeck() { return Object.entries(CARD_COUNTS).flatMap(([value,count]) => Array(count).fill(Number(value))); },
    shuffle(cards, random=Math.random) { const result=[...cards]; for(let i=result.length-1;i>0;i-=1){ const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result; },
    initialStrategy(deck=Logic.cardDeck()) { return { position:BOARD.start, hand:[1,2,3], deck:[...deck], discard:[], turn:0, score:0, meat:0, star:0, pepper:0, status:"playing" }; },
    drawCard(state, random=Math.random) { const next={...state,hand:[...state.hand],deck:[...state.deck],discard:[...state.discard]}; if(!next.deck.length){ next.deck=Logic.shuffle(next.discard,random); next.discard=[]; } if(next.deck.length) next.hand.push(next.deck.shift()); return next; },
    useCard(state,index,random=Math.random) { const next={...state,hand:[...state.hand],discard:[...state.discard]}; next.discard.push(next.hand.splice(index,1)[0]); return Logic.drawCard(next,random); },
    destinations(position,steps,board=BOARD) { if(position===board.goal || steps===0) return [position]; const node=board.nodes[position]; return [...new Set(node.next.flatMap(id=>Logic.destinations(id,steps-1,board)))]; },
    applySpecial(state,node) { const next={...state}; const type=node.special; if(type==="meat"){next.score+=1;next.meat+=1;} if(type==="star"){next.score+=3;next.star+=1;} if(type==="pepper"){next.score=Math.max(0,next.score-2);next.pepper+=1;} return next; },
    finishTurn(state,position,board=BOARD) { let next=Logic.applySpecial({...state,position},board.nodes[position]); next.turn+=1; next.status=position===board.goal?"clear":next.turn>=MAX_TURNS?"failed":"playing"; return next; },
    initialProgramState(stage) { return { x:stage.start[0],y:stage.start[1],direction:stage.direction,meat:false,failed:false }; },
    stepProgram(state,command,stage) { const next={...state}; if(command==="right")next.direction=(next.direction+1)%4; if(command==="left")next.direction=(next.direction+3)%4; if(command==="forward"){const d=DIRECTIONS[next.direction],target=[next.x+d[0],next.y+d[1]];const onPath=stage.path.some(([x,y])=>x===target[0]&&y===target[1]);const onPepper=stage.pepper&&target[0]===stage.pepper[0]&&target[1]===stage.pepper[1];if(!onPath||onPepper)return {...next,failed:true};[next.x,next.y]=target;if(stage.meat&&next.x===stage.meat[0]&&next.y===stage.meat[1])next.meat=true;} return next; },
    isStageClear(state,stage) { return state.x===stage.goal[0]&&state.y===stage.goal[1]&&(!stage.meat||state.meat); },
    starsFor(count,optimal) { return count<=optimal?3:count<=optimal+2?2:1; }
  };

  if(typeof module!=="undefined") module.exports={Logic,STAGES,STORAGE_KEYS,BOARD,CARD_COUNTS,MAX_TURNS};
  if(typeof document==="undefined") return;
  const $=id=>document.getElementById(id); const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const Storage={getNumber(key){try{return Number(localStorage.getItem(key))||0;}catch(_){return 0;}},getObject(key){try{return JSON.parse(localStorage.getItem(key)||"{}");}catch(_){return {};}},set(key,value){try{localStorage.setItem(key,typeof value==="object"?JSON.stringify(value):String(value));}catch(_){}}};
  let sugoroku, replayDeck=[]; let program={stageIndex:0,commands:[],state:null,running:false,activeCommand:-1};
  function showScreen(id){document.querySelectorAll(".screen").forEach(screen=>screen.classList.toggle("active",screen.id===id));closeResult();window.scrollTo(0,0);}
  document.querySelectorAll("[data-title]").forEach(button=>button.addEventListener("click",()=>showScreen("title-screen")));
  document.querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",()=>{const target=button.dataset.open;showScreen(target);if(target==="sugoroku-screen")resetSugoroku(false);if(target==="stage-screen")renderStageSelect();}));

  function resetSugoroku(sameOrder=false){ if(!sameOrder||!replayDeck.length) replayDeck=Logic.shuffle(Logic.cardDeck()); sugoroku={...Logic.initialStrategy(replayDeck),selected:null,locked:false}; $("sugoroku-message").textContent="カードを選ぶと 到着マスが光るよ！"; renderSugoroku(); }
  function renderSugoroku(){
    const board=$("sugoroku-board");board.innerHTML=""; const previews=sugoroku.selected===null?[]:Logic.destinations(sugoroku.position,sugoroku.hand[sugoroku.selected]);
    Object.entries(BOARD.nodes).forEach(([id,node])=>{const tile=document.createElement("div");tile.className=`path-tile${id===sugoroku.position?" current":""}${previews.includes(id)?" preview":""}`;tile.style.gridColumn=node.x+1;tile.style.gridRow=node.y+1;tile.dataset.node=id;const special=SPECIALS[node.special];tile.innerHTML=node.label?`<small>${node.label}</small>${special?`<span>${special.icon}</span>`:""}`:(special?`<span>${special.icon}</span>`:"<i>•</i>");if(id===sugoroku.position){const pawn=document.createElement("span");pawn.className="pawn game-piece";pawn.textContent="🦖";tile.append(pawn);}board.append(tile);});
    $("score-label").textContent=sugoroku.score;$("turn-label").textContent=MAX_TURNS-sugoroku.turn;$("position-label").textContent=`現在 ${BOARD.nodes[sugoroku.position].label||sugoroku.position.toUpperCase()}`;const best=Storage.getNumber(STORAGE_KEYS.strategyBestScore);$("sugoroku-records").innerHTML=`BEST <b>${best}点</b>`;
    $("card-hand").innerHTML=sugoroku.hand.map((value,index)=>`<button class="move-card${index===sugoroku.selected?" selected":""}" data-card="${index}" ${sugoroku.locked?"disabled":""}><small>すすむ</small><b>+${value}</b><span>${index===sugoroku.selected?(previews.length>1?"分岐あり":`→ ${previews[0]===BOARD.goal?"GOAL":previews[0].toUpperCase()}`):"到着を見る"}</span></button>`).join("");
    document.querySelectorAll("[data-card]").forEach(button=>button.addEventListener("click",()=>{if(sugoroku.locked)return;sugoroku.selected=Number(button.dataset.card);$("sugoroku-message").textContent=Logic.destinations(sugoroku.position,sugoroku.hand[sugoroku.selected]).length>1?"途中に分岐あり。進むと道を選べるよ":"光ったマスに止まるよ";renderSugoroku();}));
    $("move-button").disabled=sugoroku.locked||sugoroku.selected===null;$("move-button").textContent=sugoroku.selected===null?"カードを選んでね":`+${sugoroku.hand[sugoroku.selected]} で進む！`;
  }
  function chooseBranch(node){return new Promise(resolve=>{sugoroku.locked=true;renderSugoroku();$("branch-choice").hidden=false;$("branch-options").innerHTML=node.next.map((id,i)=>`<button data-route="${i}">${node.routes[i]}</button>`).join("");$("branch-options").querySelectorAll("button").forEach(button=>button.onclick=()=>{$("branch-choice").hidden=true;resolve(node.next[Number(button.dataset.route)]);});});}
  async function moveSugoroku(){if(sugoroku.locked||sugoroku.selected===null)return;sugoroku.locked=true;const index=sugoroku.selected,steps=sugoroku.hand[index];sugoroku=Logic.useCard(sugoroku,index);sugoroku.selected=null;renderSugoroku();let position=sugoroku.position;for(let step=0;step<steps&&position!==BOARD.goal;step+=1){const node=BOARD.nodes[position];const next=node.next.length>1?await chooseBranch(node):node.next[0];position=next;sugoroku.position=position;renderSugoroku();await wait(180);}sugoroku=Logic.finishTurn(sugoroku,position);sugoroku.locked=true;renderSugoroku();if(sugoroku.status!=="playing")return finishSugoroku();const special=SPECIALS[BOARD.nodes[position].special];$("sugoroku-message").textContent=special&&special.points?`${special.icon} ${special.name}！ ${special.points>0?"+":""}${special.points}点`:`${steps}マス進んだよ。次のカードは？`;sugoroku.locked=false;renderSugoroku();}
  function finishSugoroku(){const clear=sugoroku.status==="clear";if(clear&&sugoroku.score>Storage.getNumber(STORAGE_KEYS.strategyBestScore))Storage.set(STORAGE_KEYS.strategyBestScore,sugoroku.score);showResult({icon:clear?"🏆":"⌛",title:clear?"ゴールだノン！":"時間切れだノン",stars:clear?`${sugoroku.score}点`:"",text:`最終得点 ${sugoroku.score}点\n🍖 お肉 ${sugoroku.meat}個　⭐ スター ${sugoroku.star}個\n🫑 ピーマン ${sugoroku.pepper}回`,main:"同じカード順でもう一回",onMain:()=>resetSugoroku(true),sub:"新しいカード順でもう一回",onSub:()=>resetSugoroku(false),celebrate:clear});}
  $("move-button").addEventListener("click",moveSugoroku);
  function getStageStars() { return Storage.getObject(STORAGE_KEYS.stageStars); }
  function renderStageSelect() {
    const scores = getStageStars();
    $("stage-grid").innerHTML = STAGES.map((stage, index) => {
      const stars = Number(scores[index]) || 0;
      return `<button class="stage-card" data-stage="${index}"><span class="stage-number">${index + 1}</span><span><small>STAGE ${index + 1}</small><b>${stage.title}</b></span><span class="stage-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span></button>`;
    }).join("");
    document.querySelectorAll("[data-stage]").forEach(button => button.addEventListener("click", () => loadStage(Number(button.dataset.stage))));
  }
  function loadStage(index) {
    const stage = STAGES[index];
    program = { stageIndex: index, commands: [], state: Logic.initialProgramState(stage), running: false, activeCommand: -1 };
    showScreen("program-screen");
    renderProgram();
  }
  function renderProgram() {
    const stage = STAGES[program.stageIndex];
    const board = $("program-board");
    board.innerHTML = "";
    $("stage-label").textContent = `STAGE ${program.stageIndex + 1}`;
    $("stage-mission").textContent = stage.mission;
    $("optimal-label").textContent = `最短 ${stage.optimal}個`;
    const best = Number(getStageStars()[program.stageIndex]) || 0;
    $("stage-best").textContent = `${"★".repeat(best)}${"☆".repeat(3 - best)}`;
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) {
      const tile = document.createElement("div");
      const onPath = stage.path.some(point => point[0] === x && point[1] === y);
      tile.className = `program-tile${onPath ? " path" : ""}`;
      if (x === stage.goal[0] && y === stage.goal[1]) tile.innerHTML = "<small>GOAL</small><span>🏁</span>";
      if (stage.pepper && x === stage.pepper[0] && y === stage.pepper[1]) tile.innerHTML = "<span class=\"board-item\">🫑</span>";
      if (stage.meat && x === stage.meat[0] && y === stage.meat[1] && !program.state.meat) tile.innerHTML = "<span class=\"board-item\">🍖</span>";
      if (x === program.state.x && y === program.state.y) {
        const pawn = document.createElement("span"); pawn.className = "pawn game-piece"; pawn.textContent = "🦖"; pawn.style.transform = `rotate(${program.state.direction * 90}deg)`; tile.append(pawn);
      }
      board.append(tile);
    }
    const list = $("command-list");
    list.innerHTML = program.commands.length ? program.commands.map((command, index) => `<span class="command-chip${index === program.activeCommand ? " active" : ""}"><i>${index + 1}</i><b>${COMMANDS[command].icon}</b><small>${COMMANDS[command].label}</small></span>`).join("") : "<span class=\"empty\">ボタンを おしてね！</span>";
    $("command-count").textContent = `${program.commands.length}個`;
    document.querySelectorAll("[data-command], #undo-button, #clear-button, #run-button").forEach(button => { button.disabled = program.running; });
  }
  document.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => {
    if (program.running || program.commands.length >= 24) return;
    program.commands.push(button.dataset.command);
    renderProgram();
    $("command-list").scrollLeft = $("command-list").scrollWidth;
  }));
  $("undo-button").addEventListener("click", () => { if (!program.running) { program.commands.pop(); renderProgram(); } });
  $("clear-button").addEventListener("click", () => { if (!program.running) { program.commands = []; renderProgram(); } });
  $("stage-back").addEventListener("click", () => { if (!program.running) { showScreen("stage-screen"); renderStageSelect(); } });
  $("run-button").addEventListener("click", runProgram);
  async function runProgram() {
    if (program.running || !program.commands.length) return;
    const stage = STAGES[program.stageIndex];
    program.running = true;
    program.state = Logic.initialProgramState(stage);
    for (let index = 0; index < program.commands.length; index += 1) {
      program.activeCommand = index;
      renderProgram();
      await wait(300);
      program.state = Logic.stepProgram(program.state, program.commands[index], stage);
      renderProgram();
      await wait(330);
      if (program.state.failed) break;
    }
    program.running = false;
    program.activeCommand = -1;
    renderProgram();
    if (Logic.isStageClear(program.state, stage)) completeStage();
    else showResult({ icon: program.state.failed ? "🫨" : "🤔", title: program.state.failed ? "そっちじゃないノン！" : "おしいノン！", text: program.state.failed ? "道とピーマンを よく見てみよう！" : stage.meat && !program.state.meat ? "お肉を とってから GOALしよう！" : "めいれいを 見なおしてみよう！", main: "めいれいを直す", onMain: resetProgramPosition, sub: "ステージをえらぶ", onSub: () => { showScreen("stage-screen"); renderStageSelect(); } });
  }
  function resetProgramPosition() {
    program.state = Logic.initialProgramState(STAGES[program.stageIndex]);
    program.running = false;
    program.activeCommand = -1;
    renderProgram();
  }
  function completeStage() {
    const stage = STAGES[program.stageIndex];
    const stars = Logic.starsFor(program.commands.length, stage.optimal);
    const scores = getStageStars();
    scores[program.stageIndex] = Math.max(Number(scores[program.stageIndex]) || 0, stars);
    Storage.set(STORAGE_KEYS.stageStars, scores);
    const last = program.stageIndex === STAGES.length - 1;
    showResult({ icon: "🏆", title: "できたノン！", stars: `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`, text: `${program.commands.length}個の めいれいでクリア！\n${stars === 3 ? "最短クリア！ すごいノン！" : `最短は ${stage.optimal}個。もっとへらせる？`}`, main: last ? "もう一回" : "つぎのステージ", onMain: () => loadStage(last ? program.stageIndex : program.stageIndex + 1), sub: "ステージをえらぶ", onSub: () => { showScreen("stage-screen"); renderStageSelect(); }, celebrate: true });
  }

  function showResult(options) {
    $("result-icon").textContent = options.icon;
    $("result-title").textContent = options.title;
    $("result-stars").textContent = options.stars || "";
    $("result-text").textContent = options.text;
    $("result-main").textContent = options.main;
    $("result-sub").textContent = options.sub;
    $("result-main").onclick = () => { closeResult(); options.onMain(); };
    $("result-sub").onclick = () => { closeResult(); options.onSub(); };
    $("confetti").innerHTML = options.celebrate ? Array.from({ length: 18 }, (_, index) => `<i style="--i:${index}"></i>`).join("") : "";
    $("result-modal").hidden = false;
  }
  function closeResult() { $("result-modal").hidden = true; }

  resetSugoroku();
  renderStageSelect();
})();