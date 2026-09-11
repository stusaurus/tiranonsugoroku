(function () {
  "use strict";

  const FOODS = [
    { name: "お肉", icon: "🍖", move: 1 },
    { name: "お寿司", icon: "🍣", move: 2 },
    { name: "ラーメン", icon: "🍜", move: 3 },
    { name: "ケーキ", icon: "🍰", move: 2 },
    { name: "ピーマン", icon: "🫑", pepper: true }
  ];
  const COMMAND_NAMES = { forward: "すすむ", right: "みぎ", left: "ひだり" };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const STAGES = [
    { mission: "まっすぐ GOALへ！", path: [[0,4],[0,3],[0,2],[0,1],[0,0]], start:[0,4], goal:[0,0], dir:0 },
    { mission: "みぎに まがって GOALへ！", path: [[0,4],[0,3],[0,2],[1,2],[2,2],[3,2]], start:[0,4], goal:[3,2], dir:0 },
    { mission: "お肉を とって GOALへ！", path: [[0,4],[0,3],[0,2],[1,2],[2,2],[2,1],[2,0]], start:[0,4], goal:[2,0], meat:[1,2], pepper:[1,1], dir:0 }
  ];

  const Logic = {
    moveSugoroku(position, amount, goal = 22) {
      return Math.max(0, Math.min(goal, position + amount));
    },
    step(state, command, stage) {
      const next = { ...state };
      if (command === "right") next.dir = (next.dir + 1) % 4;
      if (command === "left") next.dir = (next.dir + 3) % 4;
      if (command === "forward") {
        const d = DIRS[next.dir], target = [next.x + d[0], next.y + d[1]];
        if (!stage.path.some(([x,y]) => x === target[0] && y === target[1])) return { ...next, crashed: true };
        [next.x, next.y] = target;
        if (stage.meat && next.x === stage.meat[0] && next.y === stage.meat[1]) next.meat = true;
      }
      return next;
    }
  };

  if (typeof module !== "undefined") module.exports = { Logic, FOODS, STAGES };
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  let sugo = { position: 0, safePosition: 0, eats: 0, turnEats: 0, rounds: 1, running: false };
  let program = { stage: 0, commands: [], state: null, running: false };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
    closeModal();
  }

  document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    showScreen(b.dataset.open);
    b.dataset.open === "sugoroku-screen" ? resetSugoroku() : loadStage(0);
  }));
  document.querySelectorAll("[data-title]").forEach(b => b.addEventListener("click", () => showScreen("title-screen")));

  function boardIndexToGrid(i) {
    const row = 4 - Math.floor(i / 5), offset = i % 5;
    return [row % 2 ? offset : 4 - offset, row];
  }

  function renderSugoroku() {
    const board = $("sugoroku-board");
    board.innerHTML = "";
    for (let i = 0; i < 23; i++) {
      const tile = document.createElement("div"), [x,y] = boardIndexToGrid(i);
      tile.className = `tile${i===0?" start":""}${i===22?" goal":""}${i===sugo.safePosition && i!==sugo.position?" saved":""}`;
      tile.style.gridColumn = x + 1;
      tile.style.gridRow = y + 1;
      tile.textContent = i === 0 ? "START" : i === 22 ? "GOAL" : i;
      if (i === sugo.safePosition && i !== sugo.position && i !== 0) tile.textContent = "✓";
      if (i === sugo.position) {
        const pawn = document.createElement("span");
        pawn.className = "pawn";
        pawn.textContent = "🦖";
        tile.textContent = "";
        tile.append(pawn);
      }
      board.append(tile);
    }
    const pending = sugo.position - sugo.safePosition;
    $("turn-display").textContent = `かくてい ${sugo.safePosition}マス ｜ 今 +${pending}マス`;
    const best = localStorage.getItem("tiranon-best");
    $("best-record").textContent = `ベスト ${best ? best+"回" : "--"}`;
  }

  function resetSugoroku() {
    sugo = { position: 0, safePosition: 0, eats: 0, turnEats: 0, rounds: 1, running: false };
    $("food-display").textContent = "🍽️";
    $("sugoroku-message").textContent = "どこまで たべるノン？";
    renderSugoroku();
  }

  async function animateTo(target) {
    const direction = Math.sign(target - sugo.position);
    while (sugo.position !== target) {
      sugo.position += direction;
      renderSugoroku();
      await sleep(180);
    }
    renderSugoroku();
  }

  async function eat() {
    if (sugo.running) return;
    sugo.running = true;
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    sugo.eats++;
    $("food-display").textContent = food.icon;

    if (food.pepper) {
      const lost = sugo.position - sugo.safePosition;
      $("sugoroku-message").textContent = lost > 0
        ? `ピーマンだノーーーン！ ${lost}マスぶん もどるノン…`
        : "ピーマンだノーーーン！";
      await animateTo(sugo.safePosition);
      sugo.turnEats = 0;
      sugo.rounds++;
      sugo.running = false;
      return;
    }

    sugo.turnEats++;
    $("sugoroku-message").textContent = sugo.turnEats >= 4
      ? "フー！ まだいくノン？"
      : sugo.turnEats >= 2
        ? "まだいけるノン！"
        : "おいしいノン！";

    const target = Logic.moveSugoroku(sugo.position, food.move);
    await animateTo(target);
    sugo.running = false;
    if (sugo.position === 22) finishSugoroku();
  }

  function bankTurn() {
    if (sugo.running) return;
    if (sugo.position === sugo.safePosition) {
      $("sugoroku-message").textContent = "まずは ひとくち たべるノン！";
      return;
    }
    const gained = sugo.position - sugo.safePosition;
    sugo.safePosition = sugo.position;
    sugo.turnEats = 0;
    sugo.rounds++;
    $("food-display").textContent = "✨";
    $("sugoroku-message").textContent = `${gained}マス かくてい！ つぎも いくノン？`;
    renderSugoroku();
  }

  function finishSugoroku() {
    const old = Number(localStorage.getItem("tiranon-best")) || Infinity;
    if (sugo.eats < old) localStorage.setItem("tiranon-best", sugo.eats);
    showResult("🎉", "ついたノン！", `${sugo.eats}かい たべて ゴール！`, "もう一回", resetSugoroku);
    renderSugoroku();
  }

  $("eat-button").addEventListener("click", eat);
  $("finish-button").addEventListener("click", bankTurn);

  function initialState(stage) {
    return { x:stage.start[0], y:stage.start[1], dir:stage.dir, meat:false, crashed:false };
  }

  function loadStage(n) {
    program = { stage:n, commands:[], state:initialState(STAGES[n]), running:false };
    renderProgram();
  }

  function renderProgram() {
    const stage = STAGES[program.stage], board = $("program-board");
    board.innerHTML = "";
    $("stage-label").textContent = `${program.stage+1} / 3`;
    $("stage-mission").textContent = stage.mission;
    for (let y=0; y<5; y++) for (let x=0; x<5; x++) {
      const t = document.createElement("div"), isPath = stage.path.some(p => p[0]===x && p[1]===y);
      t.className = `tile${isPath?" path":""}`;
      if (x===stage.goal[0] && y===stage.goal[1]) t.textContent = "GOAL";
      if (stage.pepper && x===stage.pepper[0] && y===stage.pepper[1]) { t.textContent="🫑"; t.classList.add("pepper"); }
      if (stage.meat && x===stage.meat[0] && y===stage.meat[1] && !program.state.meat) t.textContent="🍖";
      if (x===program.state.x && y===program.state.y) {
        t.textContent="";
        const p=document.createElement("span");
        p.className="pawn";
        p.textContent="🦖";
        p.style.transform=`rotate(${program.state.dir*90}deg)`;
        t.append(p);
      }
      board.append(t);
    }
    const list=$("command-list");
    list.innerHTML=program.commands.length
      ? program.commands.map((c,i)=>`<span class="command-chip">${i+1}. ${COMMAND_NAMES[c]}</span>`).join("")
      : "<span class=\"empty\">めいれいを いれてね</span>";
  }

  document.querySelectorAll("[data-command]").forEach(b=>b.addEventListener("click",()=>{
    if(!program.running && program.commands.length<20){
      program.commands.push(b.dataset.command);
      renderProgram();
    }
  }));
  $("undo-button").addEventListener("click",()=>{if(!program.running){program.commands.pop();renderProgram();}});
  $("clear-button").addEventListener("click",()=>{if(!program.running){program.commands=[];renderProgram();}});
  $("retry-button").addEventListener("click",()=>loadStage(program.stage));

  $("run-button").addEventListener("click",async()=>{
    if(program.running || !program.commands.length) return;
    program.running=true;
    program.state=initialState(STAGES[program.stage]);
    renderProgram();
    for(const command of program.commands){
      program.state=Logic.step(program.state,command,STAGES[program.stage]);
      renderProgram();
      await sleep(350);
      if(program.state.crashed) break;
    }
    program.running=false;
    const s=STAGES[program.stage], atGoal=program.state.x===s.goal[0]&&program.state.y===s.goal[1], success=atGoal&&(!s.meat||program.state.meat);
    if(success){
      const last=program.stage===STAGES.length-1;
      showResult(last?"🏆":"🎉",last?"ぜんぶ クリア！":"できたノン！",last?"3つのステージを クリアしたノン！":"つぎのステージへ いこう！",last?"ステージ1へ":"つぎへ",()=>loadStage(last?0:program.stage+1));
    } else {
      showResult("💭","おしいノン！",program.state.crashed?"みちから はみだしたノン":"GOALまで めいれいを たそう！","やりなおす",()=>loadStage(program.stage));
    }
  });

  function showResult(icon,title,text,main,action){
    $("result-icon").textContent=icon;
    $("result-title").textContent=title;
    $("result-text").textContent=text;
    $("result-main").textContent=main;
    $("result-main").onclick=()=>{closeModal();action();};
    $("result-modal").hidden=false;
  }

  function closeModal(){ $("result-modal").hidden=true; }
  $("result-title-button").addEventListener("click",()=>showScreen("title-screen"));
  resetSugoroku();
})();