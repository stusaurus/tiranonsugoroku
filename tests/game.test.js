"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Logic, STAGES, BOARD, CARD_COUNTS, MAX_TURNS, STORAGE_KEYS } = require("../script.js");

function shortestSolution(stage) {
  const queue = [{ state: Logic.initialProgramState(stage), commands: [] }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = [current.state.x, current.state.y, current.state.direction, current.state.meat].join(",");
    if (visited.has(key)) continue;
    visited.add(key);
    if (Logic.isStageClear(current.state, stage)) return current.commands;
    for (const command of ["forward", "right", "left"]) {
      const state = Logic.stepProgram(current.state, command, stage);
      if (!state.failed) queue.push({ state, commands: [...current.commands, command] });
    }
  }
  return null;
}

function walk(position, steps, choices = []) {
  let choice = 0;
  while (steps > 0 && position !== BOARD.goal) {
    const next = BOARD.nodes[position].next;
    position = next.length > 1 ? next[choices[choice++] || 0] : next[0];
    steps -= 1;
  }
  return position;
}

test("initial hand is fixed at +1, +2, +3", () => {
  assert.deepEqual(Logic.initialStrategy([3, 2, 1]).hand, [1, 2, 3]);
  assert.deepEqual(CARD_COUNTS, { 1: 4, 2: 4, 3: 4 });
});

test("using a card draws exactly one and keeps the other two", () => {
  const state = Logic.initialStrategy([3, 1]);
  const next = Logic.useCard(state, 1);
  assert.deepEqual(next.hand, [1, 3, 3]);
  assert.deepEqual(next.discard, [2]);
  assert.equal(next.hand.length, 3);
});

test("meat stop scores +1 and star stop scores +3", () => {
  let state = Logic.initialStrategy([]);
  state = Logic.finishTurn(state, "a1");
  assert.equal(state.score, 1);
  state = Logic.finishTurn(state, "u1");
  assert.equal(state.score, 4);
  assert.deepEqual([state.meat, state.star], [1, 1]);
});

test("pepper stop scores -2 but score never goes below zero", () => {
  let state = { ...Logic.initialStrategy([]), score: 3 };
  state = Logic.finishTurn(state, "a2");
  assert.equal(state.score, 1);
  state = Logic.finishTurn({ ...state, score: 1 }, "a2");
  assert.equal(state.score, 0);
  assert.equal(state.pepper, 2);
});

test("special squares passed over do not activate", () => {
  const destination = walk("start", 3);
  const state = Logic.finishTurn(Logic.initialStrategy([]), destination);
  assert.equal(destination, "b1");
  assert.deepEqual([state.score, state.meat, state.pepper], [0, 0, 0]);
});

test("passing GOAL completes without an exact roll", () => {
  const destination = walk("d2", 3);
  const state = Logic.finishTurn(Logic.initialStrategy([]), destination);
  assert.equal(destination, BOARD.goal);
  assert.equal(state.status, "clear");
});

test("turn 12 fails when GOAL was not reached and never exceeds limit", () => {
  const state = Logic.finishTurn({ ...Logic.initialStrategy([]), turn: MAX_TURNS - 1 }, "a1");
  assert.equal(state.turn, 12);
  assert.equal(state.status, "failed");
});

test("the same deck gives the same replenishment sequence", () => {
  const deck = [3, 1, 2, 2];
  let first = Logic.initialStrategy(deck), second = Logic.initialStrategy(deck);
  const draws = state => { const result=[]; for(let i=0;i<4;i+=1){state=Logic.useCard(state,0,()=>0);result.push(state.hand.at(-1));} return result; };
  assert.deepEqual(draws(first), draws(second));
});

test("discard pile reshuffles when the deck is exhausted", () => {
  let state = Logic.initialStrategy([2]);
  state = Logic.useCard(state, 0, () => 0);
  state = Logic.useCard(state, 0, () => 0);
  assert.equal(state.hand.length, 3);
  assert.equal(state.deck.length + state.discard.length, 1);
});

test("branch route changes the stopping position", () => {
  assert.deepEqual(Logic.destinations("b1", 2).sort(), ["l2", "u2"]);
  assert.equal(walk("b1", 2, [0]), "u2");
  assert.equal(walk("b1", 2, [1]), "l2");
});

test("strategy score uses a separate localStorage key", () => {
  assert.equal(STORAGE_KEYS.strategyBestScore, "tiranon-strategy-best-score");
  assert.equal(STORAGE_KEYS.stageStars, "tiranon-stage-stars");
});

test("all stages are solvable and declared optimal counts are exact", () => {
  STAGES.forEach((stage, index) => {
    const solution = shortestSolution(stage);
    assert.ok(solution, `stage ${index + 1} should be solvable`);
    assert.equal(solution.length, stage.optimal, `stage ${index + 1} optimal count`);
    let state = Logic.initialProgramState(stage);
    solution.forEach(command => { state = Logic.stepProgram(state, command, stage); });
    assert.equal(Logic.isStageClear(state, stage), true);
  });
});

test("turning directions, off-path, pepper, meat and star ratings work", () => {
  const stage = STAGES[3];
  let state = Logic.initialProgramState(stage);
  state = Logic.stepProgram(state, "right", stage);
  assert.equal(state.direction, 1);
  state = Logic.stepProgram(state, "left", stage);
  assert.equal(state.direction, 0);
  assert.equal(Logic.stepProgram(state, "left", stage).direction, 3);
  assert.equal(Logic.stepProgram(state, "forward", stage).failed, false);
  assert.equal(Logic.stepProgram(Logic.initialProgramState(stage), "left", stage).failed, false);
  assert.equal(Logic.stepProgram(Logic.stepProgram(Logic.initialProgramState(stage), "left", stage), "forward", stage).failed, true);
  const pepperStage = STAGES[4];
  const nearPepper = { x: 1, y: 2, direction: 1, meat: false, failed: false };
  assert.equal(Logic.stepProgram(nearPepper, "forward", pepperStage).failed, true);
  assert.deepEqual([Logic.starsFor(10, 10), Logic.starsFor(12, 10), Logic.starsFor(13, 10)], [3, 2, 1]);
});
