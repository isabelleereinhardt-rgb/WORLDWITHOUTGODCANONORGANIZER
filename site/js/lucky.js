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
  luckyWalks: true, luckyNaps: true, luckyPets: 0, luckyPetsTotal: 0, luckyTreats: 0,
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
    sprint: "I will nap here. Wake me when it rings.",
    tips: [
      "There is no hurry. The canon keeps perfectly well overnight.",
      "Ctrl K finds anything, so you do not have to remember where you put it.",
      "Everything saves itself. You may close the tab whenever you like.",
      "A short sprint counts. Twenty five minutes is a whole scene sometimes.",
      { needs: "words", text: w => `${w.toLocaleString()} words this week. Rest now.` },
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
  el: null, tipIdx: 0, facts: { words: 0, streak: 0, entries: 0 },

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
    if (!pref("luckyWalks")) { this.el.innerHTML = ""; return; }
    const pets = pref("luckyPets") || 0;
    this.el.setAttribute("data-skin", this.skin());
    this.el.innerHTML = `
      <div class="lucky-walk" id="luckyWalk" title="Pet me, or ask me about your canon">
        <div class="lucky-tip">
          <div class="k">${esc(this.name())} says</div>
          <div class="lucky-tip-text" id="luckyTipText">${esc(this.tip())}</div>
          <div class="lucky-tip-foot">
            <span class="pet-meter">${"✦".repeat(pets)}${"✧".repeat(Math.max(0, 5 - pets))}</span>
            <span class="pet-hint">${pets === 0 ? "Click me" : pets >= 4 ? "One more for a treat" : "Keep petting"}</span>
          </div>
          <button class="lucky-ask" id="luckyAsk">Ask me something →</button>
        </div>
        <div class="lucky-bob">${walkerSvg()}</div>
      </div>`;
    const walk = $("#luckyWalk", this.el);
    walk.onclick = (e) => {
      if (e.target.closest("#luckyAsk")) return;
      this.pet(walk);
    };
    $("#luckyAsk", this.el).onclick = (e) => {
      e.stopPropagation();
      if (window.CodexAssistant) CodexAssistant.open();
    };
  },

  pet(walk) {
    const n = (pref("luckyPets") || 0) + 1;
    CodexExtra.settings.luckyPetsTotal = (pref("luckyPetsTotal") || 0) + 1;
    if (n < 5) {
      CodexExtra.settings.luckyPets = n;
      save();
      this.render();
      return;
    }
    // five pets: a treat, a hop, and he takes it off screen
    CodexExtra.settings.luckyPets = 0;
    CodexExtra.settings.luckyTreats = (pref("luckyTreats") || 0) + 1;
    save();
    Sound.onBell();
    walk.classList.add("treating");
    const txt = $("#luckyTipText", this.el);
    if (txt) txt.textContent = persona().treat;
    setTimeout(() => {
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
  persona, PERSONAS, SKINS, ACCESSORIES,
  pref, setPref,
  setSkin: id => Lucky.setSkin(id), setAcc: id => Lucky.setAcc(id),
  setPersonality: id => Lucky.setPersonality(id), setName: n => Lucky.setName(n),
  setWalks: on => Lucky.setWalks(on),
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
function boot() {
  Lucky.refreshFacts().then(() => { Lucky.mount(); });
  // rotate his tip each time the stroll wraps around
  setInterval(() => Lucky.nextTip(), 34000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
else setTimeout(boot, 900);
})();
