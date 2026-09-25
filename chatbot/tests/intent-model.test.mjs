import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IntentModel, tokenize } from '../../assets/js/chatbot/intent-model.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const model = new IntentModel(read('../../assets/chatbot/model.json'));
const parity = read('./fixtures/parity.json');

test('tokenizer lowercases, drops apostrophes and maps numbers to "num"', () => {
  assert.deepEqual(tokenize("What's the pump for 8x4.5?"), ['whats', 'the', 'pump', 'for', 'num', 'x', 'num']);
});

test('browser model gives the same probabilities as the trained Python model', () => {
  let worst = 0;
  parity.texts.forEach((text, i) => {
    const js = model.probabilities(text);
    parity.probs[i].forEach((p, c) => { worst = Math.max(worst, Math.abs(p - js[c])); });
  });
  assert.ok(worst < 1e-3, `largest difference ${worst}`);
});

test('recognizes a few typical customer messages', () => {
  assert.equal(model.predict('what time do you open').tag, 'hours');
  assert.equal(model.predict('my pool is green').tag, 'problem_green_water');
  assert.equal(model.predict('what pump do i need for my pool').tag, 'pool_sizing');
});
