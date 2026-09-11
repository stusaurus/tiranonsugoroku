(function () {
  "use strict";

  const GOAL = 22;
  const STORAGE_KEYS = {
    bestTurns: "tiranon-best-turns",
    maxStreak: "tiranon-max-streak",
    stageStars: "tiranon-stage-stars"
  };
  // 100分率。ピーマンは18%で、あとからここだけで調整できます。
  const FOODS = [
    { id: "meat", name: "お肉", icon: "🍖", move: 1, weight: 25 },
    { id: "sushi", name: "お寿司", icon: "🍣", move: 2, weight: 20 },
    { id: "cake", name: "ケーキ", icon: "🍰", move: 2, weight: 20 },
    { id: "ramen", name: "ラーメン", icon: "🍜", move: 3, weight: 17 },
    { id: "pepper", name: "ピーマン", icon: "🫑", move: 0, weight: 18, burst: true }
  ];
  const COMMANDS = {
    forward: { label: "すすむ", icon: "⬆️" }, right: { label: "みぎ", icon: "↪️" }, left: { label: "ひだり", icon: "↩️" }
  };
  const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const STAGES = [
    { title: "まずは まっすぐ", mission: "まっすぐ GOALへ！", start:[0,4], goal:[0,0], direction:0, path:[[0,4],[0,3],[0,2],[0,1],[0,0]], optimal:4 },
    { title: "みぎへ まがろう", mission: "みぎに まがって GOALへ！", start:[0,4], goal:[3,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2]], optimal:6 },
    { title: "ジグザグみち", mission: "2かい まがろう！", start:[0,4], goal:[3,0], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2],[3,1],[3,0]], optimal:9 },
    { title: "お肉を ゲット", mission: "お肉を とって GOALへ！", start:[0,4], goal:[4,0], meat:[2,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[3,2],[4,2],[4,1],[4,0]], optimal:10 },
    { title: "ピーマンを よけろ", mission: "🫑を よけて GOALへ！", start:[0,4], goal:[4,0], pepper:[2,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[1,1],[2,1],[3,1],[3,2],[4,2],[4,1],[4,0]], optimal:12 },
    { title: "よくばりロード", mission: "遠回りして お肉をゲット！", start:[0,4], goal:[4,4], meat:[2,0], pepper:[3,2], direction:0, path:[[0,4],[0,3],[0,2],[1,2],[2,2],[2,1],[2,0],[3,0],[4,0],[4,1],[4,2],[4,3],[4,4]], optimal:16 }
  ];

  const Logic = {
    chooseFood(randomValue) {
      let cursor = randomValue * FOODS.reduce((sum, food) => sum + food.weight, 0);
      return FOODS.find(food => (cursor -= food.weight) < 0) || FOODS[FOODS.length - 1];
    },
    bonusForStreak(streak) { return streak === 3 || streak === 5 ? 1 : 0; },
    provisionalPosition(confirmed, pending) { return Math.min(GOAL, confirmed + pending); },
    bank(state) {
      const confirmed = Logic.provisionalPosition(state.confirmed, state.pending);
      return { ...state, confirmed, pending: 0, streak: 0, turn: confirmed >= GOAL ? state.turn : state.turn + 1 };
    },
    burst(state) { return { ...state, pending: 0, streak: 0, turn: state.turn + 1 }; },
    initialProgramState(stage) { return { x: stage.start[0], y: stage.start[1], direction: stage.direction, meat: false, failed: false }; },
    stepProgram(state, command, stage) {
      const next = { ...state };
      if (command === "right") next.direction = (next.direction + 1) % 4;
      if (command === "left") next.direction = (next.direction + 3) % 4;
      if (command === "forward") {
        const delta = DIRECTIONS[next.direction];
        const target = [next.x + delta[0], next.y + delta[1]];
        const onPath = stage.path.some(([x, y]) => x === target[0] && y === target[1]);
        const onPepper = stage.pepper && target[0] === stage.pepper[0] && target[1] === stage.pepper[1];
        if (!onPath || onPepper) return { ...next, failed: true };
        [next.x, next.y] = target;
        if (stage.meat && next.x === stage.meat[0] && next.y === stage.meat[1]) next.meat = true;
      }
      return next;
    },
    isStageClear(state, stage) { return state.x === stage.goal[0] && state.y === stage.goal[1] && (!stage.meat || state.meat); },
    starsFor(commandCount, optimal) { return commandCount <= optimal ? 3 : commandCount <= optimal + 2 ? 2 : 1; }
  };

  if (typeof module !== "undefined") module.exports = { Logic, FOODS, STAGES, STORAGE_KEYS, GOAL };
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const Storage = {
    getNumber(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (_) { return 0; } },
    getObject(key) { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) { return {}; } },
    set(key, value) { try { localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value)); } catch (_) { /* private storage can be unavailable */ } }
  };
  let sugoroku;
  let program = { stageIndex: 0, commands: [], state: null, running: false, activeCommand: -1 };

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen.id === id));
    closeResult();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-title]").forEach(button => button.addEventListener("click", () => showScreen("title-screen")));
  document.querySelectorAll("[data-open]").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.open;
    showScreen(target);
    if (target === "sugoroku-screen") resetSugoroku();
    if (target === "stage-screen") renderStageSelect();
  }));

  function resetSugoroku() {
    sugoroku = { confirmed: 0, pending: 0, streak: 0, maxStreak: 0, turn: 1, locked: false, lastFood: null, effect: "" };
    $("food-display").textContent = "🍽️";
    $("sugoroku-message").textContent = "まずは ひとくち！";
    renderSugoroku();
  }
  function pathGrid(index) {
    const row = 4 - Math.floor(index / 5);
    const offset = index % 5;
    return [row % 2 === 0 ? 4 - offset : offset, row];
  }
  function renderSugoroku() {
    const board = $("sugoroku-board");
    board.innerHTML = "";
    const provisional = Logic.provisionalPosition(sugoroku.confirmed, sugoroku.pending);
    for (let index = 0; index <= GOAL; index += 1) {
      const [x, y] = pathGrid(index);
      const tile = document.createElement("div");
      tile.className = "path-tile";
      tile.style.gridColumn = x + 1;
      tile.style.gridRow = y + 1;
      tile.dataset.step = index;
      if (index === 0) { tile.classList.add("start"); tile.innerHTML = "<small>START</small>"; }
      else if (index === GOAL) { tile.classList.add("goal"); tile.innerHTML = "<small>GOAL</small><span>🏁</span>"; }
      else if (index % 4 === 0) tile.textContent = "•";
      if (index === sugoroku.confirmed) {
        const marker = document.createElement("span"); marker.className = `confirmed-marker${sugoroku.effect === "bank" ? " flash" : ""}`; marker.textContent = "⭐"; marker.title = "確定位置"; tile.append(marker);
      }
      if (index === provisional) {
        const pawn = document.createElement("span"); pawn.className = `pawn game-piece${sugoroku.effect === "hop" ? " hop" : ""}`; pawn.textContent = "🦖"; pawn.title = "いまの位置"; tile.append(pawn);
      }
      board.append(tile);
    }
    const best = Storage.getNumber(STORAGE_KEYS.bestTurns);
    const max = Storage.getNumber(STORAGE_KEYS.maxStreak);
    $("sugoroku-records").innerHTML = `<span>BEST <b>${best || "--"}ターン</b></span><span>MAX <b>${max || "--"}パク</b></span>`;
    $("pending-label").textContent = `+${sugoroku.pending}`;
    $("turn-label").textContent = `${sugoroku.turn}ターンめ`;
    $("bank-button").disabled = sugoroku.pending === 0 || sugoroku.locked;
    $("bank-button").querySelector("small").textContent = `+${sugoroku.pending}マスを確定`;
    $("eat-button").disabled = sugoroku.locked;
    $("streak-label").textContent = streakMessage(sugoroku.streak);
  }
  function streakMessage(streak) {
    if (streak >= 7) return `🔥 ${streak}連続！ 止まらないノン！`;
    if (streak >= 5) return `🔥 ${streak}連続！ まだいけるノン！`;
    if (streak >= 3) return `🔥 ${streak}連続！ パクパク！`;
    return streak ? `🔥 ${streak}連続！ あと${3 - streak}回でボーナス` : "3連続と5連続で +1ボーナス！";
  }
  async function animateSugoroku(from, to) {
    const direction = Math.sign(to - from);
    let position = from;
    const startingTile = $("sugoroku-board").querySelector(`[data-step="${from}"]`);
    const movingPawn = $("sugoroku-board").querySelector(".pawn");
    if (startingTile && movingPawn) startingTile.append(movingPawn);
    while (position !== to) {
      position += direction;
      const pawn = $("sugoroku-board").querySelector(".pawn");
      const destination = $("sugoroku-board").querySelector(`[data-step="${position}"]`);
      if (pawn && destination) destination.append(pawn);
      pawn?.classList.remove("hop");
      void pawn?.offsetWidth;
      pawn?.classList.add("hop");
      await wait(115);
    }
  }
  async function eat() {
    if (sugoroku.locked) return;
    sugoroku.locked = true;
    renderSugoroku();
    const food = Logic.chooseFood(Math.random());
    sugoroku.lastFood = food.id;
    $("food-display").textContent = food.icon;
    if (food.burst) {
      const from = Logic.provisionalPosition(sugoroku.confirmed, sugoroku.pending);
      $("sugoroku-message").textContent = "ピーマンだノーーーン！";
      $("sugoroku-status").classList.add("burst");
      await wait(420);
      sugoroku = { ...Logic.burst(sugoroku), locked: true, effect: "" };
      renderSugoroku();
      await animateSugoroku(from, sugoroku.confirmed);
      await wait(250);
      $("sugoroku-status").classList.remove("burst");
      $("sugoroku-message").textContent = "今回の分が パー！ つぎこそ！";
      sugoroku.locked = false;
      renderSugoroku();
      return;
    }
    const from = Logic.provisionalPosition(sugoroku.confirmed, sugoroku.pending);
    sugoroku.streak += 1;
    sugoroku.maxStreak = Math.max(sugoroku.maxStreak, sugoroku.streak);
    const bonus = Logic.bonusForStreak(sugoroku.streak);
    sugoroku.pending += food.move + bonus;
    sugoroku.effect = "hop";
    $("sugoroku-message").textContent = bonus ? `${food.name}！ ボーナス +1！` : `${food.name}を パクッ！`;
    renderSugoroku();
    await animateSugoroku(from, Logic.provisionalPosition(sugoroku.confirmed, sugoroku.pending));
    sugoroku.effect = "";
    sugoroku.locked = false;
    renderSugoroku();
    saveMaxStreak();
    if (Logic.provisionalPosition(sugoroku.confirmed, sugoroku.pending) >= GOAL) finishSugoroku();
  }
  async function bankSugoroku() {
    if (sugoroku.locked || sugoroku.pending === 0) return;
    sugoroku.locked = true;
    $("sugoroku-message").textContent = "ここまで確定！";
    sugoroku = { ...Logic.bank(sugoroku), locked: true, effect: "bank" };
    saveMaxStreak();
    renderSugoroku();
    await wait(500);
    sugoroku.locked = false;
    sugoroku.effect = "";
    $("food-display").textContent = "🍽️";
    $("sugoroku-message").textContent = "つぎのターン！";
    renderSugoroku();
  }
  function saveMaxStreak() {
    if (sugoroku.maxStreak > Storage.getNumber(STORAGE_KEYS.maxStreak)) Storage.set(STORAGE_KEYS.maxStreak, sugoroku.maxStreak);
  }
  function finishSugoroku() {
    sugoroku.confirmed = GOAL;
    saveMaxStreak();
    const best = Storage.getNumber(STORAGE_KEYS.bestTurns);
    const isRecord = !best || sugoroku.turn < best;
    if (isRecord) Storage.set(STORAGE_KEYS.bestTurns, sugoroku.turn);
    renderSugoroku();
    showResult({ icon: "🏆", title: "ついたノーーン！", stars: "🎉 🎊 🎉", text: `${sugoroku.turn}ターンでゴール！${isRecord ? "\nNEW RECORD！" : ""}`, main: "もう一回！", onMain: resetSugoroku, sub: "タイトルへ", onSub: () => showScreen("title-screen"), celebrate: true });
  }
  $("eat-button").addEventListener("click", eat);
  $("bank-button").addEventListener("click", bankSugoroku);

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
