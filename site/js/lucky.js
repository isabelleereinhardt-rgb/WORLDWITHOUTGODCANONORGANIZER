/* ============================================================
   LUCKY, SOUND, AND THE SPRINT OVERLAY

   Lucky is the assistant's cat. He walks along the bottom of the
   window, offers a tip, and can be petted; five pets earns him a
   treat, at which point he hops, takes it, and runs off before
   strolling back in. He naps on the clock during a sprint.

   All sound is synthesized here with WebAudio — no audio files are
   downloaded, and everything is off until switched on. Sound cannot
   start on its own: browsers require a gesture first, so the audio
   context is only created in response to a click.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const settings = () => (window.CodexExtra && CodexExtra.settings) || {};
const save = () => window.CodexSettings && CodexSettings.save();

/* ---------- defaults, all opt-in ---------- */
const DEF = {
  luckyName: "Lucky", luckySkin: "tabby", luckyAcc: "bell", luckyPersonality: "sweet",
  luckyWalks: true, luckyNaps: true, luckyTips: true, luckyTreatsOn: true,
  luckySleeps: true,
  // seconds for one crossing; the slider offers a few named speeds
  luckyPace: 34,
  luckyPets: 0, luckyPetsTotal: 0, luckyTreats: 0,
  luckyCompanion: "none", luckyTreat: "sardine",
  ambience: "none", volume: 40,
  sfx: { click: false, page: false, bell: true, chime: false },
};
function pref(k) { const s = settings(); return s[k] === undefined ? DEF[k] : s[k]; }
function setPref(k, v) { CodexExtra.settings[k] = v; save(); }
function sfxOn(k) { const s = settings().sfx || DEF.sfx; return !!s[k]; }

/* ============================================================
   SOUND — generated on this machine, nothing downloaded
   ============================================================ */
const Sound = {
  _ac: null, _noise: null, _white: null, _ambSrc: null, _ambGain: null,

  /* Only ever called from a user gesture, which is what lets the
     browser allow audio at all. */
  ctx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this._ac) { try { this._ac = new AC(); } catch (e) { return null; } }
    if (this._ac.state === "suspended") this._ac.resume();
    return this._ac;
  },
  vol() { const v = pref("volume"); return (v == null ? 40 : v) / 100; },

  /* brown-ish noise: gentler than white, better for fire and wind */
  brown(ac) {
    if (this._noise) return this._noise;
    const len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    return (this._noise = buf);
  },
  whiteBuf(ac) {
    if (this._white) return this._white;
    const len = Math.floor(ac.sampleRate * 1.5), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._white = buf);
  },

  ambience(kind) {
    setPref("ambience", kind);
    const ac = this.ctx();
    if (!ac) return;
    if (this._ambSrc) { try { this._ambSrc.stop(); } catch (e) {} this._ambSrc = null; this._ambGain = null; }
    if (kind === "none") return;
    const src = ac.createBufferSource();
    src.buffer = ["rain", "night", "cafe"].indexOf(kind) > -1 ? this.whiteBuf(ac) : this.brown(ac);
    src.loop = true;
    const filter = ac.createBiquadFilter(), gain = ac.createGain();
    const shape = {
      rain: { type: "highpass", freq: 800, q: 0.7, g: 0.55 },
      fire: { type: "lowpass", freq: 420, q: 0.9, g: 1.6 },
      cafe: { type: "lowpass", freq: 700, q: 0.6, g: 0.7 },
      wind: { type: "bandpass", freq: 320, q: 0.5, g: 1.5 },
      night: { type: "highpass", freq: 2400, q: 1.2, g: 0.4 },
    }[kind] || { type: "lowpass", freq: 800, q: 0.7, g: 0.8 };
    filter.type = shape.type; filter.frequency.value = shape.freq; filter.Q.value = shape.q;
    gain.gain.value = this.vol() * 0.3 * shape.g;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    this._ambSrc = src; this._ambGain = gain;
  },
  stopAmbience() {
    if (this._ambSrc) { try { this._ambSrc.stop(); } catch (e) {} this._ambSrc = null; this._ambGain = null; }
  },
  setVolume(v) {
    setPref("volume", v);
    if (this._ambGain) this._ambGain.gain.value = v / 100 * 0.3;
  },

  click(soft) {
    const ac = this.ctx(); if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = soft ? "sine" : "square";
    o.frequency.value = soft ? 880 : 2100;
    f.type = "bandpass"; f.frequency.value = soft ? 900 : 1800; f.Q.value = 1.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.vol() * (soft ? 0.12 : 0.2), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (soft ? 0.22 : 0.06));
    o.connect(f).connect(g).connect(ac.destination);
    o.start(t); o.stop(t + 0.3);
  },
  page() {
    const ac = this.ctx(); if (!ac) return;
    const t0 = ac.currentTime;
    // two paper swishes: the lift, then the settle
    [[t0, 0.26, 3200, 700, 0.5], [t0 + 0.17, 0.34, 1800, 380, 0.34]].forEach(([t, dur, hi, lo, amp]) => {
      const src = ac.createBufferSource();
      src.buffer = this.whiteBuf(ac);
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = "bandpass"; bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(hi, t);
      bp.frequency.exponentialRampToValueAtTime(lo, t + dur);
      lp.type = "lowpass"; lp.frequency.value = 7000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(this.vol() * amp, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(bp).connect(lp).connect(g).connect(ac.destination);
      src.start(t); src.stop(t + dur + 0.05);
    });
  },
  /* Lucky's collar: a little bell skip, E6 G6 C7 G6, each a struck partial pair */
  bell() {
    const ac = this.ctx(); if (!ac) return;
    [[1318.5, 0], [1568, 0.16], [2093, 0.32], [1568, 0.52]].forEach(([hz, at]) => {
      [[hz, 0.14], [hz * 2.76, 0.045]].forEach(([f, gain]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f;
        const t = ac.currentTime + at;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain * this.vol() * 2.5, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.85);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.9);
      });
    });
  },

  /* the four toggleable interface sounds, each a no-op when off */
  onType() { if (sfxOn("click")) this.click(false); },
  onPage() { if (sfxOn("page")) this.page(); },
  onSave() { if (sfxOn("chime")) this.click(true); },
  onBell() { if (sfxOn("bell")) this.bell(); },
};
window.CodexSound = Sound;

const AMBIENCES = [
  ["none", "Silence", "Default", "✕"],
  ["rain", "Rain on glass", "Steady", "☂"],
  ["fire", "Fireplace", "Crackle", "✦"],
  ["cafe", "Cafe hum", "Low voices", "❖"],
  ["wind", "Wind, far off", "Cold", "✧"],
  ["night", "Night, crickets", "Late", "✧"],
];
const SFX = [
  ["click", "Typewriter clicks", "A soft key strike as you type"],
  ["page", "Page turn", "When you move between chapters"],
  ["bell", "Sprint bell", "Lucky's collar rings when time is up"],
  ["chime", "Saved chime", "A quiet note when work is saved"],
];
window.CodexSound.AMBIENCES = AMBIENCES;
window.CodexSound.SFX = SFX;

