# Notes for agents working on this repo

## Sound while testing

The game starts muted in the Claude app's built-in browser (and in any browser with `navigator.webdriver` set),
so test runs don't play sound on Brian's computer. Leave it that way.

Only turn sound on when the task is about audio and you need to hear or check it: open the page with
`?sound=1` (for example `http://localhost:5173/?sound=1`), or press M. The audio graph still runs while muted
(only the master volume is 0), so checking that sounds are scheduled does not need sound on.
