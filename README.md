# pomo
A responsive Pomodoro timer built with vanilla HTML, CSS, and JavaScript. Open `index.html` in a browser; no installation or build is needed.
Focus, short break, and long break modes (25 / 5 / 15 minutes by default).
Start, pause, resume, reset, and skip controls.
A gentle three-note chime when the timer ends, with mute and sound preview.
Adjustable durations, saved preferences, and daily focus progress.
Space to start/pause; R to reset. Shortcuts stay out of form fields and dialogs.
The next session waits for you to start it. After four completed focus sessions, the timer offers a long break. Skipped sessions do not count toward progress. The countdown stays accurate across background-tab throttling; it checks the deadline when the page becomes visible. Preferences and daily totals use local storage, and refresh starts a fresh timer. Audio uses the Web Audio API and is unlocked when you start the timer or test the sound. Optional Google Fonts have local fallbacks.