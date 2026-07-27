/* ============================================================
   THE AVATAR BUILDER; the Settings panel that drives avatar.js.

   Three kits (feminine, masculine, neutral) each offer their own set
   of face shapes, hairstyles, eyes, brows, mouths, glasses, tops and
   extras; the colour rows are shared. Everything is stored in
   settings, so the Desk greeting and the assistant header follow it.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KITS = {
      fem: {
        label: 'Feminine', note: 'Softer frames, longer hair, lashes and colour on the cheek.',
        build: [['soft', 'Soft oval'], ['heart', 'Heart'], ['round', 'Round'], ['oval', 'Oval'],
          ['diamond', 'Diamond'], ['tapered', 'Tapered'], ['pear', 'Pear'], ['baby', 'Baby face'],
          ['lean', 'Lean'], ['long', 'Long'], ['softsquare', 'Soft square'], ['wide', 'Wide']],
        style: [['long', 'Long'], ['wavy', 'Waves'], ['beachy', 'Beachy'], ['bob', 'Bob'], ['lob', 'Lob'],
          ['bowl', 'Rounded fringe'], ['halfup', 'Half up'], ['bangs', 'Blunt bangs'], ['curtain', 'Curtain bangs'],
          ['pony', 'Ponytail'], ['highpony', 'High ponytail'], ['longbraid', 'Side braid'], ['braids', 'Two braids'],
          ['twintails', 'Twin tails'], ['buns', 'Space buns'], ['topknot', 'Top knot'], ['messybun', 'Messy bun'],
          ['lowbun', 'Low bun'], ['curls', 'Curls'], ['afro', 'Afro'], ['bantu', 'Bantu knots'],
          ['locs', 'Locs'], ['cornrows', 'Cornrows'], ['shag', 'Shag'], ['wolf', 'Wolf cut'],
          ['pixie', 'Pixie'], ['sidepart', 'Side part'], ['shavedside', 'Shaved side']],
        eyes: [['lash', 'Lashes'], ['doe', 'Doe'], ['round', 'Bright'], ['wide', 'Wide'], ['almond', 'Almond'],
          ['cat', 'Cat eye'], ['upturned', 'Upturned'], ['downturned', 'Downturned'], ['hooded', 'Hooded'],
          ['monolid', 'Monolid'], ['sharp', 'Sharp'], ['sleepy', 'Sleepy'], ['tired', 'Tired'],
          ['happy', 'Smiling'], ['closed', 'Closed'], ['wink', 'Wink'], ['sparkle', 'Sparkling'], ['star', 'Stars']],
        brow: [['arch', 'Arched'], ['thin', 'Thin'], ['soft', 'Soft'], ['rounded', 'Rounded'],
          ['tapered', 'Tapered'], ['high', 'High'], ['short', 'Short'], ['straight', 'Straight'],
          ['bold', 'Bold'], ['sharp', 'Sharp'], ['angled', 'Angled'], ['worried', 'Worried'], ['low', 'Low']],
        mouth: [['smile', 'Smile'], ['soft', 'Soft smile'], ['half', 'Half smile'], ['lipstick', 'Lipstick'],
          ['pout', 'Pout'], ['kiss', 'Kiss'], ['grin', 'Grin'], ['teeth', 'Teeth'], ['laugh', 'Laughing'],
          ['open', 'Open'], ['o', 'Oh'], ['surprised', 'Surprised'], ['bite', 'Lip bite'], ['tongue', 'Tongue'],
          ['smirk', 'Smirk'], ['smug', 'Smug'], ['neutral', 'Neutral'], ['frown', 'Frown'], ['sad', 'Sad']],
        glasses: [['none', 'None'], ['cat', 'Cat eye'], ['round', 'Round gold'], ['oval', 'Oval'],
          ['wire', 'Wire'], ['halfrim', 'Half rim'], ['rect', 'Rectangle'], ['square', 'Square'],
          ['thick', 'Thick black'], ['tinted', 'Rose tinted'], ['sun', 'Sunglasses'], ['reading', 'Reading, low'],
          ['aviator', 'Aviators'], ['head', 'On my head']],
        topStyle: [['collar', 'Ribbon collar'], ['crew', 'Crew neck'], ['vneck', 'V neck'], ['turtle', 'Turtleneck'],
          ['cowl', 'Cowl neck'], ['cardigan', 'Cardigan'], ['sweater', 'Knit sweater'], ['blazer', 'Blazer'],
          ['coat', 'Winter coat'], ['tee', 'Tee'], ['tank', 'Tank'], ['corset', 'Corset'],
          ['wrap', 'Wrap top'], ['kimono', 'Kimono'], ['shawl', 'Shawl'], ['button', 'Button-up'],
          ['denim', 'Denim jacket'], ['hoodie', 'Hoodie']],
        blush: [['soft', 'Soft'], ['rosy', 'Rosy'], ['strong', 'Strong'], ['peach', 'Peach'], ['coral', 'Coral'],
          ['plum', 'Plum'], ['berry', 'Berry'], ['deep', 'Deep'], ['pale', 'Pale'], ['dewy', 'Dewy'],
          ['glitter', 'Glitter'], ['sunkissed', 'Sun-kissed'], ['bronze', 'Bronze'], ['contour', 'Contour'], ['none', 'None']],
        beard: null,
        extras: [['freckles', 'Freckles'], ['mark', 'Beauty mark'], ['dimples', 'Dimples'], ['scar', 'Scar'],
          ['nosering', 'Nose ring'], ['earrings', 'Gold studs'], ['drops', 'Drop earrings'], ['hoops', 'Hoops'],
          ['cuff', 'Ear cuff'], ['flower', 'Flower'], ['bow', 'Bow'], ['ribbon', 'Ribbon'],
          ['headband', 'Headband'], ['beret', 'Beret'], ['crown', 'Little crown'], ['tiara', 'Tiara'],
          ['halo', 'Halo'], ['veil', 'Veil'], ['stars', 'Stars'], ['heartsticker', 'Heart sticker'], ['eyepatch', 'Eye patch']]
      },
      masc: {
        label: 'Masculine', note: 'Stronger jaw and shoulders, short cuts, every kind of beard.',
        build: [['square', 'Square jaw'], ['broad', 'Broad'], ['angular', 'Angular'], ['chiseled', 'Chiselled'],
          ['softsquare', 'Soft square'], ['wide', 'Wide'], ['oval', 'Oval'], ['round', 'Round'],
          ['long', 'Long'], ['lean', 'Lean'], ['diamond', 'Diamond'], ['baby', 'Baby face']],
        style: [['crop', 'Short crop'], ['buzz', 'Buzz cut'], ['fade', 'Fade'], ['undercut', 'Undercut'],
          ['quiff', 'Quiff'], ['pompadour', 'Pompadour'], ['spikes', 'Spikes'], ['flattop', 'Flat top'],
          ['slick', 'Slicked back'], ['sidepart', 'Side part'], ['shavedside', 'Shaved side'],
          ['curlytop', 'Curly top'], ['curls', 'Curls'], ['afro', 'Afro'], ['bantu', 'Bantu knots'],
          ['locs', 'Locs'], ['cornrows', 'Cornrows'], ['manbun', 'Man bun'], ['lowbun', 'Low bun'],
          ['mullet', 'Grown out'], ['wolf', 'Wolf cut'], ['shag', 'Shag'], ['long', 'Long'],
          ['lob', 'Shoulder length'], ['pixie', 'Cropped'], ['bowl', 'Bowl cut']],
        eyes: [['narrow', 'Level'], ['round', 'Bright'], ['wide', 'Wide'], ['almond', 'Almond'],
          ['hooded', 'Hooded'], ['monolid', 'Monolid'], ['sharp', 'Sharp'], ['downturned', 'Downturned'],
          ['upturned', 'Upturned'], ['sleepy', 'Sleepy'], ['tired', 'Tired'], ['happy', 'Smiling'],
          ['closed', 'Closed'], ['wink', 'Wink'], ['cat', 'Keen'], ['sparkle', 'Sparkling']],
        brow: [['bold', 'Heavy'], ['thick', 'Thick'], ['straight', 'Straight'], ['angled', 'Angled'],
          ['sharp', 'Sharp'], ['low', 'Low'], ['soft', 'Soft'], ['short', 'Short'], ['tapered', 'Tapered'],
          ['arch', 'Arched'], ['rounded', 'Rounded'], ['high', 'High'], ['thin', 'Thin'], ['worried', 'Worried']],
        mouth: [['neutral', 'Neutral'], ['smirk', 'Smirk'], ['smug', 'Smug'], ['half', 'Half smile'],
          ['smile', 'Smile'], ['soft', 'Soft smile'], ['grin', 'Grin'], ['teeth', 'Teeth'],
          ['laugh', 'Laughing'], ['open', 'Open'], ['o', 'Oh'], ['surprised', 'Surprised'],
          ['bite', 'Lip bite'], ['tongue', 'Tongue'], ['frown', 'Frown'], ['sad', 'Sad'], ['pout', 'Pout']],
        glasses: [['none', 'None'], ['square', 'Square'], ['rect', 'Rectangle'], ['thick', 'Thick black'],
          ['round', 'Round gold'], ['oval', 'Oval'], ['wire', 'Wire'], ['halfrim', 'Half rim'],
          ['aviator', 'Aviators'], ['sun', 'Sunglasses'], ['sport', 'Sport'], ['tinted', 'Tinted'],
          ['reading', 'Reading, low'], ['monocle', 'Monocle'], ['head', 'On my head']],
        topStyle: [['button', 'Button-up'], ['crew', 'Crew neck'], ['vneck', 'V neck'], ['henley', 'Henley'],
          ['polo', 'Polo'], ['tee', 'Tee'], ['tank', 'Tank'], ['hoodie', 'Hoodie'], ['sweater', 'Knit sweater'],
          ['turtle', 'Turtleneck'], ['cowl', 'Cowl neck'], ['blazer', 'Blazer'], ['coat', 'Winter coat'],
          ['denim', 'Denim jacket'], ['cardigan', 'Cardigan'], ['kimono', 'Kimono'], ['shawl', 'Shawl']],
        blush: [['none', 'None'], ['soft', 'Soft'], ['sunkissed', 'Sun-kissed'], ['bronze', 'Bronze'],
          ['contour', 'Contour'], ['pale', 'Pale'], ['rosy', 'Rosy'], ['peach', 'Peach'], ['coral', 'Coral'],
          ['dewy', 'Dewy'], ['plum', 'Plum'], ['berry', 'Berry'], ['deep', 'Deep'], ['strong', 'Strong']],
        beard: [['none', 'Clean shaven'], ['stubble', 'Stubble'], ['soulpatch', 'Soul patch'],
          ['moustache', 'Moustache'], ['handlebar', 'Handlebar'], ['goatee', 'Goatee'], ['vandyke', 'Van Dyke'],
          ['chinstrap', 'Chin strap'], ['mutton', 'Mutton chops'], ['short', 'Short beard'],
          ['full', 'Full beard'], ['longbeard', 'Long beard']],
        extras: [['freckles', 'Freckles'], ['mark', 'Beauty mark'], ['dimples', 'Dimples'], ['scar', 'Scar'],
          ['nosering', 'Nose ring'], ['earrings', 'Gold studs'], ['hoops', 'Hoops'], ['cuff', 'Ear cuff'],
          ['drops', 'Drop earrings'], ['headband', 'Headband'], ['beret', 'Beret'], ['crown', 'Little crown'],
          ['halo', 'Halo'], ['stars', 'Stars'], ['eyepatch', 'Eye patch'], ['heartsticker', 'Heart sticker'],
          ['flower', 'Flower'], ['ribbon', 'Ribbon']]
      },
      neutral: {
        label: 'Neither / both', note: 'Every frame, every cut, every piece; nothing withheld.',
        build: [['oval', 'Oval'], ['soft', 'Soft oval'], ['heart', 'Heart'], ['round', 'Round'],
          ['diamond', 'Diamond'], ['long', 'Long'], ['tapered', 'Tapered'], ['lean', 'Lean'],
          ['pear', 'Pear'], ['baby', 'Baby face'], ['softsquare', 'Soft square'], ['square', 'Square jaw'],
          ['angular', 'Angular'], ['chiseled', 'Chiselled'], ['wide', 'Wide'], ['broad', 'Broad']],
        style: [['sidepart', 'Side part'], ['shag', 'Shag'], ['wolf', 'Wolf cut'], ['curtain', 'Curtain bangs'],
          ['crop', 'Short crop'], ['buzz', 'Buzz cut'], ['fade', 'Fade'], ['undercut', 'Undercut'],
          ['quiff', 'Quiff'], ['pompadour', 'Pompadour'], ['spikes', 'Spikes'], ['flattop', 'Flat top'],
          ['slick', 'Slicked back'], ['shavedside', 'Shaved side'], ['curlytop', 'Curly top'],
          ['manbun', 'Man bun'], ['lowbun', 'Low bun'], ['messybun', 'Messy bun'], ['topknot', 'Top knot'],
          ['mullet', 'Grown out'], ['pixie', 'Pixie'], ['bowl', 'Rounded fringe'], ['bob', 'Bob'],
          ['lob', 'Lob'], ['long', 'Long'], ['wavy', 'Waves'], ['beachy', 'Beachy'], ['halfup', 'Half up'],
          ['bangs', 'Blunt bangs'], ['pony', 'Ponytail'], ['highpony', 'High ponytail'],
          ['braids', 'Two braids'], ['twintails', 'Twin tails'], ['longbraid', 'Side braid'],
          ['buns', 'Space buns'], ['curls', 'Curls'], ['afro', 'Afro'], ['bantu', 'Bantu knots'],
          ['locs', 'Locs'], ['cornrows', 'Cornrows']],
        eyes: [['round', 'Bright'], ['narrow', 'Level'], ['wide', 'Wide'], ['almond', 'Almond'], ['doe', 'Doe'],
          ['lash', 'Lashes'], ['cat', 'Cat eye'], ['upturned', 'Upturned'], ['downturned', 'Downturned'],
          ['hooded', 'Hooded'], ['monolid', 'Monolid'], ['sharp', 'Sharp'], ['sleepy', 'Sleepy'],
          ['tired', 'Tired'], ['happy', 'Smiling'], ['closed', 'Closed'], ['wink', 'Wink'],
          ['sparkle', 'Sparkling'], ['star', 'Stars']],
        brow: [['soft', 'Soft'], ['straight', 'Straight'], ['arch', 'Arched'], ['rounded', 'Rounded'],
          ['thin', 'Thin'], ['bold', 'Heavy'], ['thick', 'Thick'], ['angled', 'Angled'], ['sharp', 'Sharp'],
          ['tapered', 'Tapered'], ['high', 'High'], ['low', 'Low'], ['short', 'Short'], ['worried', 'Worried']],
        mouth: [['smile', 'Smile'], ['soft', 'Soft smile'], ['half', 'Half smile'], ['neutral', 'Neutral'],
          ['smirk', 'Smirk'], ['smug', 'Smug'], ['grin', 'Grin'], ['teeth', 'Teeth'], ['laugh', 'Laughing'],
          ['open', 'Open'], ['o', 'Oh'], ['surprised', 'Surprised'], ['bite', 'Lip bite'], ['tongue', 'Tongue'],
          ['kiss', 'Kiss'], ['lipstick', 'Lipstick'], ['pout', 'Pout'], ['frown', 'Frown'], ['sad', 'Sad']],
        glasses: [['none', 'None'], ['round', 'Round gold'], ['oval', 'Oval'], ['square', 'Square'],
          ['rect', 'Rectangle'], ['thick', 'Thick black'], ['wire', 'Wire'], ['halfrim', 'Half rim'],
          ['cat', 'Cat eye'], ['aviator', 'Aviators'], ['sun', 'Sunglasses'], ['tinted', 'Tinted'],
          ['reading', 'Reading, low'], ['sport', 'Sport'], ['monocle', 'Monocle'], ['head', 'On my head']],
        topStyle: [['crew', 'Crew neck'], ['vneck', 'V neck'], ['tee', 'Tee'], ['collar', 'Ribbon collar'],
          ['button', 'Button-up'], ['henley', 'Henley'], ['polo', 'Polo'], ['turtle', 'Turtleneck'],
          ['cowl', 'Cowl neck'], ['sweater', 'Knit sweater'], ['cardigan', 'Cardigan'], ['hoodie', 'Hoodie'],
          ['blazer', 'Blazer'], ['coat', 'Winter coat'], ['denim', 'Denim jacket'], ['tank', 'Tank'],
          ['corset', 'Corset'], ['wrap', 'Wrap top'], ['kimono', 'Kimono'], ['shawl', 'Shawl']],
        blush: [['none', 'None'], ['soft', 'Soft'], ['rosy', 'Rosy'], ['strong', 'Strong'], ['peach', 'Peach'],
          ['coral', 'Coral'], ['plum', 'Plum'], ['berry', 'Berry'], ['deep', 'Deep'], ['pale', 'Pale'],
          ['dewy', 'Dewy'], ['glitter', 'Glitter'], ['sunkissed', 'Sun-kissed'], ['bronze', 'Bronze'], ['contour', 'Contour']],
        beard: [['none', 'Clean shaven'], ['stubble', 'Stubble'], ['soulpatch', 'Soul patch'],
          ['moustache', 'Moustache'], ['handlebar', 'Handlebar'], ['goatee', 'Goatee'], ['vandyke', 'Van Dyke'],
          ['chinstrap', 'Chin strap'], ['mutton', 'Mutton chops'], ['short', 'Short beard'],
          ['full', 'Full beard'], ['longbeard', 'Long beard']],
        extras: [['freckles', 'Freckles'], ['mark', 'Beauty mark'], ['dimples', 'Dimples'], ['scar', 'Scar'],
          ['nosering', 'Nose ring'], ['earrings', 'Gold studs'], ['drops', 'Drop earrings'], ['hoops', 'Hoops'],
          ['cuff', 'Ear cuff'], ['flower', 'Flower'], ['bow', 'Bow'], ['ribbon', 'Ribbon'],
          ['headband', 'Headband'], ['beret', 'Beret'], ['crown', 'Little crown'], ['tiara', 'Tiara'],
          ['halo', 'Halo'], ['veil', 'Veil'], ['stars', 'Stars'], ['heartsticker', 'Heart sticker'], ['eyepatch', 'Eye patch']]
      }
    };

const COLOR_ROWS = [
  ["skin", "Skin", "SKIN", 7],
  ["hair", "Hair colour", "HAIRC", 7],
  ["eyeColor", "Eyes", "IRISC", 3],
  ["top", "Top colour", "TOPC", 1],
  ["ring", "Frame", "RINGC", 1],
];
/* every option group that is a single choice from a list */
const PICK_ROWS = [
  ["build", "Face shape"], ["style", "Hair"], ["eyes", "Eye shape"], ["brow", "Brows"],
  ["mouth", "Expression"], ["glasses", "Glasses"], ["beard", "Facial hair"],
  ["topStyle", "What you're wearing"], ["blush", "Cheeks"],
];

