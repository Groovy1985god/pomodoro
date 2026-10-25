"use strict";

(() => {
  const DEFAULTS = Object.freeze({ focus: 25, shortBreak: 5, longBreak: 15 });
  const MODES = Object.freeze({
    focus: { name: "Focus", label: "TIME TO FOCUS", message: "You’ve got this.", action: "Start focus" },
    shortBreak: { name: "Short break", label: "TIME TO RECHARGE", message: "Take a breath. You earned it.", action: "Start break" },
    longBreak: { name: "Long break", label: "A LITTLE MORE REST", message: "Step away. Come back fresh.", action: "Start long break" },
  });
  const STORAGE_KEY = "pomo-preferences-v1";
  const STATS_KEY = "pomo-daily-v1";
  const $ = (selector) => document.querySelector(selector);
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const durationInputs = [...document.querySelectorAll(".duration-field input")];
  const settingsDialog = $("#settings-dialog");
  let preferences = loadPreferences();
  let stats = loadStats();
  let mode = "focus";
  let duration = preferences.focus * 60;
  let remaining = duration;
  let endAt = 0;
  let running = false;
  let finished = false;
  let cycleCompleted = 0;
  let intervalId = null;
  let audioContext = null;
  let toastTimeout = null;
  let lastDisplayedSecond = -1;

  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function validMinutes(value) {
    return Number.isInteger(value) && value >= 1 && value <= 180;
  }

  function loadPreferences() {
    const saved = readStorage(STORAGE_KEY);
    const result = { ...DEFAULTS, sound: true };
    if (!saved || typeof saved !== "object") return result;
    for (const key of Object.keys(DEFAULTS)) {
      if (validMinutes(saved[key])) result[key] = saved[key];
    }
    if (typeof saved.sound === "boolean") result.sound = saved.sound;
    return result;
  }

  function loadStats() {
    const saved = readStorage(STATS_KEY);
    if (saved?.date === localDate() && Number.isSafeInteger(saved.sessions) && saved.sessions >= 0 && Number.isFinite(saved.minutes) && saved.minutes >= 0) return saved;
    return { date: localDate(), sessions: 0, minutes: 0 };
  }

  function announce(message) {
    $("#announcer").textContent = message;
  }

  function showToast(message) {
    clearTimeout(toastTimeout);
    $("#toast").textContent = message;
    $("#toast").classList.add("is-visible");
    toastTimeout = setTimeout(() => $("#toast").classList.remove("is-visible"), 3500);
  }

  // Create and unlock audio during a user gesture so the end chime can play later.
  async function prepareAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") await audioContext.resume();
      if (audioContext.state !== "running") return false;
      const silentBuffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      const unlock = audioContext.createBufferSource();
      unlock.buffer = silentBuffer;
      unlock.connect(audioContext.destination);
      unlock.start();
      return true;
    } catch { return false; }
  }

  function playChime() {
    try {
      if (!audioContext || audioContext.state !== "running") return false;
      const start = audioContext.currentTime;
      // Three soft bell notes, generated locally without an audio download.
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const noteAt = start + index * 0.23;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, noteAt);
        gain.gain.linearRampToValueAtTime(0.22, noteAt + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, noteAt + 1.3);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(noteAt);
        oscillator.stop(noteAt + 1.35);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
      return true;
    } catch { return false; }
  }

  function updateSound() {
    $("#sound-label").textContent = preferences.sound ? "Sound on" : "Sound off";
    $("#sound-toggle").setAttribute("aria-pressed", String(preferences.sound));
    $("#sound-toggle").setAttribute("aria-label", preferences.sound ? "Completion sound on; click to mute" : "Completion sound off; click to unmute");
    $("#sound-toggle use").setAttribute("href", preferences.sound ? "#icon-sound" : "#icon-muted");
  }

  function renderStats() {
    if (stats.date !== localDate()) stats = loadStats();
    $("#sessions-total").textContent = stats.sessions;
    $("#sessions-word").textContent = stats.sessions === 1 ? "session" : "sessions";
    $("#minutes-total").textContent = stats.minutes;
  }

  function renderTime() {
    const seconds = Math.max(0, Math.ceil(remaining));
    if (seconds === lastDisplayedSecond) return;
    lastDisplayedSecond = seconds;
    const minutes = Math.floor(seconds / 60);
    const time = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    $("#time-display").textContent = time;
    $("#time-display").classList.toggle("is-long-duration", minutes >= 100);
    $("#time-display").setAttribute("aria-label", `${minutes} minutes ${seconds % 60} seconds remaining`);
    $("#ring-progress").style.strokeDashoffset = String(100 * (1 - seconds / duration));
    document.title = `${time} · ${MODES[mode].name} — pomo`;
  }

  function render() {
    document.body.dataset.mode = mode;
    document.body.classList.toggle("is-running", running);
    for (const button of modeButtons) {
      const selected = button.dataset.mode === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    $("#timer-label").lastChild.textContent = finished ? " SESSION COMPLETE" : ` ${running ? MODES[mode].label : remaining < duration ? "ON A LITTLE PAUSE" : MODES[mode].label}`;
    $("#timer-message").textContent = finished ? (mode === "focus" ? "A little progress. Well done." : "Ready for a fresh start.") : running ? (mode === "focus" ? "Just this moment. Just this task." : MODES[mode].message) : MODES[mode].message;
    $("#start-label").textContent = running ? "Pause timer" : finished ? MODES[nextMode()].action : remaining < duration ? "Resume timer" : MODES[mode].action;
    $("#start-icon").setAttribute("href", running ? "#icon-pause" : "#icon-play");
    $("#session-dots").setAttribute("aria-label", `${cycleCompleted} of 4 focus sessions completed`);
    document.querySelectorAll(".session-dot").forEach((dot, index) => {
      dot.classList.toggle("is-complete", index < cycleCompleted);
      dot.classList.toggle("is-current", mode === "focus" && !finished && index === cycleCompleted);
    });
    const caption = $("#session-caption");
    caption.replaceChildren();
    if (mode === "focus" && !finished) {
      const count = document.createElement("strong");
      count.textContent = cycleCompleted + 1;
      caption.append("Session ", count, " of 4");
    } else {
      caption.textContent = `${cycleCompleted} of 4 focus sessions complete`;
    }
    $("#note-text").textContent = finished
      ? mode === "focus" ? `Nice work. Your ${preferences[nextMode()]}-minute break is ready.` : "Recharged and ready for your next little win."
      : mode === "focus" ? "Small steps make a big difference." : "Rest is productive, too. Let your mind wander.";
    renderTime();
    renderStats();
  }

  function nextMode() {
    return mode === "focus" ? (cycleCompleted >= 4 ? "longBreak" : "shortBreak") : "focus";
  }

  function stopClock() {
    clearInterval(intervalId);
    intervalId = null;
    running = false;
    endAt = 0;
  }

  function selectMode(selectedMode) {
    stopClock();
    mode = selectedMode;
    if (mode === "focus" && cycleCompleted >= 4) cycleCompleted = 0;
    duration = preferences[mode] * 60;
    remaining = duration;
    finished = false;
    lastDisplayedSecond = -1;
    render();
  }

  function completeSession() {
    if (!running || finished) return;
    stopClock();
    remaining = 0;
    finished = true;
    if (mode === "focus") {
      renderStats();
      cycleCompleted = Math.min(4, cycleCompleted + 1);
      stats.sessions += 1;
      stats.minutes += duration / 60;
      writeStorage(STATS_KEY, stats);
    }
    render();
    const message = mode === "focus"
      ? `Focus complete. Time for a ${preferences[nextMode()]}-minute ${nextMode() === "longBreak" ? "long " : ""}break.`
      : "Break complete. Your next focus session is ready.";
    announce(message);
    if (preferences.sound && !playChime()) showToast("Session complete. Sound couldn’t play; try Test sound in settings.");
  }

  function tick() {
    if (!running) return;
    // A deadline stays accurate when background tabs throttle interval callbacks.
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    if (remaining <= 0) completeSession();
    else renderTime();
  }

  function toggleTimer() {
    if (running) {
      tick();
      if (finished) return;
      stopClock();
      render();
      announce("Timer paused.");
      return;
    }
    if (finished) selectMode(nextMode());
    if (preferences.sound) {
      void prepareAudio().then((ready) => {
        if (!ready) showToast("Sound is unavailable in this browser. The timer will still show when your session ends.");
      });
    }
    endAt = Date.now() + remaining * 1000;
    running = true;
    intervalId = setInterval(tick, 200);
    render();
    announce(`${MODES[mode].name} timer started.`);
  }

  modeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.mode === mode) return;
    selectMode(button.dataset.mode);
    announce(`${MODES[mode].name} selected. ${preferences[mode]} minutes.`);
  }));

  $("#start-timer").addEventListener("click", toggleTimer);
  $("#reset-timer").addEventListener("click", () => {
    selectMode(mode);
    announce("Timer reset.");
    showToast("A fresh start. Timer reset.");
  });
  $("#skip-timer").addEventListener("click", () => {
    const skippedFocus = mode === "focus" && !finished;
    selectMode(nextMode());
    showToast(skippedFocus ? "Break ready. Skipped sessions don’t count toward your progress." : `${MODES[mode].name} session ready.`);
  });

  $("#sound-toggle").addEventListener("click", () => {
    preferences.sound = !preferences.sound;
    writeStorage(STORAGE_KEY, preferences);
    updateSound();
    if (preferences.sound) void prepareAudio().then((ready) => {
      if (ready) playChime();
      else showToast("Sound couldn’t start. Try Test sound in settings.");
    });
  });

  function fillSettings(values) {
    for (const input of durationInputs) {
      input.value = values[input.name];
      input.removeAttribute("aria-invalid");
    }
    $("#duration-error").textContent = "";
  }

  $("#open-settings").addEventListener("click", () => {
    fillSettings(preferences);
    settingsDialog.showModal();
  });
  $("#close-settings").addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...settingsDialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  settingsDialog.addEventListener("click", (event) => {
    const rect = settingsDialog.getBoundingClientRect();
    if (event.target === settingsDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) settingsDialog.close();
  });
  $("#restore-defaults").addEventListener("click", () => fillSettings(DEFAULTS));
  $("#preview-sound").addEventListener("click", async () => {
    const ready = await prepareAudio();
    if (ready && playChime()) $("#preview-sound").setAttribute("aria-label", "Test sound; chime played");
    else $("#duration-error").textContent = "Sound is unavailable. Check your browser’s audio permissions.";
  });
  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    let invalid = null;
    const nextPreferences = { ...preferences };
    for (const input of durationInputs) {
      const value = Number(input.value);
      const valid = validMinutes(value) && input.value.trim() !== "";
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid && !invalid) invalid = input;
      if (valid) nextPreferences[input.name] = value;
    }
    if (invalid) {
      $("#duration-error").textContent = "Enter a whole number from 1 to 180 for each session.";
      invalid.focus();
      return;
    }
    const durationChanged = Object.keys(DEFAULTS).some((key) => preferences[key] !== nextPreferences[key]);
    preferences = nextPreferences;
    const saved = writeStorage(STORAGE_KEY, preferences);
    if (durationChanged) selectMode(mode);
    settingsDialog.close();
    showToast(saved ? "Your rhythm, saved." : "Settings applied for this visit. Browser storage is unavailable.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || settingsDialog.open) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest("input, textarea, select, button, a") || target.isContentEditable)) return;
    if (event.code === "Space") { event.preventDefault(); toggleTimer(); }
    if (event.key.toLowerCase() === "r") { event.preventDefault(); $("#reset-timer").click(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { tick(); renderStats(); }
  });
  window.addEventListener("pageshow", () => { tick(); renderStats(); });
  window.addEventListener("storage", (event) => {
    if (event.key === STATS_KEY) { stats = loadStats(); renderStats(); }
  });

  updateSound();
  render();
})();