/* ============================================================
   LUCKY — coats, accessories, personalities
   ============================================================ */
const SKINS = [
  ["tabby", "Lucky", "Orange tabby · original"],
  ["calico", "Biscuit", "Cream calico"],
  ["grey", "Ash", "Grey tabby"],
  ["tux", "Inkwell", "Tuxedo, gold eyes"],
  ["cream", "Marzipan", "Cream point"],
  ["siamese", "Solstice", "Siamese, blue eyes"],
];
const ACCESSORIES = [
  ["bell", "Gold bell"], ["bow", "Ribbon bow"], ["crown", "Tiny crown"],
  ["flowers", "Flower crown"], ["pearls", "Pearl collar"], ["scarf", "Winter scarf"],
  ["pendant", "Star pendant"], ["kerchief", "Kerchief"], ["bare", "Bare"],
];

/* Personalities change the voice, never the facts. Anything with a
   number in it is filled from real counts at render time, so Lucky
   cannot congratulate you on a streak you do not have. */
const PERSONAS = {
  sweet: {
    name: "Sweetheart", glyph: "✦", mood: "Content",
    moodLine: "He curls a little closer every day you write.",
    treat: "A treat! For me?",
    thanks: "He purrs so hard he has to sit down.",
    sprint: "I will keep watch. Write the scene.",
    tips: [
      "Press Ctrl K from anywhere; I search titles and full text at once.",
      "Type a name in a document and press Tab; I finish it for you.",
      "Nothing is ever destroyed. Deleted entries wait in Settings, then Restore.",
      "Hover any underlined name for a peek without leaving the page.",
      "Drop a PDF anywhere and I will index its text and its pages.",
      "Take a sip of something warm. The winter court can wait five minutes.",
      "Ask me anything about your canon; I only ever answer from your own words.",
      { needs: "words", text: w => `${w.toLocaleString()} words this week already. That is a real chapter's worth.` },
      { needs: "streak", text: s => `${s} days in a row. That is how books actually get finished.` },
      { needs: "entries", text: n => `${n} entries in this workspace, and I have read every one.` },
    ],
  },
  grumpy: {
    name: "Grumpy", glyph: "❖", mood: "Unimpressed",
    moodLine: "He will deny enjoying any of this. He is lying.",
    treat: "Finally. Put it down there.",
    thanks: "He is purring. He would like that stricken from the record.",
    sprint: "Twenty five minutes. No scrolling. I am timing you.",
    tips: [
      "Wow. Still writing. I don't have all day.",
      "Ctrl K. It has always been Ctrl K. I have told you before.",
      "Fine. That paragraph was good. Do not make it weird.",
      "I sat on your keyboard and the draft improved. Think about that.",
      "Back up your work. Not for you. For me. I live in there.",
      "You have a search box and you are still scrolling. Astonishing.",
      { needs: "words", text: w => `${w.toLocaleString()} words this week and not one of them about cats. Noted.` },
      { needs: "entries", text: n => `${n} entries. You have made me a filing cabinet.` },
    ],
  },
  regal: {
    name: "Regal", glyph: "✧", mood: "Gracious",
    moodLine: "He considers your desk a throne and you its steward.",
    treat: "Tribute. Acceptable.",
    thanks: "The court is satisfied. You may rise.",
    sprint: "The court will not interrupt. Proceed.",
    tips: [
      "The court awaits your next chapter. Do not keep it waiting.",
      "Command me: list all characters in a book, and I shall recite them.",
      "A wise archivist backs up before bed. Settings, then Back up my work.",
      "Name a house and I shall recite every mention of it.",
      "Sit up. Posture is half of prose.",
      { needs: "entries", text: n => `Your canon holds ${n} entries; a respectable library.` },
      { needs: "streak", text: s => `${s} days of steady work. The archive is pleased.` },
    ],
  },
  sleepy: {
    name: "Sleepy", glyph: "☾", mood: "Drowsy",
    moodLine: "He is mostly asleep, but he is asleep near you.",
    treat: "Mmh. Treat. Thank you.",
    thanks: "He carries it off to the warm spot and forgets about it.",
    sprint: "I will nap here. Wake me when it rings.",
    tips: [
      "There is no hurry. The canon keeps perfectly well overnight.",
      "Ctrl K finds anything, so you do not have to remember where you put it.",
      "Everything saves itself. You may close the tab whenever you like.",
      "A short sprint counts. Twenty five minutes is a whole scene sometimes.",
      { needs: "words", text: w => `${w.toLocaleString()} words this week. Rest now.` },
    ],
  },
  gremlin: {
    name: "Gremlin", glyph: "✸", mood: "Feral",
    moodLine: "Something was knocked off the desk. No witnesses. No suspects.",
    treat: "MINE. I am taking this under the sofa.",
    thanks: "Gone. Under the sofa. It lives there now.",
    sprint: "Twenty five minutes of chaos. I mean focus. Go.",
    tips: [
      "I walked across your keyboard and invented a new character. You are welcome.",
      "Ctrl K. Press it. Press it again. It is very satisfying.",
      "I hid something. It is in Settings, then Restore. Probably.",
      "Write the unhinged version first. You can be respectable in the second draft.",
      "Delete nothing in anger. I have seen you. Sleep on it.",
      "Drop a PDF on the page and watch me eat it. I mean index it.",
      { needs: "words", text: w => `${w.toLocaleString()} words. Absolute menace behaviour. Continue.` },
      { needs: "entries", text: n => `${n} entries and I have knocked every one of them off a shelf at least once.` },
    ],
  },
  scholar: {
    name: "Scholar", glyph: "✜", mood: "Studious",
    moodLine: "He has read your canon twice and has notes.",
    treat: "Thank you. I shall record this in the ledger.",
    thanks: "Duly noted, dated, and filed under Provisions.",
    sprint: "Twenty five minutes, uninterrupted. That is how monographs happen.",
    tips: [
      "Ask me to cross-check a name and I will show you every passage that disagrees.",
      "A cross reference forms the second time you use a name. That is the whole rule.",
      "Versions keep themselves as you write; compare any two from the toolbar.",
      "Consistency is not the same as quality, but it is cheaper to fix.",
      "Cite yourself. Link an entry to the passage it came from while you remember.",
      "Back up before a big revision. Future you is a stranger with poor judgement.",
      { needs: "entries", text: n => `${n} entries catalogued. I have read all of them, twice.` },
      { needs: "streak", text: s => `${s} consecutive days. Regularity beats inspiration; the record shows it.` },
      { needs: "words", text: w => `${w.toLocaleString()} words this week — a steady, defensible pace.` },
    ],
  },
};

