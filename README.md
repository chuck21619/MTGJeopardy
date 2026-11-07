# MTG Jeopardy

A multiplayer Jeopardy-style trivia game themed on Magic: The Gathering. One person hosts on a big screen, and everyone else buzzes in from their phones.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000 and choose **Host a game**. The server prints a LAN address (for example `http://192.168.1.20:3000/play.html`). Players on the same Wi-Fi open that address and enter the 4-letter room code.

## How it plays

- **Two rounds and a Final.** Each game draws 12 random categories from `clues.js`: 6 for Jeopardy! ($200–$1000) and 6 for Double Jeopardy! ($400–$2000). There is 1 Daily Double in the first round and 2 in the second.
- **Picking.** The player in control picks from their phone, or the host clicks the board. Whoever answers correctly takes control.
- **Buzzing.** Buzzers open automatically once the host has had time to read the clue aloud, or the host can open them early (Space). Buzzing early locks you out for 250 ms. A wrong answer loses the clue's value, and buzzers reopen for everyone else.
- **Judging.** The host marks answers Correct (C) or Wrong (W), or reveals the answer (R). The host can **Peek** at the answer, which stays blurred on the shared screen until then.
- **Final Jeopardy!** Players with money place secret wagers, then get 30 seconds to type a response. The host reveals and judges each response in turn.
- **Host tools.** Hover a player's score to adjust it by ±100, give them control (👑), or remove them. *Skip round* and *New game* are in the top bar.

Players who refresh or drop rejoin automatically with their score intact. Several players can share one computer for testing, one per browser tab.

## Adding clues

Edit `clues.js`. Each category needs exactly 5 clues, easiest first. Add entries to `finals` for more Final Jeopardy! clues.

## Tests

```bash
npm test
```

This plays a full game over sockets: 60 clues, Daily Doubles, buzz races, lockouts, Final wagers, reconnecting and restarting.
