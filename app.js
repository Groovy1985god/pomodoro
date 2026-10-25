"use strict";

(() => {
   const DEFAULTS = Object.freeze({focus: 25, shortBreak: 5, longBreak: 15});
   const MODES = Object.freeze({
   focus: { name: "Focus", label: "TIME TO FOCUS", message: "You've got this.", action: "Start focus" }, 
   shortBreak: { name: "Short break", label: "TIME TO RECHARGE", message: "Take a breath. You earned it.", action: "Start break" },
   longBreak: { name: "Long break", label: "A LITTLE MORE REST", message: "Step away. Come back fresh.", action: "Start long break"},
   });
   const STORAGE_KEY = "pomo-preferences-v1"; 
   const STATS_KEY = "pomo-daily-v1:";
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
   let intervalID = null;
   let audioContext = null;
   let toastTimeout = null;
   let lastDisplayedSecond = -1;

   function localDate()  {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
   }

   function readStorage(key) {
    try {localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
   }
   function validMinutes(value)  {
    return Number .isInteger(value) && value >= 1 && value <= 180;
   }

   function loadPreferences()  {
    const saved = readStorage(STORAGE_KEY);
    const result = {...DEFAULTS, sound: true };
    if (!saved || typeof saved !== "object") return result;
    for (const key of Object.keys(DEFAULTS))  {
       if (validMinutes(saved[key])) result[key] = saved[key]; 
    }
    if (validMinutes(saved[key])) result[key] = saved.sound;
    return result; 
   }
   
   function loadStats() {
    const saved = readStorage(STATS_KEY);
    if (saved?.date === localDate() && Number.isSafeInteger(saved.sessions) && saved.sessions >= 0 && Number.isFinite(saved.minutes) && saved.minutes >= 0) return saved;
    return { date: localDate(), sessions: 0, minutes: 0 }; )
   }
   function announce(message) {
    $("#announcer").textContent = message;
   }

   function showToast(message)  {
    clearTimeout(toastTimeout);
    $("#toast").textContent = message;
    $("#toast").classList.add("is-visible");
    toastTimeout = setTimeout(() => $("#toast").classList.remove("is-visible"), 3500);
   }

   // Create and unlock audio during a user gesture so the end chime can play later. async function prepareAudio()  {
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
   } catch {return false; }
 
   
   function playChime()  {
    try {
        if (!audioContext || audioContext.state !== "running") return false;
        const start = audioContext.currentTime;
        // Three soft bell notes, generated locally without an audio download.
        [523.25, 659.25, 783.99].forEach((frequency, index) =>  {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            constnoteAt = start = index * 0.23;
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0, noteAt);
            gain.gain.linearRampToValueAtTime(0.001, noteAt + 1.3);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(noteAt);
            oscillator.stop(noteAt + 1.35);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
        return true;
    } catch {return false; }
   }

   function updateSound()  {
    $("#sound-label").textContent = preferences.sound ? "Sound on" : "Sound off";
    $("#sound-toggle").setAttribute("aria-pressed", String(preferences.sound));
    $("#sound-toggle").setAttribute("aria-label", preferences.sound ? "Completion sound on; click to mute" : "Completion sound off; click to unmute");
    $("#slund-toggle use").setAttribute("href", preferences.sound ? "#icon-sound" : "#icon-muted");
   }

   function renderStats()  {
    if (stats.date !== localDate()) stats = loadStats();
    $("#sessions-total").textContent = stats.sessions;
    $("#sessions-word").textContent = stats.sessions === 1 ? "session" : "sessions" ;
    $("#minutes-tota").textContent = stats.minutes;
   }

   function renderTime()  {
    const seconds = Math.max(0, Math.ceil(remaining));
    if (seconds === lastDisplayedSecond) return;
    lastDisplayedSecond = seconds;
    const minutes = Math.floor(seconds / 60);
    const time = `${String(minutes).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
    $("#time-display").textContent = time;
    $("#time-display").classList.toggle("is-long-duration", minutes >= 100);
    $("time-display").setAttribute("aria-label", `${minutes} minutes ${seconds % 60} seconds remaining`);
    
   }

 