/* Fill the templated tips from real numbers and drop the ones we
   cannot ground yet — better a shorter rotation than a made-up fact. */
function tipsFor(id, facts) {
  const p = PERSONAS[id] || PERSONAS.sweet;
  return p.tips.map(t => {
    if (typeof t === "string") return t;
    const v = facts[t.needs];
    return v ? t.text(v) : null;
  }).filter(Boolean);
}

function persona() { return PERSONAS[pref("luckyPersonality")] || PERSONAS.sweet; }


/* ---------- the companions who tag along ----------
   Drawn the same way Lucky is, so a coat change on him carries through
   to the kitten who copies him. */
const COMPANION_SVG = {
  mouse: `<svg width="36" height="24" viewBox="0 0 36 24" fill="none">
    <path d="M23 16c7 .8 10-1.4 9.4-4.4" stroke="#a99e98" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
    <ellipse cx="15" cy="15" rx="9.6" ry="6.4" fill="#a9a29d"></ellipse>
    <circle cx="9.6" cy="8.8" r="3.7" fill="#c0b9b4"></circle>
    <circle cx="16.4" cy="7.6" r="3.5" fill="#c0b9b4"></circle>
    <circle cx="9.6" cy="8.8" r="2.1" fill="#e0b4bd"></circle>
    <circle cx="16.4" cy="7.6" r="2" fill="#e0b4bd"></circle>
    <circle cx="6.6" cy="14.4" r="4.8" fill="#b8b1ac"></circle>
    <circle cx="4" cy="13.6" r="1" fill="#33272a"></circle>
    <circle cx="2.2" cy="15.8" r="1" fill="#d98c9a"></circle>
    <path d="M3.2 17.4l-2.4 1.4M3 16.2h-2.6" stroke="#e6ded9" stroke-width=".7" stroke-linecap="round"></path>
    <circle cx="12" cy="21" r="1.5" fill="#e0b4bd"></circle>
    <circle cx="18.4" cy="21.2" r="1.5" fill="#e0b4bd"></circle>
    </svg>`,
  duckling: `<svg width="32" height="30" viewBox="0 0 32 30" fill="none">
    <ellipse cx="18" cy="18.6" rx="9.6" ry="7.4" fill="#f0cb63"></ellipse>
    <path d="M19.4 15.4c4.2 1.6 4.8 5.2 1.6 7-2.6-.8-3.4-4.2-1.6-7z" fill="#e0b247"></path>
    <circle cx="10.4" cy="10" r="5.6" fill="#f6dd8f"></circle>
    <path d="M5.4 9.4l-4.2 1 4 2.4z" fill="#e08a3c" stroke="#b8681f" stroke-width=".6"></path>
    <circle cx="8.8" cy="8.8" r="1.1" fill="#33272a"></circle>
    <path d="M9.6 3.8q1.6-2.8 3.2 0" stroke="#f6dd8f" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    <path d="M15 25.6l-1 3.4M21 25.6l1 3.4" stroke="#e08a3c" stroke-width="1.6" stroke-linecap="round"></path>
    </svg>`,
  bee: `<svg width="32" height="26" viewBox="0 0 32 26" fill="none" style="animation:lucky-bob .9s ease-in-out infinite">
    <ellipse cx="17" cy="15" rx="8.6" ry="6" fill="#f0c65c" stroke="#a97f24" stroke-width=".6"></ellipse>
    <path d="M14 9.6v10.8M18 9.6v10.6M22 11.4v7" stroke="#3a2f22" stroke-width="2.2" stroke-linecap="round"></path>
    <path d="M25.4 15l3.4-1.6v3.2z" fill="#3a2f22"></path>
    <ellipse cx="15" cy="7.4" rx="5.4" ry="3.1" fill="#eaf3fa" stroke="#bcd2e2" stroke-width=".7" opacity=".9"></ellipse>
    <ellipse cx="20.6" cy="8.6" rx="4" ry="2.4" fill="#eaf3fa" stroke="#bcd2e2" stroke-width=".7" opacity=".75"></ellipse>
    <circle cx="8" cy="14.4" r="4.6" fill="#3a2f22"></circle>
    <circle cx="6.2" cy="13.4" r="1.1" fill="#fdf7ef"></circle>
    <path d="M6.4 10.4l-1.8-3.2M9.4 9.8l-.6-3.6" stroke="#3a2f22" stroke-width="1.1" stroke-linecap="round"></path>
    </svg>`,
  snail: `<svg width="36" height="26" viewBox="0 0 36 26" fill="none">
    <path d="M4 21.4h17" stroke="#cbb69c" stroke-width="4.4" stroke-linecap="round"></path>
    <path d="M6 19.6q1.4-6 7-6" stroke="#cbb69c" stroke-width="4" fill="none" stroke-linecap="round"></path>
    <circle cx="21.6" cy="12.6" r="8.4" fill="#d9a768" stroke="#a97b45" stroke-width="1"></circle>
    <path d="M21.6 12.6a3.2 3.2 0 0 1 3.2 3.2 6.4 6.4 0 0 1-9.6-1.6 9 9 0 0 1 12.8 1" fill="none" stroke="#a97b45" stroke-width="1.2"></path>
    <circle cx="7" cy="16.4" r="3.4" fill="#d6c2a8"></circle>
    <path d="M5.8 13.4l-1.6-4.4M9 13.2l.8-4.4" stroke="#d6c2a8" stroke-width="1.5" stroke-linecap="round"></path>
    <circle cx="4" cy="8.4" r="1.1" fill="#33272a"></circle>
    <circle cx="10" cy="8.2" r="1.1" fill="#33272a"></circle>
    <path d="M5 18q1.8 1.2 3.4 0" stroke="#a98f74" stroke-width=".8" fill="none" stroke-linecap="round"></path>
    </svg>`,
  kitten: `<svg width="40" height="28" viewBox="0 0 40 28" fill="none">
    <path class="lucky-tail" d="M28 16.4c5.6-.2 5.2-5 3.6-8" stroke="var(--fur)" stroke-width="3.2" stroke-linecap="round"></path>
    <rect class="lucky-leg" x="15" y="18.6" width="3.2" height="7.4" rx="1.6" fill="var(--fur2)"></rect>
    <rect class="lucky-leg" x="22.4" y="18.6" width="3.2" height="7.4" rx="1.6" fill="var(--fur2)" style="animation-delay:-.31s"></rect>
    <rect x="11.6" y="11.6" width="17" height="10" rx="5" fill="var(--fur)"></rect>
    <ellipse cx="20.6" cy="20" rx="6.6" ry="2.4" fill="var(--belly)"></ellipse>
    <path d="M16.6 12.2v8.4M20.6 12.2v8.4M24.6 12.6v7.6" stroke="var(--fur3)" stroke-width="1.6" stroke-linecap="round" opacity=".7"></path>
    <rect class="lucky-leg" x="18.6" y="18.6" width="3.2" height="7.4" rx="1.6" fill="var(--fur)" style="animation-delay:-.16s"></rect>
    <rect class="lucky-leg" x="25.4" y="18.6" width="3.2" height="7.4" rx="1.6" fill="var(--fur)"></rect>
    <path d="M6 8.6l.9-5 3.9 3.7z" fill="var(--fur)"></path>
    <path d="M12.6 7.6l4.1-3.5.3 4.9z" fill="var(--fur)"></path>
    <path d="M7.4 7.8l.5-2.6 2.1 1.9z" fill="var(--ear)"></path>
    <path d="M13.8 7.2l2.3-1.9.2 2.7z" fill="var(--ear)"></path>
    <circle cx="11" cy="12.6" r="6.4" fill="var(--head)"></circle>
    <circle cx="8.6" cy="12.4" r="1.3" fill="var(--eye)"></circle>
    <circle cx="13.4" cy="12.4" r="1.3" fill="var(--eye)"></circle>
    <circle cx="9" cy="11.9" r=".45" fill="#fff"></circle>
    <circle cx="13.8" cy="11.9" r=".45" fill="#fff"></circle>
    <path d="M10 15h2l-1 1.2z" fill="var(--nose)"></path>
    <path d="M11 16.4c-.6.9-1.8.9-2.4.2M11 16.4c.6.9 1.8.9 2.4.2" stroke="var(--fur3)" stroke-width=".8" stroke-linecap="round"></path>
    <circle cx="6.2" cy="15" r="1.5" fill="var(--ear)" opacity=".5"></circle>
    <circle cx="15.8" cy="15" r="1.5" fill="var(--ear)" opacity=".5"></circle>
    </svg>`,
};
const COMPANIONS = [
  ["none", "Walks alone", "Default"],
  ["mouse", "Crumb the mouse", "Unbothered"],
  ["kitten", "Pip the kitten", "Copies him"],
  ["duckling", "Custard the duckling", "Loud"],
  ["bee", "Thimble the bee", "Busy"],
  ["snail", "Slowpoke the snail", "Late"],
];

