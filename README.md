# Bullseye

A daily estimation game. Ten questions a day about anything, from bones in your hand to the distance to the Moon. Drag the slider, lock in your guess, and see how close you got.

## Play it locally

```
npm start        # serves the game at http://localhost:8000
npm test         # checks the scoring rules and the question file
```

Add `?day=5` to the URL to play a specific puzzle, and `&fresh=1` to start it over.

## How it works

- `data/questions.json` holds the question bank. Each question has an answer and a source link. Fermi questions also carry their working.
- `js/rules.js` holds the game rules: which 10 questions show up each day, the slider scale, the bullseye window and scoring.
- `js/game.js` runs the page.

The slider always starts at 0. Its top is the first clean number (10, 25, 50, 100, 250 ...) at or above the answer, and about 1 in 4 questions goes one step higher. A bullseye is within 0.5% of the scale (2% for Fermi questions), so small scales need the exact answer. Otherwise you score up to 90 points, falling to 0 at 30% of the scale away.
