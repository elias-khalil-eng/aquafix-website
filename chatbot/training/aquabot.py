"""AquaFix chatbot: feature extraction, data augmentation, model and export.

The browser version of tokenize() and extract_features() lives in
assets/js/chatbot/intent-model.js and MUST stay identical to this file,
otherwise the exported weights will not match the inputs.
"""
import base64
import copy
import json
import math
import random
import re
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "chatbot" / "data"
EXPORT_DIR = ROOT / "assets" / "chatbot"

TOKEN_RE = re.compile(r"\d+(?:\.\d+)?|[a-z]+")


# ---------------------------------------------------------------- features
def tokenize(text):
    """Lowercase words; every number becomes 'num' so '8 by 4' and '10 by 5' look alike."""
    text = text.lower().replace("'", "")
    return ["num" if t[0].isdigit() else t for t in TOKEN_RE.findall(text)]


def extract_features(text):
    """Words, word pairs and character trigrams.

    Character trigrams make the model tolerant to typos: 'chlorin' still shares
    most trigrams with 'chlorine'.
    """
    tokens = tokenize(text)
    feats = {f"w:{t}" for t in tokens}
    feats |= {f"b:{a}_{b}" for a, b in zip(tokens, tokens[1:])}
    for t in tokens:
        padded = f"<{t}>"
        feats |= {f"c:{padded[i:i + 3]}" for i in range(len(padded) - 2)}
    return feats


def build_vocab(texts, min_char_df=2):
    """Keep every word and word pair; keep character trigrams seen in 2+ sentences."""
    df = Counter(f for t in texts for f in extract_features(t))
    vocab = sorted(f for f, n in df.items() if not f.startswith("c:") or n >= min_char_df)
    return vocab


def vectorize(texts, vocab):
    """Binary bag of features, L2 normalized so long and short messages weigh the same."""
    index = {f: i for i, f in enumerate(vocab)}
    X = np.zeros((len(texts), len(vocab)), dtype=np.float32)
    for row, text in enumerate(texts):
        ids = [index[f] for f in extract_features(text) if f in index]
        if ids:
            X[row, ids] = 1.0 / math.sqrt(len(ids))
    return X


# ------------------------------------------------------------ augmentation
KEYBOARD_NEIGHBORS = {
    "a": "qsz", "b": "vn", "c": "xv", "d": "sf", "e": "wr", "f": "dg", "g": "fh", "h": "gj",
    "i": "uo", "j": "hk", "k": "jl", "l": "k", "m": "n", "n": "bm", "o": "ip", "p": "o",
    "q": "wa", "r": "et", "s": "ad", "t": "ry", "u": "yi", "v": "cb", "w": "qe", "x": "zc",
    "y": "tu", "z": "x",
}
FILLERS_BEFORE = ["please", "hey", "can you tell me", "i want to know", "pls"]
FILLERS_AFTER = ["please", "pls", "thanks", "?"]


def _typo(word, rng):
    i = rng.randrange(len(word))
    kind = rng.choice(["swap", "delete", "double", "neighbor"])
    if kind == "swap" and i < len(word) - 1:
        return word[:i] + word[i + 1] + word[i] + word[i + 2:]
    if kind == "delete":
        return word[:i] + word[i + 1:]
    if kind == "double":
        return word[:i] + word[i] + word[i:]
    if word[i] in KEYBOARD_NEIGHBORS:
        return word[:i] + rng.choice(KEYBOARD_NEIGHBORS[word[i]]) + word[i + 1:]
    return word


def augment(text, rng):
    """Make one noisy copy of a sentence: a typo, a dropped word, or a filler phrase."""
    words = text.split()
    op = rng.choice(["typo", "typo", "drop", "filler"])
    if op == "typo":
        long_words = [i for i, w in enumerate(words) if len(w) >= 4]
        if long_words:
            i = rng.choice(long_words)
            words[i] = _typo(words[i], rng)
    elif op == "drop" and len(words) >= 3:
        words.pop(rng.randrange(len(words)))
    else:
        if rng.random() < 0.5:
            words = rng.choice(FILLERS_BEFORE).split() + words
        else:
            words = words + [rng.choice(FILLERS_AFTER)]
    return " ".join(words)


def augment_dataset(texts, labels, copies=4, seed=0):
    rng = random.Random(seed)
    out_x, out_y = list(texts), list(labels)
    for text, label in zip(texts, labels):
        for _ in range(copies):
            out_x.append(augment(text, rng))
            out_y.append(label)
    return out_x, out_y


# -------------------------------------------------------------------- data
def load_intents():
    return json.loads((DATA_DIR / "intents.json").read_text(encoding="utf8"))["intents"]


def load_test_set():
    examples = json.loads((DATA_DIR / "test_set.json").read_text(encoding="utf8"))["examples"]
    return [t for t, _ in examples], [l for _, l in examples]