/* ---------- what he gets after five pets ---------- */
const TREAT_SVG = {
  sardine: `<svg width="34" height="20" viewBox="0 0 34 20" fill="none">
    <path d="M4 10c6-7 16-7 22 0-6 7-16 7-22 0z" fill="#9ec6d8"></path>
    <path d="M26 10l6-5v10z" fill="#7fadc2"></path>
    <circle cx="11" cy="9" r="1.4" fill="#2f3a42"></circle>
    <path d="M14 6.5c3 1 5 3 6 5" stroke="#7fadc2" stroke-width="1.2"></path>
    </svg>`,
  cream: `<svg width="36" height="22" viewBox="0 0 36 22" fill="none">
    <ellipse cx="18" cy="16" rx="15" ry="5" fill="#e7dcd2"></ellipse>
    <ellipse cx="18" cy="13" rx="11" ry="4" fill="#fdf7ef"></ellipse>
    <ellipse cx="14" cy="12.2" rx="3" ry="1.1" fill="#fff"></ellipse>
    </svg>`,
  biscuit: `<svg width="30" height="22" viewBox="0 0 30 22" fill="none">
    <rect x="3" y="5" width="24" height="13" rx="4" fill="#d9a86a"></rect>
    <path d="M8 9.5h.01M14 8.5h.01M20 10h.01M11 14h.01M18 14.5h.01" stroke="#8a5a2c" stroke-width="2.4" stroke-linecap="round"></path>
    </svg>`,
  prawn: `<svg width="32" height="24" viewBox="0 0 32 24" fill="none">
    <path d="M7 8c8-4 17-2 19 5-2 7-11 9-16 4" stroke="#ef9a9a" stroke-width="6" stroke-linecap="round"></path>
    <path d="M9 6l-4-3M12 5l-2-4" stroke="#ef9a9a" stroke-width="1.6" stroke-linecap="round"></path>
    <circle cx="9.5" cy="8.5" r="1.2" fill="#7c3b3b"></circle>
    </svg>`,
  catnip: `<svg width="30" height="26" viewBox="0 0 30 26" fill="none">
    <path d="M15 24V8" stroke="#6f8f5f" stroke-width="2" stroke-linecap="round"></path>
    <path d="M15 14c-6 0-8-3-8-6 4 0 8 2 8 6zM15 11c6 0 8-3 8-6-4 0-8 2-8 6z" fill="#89ab72"></path>
    <circle cx="15" cy="5" r="2.4" fill="#c9b6e0"></circle>
    <circle cx="11" cy="7" r="1.4" fill="#c9b6e0"></circle>
    </svg>`,
};
const TREATS = [
  ["sardine", "Sardine", "Classic"],
  ["cream", "Saucer of cream", "Rich"],
  ["biscuit", "Butter biscuit", "Crumbly"],
  ["prawn", "Prawn", "Fancy"],
  ["catnip", "Catnip sprig", "Chaotic"],
];
const TREAT_NAME = { sardine: "sardine", cream: "saucer of cream", biscuit: "butter biscuit",
  prawn: "prawn", catnip: "sprig of catnip" };

/* ---------- coat palettes, applied through data-skin ---------- */
const SKIN_CSS = `
[data-skin="tabby"]{--fur:#e8963f;--fur2:#cf7f2e;--fur3:#c9741f;--head:#eda256;--belly:#f8e6d2;--ear:#eeb0ae;--nose:#e08b96;--eye:#3a2a22}
[data-skin="calico"]{--fur:#f3e7d8;--fur2:#dcc6ae;--fur3:#c98a4a;--head:#f7efe4;--belly:#fffaf3;--ear:#eeb0ae;--nose:#e08b96;--eye:#3a2a22}
[data-skin="grey"]{--fur:#9aa3ad;--fur2:#7c858f;--fur3:#68717c;--head:#a7b0b9;--belly:#e9edf1;--ear:#e0aeb6;--nose:#d8929c;--eye:#2c3238}
[data-skin="tux"]{--fur:#2f2b30;--fur2:#221f24;--fur3:#4a444c;--head:#35313a;--belly:#f6f2ee;--ear:#c98f9a;--nose:#dba0aa;--eye:#f0d98a}
[data-skin="cream"]{--fur:#f2ded0;--fur2:#e2c9b6;--fur3:#cbab93;--head:#f6e6da;--belly:#fffaf5;--ear:#eeb0ae;--nose:#dd97a3;--eye:#6f7f9c}
[data-skin="siamese"]{--fur:#e6dcd0;--fur2:#c3b3a4;--fur3:#6b5648;--head:#efe7dd;--belly:#fdf8f3;--ear:#8a6a5c;--nose:#d79aa2;--eye:#5f8fc4}
`;
(function injectSkins() {
  const el = document.createElement("style");
  el.id = "luckySkins"; el.textContent = SKIN_CSS;
  document.head.appendChild(el);
})();

