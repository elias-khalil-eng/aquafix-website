// Runs the trained intent classifier in the browser.
// tokenize() and extractFeatures() MUST match chatbot/training/aquabot.py exactly.

const TOKEN_RE = /\d+(?:\.\d+)?|[a-z]+/g;

export function tokenize(text) {
  const tokens = text.toLowerCase().replaceAll("'", '').match(TOKEN_RE) || [];
  return tokens.map((t) => (/^\d/.test(t) ? 'num' : t));
}

export function extractFeatures(text) {
  const tokens = tokenize(text);
  const feats = new Set();
  tokens.forEach((t, i) => {
    feats.add(`w:${t}`);
    if (i < tokens.length - 1) feats.add(`b:${t}_${tokens[i + 1]}`);
    const padded = `<${t}>`;
    for (let j = 0; j < padded.length - 2; j++) feats.add(`c:${padded.slice(j, j + 3)}`);
  });
  return feats;
}

function decodeInt8(base64) {
  const binary = atob(base64);
  const out = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = (binary.charCodeAt(i) << 24) >> 24;
  return out;
}

export class IntentModel {
  constructor(data) {
    this.labels = data.labels;
    this.threshold = data.threshold;
    this.hidden = data.hidden;
    this.index = new Map(data.vocab.map((f, i) => [f, i]));
    this.W1 = decodeInt8(data.W1.int8);
    this.scale1 = data.W1.scale;
    this.W2 = decodeInt8(data.W2.int8);
    this.scale2 = data.W2.scale;
    this.b1 = data.b1;
    this.b2 = data.b2;
  }

  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load model (${res.status})`);
    return new IntentModel(await res.json());
  }

  /** Probability for every intent, same math as the PyTorch model in eval mode. */
  probabilities(text) {
    const ids = [...extractFeatures(text)].map((f) => this.index.get(f)).filter((i) => i !== undefined);
    const H = this.hidden;
    const h = Float64Array.from(this.b1);

    // Input is sparse: only add the W1 rows of features present in the message
    if (ids.length) {
      const x = this.scale1 / Math.sqrt(ids.length);
      for (const id of ids) {
        for (let k = 0; k < H; k++) h[k] += this.W1[id * H + k] * x;
      }
    }
    for (let k = 0; k < H; k++) h[k] = Math.max(0, h[k]); // ReLU

    const logits = this.b2.map((b, c) => {
      let sum = 0;
      for (let k = 0; k < H; k++) sum += this.W2[c * H + k] * h[k];
      return b + sum * this.scale2;
    });
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / total);
  }

  predict(text) {
    const probs = this.probabilities(text);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    return {
      tag: this.labels[best],
      confidence: probs[best],
      confident: probs[best] >= this.threshold,
    };
  }
}