def patterns_and_labels(intents):
    texts, labels = [], []
    for intent in intents:
        for p in intent["patterns"]:
            texts.append(p)
            labels.append(intent["tag"])
    return texts, labels


# ------------------------------------------------------------------- model
class IntentNet(nn.Module):
    """Small feed-forward network: sparse features -> 32 hidden units -> one score per intent."""

    def __init__(self, n_features, n_classes, hidden=32, dropout=0.4):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, n_classes),
        )

    def forward(self, x):
        return self.net(x)


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def train_model(X_train, y_train, n_classes, X_val=None, y_val=None, epochs=150,
                lr=5e-3, weight_decay=1e-4, batch_size=64, patience=25, seed=42):
    """Mini-batch training with AdamW. With a validation set, keeps the best epoch (early stopping)."""
    set_seed(seed)
    model = IntentNet(X_train.shape[1], n_classes)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    # label smoothing keeps the model from being 100% sure, which helps the confidence threshold
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

    Xt, yt = torch.tensor(X_train), torch.tensor(y_train)
    Xv = torch.tensor(X_val) if X_val is not None else None
    yv = torch.tensor(y_val) if y_val is not None else None

    history = {"train_loss": [], "train_acc": [], "val_loss": [], "val_acc": []}
    best_state, best_val, bad_epochs = None, float("inf"), 0

    for _ in range(epochs):
        model.train()
        perm = torch.randperm(len(Xt))
        total, correct, loss_sum = 0, 0, 0.0
        for i in range(0, len(Xt), batch_size):
            idx = perm[i:i + batch_size]
            logits = model(Xt[idx])
            loss = loss_fn(logits, yt[idx])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * len(idx)
            correct += (logits.argmax(1) == yt[idx]).sum().item()
            total += len(idx)
        history["train_loss"].append(loss_sum / total)
        history["train_acc"].append(correct / total)

        if Xv is not None:
            model.eval()
            with torch.no_grad():
                logits = model(Xv)
                val_loss = loss_fn(logits, yv).item()
                val_acc = (logits.argmax(1) == yv).float().mean().item()
            history["val_loss"].append(val_loss)
            history["val_acc"].append(val_acc)
            if val_loss < best_val - 1e-4:
                best_val, bad_epochs = val_loss, 0
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
            else:
                bad_epochs += 1
                if bad_epochs >= patience:
                    break

    if best_state is not None:
        model.load_state_dict(best_state)
    history["best_epoch"] = int(np.argmin(history["val_loss"])) + 1 if history["val_loss"] else epochs
    model.eval()
    return model, history


def predict_proba(model, X):
    with torch.no_grad():
        return torch.softmax(model(torch.tensor(X)), dim=1).numpy()


# ------------------------------------------------------------------ export
def _quantize(w):
    """int8 quantization: 4x smaller file, one float scale per matrix."""
    scale = float(np.abs(w).max()) / 127 or 1.0
    q = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
    return q, scale


def quantized_copy(model):
    """Same model with weights rounded exactly like the exported file, to measure any accuracy loss."""
    m = copy.deepcopy(model)
    with torch.no_grad():
        for layer in (m.net[0], m.net[3]):
            q, scale = _quantize(layer.weight.numpy())
            layer.weight.copy_(torch.tensor(q.astype(np.float32) * scale))
            layer.bias.copy_(torch.tensor(np.float32(np.round(layer.bias.numpy(), 5))))
    return m


def export_model(model, vocab, labels, threshold, path=None):
    """Save the model for the browser. W1 is stored per feature ([n_features][hidden])
    so the browser only adds up the rows of the features present in a message."""
    path = path or EXPORT_DIR / "model.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    lin1, lin2 = model.net[0], model.net[3]
    q1, s1 = _quantize(lin1.weight.detach().numpy().T.copy())
    q2, s2 = _quantize(lin2.weight.detach().numpy())
    b64 = lambda q: base64.b64encode(q.tobytes()).decode("ascii")
    payload = {
        "version": 1,
        "labels": labels,
        "threshold": round(float(threshold), 3),
        "vocab": vocab,
        "hidden": int(q1.shape[1]),
        "W1": {"int8": b64(q1), "scale": s1},  # [n_features][hidden]
        "b1": np.round(lin1.bias.detach().numpy(), 5).tolist(),
        "W2": {"int8": b64(q2), "scale": s2},  # [n_classes][hidden]
        "b2": np.round(lin2.bias.detach().numpy(), 5).tolist(),
    }
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf8")
    return path


def export_responses(intents, path=None):
    """Answers the bot can give, without the training sentences."""
    path = path or EXPORT_DIR / "responses.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    out = {i["tag"]: {k: v for k, v in i.items() if k not in ("tag", "patterns")} for i in intents}
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf8")
    return path