/* ---------- the drawings ---------- */
function accessorySvg(acc) {
  return ({
    bell: `<path d="M28.9 23.2A9.6 9.6 0 0 1 22.6 29.3" stroke="#b0567a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M26.2 27.6v1.2" stroke="#7d5a20" stroke-width=".8" stroke-linecap="round"/>
      <circle cx="26.2" cy="30.4" r="2.2" fill="#e6b95e" stroke="#7d5a20" stroke-width=".8"/>
      <path d="M25.3 30.1h1.8" stroke="#7d5a20" stroke-width=".7" stroke-linecap="round"/>`,
    bow: `<path d="M28.9 23.2A9.6 9.6 0 0 1 22.6 29.3" stroke="#e8799c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M26.4 27.4l-4-2.4.7 5z" fill="#e8799c" stroke="#93304f" stroke-width=".6"/>
      <path d="M27.6 27.2l4.3-1.5-1.2 4.8z" fill="#e8799c" stroke="#93304f" stroke-width=".6"/>
      <circle cx="27" cy="27.8" r="1.4" fill="#f7b3c7" stroke="#93304f" stroke-width=".5"/>`,
    crown: `<path d="M14.8 12.2l1-6 2.9 2.9 1.8-3.8 1.8 3.8 2.9-2.9 1 6z" fill="#e6b95e" stroke="#7d5a20" stroke-width=".9"/>
      <circle cx="17.4" cy="10.4" r=".85" fill="#b0567a"/><circle cx="20.5" cy="9.7" r=".95" fill="#b0567a"/>
      <circle cx="23.6" cy="10.4" r=".85" fill="#b0567a"/>`,
    flowers: `<path d="M13.4 13q3.2-4.4 6.8-4.4T27 13" stroke="#6f8f5f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="14.6" cy="11.8" r="2" fill="#fdf2f5" stroke="#b0567a" stroke-width=".7"/>
      <circle cx="20.2" cy="8.8" r="2.3" fill="#fdf2f5" stroke="#b0567a" stroke-width=".7"/>
      <circle cx="25.8" cy="11.8" r="2" fill="#fdf2f5" stroke="#b0567a" stroke-width=".7"/>
      <circle cx="14.6" cy="11.8" r=".8" fill="#e6b95e"/><circle cx="20.2" cy="8.8" r=".9" fill="#e6b95e"/>
      <circle cx="25.8" cy="11.8" r=".8" fill="#e6b95e"/>`,
    pearls: `<circle cx="28.6" cy="24" r="1.5" fill="#fbf7f2" stroke="#8f7f78" stroke-width=".6"/>
      <circle cx="27.3" cy="26.3" r="1.5" fill="#fbf7f2" stroke="#8f7f78" stroke-width=".6"/>
      <circle cx="25.5" cy="28.1" r="1.5" fill="#fbf7f2" stroke="#8f7f78" stroke-width=".6"/>
      <circle cx="23.2" cy="29.3" r="1.5" fill="#fbf7f2" stroke="#8f7f78" stroke-width=".6"/>`,
    scarf: `<path d="M29.4 22.6A10.2 10.2 0 0 1 22.4 30" stroke="#b0567a" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M23.8 30l-2 6.6 4.4-1.4z" fill="#95496a" stroke="#7c3350" stroke-width=".6"/>
      <path d="M28.4 24.4A8.4 8.4 0 0 1 23.4 29.2" stroke="#f7c8d8" stroke-width=".9" fill="none"/>`,
    pendant: `<path d="M28.9 23.2A9.6 9.6 0 0 1 22.6 29.3" stroke="#c9a15c" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M26.2 28.6l.9 1.9 2 .2-1.5 1.4.5 2-1.9-1.1-1.9 1.1.5-2-1.5-1.4 2-.2z" fill="#e6b95e" stroke="#7d5a20" stroke-width=".6"/>`,
    kerchief: `<path d="M28.9 23.2A9.6 9.6 0 0 1 22.6 29.3l7 6.2z" fill="#8c3b57" stroke="#571f34" stroke-width=".8"/>
      <circle cx="26.4" cy="27.6" r=".7" fill="#f7c8d8"/><circle cx="27.8" cy="30.4" r=".7" fill="#f7c8d8"/>
      <circle cx="24.8" cy="29.6" r=".7" fill="#f7c8d8"/>`,
  })[acc] || "";
}

/* the full walking cat, side on */
function walkerSvg() {
  return `<svg width="86" height="52" viewBox="0 0 72 48" fill="none" aria-hidden="true">
    <path class="lucky-tail" d="M56 25c9-1 9-8 8-14" stroke="var(--fur)" stroke-width="5" stroke-linecap="round"/>
    <rect class="lucky-leg" x="46" y="32" width="5" height="13" rx="2.5" fill="var(--fur2)"/>
    <rect class="lucky-leg" x="28" y="32" width="5" height="13" rx="2.5" fill="var(--fur2)" style="animation-delay:-.31s"/>
    <rect x="23" y="19" width="34" height="17" rx="8.5" fill="var(--fur)"/>
    <ellipse cx="40" cy="33" rx="13" ry="4" fill="var(--belly)"/>
    <path d="M32 20v14M39 20v14M46 20v15" stroke="var(--fur3)" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>
    <rect class="lucky-leg" x="51" y="32" width="5" height="13" rx="2.5" fill="var(--fur)" style="animation-delay:-.31s"/>
    <rect class="lucky-leg" x="33" y="32" width="5" height="13" rx="2.5" fill="var(--fur)"/>
    <path d="M11 13l2-9 8 7z" fill="var(--fur)"/><path d="M22 10l8-6 .5 9z" fill="var(--fur)"/>
    <path d="M13.5 11l1-4.5 3.6 3.2z" fill="var(--ear)"/><path d="M24 10l4-3 .3 4.6z" fill="var(--ear)"/>
    <circle cx="20" cy="20" r="11" fill="var(--head)"/>
    <path d="M17 11.5c1.6 1.4 4 1.4 5.6 0M14 15.5l3.4 1.6" stroke="var(--fur3)" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
    <circle class="lucky-eye" cx="15" cy="20" r="2" fill="var(--eye)"/>
    <circle class="lucky-eye" cx="24" cy="20" r="2" fill="var(--eye)"/>
    <circle cx="15.7" cy="19.3" r=".6" fill="#fff"/><circle cx="24.7" cy="19.3" r=".6" fill="#fff"/>
    <path d="M18 24.4h3l-1.5 1.8z" fill="var(--nose)"/>
    <path d="M19.5 26.2c-.8 1.2-2.4 1.2-3.2.2M19.5 26.2c.8 1.2 2.4 1.2 3.2.2" stroke="var(--fur3)" stroke-width="1.1" stroke-linecap="round"/>
    <circle cx="11.5" cy="24" r="2.2" fill="var(--ear)" opacity=".55"/>
    <circle cx="28.5" cy="24" r="2.2" fill="var(--ear)" opacity=".55"/>
    <path d="M6 22.5l5 .8M6 26l5-.6M31 23.3l5-.8M31 25.4l5 .6" stroke="var(--belly)" stroke-width="1" stroke-linecap="round"/>
    ${accessorySvg(pref("luckyAcc"))}
  </svg>`;
}

