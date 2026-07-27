/* ============================================================
   THE AVATAR; a parametric portrait, drawn as SVG.

   Ported from the design prototype: every skin tone, hair colour,
   face shape, hairstyle, eye shape, brow, mouth, pair of glasses, top
   and extra is a real drawn variant rather than a stock image, so the
   whole set is a few kilobytes of maths and nothing is downloaded.
   ============================================================ */
(function () {
"use strict";

const SKIN = ['#fdeee4', '#fbe9dd', '#f8e0d0', '#f6ded0', '#f4d8c4', '#f2d3b8', '#eecdb4', '#ead0b0', '#e4bb96', '#dfc0a0', '#d9a882', '#d3a06f', '#c9915f', '#c08a6a', '#b57a52', '#ac7c5c', '#a06840', '#99613c', '#8a5636', '#7d5030', '#70432a', '#653c28', '#553120', '#45281a'];
const HAIRC = ['#1f1a18', '#241d1a', '#2f2622', '#3a2c25', '#4a3226', '#5a3a2a', '#6b4630', '#7c5236', '#8d4f2f', '#a35f36', '#b9814a', '#c98f52', '#d9a24c', '#e2b463', '#e8cf9a', '#f0dcb4', '#c9c4c0', '#a29b96', '#e7e3df', '#b0567a', '#d0679a', '#8e7cc3', '#5f93a8', '#6f8f5f'];
const IRISC = ['#4a3226', '#5f3a24', '#7a4a2a', '#8f5a2c', '#a9762f', '#c08f3a', '#5f8f5a', '#48765a', '#4a7f8f', '#3f9aa8', '#3f5f9a', '#5470b8', '#7b5fa8', '#9a6fb8', '#8a8f95', '#6f7f8f', '#b0567a', '#c2334f', '#2c2126', '#1f2a2e'];
const RINGC = ['#f6ccd5', '#e8a9bb', '#c9a15c', '#e6b95e', '#8e7cc3', '#a893d6', '#7c9a76', '#9ec6d8', '#5f93a8', '#e6dcd0', '#d6006c', '#e08a3c', '#4a3f4c', '#2f2622', '#b0567a', '#f0dcb4', '#6f8f5f', '#3d5a80', '#a75f6c', '#c9c4c0', '#8a5636', '#e7e3df'];
const TOPC = ['#b0567a', '#d6006c', '#3d5a80', '#2c4460', '#7c9a76', '#5d7a58', '#c9a15c', '#e6b95e', '#4a3f4c', '#2f2622', '#e8cf9a', '#f6ccd5', '#5f93a8', '#427183', '#8e7cc3', '#6c5aa1', '#a75f6c', '#e08a3c', '#f0dcb4', '#6f8f5f', '#c2334f', '#e7e3df'];
const BLUSHES = {
  none: ['#e08b96', 0, 3.4], soft: ['#e08b96', 0.45, 3.4], rosy: ['#e0707f', 0.55, 3.8],
  strong: ['#d6516a', 0.7, 4], peach: ['#f0a071', 0.5, 3.6], coral: ['#ee8a72', 0.55, 3.6],
  plum: ['#a3567f', 0.5, 3.6], berry: ['#c2334f', 0.45, 3.4], sunkissed: ['#c98f52', 0.5, 4.2],
  bronze: ['#a97244', 0.45, 4], dewy: ['#e8a0ac', 0.4, 3.8], glitter: ['#e8a0ac', 0.4, 3.6],
  contour: ['#b07a6a', 0.3, 3.4], pale: ['#e8c0c4', 0.3, 3], deep: ['#8e3a52', 0.55, 4]
};

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * (1 - amt)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
};
const pickC = (arr, v, dflt) => arr[Math.max(0, Math.min(arr.length - 1, (parseInt(v, 10) || dflt) - 1))];

/* Turns a saved avatar into the colours and the ~200 shape flags that
   the drawing below switches on. */
function fields(props) {
  const p = props;
    const style = p.hairStyle || 'long';
    const eyes = p.eyes || 'round';
    const mouth = p.mouth || 'smile';
    const glasses = p.glasses || 'none';
    const brow = p.brow || 'soft';
    const topStyle = p.topStyle || 'crew';
    const build = p.build || 'soft';
    const beard = p.facialHair || 'none';
    const blush = BLUSHES[p.blush] || BLUSHES.soft;
    const skinHex = pickC(SKIN, p.skin, 7);
    const hairHex = pickC(HAIRC, p.hair, 7);
    const topHex = pickC(TOPC, p.top, 1);
    const wideSet = ['square', 'broad', 'wide', 'angular', 'chiseled', 'softsquare'];
    const midSet = ['oval', 'round', 'long', 'pear', 'baby'];
    const wide = wideSet.indexOf(build) > -1;
    const mid = midSet.indexOf(build) > -1;
    const NARROW = ['diamond', 'lean', 'tapered', 'heart', 'long'];
    const narrow = NARROW.indexOf(build) > -1;
    const veryWide = build === 'broad' || build === 'wide';
    const earR = veryWide ? 3.4 : 3;
    const earL = veryWide ? 30 : wide ? 31 : narrow ? 32.6 : 32;
    const hairSX = veryWide ? 1.1 : wide ? 1.05 : build === 'diamond' || build === 'lean' ? 0.93
      : narrow ? 0.95 : build === 'round' || build === 'baby' || build === 'pear' ? 1.02 : 1;
    const hairDY = build === 'long' || build === 'lean' ? 1.4 : build === 'baby' || build === 'round' ? 0.8 : 0;
    const blushXL = veryWide ? 35 : narrow ? 38 : 36.5;
    return {
      cSkin: skinHex, cSkin2: shade(skinHex, 0.13), cShade: shade(skinHex, 0.26),
      cHair: hairHex, cHair2: shade(hairHex, 0.3),
      cIris: pickC(IRISC, p.eyeColor, 3),
      cRing: pickC(RINGC, p.ring, 1),
      cTop: topHex, cTop2: shade(topHex, 0.22),
      blushColor: blush[0], blushOpacity: blush[1], blushR: blush[2],
      blushGlitter: p.blush === 'glitter', blushContour: p.blush === 'contour',
      blushHighlight: p.blush === 'dewy',
      earL, earRt: 100 - earL, earR, hairSX, hairDY,
      earJL: earL - 1.4, earJR: 100 - (earL - 1.4),
      blushXL, blushXR: 100 - blushXL,
      shouldersSlim: !wide && !mid, shouldersMid: mid, shouldersBroad: wide,
      neckWide: wide, neckSlim: !wide,
      faceSoft: build === 'soft', faceHeart: build === 'heart', faceRound: build === 'round',
      faceOval: build === 'oval', faceSquare: build === 'square', faceBroad: build === 'broad',
      faceDiamond: build === 'diamond', faceLong: build === 'long', faceTapered: build === 'tapered',
      faceWide: build === 'wide', faceAngular: build === 'angular', faceChiseled: build === 'chiseled',
      faceSoftsquare: build === 'softsquare', facePear: build === 'pear', faceBaby: build === 'baby',
      faceLean: build === 'lean',
      stubble: beard === 'stubble', soulpatch: beard === 'soulpatch', moustache: beard === 'moustache',
      handlebar: beard === 'handlebar', goatee: beard === 'goatee', vandyke: beard === 'vandyke',
      chinstrap: beard === 'chinstrap', mutton: beard === 'mutton',
      beardShort: beard === 'short', beardFull: beard === 'full', beardLong: beard === 'longbeard',
      backLong: ['long', 'wavy', 'beachy', 'bob', 'buns', 'topknot', 'braids', 'halfup', 'bangs', 'bowl', 'shag', 'sidepart', 'longbraid', 'curtain', 'messybun', 'twintails', 'highpony'].indexOf(style) > -1,
      backLob: style === 'lob',
      backVolume: ['afro', 'curls', 'bantu'].indexOf(style) > -1,
      backWolf: style === 'wolf',
      backNape: ['mullet', 'shavedside'].indexOf(style) > -1,
      backBun: style === 'manbun', backLowbun: style === 'lowbun',
      backMessybun: style === 'messybun', backTopknot: style === 'topknot',
      backHighpony: style === 'highpony', backTwintails: style === 'twintails',
      backLocs: style === 'locs', backCornrows: style === 'cornrows',
      backPony: style === 'pony', backBraids: style === 'braids',
      hairLong: style === 'long', hairWavy: style === 'wavy', hairBeachy: style === 'beachy',
      hairBob: style === 'bob', hairLob: style === 'lob', hairBowl: style === 'bowl',
      hairPixie: style === 'pixie', hairCurls: style === 'curls', hairAfro: style === 'afro',
      hairBantu: style === 'bantu', hairBuns: style === 'buns', hairTopknot: style === 'topknot',
      hairMessybun: style === 'messybun' || style === 'lowbun', hairPony: style === 'pony',
      hairHighpony: style === 'highpony', hairBraids: style === 'braids',
      hairTwintails: style === 'twintails', hairHalfup: style === 'halfup', hairBangs: style === 'bangs',
      hairCurtain: style === 'curtain', hairLocs: style === 'locs', hairCornrows: style === 'cornrows',
      hairShag: style === 'shag', hairWolf: style === 'wolf', hairSidepart: style === 'sidepart',
      hairShavedside: style === 'shavedside', hairLongbraid: style === 'longbraid',
      hairBuzz: style === 'buzz', hairCrop: style === 'crop', hairFade: style === 'fade',
      hairUndercut: style === 'undercut', hairQuiff: style === 'quiff',
      hairPompadour: style === 'pompadour', hairSpikes: style === 'spikes',
      hairFlattop: style === 'flattop', hairSlick: style === 'slick',
      hairCurlytop: style === 'curlytop', hairManbun: style === 'manbun', hairMullet: style === 'mullet',
      topCrew: topStyle === 'crew', topTee: topStyle === 'tee', topVneck: topStyle === 'vneck',
      topCollar: topStyle === 'collar', topTurtle: topStyle === 'turtle', topCowl: topStyle === 'cowl',
      topCardigan: topStyle === 'cardigan', topButton: topStyle === 'button',
      topHenley: topStyle === 'henley', topHoodie: topStyle === 'hoodie',
      topBlazer: topStyle === 'blazer', topCoat: topStyle === 'coat', topTank: topStyle === 'tank',
      topCorset: topStyle === 'corset', topWrap: topStyle === 'wrap', topKimono: topStyle === 'kimono',
      topSweater: topStyle === 'sweater', topPolo: topStyle === 'polo', topDenim: topStyle === 'denim',
      topShawl: topStyle === 'shawl',
      browSoft: brow === 'soft', browThin: brow === 'thin', browArch: brow === 'arch',
      browRounded: brow === 'rounded', browStraight: brow === 'straight', browBold: brow === 'bold',
      browThick: brow === 'thick', browAngled: brow === 'angled', browSharp: brow === 'sharp',
      browHigh: brow === 'high', browLow: brow === 'low', browShort: brow === 'short',
      browTapered: brow === 'tapered', browWorried: brow === 'worried',
      eyesRound: eyes === 'round', eyesWide: eyes === 'wide', eyesAlmond: eyes === 'almond',
      eyesDoe: eyes === 'doe', eyesLash: eyes === 'lash', eyesCat: eyes === 'cat',
      eyesUpturned: eyes === 'upturned', eyesDownturned: eyes === 'downturned',
      eyesHooded: eyes === 'hooded', eyesMonolid: eyes === 'monolid', eyesNarrow: eyes === 'narrow',
      eyesSharp: eyes === 'sharp', eyesSleepy: eyes === 'sleepy', eyesTired: eyes === 'tired',
      eyesHappy: eyes === 'happy', eyesClosed: eyes === 'closed', eyesWink: eyes === 'wink',
      eyesStar: eyes === 'star', eyesSparkle: eyes === 'sparkle',
      glassRound: glasses === 'round', glassSquare: glasses === 'square', glassRect: glasses === 'rect',
      glassOval: glasses === 'oval', glassWire: glasses === 'wire', glassThick: glasses === 'thick',
      glassHalfrim: glasses === 'halfrim', glassCat: glasses === 'cat',
      glassAviator: glasses === 'aviator', glassSun: glasses === 'sun', glassTinted: glasses === 'tinted',
      glassReading: glasses === 'reading', glassSport: glasses === 'sport',
      glassMonocle: glasses === 'monocle', glassHead: glasses === 'head',
      mouthSmile: mouth === 'smile', mouthSoft: mouth === 'soft', mouthHalf: mouth === 'half',
      mouthGrin: mouth === 'grin', mouthTeeth: mouth === 'teeth', mouthOpen: mouth === 'open',
      mouthLaugh: mouth === 'laugh', mouthNeutral: mouth === 'neutral', mouthSmirk: mouth === 'smirk',
      mouthSmug: mouth === 'smug', mouthFrown: mouth === 'frown', mouthSad: mouth === 'sad',
      mouthPout: mouth === 'pout', mouthO: mouth === 'o', mouthSurprised: mouth === 'surprised',
      mouthBite: mouth === 'bite', mouthTongue: mouth === 'tongue', mouthKiss: mouth === 'kiss',
      mouthLipstick: mouth === 'lipstick',
      freckles: !!p.freckles, mark: !!p.mark, dimples: !!p.dimples, scar: !!p.scar,
      nosering: !!p.nosering, earrings: !!p.earrings, drops: !!p.drops, hoops: !!p.hoops,
      cuff: !!p.cuff, flower: !!p.flower, bow: !!p.bow, ribbon: !!p.ribbon,
      headband: !!p.headband, beret: !!p.beret, crown: !!p.crown, tiara: !!p.tiara,
      halo: !!p.halo, veil: !!p.veil, stars: !!p.stars, heartsticker: !!p.heartsticker,
      eyepatch: !!p.eyepatch
    };
}

const TPL = (V, F) => `<span style="display:block;width:100%;height:100%;line-height:0;--skin:${V.cSkin};--skin2:${V.cSkin2};--shade:${V.cShade};--hair:${V.cHair};--hair2:${V.cHair2};--iris:${V.cIris};--ring:${V.cRing};--top:${V.cTop};--top2:${V.cTop2}">
  <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="48" fill="#3c2a32" stroke="var(--ring)" stroke-width="2.5"></circle>
    <g transform="translate(50 ${V.hairDY}) scale(${V.hairSX} 1) translate(-50 0)">
    ${F.backLong?`
      <path d="M23 45c0-18 12-28 27-28s27 10 27 28c0 13-2 23-5 32l-7-4c3-11 3-21 1-28-6 5-19 7-34 3-2 8-2 18 1 25l-7 4c-3-9-5-19-5-32z" fill="var(--hair2)"></path>
    `:""}
    ${F.backLob?`
      <path d="M25 45c0-17 11-27 25-27s25 10 25 27c0 8-1 15-3 21l-6-2c2-7 2-14 1-19-6 5-19 7-34 3-1 5-1 12 1 19l-6 2c-2-6-3-13-3-24z" fill="var(--hair2)"></path>
    `:""}
    ${F.backVolume?`
      <circle cx="50" cy="32" r="25" fill="var(--hair2)"></circle>
      <circle cx="33" cy="24" r="10" fill="var(--hair2)"></circle>
      <circle cx="67" cy="24" r="10" fill="var(--hair2)"></circle>
      <circle cx="27" cy="38" r="9" fill="var(--hair2)"></circle>
      <circle cx="73" cy="38" r="9" fill="var(--hair2)"></circle>
    `:""}
    ${F.backWolf?`
      <path d="M24 45c0-18 12-28 26-28s26 10 26 28c0 14-3 25-7 34l-5-6c3-9 4-19 3-27-6 5-19 7-34 3-1 8 0 18 3 27l-5 6c-4-9-7-20-7-37z" fill="var(--hair2)"></path>
      <path d="M27 62l-3 12 6-4zM73 62l3 12-6-4z" fill="var(--hair2)"></path>
    `:""}
    ${F.backNape?`
      <path d="M32 46c-2 9-2 18 1 25l-6 2c-3-8-4-19-2-27zM68 46c2 9 2 18-1 25l6 2c3-8 4-19 2-27z" fill="var(--hair2)"></path>
    `:""}
    ${F.backBun?`
      <circle cx="72" cy="28" r="7" fill="var(--hair2)"></circle>
      <path d="M67 32q5 3 9-1" stroke="var(--hair)" stroke-width="1.6" fill="none"></path>
    `:""}
    ${F.backLowbun?`
      <circle cx="50" cy="70" r="9" fill="var(--hair2)"></circle>
      <path d="M43 68q7 5 14 0" stroke="var(--hair)" stroke-width="1.6" fill="none"></path>
    `:""}
    ${F.backMessybun?`
      <circle cx="50" cy="16" r="9" fill="var(--hair2)"></circle>
      <path d="M42 12q4-6 9-4M58 12q-3-6-8-4M41 20q-5 1-7 5M59 20q5 1 7 5" stroke="var(--hair2)" stroke-width="2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.backTopknot?`
      <circle cx="50" cy="14" r="8.5" fill="var(--hair2)"></circle>
      <path d="M45 19q5 4 10 0" stroke="var(--hair)" stroke-width="2" fill="none"></path>
    `:""}
    ${F.backHighpony?`
      <path d="M64 22c11-2 20 6 22 18 2 13-3 24-11 30l-5-6c6-5 10-14 8-23-2-8-8-13-16-12z" fill="var(--hair2)"></path>
      <circle cx="64" cy="24" r="5" fill="var(--hair2)"></circle>
    `:""}
    ${F.backLocs?`
      <path d="M27 40c-3 12-3 26-1 38M33 38c-2 13-2 27 0 40M40 36c-1 14-1 28 1 41M50 35c0 14 0 28 1 42M60 36c1 14 1 28 0 41M67 38c2 13 2 27 0 40M73 40c3 12 3 26 1 38" stroke="var(--hair2)" stroke-width="4.2" stroke-linecap="round" fill="none"></path>
    `:""}
    ${F.backCornrows?`
      <path d="M30 44c-2 10-2 20 1 28l5-2c-3-8-3-17-1-25zM70 44c2 10 2 20-1 28l-5-2c3-8 3-17 1-25z" fill="var(--hair2)"></path>
    `:""}
    ${F.backPony?`
      <path d="M72 33c9 2 14 12 12 24-2 12-8 19-14 21l-3-7c5-3 9-9 10-17 1-8-2-14-8-17z" fill="var(--hair2)"></path>
    `:""}
    ${F.backBraids?`
      <path d="M28 44c-5 9-6 22-4 32l7-1c-2-10-1-21 3-28zM72 44c5 9 6 22 4 32l-7-1c2-10 1-21-3-28z" fill="var(--hair2)"></path>
      <path d="M26.6 51q4.4 2.6 8.4 0M26.2 57q4.6 2.6 8.6 0M26.4 63q4.6 2.6 8.4 0M26.8 69q4.4 2.4 8 0M73.4 51q-4.4 2.6-8.4 0M73.8 57q-4.6 2.6-8.6 0M73.6 63q-4.6 2.6-8.4 0M73.2 69q-4.4 2.4-8 0" stroke="var(--hair)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"></path>
      <circle cx="30.6" cy="75" r="2.1" fill="#f6ccd5" stroke="#b0567a" stroke-width=".6"></circle>
      <circle cx="69.4" cy="75" r="2.1" fill="#f6ccd5" stroke="#b0567a" stroke-width=".6"></circle>
    `:""}
    ${F.backTwintails?`
      <circle cx="24" cy="40" r="6" fill="var(--hair2)"></circle>
      <circle cx="76" cy="40" r="6" fill="var(--hair2)"></circle>
      <path d="M22 44c-4 8-4 18-1 26l7-2c-3-8-3-16-1-22zM78 44c4 8 4 18 1 26l-7-2c3-8 3-16 1-22z" fill="var(--hair2)"></path>
    `:""}
    </g>
    ${F.shouldersSlim?`
      <path d="M50 63c13 0 22 8 24 21l-48 0c2-13 11-21 24-21z" fill="var(--top)"></path>
    `:""}
    ${F.shouldersMid?`
      <path d="M50 62c15 0 26 9 28 22l-56 0c2-13 13-22 28-22z" fill="var(--top)"></path>
    `:""}
    ${F.shouldersBroad?`
      <path d="M50 61c18 0 30 10 32 23l-64 0c2-13 14-23 32-23z" fill="var(--top)"></path>
    `:""}
    ${F.topCrew?`
      <path d="M50 62c5 0 9 1 13 3l-13 12-13-12c4-2 8-3 13-3z" fill="var(--top2)"></path>
    `:""}
    ${F.topTee?`
      <path d="M50 62c5 0 9 1 13 3q-6 7-13 7q-7 0-13-7c4-2 8-3 13-3z" fill="var(--top2)"></path>
      <path d="M37 66q13 8 26 0" stroke="var(--top)" stroke-width="1.4" fill="none"></path>
    `:""}
    ${F.topVneck?`
      <path d="M50 62c5 0 10 1 14 3l-14 16-14-16c4-2 9-3 14-3z" fill="var(--top2)"></path>
      <path d="M39 66l11 13 11-13" stroke="var(--top)" stroke-width="1.6" fill="none"></path>
    `:""}
    ${F.topCollar?`
      <path d="M50 62c5 0 9 1 13 3l-13 12-13-12c4-2 8-3 13-3z" fill="var(--top2)"></path>
      <path d="M50 74l-7-9 7-3 7 3z" fill="#f6ccd5"></path>
      <circle cx="50" cy="78" r="2.4" fill="#e6b95e"></circle>
    `:""}
    ${F.topTurtle?`
      <path d="M39 61q11 6 22 0l1 9q-12 6-24 0z" fill="var(--top2)"></path>
    `:""}
    ${F.topCowl?`
      <path d="M38 61q12 7 24 0l2 8q-14 10-28 0z" fill="var(--top2)"></path>
      <path d="M38 66q12 8 24 0" stroke="var(--top)" stroke-width="1.4" fill="none"></path>
    `:""}
    ${F.topCardigan?`
      <path d="M50 65l-12 19h-6l10-21zM50 65l12 19h6l-10-21z" fill="var(--top2)"></path>
      <path d="M50 66v18" stroke="var(--skin2)" stroke-width="7"></path>
    `:""}
    ${F.topButton?`
      <path d="M50 63l-9 21h-8l9-19zM50 63l9 21h8l-9-19z" fill="var(--top2)"></path>
      <path d="M50 66l-6 6 6 4 6-4z" fill="var(--skin2)"></path>
      <path d="M50 78v6" stroke="var(--top2)" stroke-width="2.6"></path>
      <circle cx="50" cy="80" r="1" fill="#fdf7f2"></circle>
    `:""}
    ${F.topHenley?`
      <path d="M50 62c5 0 9 1 13 3l-13 11-13-11c4-2 8-3 13-3z" fill="var(--top2)"></path>
      <path d="M50 70v12" stroke="var(--top)" stroke-width="2"></path>
      <circle cx="50" cy="73" r=".9" fill="#fdf7f2"></circle>
      <circle cx="50" cy="78" r=".9" fill="#fdf7f2"></circle>
    `:""}
    ${F.topHoodie?`
      <path d="M50 62c8 0 14 3 15 8-4 6-9 9-15 9s-11-3-15-9c1-5 7-8 15-8z" fill="var(--top2)"></path>
      <path d="M44 76v8M56 76v8" stroke="#fdf7f2" stroke-width="1.6" stroke-linecap="round"></path>
    `:""}
    ${F.topBlazer?`
      <path d="M50 63l-10 21h-9l10-20zM50 63l10 21h9l-10-20z" fill="var(--top2)"></path>
      <path d="M50 66l-7 7 7 5 7-5z" fill="#f2eee9"></path>
      <path d="M50 79v5" stroke="#3a3238" stroke-width="2.4"></path>
    `:""}
    ${F.topCoat?`
      <path d="M50 63l-11 21h-10l11-20zM50 63l11 21h10l-11-20z" fill="var(--top2)"></path>
      <path d="M50 67l-8 8 8 4 8-4z" fill="var(--top)"></path>
      <circle cx="46" cy="80" r="1.3" fill="#e6b95e"></circle>
      <circle cx="54" cy="80" r="1.3" fill="#e6b95e"></circle>
    `:""}
    ${F.topTank?`
      <path d="M43 63q7 7 14 0l3 3q-8 10-20 0z" fill="var(--skin2)"></path>
      <path d="M40 66q10 9 20 0" stroke="var(--top2)" stroke-width="2" fill="none"></path>
    `:""}
    ${F.topCorset?`
      <path d="M40 66q10 9 20 0l2 4q-12 11-24 0z" fill="var(--top2)"></path>
      <path d="M44 72h12M45 77h10" stroke="#e6b95e" stroke-width="1.2"></path>
    `:""}
    ${F.topWrap?`
      <path d="M50 63l-13 6 5 15h-8l-1-18z" fill="var(--top2)"></path>
      <path d="M50 63l13 6-5 15h8l1-18z" fill="var(--top2)" opacity=".85"></path>
      <path d="M50 63l-8 21h16z" fill="var(--skin2)" opacity=".25"></path>
    `:""}
    ${F.topKimono?`
      <path d="M50 63l-14 5 4 16h-9l1-19z" fill="var(--top2)"></path>
      <path d="M50 63l14 5-4 16h9l-1-19z" fill="var(--top2)"></path>
      <path d="M38 80h24" stroke="#e6b95e" stroke-width="2.4"></path>
    `:""}
    ${F.topSweater?`
      <path d="M50 62c6 0 11 2 14 4l-14 10-14-10c3-2 8-4 14-4z" fill="var(--top2)"></path>
      <path d="M40 70l20 0M42 75l16 0M44 80l12 0" stroke="var(--top)" stroke-width="1.2" opacity=".7"></path>
    `:""}
    ${F.topPolo?`
      <path d="M50 62c5 0 9 1 13 3l-13 11-13-11c4-2 8-3 13-3z" fill="var(--top2)"></path>
      <path d="M44 65l6 8-8 3z" fill="#fdf7f2" opacity=".85"></path>
      <path d="M56 65l-6 8 8 3z" fill="#fdf7f2" opacity=".85"></path>
    `:""}
    ${F.topDenim?`
      <path d="M50 63l-10 21h-9l10-20zM50 63l10 21h9l-10-20z" fill="#4a6a8f"></path>
      <path d="M50 66l-6 7 6 4 6-4z" fill="var(--top2)"></path>
      <path d="M43 74v9M57 74v9" stroke="#e8cf9a" stroke-width=".9" stroke-dasharray="2 2"></path>
    `:""}
    ${F.topShawl?`
      <path d="M50 62c8 0 14 3 16 8-5 4-10 6-16 6s-11-2-16-6c2-5 8-8 16-8z" fill="var(--top2)"></path>
      <path d="M34 70l-4 14h9zM66 70l4 14h-9z" fill="var(--top2)" opacity=".8"></path>
    `:""}
    ${F.neckWide?`
      <path d="M42 50h16v11c0 4-3 6-8 6s-8-2-8-6z" fill="var(--skin2)"></path>
    `:""}
    ${F.neckSlim?`
      <path d="M44.5 51h11v10c0 4-2.5 5.5-5.5 5.5s-5.5-1.5-5.5-5.5z" fill="var(--skin2)"></path>
    `:""}
    <ellipse cx="${V.earL}" cy="45.5" rx="${V.earR}" ry="4.1" fill="var(--skin2)"></ellipse>
    <ellipse cx="${V.earRt}" cy="45.5" rx="${V.earR}" ry="4.1" fill="var(--skin2)"></ellipse>
    ${F.faceSoft?`
      <path d="M31.5 40c0-12 8-20 18.5-20S68.5 28 68.5 40c0 10-3 17-8 22-3.5 3.5-6.5 4.5-10.5 4.5s-7-1-10.5-4.5c-5-5-8-12-8-22z" fill="var(--skin)"></path>
    `:""}
    ${F.faceHeart?`
      <path d="M30.5 38c0-11 9-19 19.5-19S69.5 27 69.5 38c0 8-2.5 14-6 18.5-4 5-9 9.5-13.5 9.5s-9.5-4.5-13.5-9.5c-3.5-4.5-6-10.5-6-18.5z" fill="var(--skin)"></path>
    `:""}
    ${F.faceRound?`
      <path d="M30 43c0-12.5 9-22 20-22s20 9.5 20 22-9 21.5-20 21.5S30 55.5 30 43z" fill="var(--skin)"></path>
    `:""}
    ${F.faceOval?`
      <path d="M31 40c0-13 8-21 19-21s19 8 19 21v3c0 13-8 21-19 21s-19-8-19-21z" fill="var(--skin)"></path>
    `:""}
    ${F.faceSquare?`
      <path d="M31 39c0-12 8-20 19-20s19 8 19 20v7c0 7-2 11.5-5.5 14.5-3.5 3-8 4-13.5 4s-10-1-13.5-4C33 57.5 31 53 31 46z" fill="var(--skin)"></path>
    `:""}
    ${F.faceBroad?`
      <path d="M28.5 39c0-12 9.5-20 21.5-20s21.5 8 21.5 20v7c0 7-3 11.5-7 14.5-4 3-9 4-14.5 4s-10.5-1-14.5-4c-4-3-7-7.5-7-14.5z" fill="var(--skin)"></path>
    `:""}
    ${F.faceDiamond?`
      <path d="M50 19c8 0 13 6 15 15 2 8 2 12-1 18-3 7-8 14-14 14s-11-7-14-14c-3-6-3-10-1-18 2-9 7-15 15-15z" fill="var(--skin)"></path>
    `:""}
    ${F.faceLong?`
      <path d="M32 40c0-13 7-21 18-21s18 8 18 21v7c0 13-7 21-18 21s-18-8-18-21z" fill="var(--skin)"></path>
    `:""}
    ${F.faceTapered?`
      <path d="M31 39c0-12 8.5-20 19-20s19 8 19 20c0 11-3 18-7 23-3 4-7 6-12 6s-9-2-12-6c-4-5-7-12-7-23z" fill="var(--skin)"></path>
    `:""}
    ${F.faceWide?`
      <path d="M28 41c0-12 10-20 22-20s22 8 22 20c0 6-2 11-5 15-4 6-10 9-17 9s-13-3-17-9c-3-4-5-9-5-15z" fill="var(--skin)"></path>
    `:""}
    ${F.faceAngular?`
      <path d="M31 38l4-13c3-4 8-6 15-6s12 2 15 6l4 13v8l-5 12c-3 4-8 6-14 6s-11-2-14-6l-5-12z" fill="var(--skin)"></path>
    `:""}
    ${F.faceChiseled?`
      <path d="M30 39c0-12 9-20 20-20s20 8 20 20v6l-3 11c-3 5-9 8-17 8s-14-3-17-8l-3-11z" fill="var(--skin)"></path>
    `:""}
    ${F.faceSoftsquare?`
      <path d="M30 40c0-12 9-20 20-20s20 8 20 20v6c0 8-3 13-7 16-3.5 2.5-8 3.5-13 3.5s-9.5-1-13-3.5c-4-3-7-8-7-16z" fill="var(--skin)"></path>
    `:""}
    ${F.facePear?`
      <path d="M33 38c0-11 7.5-19 17-19s17 8 17 19c0 6 1 10 2 14 1 6-6 13-19 13s-20-7-19-13c1-4 2-8 2-14z" fill="var(--skin)"></path>
    `:""}
    ${F.faceBaby?`
      <path d="M30 42c0-13 9-21 20-21s20 8 20 21c0 8-2 14-6 18-3.5 3.5-8 5-14 5s-10.5-1.5-14-5c-4-4-6-10-6-18z" fill="var(--skin)"></path>
    `:""}
    ${F.faceLean?`
      <path d="M33 39c0-12 7.5-20 17-20s17 8 17 20v6c0 9-2 15-6 20-3 4-6.5 5.5-11 5.5s-8-1.5-11-5.5c-4-5-6-11-6-20z" fill="var(--skin)"></path>
    `:""}
    <g transform="translate(50 ${V.hairDY}) scale(${V.hairSX} 1) translate(-50 0)">
    ${F.hairLong?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
    `:""}
    ${F.hairWavy?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M31 29.5q6 4 12 1.4M57 30.9q6 2.6 12-1.4" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairBeachy?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M30.5 30.5q5 3.4 10 .8M59.5 31.3q5 2.6 10-.8M28.8 45q1.4 5 .6 10M71.2 45q-1.4 5-.6 10" stroke="var(--hair2)" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairBob?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M27.2 35.5h5.6v20q-3 1.2-5.6.4zM67.2 35.5h5.6v20.4q-2.6.8-5.6-.4z" fill="var(--hair)"></path>
    `:""}
    ${F.hairLob?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M27.2 35.5h5.6v15q-3 1.2-5.6.4zM67.2 35.5h5.6v15.4q-2.6.8-5.6-.4z" fill="var(--hair)"></path>
    `:""}
    ${F.hairBowl?`
      <path d="M29 42c0-15 9.5-23 21-23s21 8 21 23c0 3 0 5-.5 7-1.5-3-2-6-2.5-8H31.5c-.5 2-1 5-2.5 8-.5-2-.5-4-.5-7z" fill="var(--hair)"></path>
      <path d="M31 36h38v6H31z" fill="var(--hair)"></path>
      <path d="M28 38h4v10h-4zM68 38h4v10h-4z" fill="var(--hair)"></path>
    `:""}
    ${F.hairPixie?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34Q50 28 30.5 34Z" fill="var(--hair)"></path>
      <path d="M35 27q8 6 17 2" stroke="var(--hair2)" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairCurls?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <circle cx="36" cy="24" r="7" fill="var(--hair)"></circle>
      <circle cx="50" cy="20" r="7.5" fill="var(--hair)"></circle>
      <circle cx="64" cy="24" r="7" fill="var(--hair)"></circle>
      <circle cx="30" cy="34" r="6" fill="var(--hair)"></circle>
      <circle cx="70" cy="34" r="6" fill="var(--hair)"></circle>
    `:""}
    ${F.hairAfro?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 29 30.5 35Z" fill="var(--hair)"></path>
      <circle cx="34" cy="26" r="8" fill="var(--hair)" opacity=".55"></circle>
      <circle cx="66" cy="26" r="8" fill="var(--hair)" opacity=".55"></circle>
    `:""}
    ${F.hairBantu?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <circle cx="36" cy="22" r="4" fill="var(--hair)"></circle>
      <circle cx="50" cy="18" r="4.4" fill="var(--hair)"></circle>
      <circle cx="64" cy="22" r="4" fill="var(--hair)"></circle>
      <circle cx="30" cy="32" r="3.6" fill="var(--hair)"></circle>
      <circle cx="70" cy="32" r="3.6" fill="var(--hair)"></circle>
    `:""}
    ${F.hairBuns?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <circle cx="24" cy="27" r="7.5" fill="var(--hair)"></circle>
      <circle cx="76" cy="27" r="7.5" fill="var(--hair)"></circle>
    `:""}
    ${F.hairTopknot?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
    `:""}
    ${F.hairMessybun?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M33 29.6q6-4.6 12-3M55 26.6q7-2.6 12 3" stroke="var(--hair2)" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairPony?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <circle cx="70" cy="33" r="4.6" fill="var(--hair)"></circle>
    `:""}
    ${F.hairHighpony?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
    `:""}
    ${F.hairBraids?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M36 23q7 4.4 14 1.8q7-2.6 14-1.8" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairTwintails?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M40 21.5q10 5 20 0" stroke="var(--hair2)" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairHalfup?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M31.5 31.5q9-5.4 18.5-3.4" stroke="var(--hair2)" stroke-width="2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairBangs?`
      <path d="M28 43c0-17 10-25 22-25s22 8 22 25c0 3 0 6-1 8-1-6-2-10-4-13H33c-2 3-3 7-4 13-.6-2-1-5-1-8z" fill="var(--hair)"></path>
      <path d="M31 36h38v6H31z" fill="var(--hair)"></path>
      <path d="M27 40h5v18h-5zM68 40h5v18h-5z" fill="var(--hair)"></path>
    `:""}
    ${F.hairCurtain?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 38.5C60 28.5 40 28.5 28 38.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M50 26.5v4.2" stroke="var(--hair2)" stroke-width="1.4" stroke-linecap="round"></path>
    `:""}
    ${F.hairLocs?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34Q50 29 30.5 34Z" fill="var(--hair)"></path>
      <path d="M33 34c-1-6 0-10 2-13M40 33c-1-7 0-12 2-15M50 32c0-8 0-13 0-16M60 33c1-7 0-12-2-15M67 34c1-6 0-10-2-13" stroke="var(--hair)" stroke-width="4.4" stroke-linecap="round" fill="none"></path>
      <path d="M33 34c-1-6 0-10 2-13M50 32c0-8 0-13 0-16M67 34c1-6 0-10-2-13" stroke="var(--hair2)" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".55"></path>
    `:""}
    ${F.hairCornrows?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34.6Q50 32.4 30.5 34.6Z" fill="var(--hair)"></path>
      <path d="M36 21v13M43 19.5v14M50 19v14M57 19.5v14M64 21v13" stroke="var(--hair2)" stroke-width="1.6" stroke-linecap="round" opacity=".8"></path>
    `:""}
    ${F.hairShag?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M33 32.5l3.4 3.6 3.4-3.6 3.4 3.6 3.4-3.6 3.4 3.6 3.4-3.6 3.4 3.6 3.4-3.6 3.4 3.4" stroke="var(--hair2)" stroke-width="1.7" fill="none" stroke-linejoin="round"></path>
    `:""}
    ${F.hairWolf?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M33 31.5l3.4 4 3.4-4 3.4 4 3.4-4 3.4 4 3.4-4 3.4 4 3.4-4 3.4 3.6" stroke="var(--hair2)" stroke-width="1.6" fill="none" stroke-linejoin="round"></path>
    `:""}
    ${F.hairSidepart?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 35Q48 27.5 28 39Z" fill="var(--hair)"></path>
      <path d="M28 36c-1.6 8.6-1.2 17 .4 22.6l4.6-1c-1.4-6-1.4-12.6-.4-18.4zM72 36c1.6 8.6 1.2 17-.4 22.6l-4.6 1c1.4-6 1.4-12.6.4-18.4z" fill="var(--hair)"></path>
      <path d="M35 26.5q11 6.5 25 5" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairShavedside?`
      <path d="M33 40C33 26 41 19 51.5 19 62 19 69.5 26.5 69.5 40L69.5 33.5Q52 26.5 37.5 34 34 36 33 40Z" fill="var(--hair)"></path>
      <path d="M30.4 38q.6-7 3.6-11.4" stroke="var(--hair)" stroke-width="3.4" fill="none" opacity=".28" stroke-linecap="round"></path>
    `:""}
    ${F.hairLongbraid?`
      <path d="M28 43C28 27 38 18.5 50 18.5S72 27 72 43L72 36.5Q50 30.5 28 36.5Z" fill="var(--hair)"></path>
      <path d="M27 44c-4 11-3.6 24 2.6 34l6.4-2.6c-5-8.4-5-19.4-2-27.4z" fill="var(--hair)"></path>
      <path d="M27 52q5.4 2.4 7.6 0M26.6 59q5.8 2.4 8.2 0M27.4 66q5.8 2.4 8 0M29 72.6q5.2 2.2 7.2 0" stroke="var(--hair2)" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
      <circle cx="33.4" cy="79" r="2.3" fill="#f6ccd5" stroke="#b0567a" stroke-width=".6"></circle>
    `:""}
    ${F.hairBuzz?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35.5Q50 31 30.5 35.5Z" fill="var(--hair)" opacity=".92"></path>
      <path d="M33 33q17-5 34 0" stroke="var(--hair2)" stroke-width="1.2" fill="none" opacity=".45"></path>
    `:""}
    ${F.hairCrop?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34.6Q50 32.6 30.5 34.6Z" fill="var(--hair)"></path>
    `:""}
    ${F.hairFade?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34Q50 30 30.5 34Z" fill="var(--hair)"></path>
      <path d="M31.2 34.5q1-8 4-12M68.8 34.5q-1-8-4-12" stroke="var(--hair)" stroke-width="3.2" fill="none" opacity=".35" stroke-linecap="round"></path>
    `:""}
    ${F.hairUndercut?`
      <path d="M32 38C32 26 40 19.5 50 19.5S68 26 68 38L68 32Q50 26 32 32Z" fill="var(--hair)"></path>
      <path d="M32 30q9-6 18-6t18 6" stroke="var(--hair2)" stroke-width="1.4" fill="none" opacity=".6"></path>
    `:""}
    ${F.hairQuiff?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <path d="M35 24q6-11 16-8q11 3 13 13q-5-8-14-10q-10-2-15 5z" fill="var(--hair)"></path>
      <path d="M41 18q7-3 12 1" stroke="var(--hair2)" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairPompadour?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34Q50 29 30.5 34Z" fill="var(--hair)"></path>
      <path d="M33 26q4-14 17-12q13 2 17 14q-6-9-17-10q-12-1-17 8z" fill="var(--hair)"></path>
      <path d="M40 16q9-4 16 2" stroke="var(--hair2)" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.hairSpikes?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <path d="M34 24l1-8 5 6zM43 20l2-9 4 8zM53 19l4-8 3 9zM62 23l5-7 1 8z" fill="var(--hair)"></path>
    `:""}
    ${F.hairFlattop?`
      <path d="M31 40V26q0-6 19-6t19 6v14L69 34H31Z" fill="var(--hair)"></path>
      <path d="M31 26h38" stroke="var(--hair2)" stroke-width="1.4" opacity=".5"></path>
    `:""}
    ${F.hairSlick?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 33Q50 25.5 30.5 33Z" fill="var(--hair)"></path>
      <path d="M36 24.5q8 4 18 2.5q6-1 10 2M38 28.5q9 3.5 18 1" stroke="var(--hair2)" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"></path>
    `:""}
    ${F.hairCurlytop?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <circle cx="37" cy="23" r="6" fill="var(--hair)"></circle>
      <circle cx="47" cy="19" r="6.5" fill="var(--hair)"></circle>
      <circle cx="58" cy="21" r="6" fill="var(--hair)"></circle>
      <circle cx="65" cy="26.5" r="5" fill="var(--hair)"></circle>
      <circle cx="43" cy="21.5" r="3" fill="var(--hair2)" opacity=".4"></circle>
      <circle cx="55" cy="20" r="2.6" fill="var(--hair2)" opacity=".35"></circle>
    `:""}
    ${F.hairManbun?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 34Q50 27.5 30.5 34Z" fill="var(--hair)"></path>
      <path d="M36 25q9 4.5 20 2q6-1.5 10 1" stroke="var(--hair2)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"></path>
    `:""}
    ${F.hairMullet?`
      <path d="M30.5 41C30.5 27 39 19.5 50 19.5S69.5 27 69.5 41L69.5 35Q50 30 30.5 35Z" fill="var(--hair)"></path>
      <path d="M31 35q4-9 7-11M69 35q-4-9-7-11" stroke="var(--hair)" stroke-width="3" fill="none" opacity=".3" stroke-linecap="round"></path>
    `:""}
    </g>
    ${F.browSoft?`
      <path d="M39.4 37.6q3.2-2 6.4-.6M54.2 37q3.2-1.4 6.4.6" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browThin?`
      <path d="M39.2 37.4q3.4-1.8 6.8-.4M54 37q3.4-1.4 6.8.4" stroke="var(--hair2)" stroke-width="1.1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browArch?`
      <path d="M38.8 38q3.6-4 7.4-.8M53.8 37.2q3.8-3.2 7.4.8" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browRounded?`
      <path d="M38.8 38.4q3.8-3.4 7.4 0M53.8 38.4q3.8-3.4 7.4 0" stroke="var(--hair2)" stroke-width="2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browStraight?`
      <path d="M38.8 37.6h7.4M53.8 37.6h7.4" stroke="var(--hair2)" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browBold?`
      <path d="M38.4 37.4h8M53.6 37.4h8" stroke="var(--hair2)" stroke-width="3" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browThick?`
      <path d="M37.8 37.4h8.8M53.4 37.4h8.8" stroke="var(--hair2)" stroke-width="3.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browAngled?`
      <path d="M38.6 38.8l4-2.4 3.6 1M61.4 38.8l-4-2.4-3.6 1" stroke="var(--hair2)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
    `:""}
    ${F.browSharp?`
      <path d="M38.4 39l5-3 3 1.4M61.6 39l-5-3-3 1.4" stroke="var(--hair2)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
    `:""}
    ${F.browHigh?`
      <path d="M39 35.4q3.4-2 6.8-.6M54.2 34.8q3.4-1.4 6.8.6" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browLow?`
      <path d="M38.8 39.4h7.4M53.8 39.4h7.4" stroke="var(--hair2)" stroke-width="2.4" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browShort?`
      <path d="M40.4 37.4h4.8M54.8 37.4h4.8" stroke="var(--hair2)" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browTapered?`
      <path d="M38.8 38.2q4-2.6 7.4-1.4" stroke="var(--hair2)" stroke-width="2.6" fill="none" stroke-linecap="round"></path>
      <path d="M46.2 36.8q.4.2.6.4" stroke="var(--hair2)" stroke-width="1" stroke-linecap="round"></path>
      <path d="M61.2 38.2q-4-2.6-7.4-1.4" stroke="var(--hair2)" stroke-width="2.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.browWorried?`
      <path d="M39 36.6q3.4 1 6.6 2M61 36.6q-3.4 1-6.6 2" stroke="var(--hair2)" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesRound?`
      <circle cx="42" cy="44" r="3.2" fill="var(--iris)"></circle>
      <circle cx="58" cy="44" r="3.2" fill="var(--iris)"></circle>
      <circle cx="42" cy="44" r="1.5" fill="#20181c"></circle>
      <circle cx="58" cy="44" r="1.5" fill="#20181c"></circle>
      <circle cx="43.4" cy="42.6" r="1" fill="#fff"></circle>
      <circle cx="59.4" cy="42.6" r="1" fill="#fff"></circle>
    `:""}
    ${F.eyesWide?`
      <ellipse cx="42" cy="44" rx="4" ry="4.6" fill="#fdf7f2"></ellipse>
      <ellipse cx="58" cy="44" rx="4" ry="4.6" fill="#fdf7f2"></ellipse>
      <circle cx="42.4" cy="44.4" r="2.8" fill="var(--iris)"></circle>
      <circle cx="58.4" cy="44.4" r="2.8" fill="var(--iris)"></circle>
      <circle cx="42.4" cy="44.4" r="1.3" fill="#20181c"></circle>
      <circle cx="58.4" cy="44.4" r="1.3" fill="#20181c"></circle>
      <circle cx="43.4" cy="43.2" r=".9" fill="#fff"></circle>
      <circle cx="59.4" cy="43.2" r=".9" fill="#fff"></circle>
    `:""}
    ${F.eyesAlmond?`
      <path d="M37.6 44.4q4.4-5 8.8 0q-4.4 4.4-8.8 0z" fill="#fdf7f2"></path>
      <path d="M53.6 44.4q4.4-5 8.8 0q-4.4 4.4-8.8 0z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44.2" r="2.4" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.2" r="2.4" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.2" r="1.1" fill="#20181c"></circle>
      <circle cx="58" cy="44.2" r="1.1" fill="#20181c"></circle>
      <path d="M37.6 44q4.4-5 8.8 0M53.6 44q4.4-5 8.8 0" stroke="#2c2126" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesDoe?`
      <ellipse cx="42" cy="44.4" rx="4.2" ry="5" fill="#fdf7f2"></ellipse>
      <ellipse cx="58" cy="44.4" rx="4.2" ry="5" fill="#fdf7f2"></ellipse>
      <circle cx="42" cy="44.6" r="3.2" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.6" r="3.2" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.6" r="1.5" fill="#20181c"></circle>
      <circle cx="58" cy="44.6" r="1.5" fill="#20181c"></circle>
      <circle cx="43.4" cy="43" r="1.1" fill="#fff"></circle>
      <circle cx="59.4" cy="43" r="1.1" fill="#fff"></circle>
      <path d="M37.6 41.4q4.4-3 8.8 0M53.6 41.4q4.4-3 8.8 0" stroke="#2c2126" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesLash?`
      <ellipse cx="42" cy="44.4" rx="3.8" ry="4.2" fill="#fdf7f2"></ellipse>
      <ellipse cx="58" cy="44.4" rx="3.8" ry="4.2" fill="#fdf7f2"></ellipse>
      <circle cx="42" cy="44.6" r="2.8" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.6" r="2.8" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.6" r="1.3" fill="#20181c"></circle>
      <circle cx="58" cy="44.6" r="1.3" fill="#20181c"></circle>
      <path d="M38.2 41.8q3.8-3.2 7.6 0M54.2 41.8q3.8-3.2 7.6 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
      <path d="M37.6 40.6l-2.6-1.6M62.4 40.6l2.6-1.6" stroke="#2c2126" stroke-width="1.5" stroke-linecap="round"></path>
    `:""}
    ${F.eyesCat?`
      <path d="M37.4 44.6q4.6-5.2 9-1.4q-4 4.4-9 1.4z" fill="#fdf7f2"></path>
      <path d="M62.6 44.6q-4.6-5.2-9-1.4q4 4.4 9 1.4z" fill="#fdf7f2"></path>
      <circle cx="42.2" cy="43.9" r="2.3" fill="var(--iris)"></circle>
      <circle cx="57.8" cy="43.9" r="2.3" fill="var(--iris)"></circle>
      <circle cx="42.2" cy="43.9" r="1.05" fill="#20181c"></circle>
      <circle cx="57.8" cy="43.9" r="1.05" fill="#20181c"></circle>
      <circle cx="43.2" cy="42.9" r=".6" fill="#fff"></circle>
      <circle cx="58.8" cy="42.9" r=".6" fill="#fff"></circle>
      <path d="M37.4 44.4q4.8-5.4 9.2-1.6" stroke="#2c2126" stroke-width="1.9" fill="none" stroke-linecap="round"></path>
      <path d="M46.6 42.8l2.6-2.4" stroke="#2c2126" stroke-width="1.5" stroke-linecap="round"></path>
      <path d="M62.6 44.4q-4.8-5.4-9.2-1.6" stroke="#2c2126" stroke-width="1.9" fill="none" stroke-linecap="round"></path>
      <path d="M53.4 42.8l-2.6-2.4" stroke="#2c2126" stroke-width="1.5" stroke-linecap="round"></path>
    `:""}
    ${F.eyesUpturned?`
      <path d="M38 45.2q4-5.4 8.4-2q-3.6 4.6-8.4 2z" fill="#fdf7f2"></path>
      <path d="M62 45.2q-4-5.4-8.4-2q3.6 4.6 8.4 2z" fill="#fdf7f2"></path>
      <circle cx="42.4" cy="44" r="2.2" fill="var(--iris)"></circle>
      <circle cx="57.6" cy="44" r="2.2" fill="var(--iris)"></circle>
      <circle cx="42.4" cy="44" r="1" fill="#20181c"></circle>
      <circle cx="57.6" cy="44" r="1" fill="#20181c"></circle>
      <path d="M38 44.8q4-5.4 8.4-2M62 44.8q-4-5.4-8.4-2" stroke="#2c2126" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesDownturned?`
      <path d="M37.8 42.6q4.6-1.4 8.4 2.6q-5.4 2-8.4-2.6z" fill="#fdf7f2"></path>
      <path d="M62.2 42.6q-4.6-1.4-8.4 2.6q5.4 2 8.4-2.6z" fill="#fdf7f2"></path>
      <circle cx="42.2" cy="44.4" r="2.2" fill="var(--iris)"></circle>
      <circle cx="57.8" cy="44.4" r="2.2" fill="var(--iris)"></circle>
      <circle cx="42.2" cy="44.4" r="1" fill="#20181c"></circle>
      <circle cx="57.8" cy="44.4" r="1" fill="#20181c"></circle>
      <path d="M37.8 42.4q4.6-1.2 8.4 2.8M62.2 42.4q-4.6-1.2-8.4 2.8" stroke="#2c2126" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesHooded?`
      <path d="M38 44.6q4-3.4 8 0q-4 3.4-8 0z" fill="#fdf7f2"></path>
      <path d="M54 44.6q4-3.4 8 0q-4 3.4-8 0z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44.4" r="2" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.4" r="2" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.4" r=".9" fill="#20181c"></circle>
      <circle cx="58" cy="44.4" r=".9" fill="#20181c"></circle>
      <path d="M37.6 43.4q4.4-3 8.8 0M53.6 43.4q4.4-3 8.8 0" stroke="#2c2126" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
      <path d="M37.4 41.4q4.6-2 9 .4M62.6 41.4q-4.6-2-9 .4" stroke="var(--shade)" stroke-width="1.1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesMonolid?`
      <path d="M37.8 44.6q4.2-3 8.4 0q-4.2 3.2-8.4 0z" fill="#fdf7f2"></path>
      <path d="M53.8 44.6q4.2-3 8.4 0q-4.2 3.2-8.4 0z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44.4" r="2.1" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.4" r="2.1" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.4" r="1" fill="#20181c"></circle>
      <circle cx="58" cy="44.4" r="1" fill="#20181c"></circle>
      <path d="M37.8 43.6q4.2-2.6 8.4 0M53.8 43.6q4.2-2.6 8.4 0" stroke="#2c2126" stroke-width="1.9" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesNarrow?`
      <path d="M38 43.8q4-2 8 0q-4 3-8 0z" fill="#fdf7f2"></path>
      <path d="M54 43.8q4-2 8 0q-4 3-8 0z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44.2" r="1.9" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.2" r="1.9" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.2" r=".9" fill="#20181c"></circle>
      <circle cx="58" cy="44.2" r=".9" fill="#20181c"></circle>
      <path d="M37.8 43.4h8.4M53.8 43.4h8.4" stroke="#2c2126" stroke-width="1.8" stroke-linecap="round"></path>
    `:""}
    ${F.eyesSharp?`
      <path d="M37.6 44.6l4-2.6 4.8 2.2-4.4 2z" fill="#fdf7f2"></path>
      <path d="M62.4 44.6l-4-2.6-4.8 2.2 4.4 2z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44" r="1.9" fill="var(--iris)"></circle>
      <circle cx="58" cy="44" r="1.9" fill="var(--iris)"></circle>
      <circle cx="42" cy="44" r=".9" fill="#20181c"></circle>
      <circle cx="58" cy="44" r=".9" fill="#20181c"></circle>
      <path d="M37.6 44.4l4-2.8 5 2.4M62.4 44.4l-4-2.8-5 2.4" stroke="#2c2126" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"></path>
    `:""}
    ${F.eyesSleepy?`
      <path d="M38.6 44.2q3.6 3.4 7.2 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
      <path d="M53.8 44.2q3.6 3.4 7.2 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
      <path d="M39.6 47.6h5M55 47.6h5" stroke="var(--shade)" stroke-width="1" stroke-linecap="round"></path>
    `:""}
    ${F.eyesTired?`
      <path d="M38 44.4q4-3 8 0q-4 2.6-8 0z" fill="#fdf7f2"></path>
      <path d="M54 44.4q4-3 8 0q-4 2.6-8 0z" fill="#fdf7f2"></path>
      <circle cx="42" cy="44.2" r="1.9" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.2" r="1.9" fill="var(--iris)"></circle>
      <path d="M37.8 43.6q4.2-2.8 8.4 0M53.8 43.6q4.2-2.8 8.4 0" stroke="#2c2126" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
      <path d="M38.6 48.4q3.4 1.6 6.8 0M54.6 48.4q3.4 1.6 6.8 0" stroke="var(--shade)" stroke-width="1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesHappy?`
      <path d="M38.6 45.6q3.4-4.4 6.8 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
      <path d="M54.6 45.6q3.4-4.4 6.8 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesClosed?`
      <path d="M38.4 44.4h7.2M54.4 44.4h7.2" stroke="#2c2126" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M39 46.4q3-1.4 6 0M55 46.4q3-1.4 6 0" stroke="#2c2126" stroke-width="1.1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.eyesWink?`
      <path d="M38.6 45.4q3.4-4.2 6.8 0" stroke="#2c2126" stroke-width="2.2" fill="none" stroke-linecap="round"></path>
      <circle cx="58" cy="44" r="3.2" fill="var(--iris)"></circle>
      <circle cx="58" cy="44" r="1.5" fill="#20181c"></circle>
      <circle cx="59.4" cy="42.6" r="1" fill="#fff"></circle>
    `:""}
    ${F.eyesStar?`
      <circle cx="42" cy="44" r="3.4" fill="var(--iris)"></circle>
      <circle cx="58" cy="44" r="3.4" fill="var(--iris)"></circle>
      <path d="M42 41.6l.7 1.6 1.7.2-1.3 1.2.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.2 1.7-.2zM58 41.6l.7 1.6 1.7.2-1.3 1.2.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.2 1.7-.2z" fill="#f6ccd5"></path>
    `:""}
    ${F.eyesSparkle?`
      <ellipse cx="42" cy="44.2" rx="3.8" ry="4.4" fill="#fdf7f2"></ellipse>
      <ellipse cx="58" cy="44.2" rx="3.8" ry="4.4" fill="#fdf7f2"></ellipse>
      <circle cx="42" cy="44.4" r="3" fill="var(--iris)"></circle>
      <circle cx="58" cy="44.4" r="3" fill="var(--iris)"></circle>
      <circle cx="42" cy="44.4" r="1.4" fill="#20181c"></circle>
      <circle cx="58" cy="44.4" r="1.4" fill="#20181c"></circle>
      <circle cx="43.6" cy="42.8" r="1.1" fill="#fff"></circle>
      <circle cx="59.6" cy="42.8" r="1.1" fill="#fff"></circle>
      <circle cx="40.4" cy="46" r=".7" fill="#fff"></circle>
      <circle cx="56.4" cy="46" r=".7" fill="#fff"></circle>
    `:""}
    <path d="M49.4 47.4q-1.6 3 1.4 3.6" stroke="var(--shade)" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
    <circle cx="${V.blushXL}" cy="50" r="${V.blushR}" fill="${V.blushColor}" opacity="${V.blushOpacity}"></circle>
    <circle cx="${V.blushXR}" cy="50" r="${V.blushR}" fill="${V.blushColor}" opacity="${V.blushOpacity}"></circle>
    ${F.blushGlitter?`
      <circle cx="34.4" cy="48.4" r=".7" fill="#fff2c9"></circle>
      <circle cx="37.6" cy="51.4" r=".6" fill="#fff2c9"></circle>
      <circle cx="65.6" cy="48.4" r=".7" fill="#fff2c9"></circle>
      <circle cx="62.4" cy="51.4" r=".6" fill="#fff2c9"></circle>
    `:""}
    ${F.blushContour?`
      <path d="M34.6 47q1.6 4 3.6 6M65.4 47q-1.6 4-3.6 6" stroke="var(--shade)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".5"></path>
    `:""}
    ${F.blushHighlight?`
      <path d="M50 30q0 3 0 5" stroke="#fff" stroke-width="2" opacity=".18" stroke-linecap="round"></path>
      <circle cx="38" cy="46.6" r="2" fill="#fff" opacity=".16"></circle>
      <circle cx="62" cy="46.6" r="2" fill="#fff" opacity=".16"></circle>
    `:""}
    ${F.glassRound?`
      <circle cx="42" cy="44" r="7" stroke="#c9a15c" stroke-width="1.8"></circle>
      <circle cx="58" cy="44" r="7" stroke="#c9a15c" stroke-width="1.8"></circle>
      <path d="M49 44h2M35 43l-4-1M65 43l4-1" stroke="#c9a15c" stroke-width="1.6" stroke-linecap="round"></path>
    `:""}
    ${F.glassSquare?`
      <rect x="34.6" y="38.6" width="14" height="11" rx="2.4" stroke="#2f2622" stroke-width="2"></rect>
      <rect x="51.4" y="38.6" width="14" height="11" rx="2.4" stroke="#2f2622" stroke-width="2"></rect>
      <path d="M48.6 43.6h2.8M34.6 42l-3.6-1M65.4 42l3.6-1" stroke="#2f2622" stroke-width="1.8" stroke-linecap="round"></path>
    `:""}
    ${F.glassRect?`
      <rect x="33.6" y="40" width="15" height="8.4" rx="1.2" stroke="#3a3238" stroke-width="1.8"></rect>
      <rect x="51.4" y="40" width="15" height="8.4" rx="1.2" stroke="#3a3238" stroke-width="1.8"></rect>
      <path d="M48.6 43.8h2.8M33.6 42.4l-3-1M66.4 42.4l3-1" stroke="#3a3238" stroke-width="1.6" stroke-linecap="round"></path>
    `:""}
    ${F.glassOval?`
      <ellipse cx="42" cy="44" rx="7.4" ry="5.4" stroke="#c9a15c" stroke-width="1.7"></ellipse>
      <ellipse cx="58" cy="44" rx="7.4" ry="5.4" stroke="#c9a15c" stroke-width="1.7"></ellipse>
      <path d="M49.4 44h1.2M34.6 43l-3.6-1M65.4 43l3.6-1" stroke="#c9a15c" stroke-width="1.5" stroke-linecap="round"></path>
    `:""}
    ${F.glassWire?`
      <circle cx="42" cy="44" r="6.4" stroke="#a9a29c" stroke-width="1"></circle>
      <circle cx="58" cy="44" r="6.4" stroke="#a9a29c" stroke-width="1"></circle>
      <path d="M48.4 44h3.2M35.6 42.6l-4.6-1.4M64.4 42.6l4.6-1.4" stroke="#a9a29c" stroke-width="1"></path>
    `:""}
    ${F.glassThick?`
      <rect x="33.8" y="38.8" width="15" height="10.4" rx="2" stroke="#1f1a18" stroke-width="3"></rect>
      <rect x="51.2" y="38.8" width="15" height="10.4" rx="2" stroke="#1f1a18" stroke-width="3"></rect>
      <path d="M48.8 43.8h2.4M33.8 42l-3-1M66.2 42l3-1" stroke="#1f1a18" stroke-width="2.4" stroke-linecap="round"></path>
    `:""}
    ${F.glassHalfrim?`
      <path d="M34.6 41.4h14v3.4q0 4-7 4t-7-4z" stroke="#c9a15c" stroke-width="1.6" fill="none"></path>
      <path d="M51.4 41.4h14v3.4q0 4-7 4t-7-4z" stroke="#c9a15c" stroke-width="1.6" fill="none"></path>
      <path d="M48.6 41.6h2.8" stroke="#c9a15c" stroke-width="1.6"></path>
    `:""}
    ${F.glassCat?`
      <path d="M34.4 41.4q7-4 14 1.6q-6 6-12 3.4q-3-1.6-2-5z" stroke="#b0567a" stroke-width="1.8" fill="none"></path>
      <path d="M65.6 41.4q-7-4-14 1.6q6 6 12 3.4q3-1.6 2-5z" stroke="#b0567a" stroke-width="1.8" fill="none"></path>
      <path d="M48.4 43.6h3.2" stroke="#b0567a" stroke-width="1.6"></path>
    `:""}
    ${F.glassAviator?`
      <path d="M34.6 40.6h13.4l-2 6.4q-1.6 3-5 3t-5-3z" fill="#6f7f8f" opacity=".55" stroke="#c9a15c" stroke-width="1.4"></path>
      <path d="M65.4 40.6H52l2 6.4q1.6 3 5 3t5-3z" fill="#6f7f8f" opacity=".55" stroke="#c9a15c" stroke-width="1.4"></path>
      <path d="M48 41h4M34.6 41l-3.6-.6M65.4 41l3.6-.6" stroke="#c9a15c" stroke-width="1.4"></path>
    `:""}
    ${F.glassSun?`
      <path d="M33.8 40h15v5q0 4.4-7.5 4.4T33.8 45z" fill="#2c2126" stroke="#1f1a18" stroke-width="1.4"></path>
      <path d="M51.2 40h15v5q0 4.4-7.5 4.4T51.2 45z" fill="#2c2126" stroke="#1f1a18" stroke-width="1.4"></path>
      <path d="M48.8 40.6h2.4M33.8 41l-3-1M66.2 41l3-1" stroke="#1f1a18" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M36 42l3 3M53.4 42l3 3" stroke="#fff" stroke-width="1" opacity=".35"></path>
    `:""}
    ${F.glassTinted?`
      <circle cx="42" cy="44" r="6.8" fill="#b0567a" opacity=".35" stroke="#c9a15c" stroke-width="1.5"></circle>
      <circle cx="58" cy="44" r="6.8" fill="#b0567a" opacity=".35" stroke="#c9a15c" stroke-width="1.5"></circle>
      <path d="M48.8 44h2.4M35.2 42.8l-4.2-1.2M64.8 42.8l4.2-1.2" stroke="#c9a15c" stroke-width="1.4" stroke-linecap="round"></path>
    `:""}
    ${F.glassReading?`
      <ellipse cx="42" cy="47.4" rx="6.4" ry="4" stroke="#c9a15c" stroke-width="1.5"></ellipse>
      <ellipse cx="58" cy="47.4" rx="6.4" ry="4" stroke="#c9a15c" stroke-width="1.5"></ellipse>
      <path d="M48.4 47h3.2M35.6 46.4l-4.6-1M64.4 46.4l4.6-1" stroke="#c9a15c" stroke-width="1.4" stroke-linecap="round"></path>
    `:""}
    ${F.glassSport?`
      <path d="M32.6 40.8q17.4-3.4 34.8 0q1 6-4 8-6 2.4-13.4 2.4T36.6 48.8q-5-2-4-8z" fill="#3d5a80" opacity=".5" stroke="#2f2622" stroke-width="1.5"></path>
      <path d="M50 41.6v10" stroke="#2f2622" stroke-width="1.2"></path>
    `:""}
    ${F.glassMonocle?`
      <circle cx="58" cy="44" r="7.4" stroke="#e6b95e" stroke-width="1.8"></circle>
      <path d="M64.6 47.6l4 8" stroke="#e6b95e" stroke-width="1.2"></path>
    `:""}
    ${F.glassHead?`
      <circle cx="41" cy="24" r="6" stroke="#c9a15c" stroke-width="1.8"></circle>
      <circle cx="57" cy="22" r="6" stroke="#c9a15c" stroke-width="1.8"></circle>
      <path d="M47 23.4h4" stroke="#c9a15c" stroke-width="1.6"></path>
    `:""}
    <g transform="translate(50 ${V.hairDY}) scale(${V.hairSX} 1) translate(-50 0)">
    ${F.stubble?`
      <path d="M35.4 47.6C35.4 61 41.6 69.4 50 69.4s14.6-8.4 14.6-21.8z" fill="var(--hair2)" opacity=".3"></path>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair2)" opacity=".3"></path>
    `:""}
    ${F.soulpatch?`
      <path d="M47.6 56.4h4.8v3.4q0 1.6-2.4 2q-2.4-.4-2.4-2z" fill="var(--hair)"></path>
    `:""}
    ${F.moustache?`
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
    `:""}
    ${F.handlebar?`
      <path d="M42.4 48.8q3.8-2.6 7.6 0q3.8-2.6 7.6 0q-1.8 3.2-7.6 2.8q-5.8.4-7.6-2.8z" fill="var(--hair)"></path>
      <path d="M42.4 49.2q-4-1-5-4M57.6 49.2q4-1 5-4" stroke="var(--hair)" stroke-width="2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.goatee?`
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
      <path d="M45.4 55.6q4.6-1.6 9.2 0v3.6q0 5.4-4.6 6.4q-4.6-1-4.6-6.4z" fill="var(--hair)"></path>
    `:""}
    ${F.vandyke?`
      <path d="M43.4 48.8q3.4-2.2 6.6 0q3.4-2.2 6.6 0q-1.4 2.8-6.6 2.4q-5.2.4-6.6-2.4z" fill="var(--hair)"></path>
      <path d="M46.4 56.2h7.2l-1.2 5q-.8 3.4-2.4 4.4q-1.6-1-2.4-4.4z" fill="var(--hair)"></path>
    `:""}
    ${F.chinstrap?`
      <path d="M35 46.6c.4 10.4 6.6 18.6 15 18.6s14.6-8.2 15-18.6c.8 4-.2 8-2.4 11.4-3 4.8-7.6 8-12.6 8s-9.6-3.2-12.6-8c-2.2-3.4-3.2-7.4-2.4-11.4z" fill="var(--hair)"></path>
    `:""}
    ${F.mutton?`
      <path d="M33.6 42c-1 8 0 14 3 18l4-2c-2-4-3-9-2-15zM66.4 42c1 8 0 14-3 18l-4-2c2-4 3-9 2-15z" fill="var(--hair)"></path>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
    `:""}
    ${F.beardShort?`
      <path d="M34.8 47.4C34.8 62 41.4 71 50 71s15.2-9 15.2-23.6z" fill="var(--hair)"></path>
      <ellipse cx="50" cy="53.2" rx="6.2" ry="3.5" fill="var(--skin)"></ellipse>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair2)" opacity=".4"></path>
    `:""}
    ${F.beardFull?`
      <path d="M33.6 45.6C33.6 63 41 75 50 75s16.4-12 16.4-29.4z" fill="var(--hair)"></path>
      <ellipse cx="50" cy="53.2" rx="6.2" ry="3.5" fill="var(--skin)"></ellipse>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair2)" opacity=".4"></path>
    `:""}
    ${F.beardLong?`
      <path d="M33.2 45.4C33.2 62 38.4 73.4 44.4 78.4c1.6 3.6 2.4 7.6 5.6 7.6s4-4 5.6-7.6c6-5 11.2-16.4 11.2-33z" fill="var(--hair)"></path>
      <ellipse cx="50" cy="53.2" rx="6.2" ry="3.5" fill="var(--skin)"></ellipse>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair)"></path>
      <path d="M43 48.8q3.6-2.4 7 0q3.6-2.4 7 0q-1.4 3-7 2.6q-5.6.4-7-2.6z" fill="var(--hair2)" opacity=".4"></path>
    `:""}
    </g>
    ${F.mouthSmile?`
      <path d="M46.6 52.4q3.4 3 6.8 0" stroke="#a75f6c" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthSoft?`
      <path d="M47.4 52.6q2.6 1.6 5.2 0" stroke="#a75f6c" stroke-width="1.6" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthHalf?`
      <path d="M46.6 52.6q3.6 2.4 6.8 .2" stroke="#a75f6c" stroke-width="1.7" fill="none" stroke-linecap="round"></path>
      <path d="M53.4 52.8q1.4-.6 1.8-1.6" stroke="#a75f6c" stroke-width="1.3" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthGrin?`
      <path d="M45 51.6q5 6 10 0z" fill="#a75f6c"></path>
      <path d="M45.6 52.4h8.8" stroke="#fdf7f2" stroke-width="1.6"></path>
    `:""}
    ${F.mouthTeeth?`
      <path d="M44.6 51.4q5.4 7 10.8 0z" fill="#8e4b58"></path>
      <path d="M45.4 51.8h9.2v2.2h-9.2z" fill="#fdf7f2"></path>
      <path d="M48.4 51.8v2.2M51.6 51.8v2.2" stroke="#e2d6cf" stroke-width=".6"></path>
    `:""}
    ${F.mouthOpen?`
      <path d="M45.4 51.6q4.6 8 9.2 0z" fill="#8e4b58"></path>
      <path d="M46.2 52.2h7.6" stroke="#fdf7f2" stroke-width="1.4"></path>
    `:""}
    ${F.mouthLaugh?`
      <path d="M44.6 51.4q5.4 8 10.8 0z" fill="#a75f6c"></path>
      <path d="M45.4 52.2h9.2" stroke="#fdf7f2" stroke-width="1.8"></path>
    `:""}
    ${F.mouthNeutral?`
      <path d="M47 53h6" stroke="#a75f6c" stroke-width="1.8" stroke-linecap="round"></path>
    `:""}
    ${F.mouthSmirk?`
      <path d="M46.6 53.2q4 2.4 7-1.6" stroke="#a75f6c" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthSmug?`
      <path d="M46.2 52.6q3.8 1.4 7.6-1.4" stroke="#a75f6c" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
      <path d="M53.8 51.2q1.2-.2 1.8-1" stroke="#a75f6c" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthFrown?`
      <path d="M46.6 53.4q3.4-3 6.8 0" stroke="#a75f6c" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthSad?`
      <path d="M46 54q4-4.4 8 0" stroke="#a75f6c" stroke-width="1.8" fill="none" stroke-linecap="round"></path>
      <path d="M45.4 53.6q-1.2-.6-1.6-1.6M54.6 53.6q1.2-.6 1.6-1.6" stroke="#a75f6c" stroke-width="1.2" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthPout?`
      <ellipse cx="50" cy="53" rx="2.6" ry="2" fill="#a75f6c"></ellipse>
    `:""}
    ${F.mouthO?`
      <ellipse cx="50" cy="53" rx="2.2" ry="2.8" fill="#8e4b58"></ellipse>
    `:""}
    ${F.mouthSurprised?`
      <circle cx="50" cy="53.2" r="2.8" fill="#8e4b58"></circle>
    `:""}
    ${F.mouthBite?`
      <path d="M46.6 52.6q3.4 2.2 6.8 0" stroke="#a75f6c" stroke-width="1.7" fill="none" stroke-linecap="round"></path>
      <path d="M48.6 51.8h4.4" stroke="#fdf7f2" stroke-width="1.2"></path>
    `:""}
    ${F.mouthTongue?`
      <path d="M45.4 51.6q4.6 6 9.2 0z" fill="#8e4b58"></path>
      <path d="M47.6 54.4q2.4 4 4.8 0z" fill="#e08b96"></path>
    `:""}
    ${F.mouthKiss?`
      <path d="M48 52.4q2-1.6 4 0q-2 1-2 1.6q0-.6-2-1.6z" fill="#a75f6c"></path>
      <path d="M53.6 51q1.6-1 2.6 0" stroke="#a75f6c" stroke-width="1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.mouthLipstick?`
      <path d="M45.6 51.8q4.4-2 8.8 0q-2.6 4.4-4.4 4.4t-4.4-4.4z" fill="#c2334f"></path>
      <path d="M45.6 51.8q2-1.4 4.4 .6q2.4-2 4.4-.6" stroke="#8e1f36" stroke-width=".8" fill="none"></path>
    `:""}
    ${F.freckles?`
      <circle cx="38.6" cy="48.6" r=".8" fill="var(--shade)"></circle>
      <circle cx="41.8" cy="50.4" r=".7" fill="var(--shade)"></circle>
      <circle cx="35.6" cy="51.4" r=".7" fill="var(--shade)"></circle>
      <circle cx="61.4" cy="48.6" r=".8" fill="var(--shade)"></circle>
      <circle cx="58.2" cy="50.4" r=".7" fill="var(--shade)"></circle>
      <circle cx="64.4" cy="51.4" r=".7" fill="var(--shade)"></circle>
    `:""}
    ${F.mark?`
      <circle cx="56.4" cy="56.6" r="1.1" fill="#7c4a3a"></circle>
    `:""}
    ${F.dimples?`
      <path d="M43.6 54.4q-.6 1.4 0 2.4M56.4 54.4q.6 1.4 0 2.4" stroke="var(--shade)" stroke-width="1" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.scar?`
      <path d="M62.6 38.4l-1.6 7" stroke="#b07a6a" stroke-width="1.1" stroke-linecap="round"></path>
      <path d="M61 41h3.4" stroke="#b07a6a" stroke-width=".8"></path>
    `:""}
    ${F.nosering?`
      <circle cx="52.6" cy="50.6" r="1.5" stroke="#e6b95e" stroke-width=".9" fill="none"></circle>
    `:""}
    ${F.earrings?`
      <circle cx="${V.earJL}" cy="51.4" r="2" fill="#e6b95e" stroke="#7d5a20" stroke-width=".7"></circle>
      <circle cx="${V.earJR}" cy="51.4" r="2" fill="#e6b95e" stroke="#7d5a20" stroke-width=".7"></circle>
    `:""}
    ${F.drops?`
      <path d="M${V.earJL} 50v4M${V.earJR} 50v4" stroke="#e6b95e" stroke-width="1"></path>
      <circle cx="${V.earJL}" cy="56" r="2.4" fill="#f6ccd5" stroke="#b0567a" stroke-width=".6"></circle>
      <circle cx="${V.earJR}" cy="56" r="2.4" fill="#f6ccd5" stroke="#b0567a" stroke-width=".6"></circle>
    `:""}
    ${F.hoops?`
      <circle cx="${V.earJL}" cy="53.4" r="3.4" stroke="#e6b95e" stroke-width="1.1" fill="none"></circle>
      <circle cx="${V.earJR}" cy="53.4" r="3.4" stroke="#e6b95e" stroke-width="1.1" fill="none"></circle>
    `:""}
    ${F.cuff?`
      <path d="M${V.earJL} 41.6v3.4M${V.earJR} 41.6v3.4" stroke="#c9c4c0" stroke-width="1.6" stroke-linecap="round"></path>
    `:""}
    ${F.flower?`
      <circle cx="70" cy="31" r="3.4" fill="#fdf2f5" stroke="#b0567a" stroke-width=".8"></circle>
      <circle cx="70" cy="31" r="1.2" fill="#e6b95e"></circle>
      <path d="M73 34q3 1 4 4" stroke="#6f8f5f" stroke-width="1.4" fill="none" stroke-linecap="round"></path>
    `:""}
    ${F.bow?`
      <path d="M66 28l-5-3 5-3z" fill="#d6006c"></path>
      <path d="M66 28l5-3-5-3z" fill="#d6006c"></path>
      <circle cx="66" cy="25" r="1.2" fill="#f6ccd5"></circle>
    `:""}
    ${F.ribbon?`
      <path d="M31 34q19-11 38 0" stroke="#f6ccd5" stroke-width="2.6" fill="none" stroke-linecap="round"></path>
      <path d="M64 27l4.4-3-1 5.2z" fill="#f6ccd5"></path>
    `:""}
    ${F.headband?`
      <path d="M30.5 32.5q19.5-11 39 0" stroke="#b0567a" stroke-width="3.4" fill="none" stroke-linecap="round"></path>
      <path d="M66 27.5l-4-2.8 4-2 4 2z" fill="#e6b95e"></path>
    `:""}
    ${F.beret?`
      <path d="M31 30q6-12 20-12t19 11q-8 5-20 5t-19-4z" fill="#4a3f4c"></path>
      <circle cx="66" cy="17" r="2" fill="#4a3f4c"></circle>
    `:""}
    ${F.crown?`
      <path d="M38 19.5l2-11.5 5 5.5 5-7.5 5 7.5 5-5.5 2 11.5z" fill="#e6b95e" stroke="#7d5a20" stroke-width="1"></path>
      <circle cx="50" cy="14.4" r="1.3" fill="#b0567a"></circle>
    `:""}
    ${F.tiara?`
      <path d="M39.5 24q10.5-8 21 0" stroke="#e6b95e" stroke-width="1.6" fill="none"></path>
      <path d="M50 15.5l2.2 5.6h-4.4z" fill="#e6b95e"></path>
      <circle cx="43.6" cy="22" r="1" fill="#f6ccd5"></circle>
      <circle cx="56.4" cy="22" r="1" fill="#f6ccd5"></circle>
    `:""}
    ${F.halo?`
      <ellipse cx="50" cy="13" rx="10" ry="3" stroke="#e6b95e" stroke-width="1.6" fill="none"></ellipse>
    `:""}
    ${F.veil?`
      <path d="M28 34q22-14 44 0q2 22-4 38h-6q4-16 2-30-14-8-28 0-2 14 2 30h-6q-6-16-4-38z" fill="#fdf7f2" opacity=".22"></path>
    `:""}
    ${F.stars?`
      <path d="M32 30l.9 2.1 2.3.2-1.7 1.6.5 2.2-2-1.2-2 1.2.5-2.2-1.7-1.6 2.3-.2z" fill="#e6b95e"></path>
      <path d="M68 36l.6 1.4 1.6.2-1.2 1.1.3 1.5-1.3-.8-1.3.8.3-1.5-1.2-1.1 1.6-.2z" fill="#f6ccd5"></path>
    `:""}
    ${F.heartsticker?`
      <path d="M64.6 55.6q1.4-1.6 2.8 0q1.4 1.6-2.8 4q-4.2-2.4-2.8-4q1.4-1.6 2.8 0z" fill="#d6006c"></path>
    `:""}
    ${F.eyepatch?`
      <rect x="35.6" y="39.4" width="13" height="9.4" rx="1.4" fill="#2c2126"></rect>
      <path d="M35.6 40.6l-5-1.6M48.6 40l6-2" stroke="#2c2126" stroke-width="1.4"></path>
    `:""}
  </svg>
</span>`;

/* Draw an avatar at a given pixel size.
   The drawing reads two fields under the names the prototype passed
   them in as; the saved shape uses the shorter names the option kits
   are keyed by, so translate before handing it over. */
function draw(av, size) {
  const src = av || {};
  const props = Object.assign({}, src, {
    hairStyle: src.hairStyle || src.style,
    facialHair: src.facialHair || src.beard,
  });
  const all = fields(props);
  return '<span class="av-wrap" style="width:' + size + 'px;height:' + size + 'px">' + TPL(all, all) + '</span>';
}

window.CodexAvatar = { draw, SKIN, HAIRC, IRISC, RINGC, TOPC, BLUSHES };
})();