function DEFAULTS() {
  return { kit: "fem", skin: "7", hair: "7", ring: "1", top: "1", topStyle: "crew",
    style: "long", eyeColor: "3", build: "soft", beard: "none", eyes: "round",
    brow: "soft", mouth: "smile", glasses: "none", blush: "soft", earrings: true };
}
function current() {
  const s = (window.CodexExtra && CodexExtra.settings) || {};
  return Object.assign(DEFAULTS(), s.avatar || {});
}
function save(av) {
  CodexExtra.settings.avatar = av;
  window.CodexSettings && CodexSettings.save();
}
function kitOf(av) { return KITS[av.kit] || KITS.fem; }

/* An option only belongs to a kit if that kit lists it; switching kits
   repairs anything the new kit cannot draw rather than leaving a
   half-broken face behind. */
function reconcile(av) {
  const k = kitOf(av);
  PICK_ROWS.forEach(([key]) => {
    const list = k[key];
    if (!list) return;
    if (!list.some(o => o[0] === av[key])) av[key] = list[0][0];
  });
  return av;
}

function randomOf(list) { return list[Math.floor(Math.random() * list.length)][0]; }
function surprise() {
  const av = current();
  const k = kitOf(av);
  PICK_ROWS.forEach(([key]) => { if (k[key]) av[key] = randomOf(k[key]); });
  COLOR_ROWS.forEach(([key, , pal]) => {
    av[key] = String(1 + Math.floor(Math.random() * CodexAvatar[pal].length));
  });
  (k.extras || []).forEach(([id]) => { av[id] = Math.random() < 0.22; });
  return av;
}