/* Whoever is tagging along today, trotting a little behind him. */
function companionSvg() {
  const id = pref("luckyCompanion");
  if (!id || id === "none" || !COMPANION_SVG[id]) return "";
  return `<div class="lucky-pal">${COMPANION_SVG[id]}</div>`;
}

/* The treat itself: hidden until the fifth pet, then set down in front
   of him while he hops. */
function treatSvg() {
  if (!pref("luckyTreatsOn")) return "";
  const id = pref("luckyTreat");
  const svg = TREAT_SVG[id] || TREAT_SVG.sardine;
  return `<div class="lucky-treat">${svg}</div>`;
}

/* the sleeping loaf, used on the sprint clock */
function napSvg() {
  return `<svg width="92" height="50" viewBox="0 0 64 36" fill="none" aria-hidden="true">
    <ellipse cx="30" cy="26" rx="21" ry="9" fill="var(--fur)"/>
    <ellipse cx="33" cy="29" rx="14" ry="5" fill="var(--belly)"/>
    <path d="M26 18v14M34 18v13M42 19v11" stroke="var(--fur3)" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <path d="M50 26c8 2 10-4 7-8" stroke="var(--fur)" stroke-width="5" stroke-linecap="round"/>
    <path d="M9 15l1-6.5 5.4 5z" fill="var(--fur)"/><path d="M19 12.6l5.6-4.6.4 6.6z" fill="var(--fur)"/>
    <circle cx="17" cy="21" r="9.5" fill="var(--head)"/>
    <path d="M11.6 20c1.3-1.4 3.2-1.4 4.5 0M18.4 20c1.3-1.4 3.2-1.4 4.5 0" stroke="var(--eye)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M15.6 24.4h2.8l-1.4 1.7z" fill="var(--nose)"/>
  </svg>`;
}

/* the round portrait used in the assistant header and the Desk */
function faceSvg(size) {
  const s = size || 30;
  return `<svg width="${s}" height="${s}" viewBox="6 4 28 26" fill="none" aria-hidden="true">
    <path d="M11 12l1.5-7 6 5.4z" fill="var(--fur)"/><path d="M23 10l6-5 .4 7z" fill="var(--fur)"/>
    <path d="M13 10.6l.8-3.4 2.7 2.4z" fill="var(--ear)"/><path d="M24.6 10l3-2.3.2 3.5z" fill="var(--ear)"/>
    <circle cx="20" cy="17" r="9" fill="var(--head)"/>
    <path d="M17 9.6c1.4 1.2 3.5 1.2 4.9 0" stroke="var(--fur3)" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
    <circle class="lucky-eye" cx="16.6" cy="17" r="1.8" fill="var(--eye)"/>
    <circle class="lucky-eye" cx="23.4" cy="17" r="1.8" fill="var(--eye)"/>
    <path d="M18.6 20.4h2.8l-1.4 1.7z" fill="var(--nose)"/>
    <path d="M20 22.1c-.7 1.1-2.2 1.1-2.9.2M20 22.1c.7 1.1 2.2 1.1 2.9.2" stroke="var(--fur3)" stroke-width="1" stroke-linecap="round"/>
    <circle cx="13.6" cy="20.6" r="2" fill="var(--ear)" opacity=".55"/>
    <circle cx="26.4" cy="20.6" r="2" fill="var(--ear)" opacity=".55"/>
  </svg>`;
}

/* ============================================================
   THE WALKER
   ============================================================ */
