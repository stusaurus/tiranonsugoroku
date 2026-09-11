"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Logic, FOODS, STAGES, GOAL } = require("../script.js");

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

test("food weights total 100 and pepper probability is 18%", () => {
  assert.equal(FOODS.reduce((sum, food) => sum + food.weight, 0), 100);
  assert.equal(FOODS.find(food => food.burst).weight, 18);
  assert.equal(Logic.chooseFood(0).id, "meat");
  assert.equal(Logic.chooseFood(0.99).id, "pepper");
});

test("bank confirms only this turn's pending movement", () => {
  const state = Logic.bank({ confirmed: 5, pending: 6, streak: 3, turn: 2 });
  assert.deepEqual(state, { confirmed: 11, pending: 0, streak: 0, turn: 3 });
});

test("pepper loses pending movement but never confirmed movement", () => {
  const state = Logic.burst({ confirmed: 5, pending: 6, streak: 3, turn: 2 });
  assert.deepEqual(state, { confirmed: 5, pending: 0, streak: 0, turn: 3 });
});

test("movement reaches GOAL without requiring an exact number", () => {
  assert.equal(Logic.provisionalPosition(21, 3), GOAL);
  assert.equal(Logic.bank({ confirmed: 21, pending: 3, streak: 1, turn: 4 }).turn, 4);
});

test("streak bonus is simple and limited to milestones", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(Logic.bonusForStreak), [0, 0, 1, 0, 1, 0]);
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