function view(root) {
  const av = reconcile(current());
  const k = kitOf(av);
  root.innerHTML = `
    <div class="av-build">
      <div class="av-stage">
        <div class="av-portrait" id="avPortrait">${CodexAvatar.draw(av, 170)}</div>
        <div class="av-stage-btns">
          <button class="btn sm" id="avSurprise">Surprise me</button>
          <button class="btn ghost sm" id="avReset">Start over</button>
        </div>
        <div class="av-kits">
          ${Object.keys(KITS).map(id => `<button class="av-kit${av.kit === id ? " on" : ""}" data-kit="${id}">${esc(KITS[id].label)}</button>`).join("")}
        </div>
        <p class="faint av-kit-note">${esc(k.note)}</p>
      </div>

      <div class="av-opts">
        ${COLOR_ROWS.map(([key, label, pal]) => `
          <div class="av-row">
            <div class="rule-head"><span class="k">${esc(label)}</span><span class="hr"></span></div>
            <div class="av-swatches">${CodexAvatar[pal].map((hex, i) => `
              <button class="av-sw${String(i + 1) === String(av[key]) ? " on" : ""}"
                      style="background:${hex}" data-color="${key}" data-val="${i + 1}"
                      title="${esc(label)} ${i + 1}" aria-label="${esc(label)} ${i + 1}"></button>`).join("")}</div>
          </div>`).join("")}

        ${PICK_ROWS.map(([key, label]) => {
          const list = k[key];
          if (!list) return "";
          return `<div class="av-row">
            <div class="rule-head"><span class="k">${esc(label)}</span><span class="hr"></span>
              <span class="meta">${list.length}</span></div>
            <div class="av-chips">${list.map(([id, name]) => `
              <button class="av-chip${av[key] === id ? " on" : ""}" data-pick="${key}" data-val="${esc(id)}">${esc(name)}</button>`).join("")}</div>
          </div>`;
        }).join("")}

        ${(k.extras || []).length ? `<div class="av-row">
          <div class="rule-head"><span class="k">Extras</span><span class="hr"></span>
            <span class="meta">${k.extras.length}</span></div>
          <div class="av-chips">${k.extras.map(([id, name]) => `
            <button class="av-chip${av[id] ? " on" : ""}" data-toggle="${esc(id)}">${esc(name)}</button>`).join("")}</div>
        </div>` : ""}
      </div>
    </div>`;

  const rerender = (next) => { save(reconcile(next)); view(root); refreshEverywhere(); };

  $$("[data-kit]", root).forEach(b => b.onclick = () => {
    const next = current(); next.kit = b.dataset.kit; rerender(next);
  });
  $$("[data-color]", root).forEach(b => b.onclick = () => {
    const next = current(); next[b.dataset.color] = b.dataset.val; rerender(next);
  });
  $$("[data-pick]", root).forEach(b => b.onclick = () => {
    const next = current(); next[b.dataset.pick] = b.dataset.val; rerender(next);
  });
  $$("[data-toggle]", root).forEach(b => b.onclick = () => {
    const next = current(); next[b.dataset.toggle] = !next[b.dataset.toggle]; rerender(next);
  });
  $("#avSurprise", root).onclick = () => rerender(surprise());
  $("#avReset", root).onclick = () => rerender(DEFAULTS());
}

/* the portrait appears in more than one place, so redraw them all */
function refreshEverywhere() {
  const av = current();
  document.querySelectorAll("[data-avatar]").forEach(el => {
    el.innerHTML = CodexAvatar.draw(av, +el.dataset.avatar || 40);
  });
}

window.CodexAvatarBuilder = { view, current, refreshEverywhere, KITS, DEFAULTS };
})();