const Lucky = {
  el: null, tipIdx: 0, _wasSleeping: false, facts: { words: 0, streak: 0, entries: 0 },

  name() { return (pref("luckyName") || "Lucky").trim() || "Lucky"; },
  skin() { return pref("luckySkin"); },

  /* Counts Lucky is allowed to mention. Refreshed from the Desk's day
     log and the live entry list. */
  async refreshFacts() {
    // the entry count never depends on the day log, so it is read
    // first — a storage hiccup must not blank out both numbers
    try { if (window.Codex) this.facts.entries = Codex.visibleEntries().length; } catch (e) {}
    try {
      const day = window.CodexDay;
      if (day) {
        const logs = await day.all();
        const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        let words = 0;
        const written = [];
        logs.forEach(l => {
          if (new Date(l.id + "T12:00") >= weekStart) words += l.words || 0;
          if (l.words > 0) written.push(l.id);
        });
        this.facts.words = words;
        this.facts.streak = currentStreak(written);
      }
    } catch (e) {}
  },

  tips() { return tipsFor(pref("luckyPersonality"), this.facts); },
  tip() { const t = this.tips(); return t.length ? t[this.tipIdx % t.length] : ""; },

  mount() {
    if (this.el) return;
    const wrap = document.createElement("div");
    wrap.className = "lucky-stage";
    wrap.id = "luckyStage";
    document.body.appendChild(wrap);
    this.el = wrap;
    this.render();
  },
  render() {
    if (!this.el) return;
    this.el.setAttribute("data-skin", this.skin());

    // While you are actually writing he stops pacing and curls up in the
    // corner instead — a cat walking through your eyeline mid-sentence is
    // the opposite of company.
    if (this.sleeping()) { this.renderSleeping(); return; }

    if (!pref("luckyWalks")) { this.el.innerHTML = this.askButton(); this.bindAsk(); return; }
    const pets = pref("luckyPets") || 0;
    const pace = this.pace();
    this.el.innerHTML = `
      <div class="lucky-walk" id="luckyWalk" title="Pet me, or ask me about your canon"
           style="--pace:${pace}s">
        ${pref("luckyTips") ? `<div class="lucky-tip">
          <div class="k">${esc(this.name())} says</div>
          <div class="lucky-tip-text" id="luckyTipText">${esc(this.tip())}</div>
          <div class="lucky-tip-foot">
            <span class="pet-meter">${"✦".repeat(pets)}${"✧".repeat(Math.max(0, 5 - pets))}</span>
            <span class="pet-hint">${pets === 0 ? "Click me" : pets >= 4 ? "One more for a treat" : "Keep petting"}</span>
          </div>
          <button class="lucky-ask" id="luckyAsk">Ask me something →</button>
        </div>` : ""}
        <div class="lucky-bob">${walkerSvg()}</div>
        ${companionSvg()}
        ${treatSvg()}
        <div class="lucky-notes" aria-hidden="true"><span>♪</span><span>♫</span><span>♪</span></div>
        <div class="lucky-sparks" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
      </div>
      ${this.askButton()}`;
    const walk = $("#luckyWalk", this.el);
    walk.onclick = (e) => {
      if (e.target.closest("#luckyAsk")) return;
      this.pet(walk);
    };
    // Rotate the tip exactly when the stroll wraps, so a new tip never
    // appears halfway through a visible bubble. A timer drifts out of step
    // the moment the animation restarts; this cannot.
    walk.addEventListener("animationiteration", (e) => {
      if (e.animationName === "lucky-walk") this.nextTip();
    });
    this.bindAsk();
  },

  /* the corner button, always reachable whatever he is doing */
  askButton() {
    return `<button class="lucky-hail" id="luckyHail" title="Ask ${esc(this.name())} about your canon">
      <span class="lh-face">${faceSvg(34)}</span>
      <span class="lh-text"><span class="lh-name">Ask ${esc(this.name())}</span>
      <span class="lh-role">Canon assistant</span></span>
    </button>`;
  },
  bindAsk() {
    const open = (e) => {
      if (e) e.stopPropagation();
      if (window.CodexAssistant) CodexAssistant.open();
    };
    const ask = $("#luckyAsk", this.el); if (ask) ask.onclick = open;
    const hail = $("#luckyHail", this.el); if (hail) hail.onclick = open;
  },

  /* one crossing, in seconds */
  pace() { const p = +pref("luckyPace"); return p >= 8 && p <= 200 ? p : 34; },

  /* he sleeps while a document is open, if you let him */
  sleeping() {
    if (!pref("luckySleeps")) return false;
    return /^#\/(doc|deck|read)\//.test(location.hash || "");
  },
  renderSleeping() {
    this.el.innerHTML = `
      <div class="lucky-sleep" id="luckySleep" title="${esc(this.name())} is asleep. Click to wake him.">
        <div class="lucky-z" aria-hidden="true"><span>z</span><span>z</span><span>z</span></div>
        ${napSvg()}
      </div>
      ${this.askButton()}`;
    const s = $("#luckySleep", this.el);
    if (s) s.onclick = () => {
      // waking him is just petting him; he goes back to sleep on the next render
      CodexExtra.settings.luckyPetsTotal = (pref("luckyPetsTotal") || 0) + 1;
      save();
      s.classList.remove("waking"); void s.offsetWidth; s.classList.add("waking");
    };
    this.bindAsk();
  },

  pet(walk) {
    const n = (pref("luckyPets") || 0) + 1;
    CodexExtra.settings.luckyPetsTotal = (pref("luckyPetsTotal") || 0) + 1;
    if (!pref("luckyTreatsOn")) {
      // no treats: he simply enjoys the attention
      CodexExtra.settings.luckyPets = n % 5;
      save();
      this.render();
      return;
    }
    if (n < 5) {
      CodexExtra.settings.luckyPets = n;
      save();
      this.render();
      return;
    }
    // five pets: a treat, a little dance, and he takes it off screen
    CodexExtra.settings.luckyPets = 0;
    CodexExtra.settings.luckyTreats = (pref("luckyTreats") || 0) + 1;
    save();
    Sound.onBell();
    walk.classList.add("treating");
    const p = persona();
    const txt = $("#luckyTipText", this.el);
    if (txt) txt.textContent = p.treat + " A " + (TREAT_NAME[pref("luckyTreat")] || "sardine") + ".";
    // the second beat: he stops crowing about the treat and just purrs
    const thanksAt = setTimeout(() => {
      const t = $("#luckyTipText", this.el);
      if (t && p.thanks) t.textContent = p.thanks;
    }, 2100);
    setTimeout(() => {
      clearTimeout(thanksAt);
      walk.classList.remove("treating");
      this.tipIdx++;
      this.render();
      // restart the stroll so he walks back in from the right
      const el = $("#luckyWalk", this.el);
      if (el && el.getAnimations) el.getAnimations({ subtree: true }).forEach(a => { try { a.cancel(); a.play(); } catch (e) {} });
    }, 4600);
  },

  /* rotate the tip every time the stroll comes round again */
  nextTip() { this.tipIdx++; const t = $("#luckyTipText", this.el || document); if (t) t.textContent = this.tip(); },

  setSkin(id) { setPref("luckySkin", id); this.render(); refreshFaces(); },
  setAcc(id) { setPref("luckyAcc", id); this.render(); },
  setPersonality(id) { setPref("luckyPersonality", id); this.tipIdx = 0; this.render(); },
  setName(n) { setPref("luckyName", n); this.render(); refreshFaces(); },
  setWalks(on) { setPref("luckyWalks", !!on); this.render(); },
};

