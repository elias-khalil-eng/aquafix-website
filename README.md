# AquaFix Website

One-page website for **AquaFix (ETS Eid)**, a pool equipment and water treatment shop in El Naame, Mount Lebanon. Built as a senior project.

Layout is based on the Pizi pool services template. Product photos come from the business Instagram [@ets.eid](https://www.instagram.com/ets.eid/).

Live site: https://elias-khalil-eng.github.io/aquafix-website/

## Run locally

The chatbot loads its model with `fetch`, so serve the folder instead of opening the file directly:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## AI chatbot

A hybrid assistant that runs entirely in the browser (no server, no paid API):

1. **Intent classifier (trained AI):** a small neural network trained with PyTorch on a hand-written dataset of 29 intents. It reads the customer's message and decides what they are asking. Weights are exported as int8 JSON (128 KB) and run in plain JavaScript.
2. **Pool sizing expert system:** when the customer asks what equipment they need, the bot asks for the pool size and calculates the volume, flow rate, sand filter, pump, accessories and start-up chlorine.
3. **Responses:** business-approved answers written in the dataset.

Results on a held-out test set: **95.9% accuracy**, 87% with injected typos. The full process (dataset, augmentation, baseline, cross-validation, threshold, confusion matrix, export) is documented in [`chatbot/training/train.ipynb`](chatbot/training/train.ipynb).

### Retrain the model

```bash
cd chatbot/training
uv venv .venv
uv pip install --python .venv/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/jupyter-nbconvert --to notebook --execute --inplace train.ipynb
```

This rewrites `assets/chatbot/model.json` and `responses.json`. To teach the bot something new, add an intent (or more sentences) to `chatbot/data/intents.json` and retrain.

### Tests

```bash
node --test chatbot/tests/*.test.mjs
```

Checks the pool calculator and that the browser model gives the same probabilities as the trained Python model.

## Structure

- `index.html`: all page sections
- `assets/css/`: site theme (`style.css`) and chatbot widget (`chatbot.css`)
- `assets/js/main.js`: navbar, counters, tabs, product filter, WhatsApp quote form
- `assets/js/chatbot/`: chat widget, browser model runner, pool calculator
- `assets/chatbot/`: exported model and responses
- `chatbot/data/`: training dataset and held-out test set
- `chatbot/training/`: `aquabot.py` (features, augmentation, model, export) and the report notebook
- `chatbot/tests/`: Node tests

## To do

- Replace placeholder phone, email and WhatsApp number (`CONTACT` in `assets/js/main.js`)