function currentStreak(days) {
  const set = new Set(days);
  const key = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  let n = 0;
  const cur = new Date(today);
  if (!set.has(key(cur))) cur.setDate(cur.getDate() - 1);   // today isn't over yet
  while (set.has(key(cur))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

/* keep every rendered portrait in step with the chosen coat */
function refreshFaces() {
  document.querySelectorAll("[data-lucky-face]").forEach(el => {
    el.setAttribute("data-skin", Lucky.skin());
    el.innerHTML = faceSvg(+el.dataset.luckyFace || 30);
  });
}

/* ============================================================
   THE SPRINT OVERLAY
   ============================================================ */
const Sprint = {
  total: 25 * 60, left: 0, running: false, tick: null, banked: 0,
  startWords: 0, el: null,

  start(minutes) {
    this.total = (minutes || 25) * 60;
    this.left = this.total;
    this.banked = 0;
    this.startWords = liveWordCount();
    this.mount();
    this.resume();
    const amb = pref("ambience");
    if (amb && amb !== "none") Sound.ambience(amb);
  },
  resume() {
    clearInterval(this.tick);
    this.running = true;
    this.tick = setInterval(() => {
      this.left--;
      this.banked++;
      if (this.banked >= 60) { window.CodexDay && CodexDay.add(0, 1, 0); this.banked = 0; }
      if (this.left <= 0) return this.finish();
      this.paint();
    }, 1000);
    this.paint();
  },
  pause() { clearInterval(this.tick); this.running = false; this.paint(); },
  end(rang) {
    clearInterval(this.tick);
    this.running = false;
    if (this.banked > 30 && window.CodexDay) CodexDay.add(0, 1, 0);
    Sound.stopAmbience();
    if (rang) Sound.onBell();
    window.CodexDay && CodexDay.flush();
    if (this.el) { this.el.remove(); this.el = null; }
    if ((location.hash || "#/") === "#/" && window.CodexDesk) CodexDesk.view();
  },
  finish() {
    const mins = Math.round(this.total / 60);
    this.end(true);
    window.CodexHelp && CodexHelp.markMilestone("sprint");
    if (window.toast) toast(`Sprint finished. ${mins} minutes at the desk.`);
  },

  mount() {
    let el = $("#sprintOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "sprintOverlay";
      el.className = "sprint-overlay";
      document.body.appendChild(el);
    }
    this.el = el;
    el.setAttribute("data-skin", Lucky.skin());
    const amb = pref("ambience");
    el.innerHTML = `
      <div class="sprint-clock">
        <svg viewBox="0 0 250 250" fill="none" class="sprint-ring" aria-hidden="true">
          <circle cx="125" cy="125" r="112" stroke="rgba(240,205,212,.16)" stroke-width="3"/>
          <circle cx="125" cy="125" r="112" stroke="#e6b95e" stroke-width="3" stroke-linecap="round"
                  stroke-dasharray="704" stroke-dashoffset="0" transform="rotate(-90 125 125)" id="sprintArc"/>
        </svg>
        <div class="sprint-read">
          <div class="sprint-time" id="sprintTime">--:--</div>
          <div class="sprint-sub" id="sprintSub">Sprint</div>
        </div>
        ${pref("luckyNaps") ? `<div class="sprint-nap">${napSvg()}</div>` : ""}
      </div>
      <div class="sprint-line">${esc(persona().sprint)}</div>
      <div class="sprint-ambs">${AMBIENCES.map(([id, name]) =>
        `<button class="amb-chip${amb === id ? " on" : ""}" data-amb="${id}">${esc(name)}</button>`).join("")}</div>
      <div class="sprint-buttons">
        <button class="sprint-btn ghost" id="sprintToggle">Pause</button>
        <button class="sprint-btn" id="sprintEnd">End sprint</button>
      </div>`;
    $("#sprintToggle", el).onclick = () => (this.running ? this.pause() : this.resume());
    $("#sprintEnd", el).onclick = () => this.end(false);
    el.querySelectorAll("[data-amb]").forEach(b => b.onclick = () => {
      Sound.ambience(b.dataset.amb);
      el.querySelectorAll("[data-amb]").forEach(x => x.classList.toggle("on", x === b));
    });
    document.addEventListener("keydown", this._esc = (e) => {
      if (e.key === "Escape" && this.el) this.end(false);
    });
    this.paint();
  },
  paint() {
    if (!this.el) return;
    const m = Math.max(0, Math.floor(this.left / 60)), s = Math.max(0, this.left % 60);
    const t = $("#sprintTime", this.el);
    if (t) t.textContent = m + ":" + String(s).padStart(2, "0");
    const arc = $("#sprintArc", this.el);
    if (arc) arc.setAttribute("stroke-dashoffset", String(Math.round(704 * (1 - this.left / this.total))));
    const sub = $("#sprintSub", this.el);
    if (sub) {
      const w = liveWordCount() - this.startWords;
      sub.textContent = this.running
        ? (w > 0 ? `Sprint · ${w.toLocaleString()} word${w === 1 ? "" : "s"} so far` : "Sprint")
        : "Paused";
    }
    const b = $("#sprintToggle", this.el);
    if (b) b.textContent = this.running ? "Pause" : "Resume";
  },
};

/* words currently in the open document, so the sprint can report
   progress without guessing */
function liveWordCount() {
  const ed = document.getElementById("docEditor");
  if (!ed) return 0;
  return (ed.innerText || "").trim().split(/\s+/).filter(Boolean).length;
}

window.CodexSprint = Sprint;
window.CodexLucky = {
  mount: () => Lucky.mount(),
  render: () => Lucky.render(),
  refreshFacts: () => Lucky.refreshFacts(),
  face: faceSvg, nap: napSvg,
  name: () => Lucky.name(), skin: () => Lucky.skin(),
  persona, PERSONAS, SKINS, ACCESSORIES, COMPANIONS, TREATS,
  companionSvg: id => COMPANION_SVG[id] || "", treatSvg: id => TREAT_SVG[id] || "",
  pref,
  // every setter here re-draws him: a toggle in Settings that does not
  // visibly change the cat reads as a broken switch
  setPref: (k, v) => { setPref(k, v); Lucky.render(); },
  setPace: secs => { setPref("luckyPace", secs); Lucky.render(); },
  setSkin: id => Lucky.setSkin(id), setAcc: id => Lucky.setAcc(id),
  setPersonality: id => Lucky.setPersonality(id), setName: n => Lucky.setName(n),
  setWalks: on => Lucky.setWalks(on),
  setCompanion: id => { setPref("luckyCompanion", id); Lucky.render(); },
  setTreat: id => { setPref("luckyTreat", id); Lucky.render(); },
  ledger: () => [
    { n: pref("luckyPetsTotal") || 0, label: "Pets" },
    { n: pref("luckyTreats") || 0, label: "Treats" },
    { n: Lucky.facts.entries, label: "Entries" },
    { n: Lucky.facts.streak, label: "Day streak" },
  ],
  refreshFaces,
};

/* Lucky only appears once the app has settled, and only if he is
   switched on. Reduced-motion users get a still cat, handled in CSS. */
/* If the device asks for reduced motion we honour it, which means Lucky
   sits still — and someone who never knowingly chose that setting has no
   way to tell a deliberate stillness from a broken cat. Ask once, plainly,
   then never again whichever way they answer. */
function offerMotionOnce() {
  const s = settings();
  if ((s.motion || "system") !== "system") return;         // already decided
  if (localStorage.getItem("codex.motionAsked")) return;
  let calm = false;
  try { calm = window.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) {}
  if (!calm) return;

  const bar = document.createElement("div");
  bar.className = "motion-offer";
  bar.innerHTML = `<div class="mo-text">Your device asks for less movement, so ${esc(Lucky.name())}
      is sitting still rather than strolling. Would you like him to walk?</div>
    <div class="mo-acts">
      <button class="btn sm" data-mo="full">Let him walk</button>
      <button class="btn ghost sm" data-mo="calm">Keep him still</button>
    </div>`;
  document.body.appendChild(bar);
  bar.querySelectorAll("[data-mo]").forEach(b => b.onclick = () => {
    CodexExtra.settings.motion = b.dataset.mo;
    save();
    localStorage.setItem("codex.motionAsked", "1");
    document.documentElement.dataset.motion = b.dataset.mo;
    Lucky.render();
    bar.remove();
  });
}

function boot() {
  // Mount first, then fill in the numbers. Chaining the mount onto the
  // fact-gathering meant a slow or wedged storage read could leave the
  // page with no cat at all; the tips that need real counts simply
  // aren't offered until the counts arrive.
  Lucky.mount();
  Lucky.refreshFacts().then(() => Lucky.render()).catch(() => {});
  setTimeout(offerMotionOnce, 2200);
  // he curls up when a document opens and paces again when it closes
  window.addEventListener("hashchange", () => {
    const now = Lucky.sleeping();
    if (now !== Lucky._wasSleeping) { Lucky._wasSleeping = now; Lucky.render(); }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
else setTimeout(boot, 900);
})();
