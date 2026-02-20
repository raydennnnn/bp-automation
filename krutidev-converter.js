/**
 * krutidev-converter.js — Krutidev 010 → Unicode Devanagari converter.
 *
 * Ported from anthro-ai/krutidev-unicode (MIT).
 * Handles the complex character reordering needed for accurate conversion:
 *   - 'f' (ि matra) repositioning
 *   - 'Z' (रेफ / र्) repositioning before matras
 *   - Compound conjuncts and special ligatures
 *
 * Usage:
 *   const { krutidevToUnicode, isLikelyKrutidev } = require('./krutidev-converter');
 *   const hindi = krutidevToUnicode('i=koyh dk voyksdu fd;k x;kA');
 */

// ── Helper: replace all occurrences ──────────────────────────────────
function replaceAll(str, find, replace) {
    if (!find) return str;
    return str.split(find).join(replace);
}

// ── Main dictionary (order matters!) ─────────────────────────────────
const MAIN_MAP = [
    ['\xf1', '\u0970'],
    ['Q+Z', 'QZ+'],
    ['sas', 'sa'],
    ['aa', 'a'],
    [')Z', '\u0930\u094d\u0926\u094d\u0927'],
    ['ZZ', 'Z'],
    ['\u2018', '"'],
    ['\u2019', '"'],
    ['\u201c', "'"],
    ['\u201d', "'"],
    ['\xe5', '\u0966'],
    ['\u0192', '\u0967'],
    ['\u201e', '\u0968'],
    ['\u2026', '\u0969'],
    ['\u2020', '\u096a'],
    ['\u2021', '\u096b'],
    ['\u02c6', '\u096c'],
    ['\u2030', '\u096d'],
    ['\u0160', '\u096e'],
    ['\u2039', '\u096f'],
    ['\xb6+', '\u095e\u094d'],
    ['d+', '\u0958'],
    ['[+k', '\u0959'],
    ['[+', '\u0959\u094d'],
    ['x+', '\u095a'],
    ['T+', '\u091c\u093c\u094d'],
    ['t+', '\u095b'],
    ['M+', '\u095c'],
    ['<+', '\u095d'],
    ['Q+', '\u095e'],
    [';+', '\u095f'],
    ['j+', '\u0931'],
    ['u+', '\u0929'],
    ['\xd9k', '\u0924\u094d\u0924'],
    ['\xd9', '\u0924\u094d\u0924\u094d'],
    ['\xe4', '\u0915\u094d\u0924'],
    ['\u2013', '\u0926\u0943'],
    ['\u2014', '\u0915\u0943'],
    ['\xe9', '\u0928\u094d\u0928'],
    ['\u2122', '\u0928\u094d\u0928\u094d'],
    ['=kk', '=k'],
    ['f=k', 'f='],
    ['\xe0', '\u0939\u094d\u0928'],
    ['\xe1', '\u0939\u094d\u092f'],
    ['\xe2', '\u0939\u0943'],
    ['\xe3', '\u0939\u094d\u092e'],
    ['\xbaz', '\u0939\u094d\u0930'],
    ['\xba', '\u0939\u094d'],
    ['\xed', '\u0926\u094d\u0926'],
    ['{k', '\u0915\u094d\u0937'],
    ['{', '\u0915\u094d\u0937\u094d'],
    ['=', '\u0924\u094d\u0930'],
    ['\xab', '\u0924\u094d\u0930\u094d'],
    ['N\xee', '\u091b\u094d\u092f'],
    ['V\xee', '\u091f\u094d\u092f'],
    ['B\xee', '\u0920\u094d\u092f'],
    ['M\xee', '\u0921\u094d\u092f'],
    ['<\xee', '\u0922\u094d\u092f'],
    ['|', '\u0926\u094d\u092f'],
    ['K', '\u091c\u094d\u091e'],
    ['}', '\u0926\u094d\u0935'],
    ['J', '\u0936\u094d\u0930'],
    ['V\xaa', '\u091f\u094d\u0930'],
    ['M\xaa', '\u0921\u094d\u0930'],
    ['<\xaa\xaa', '\u0922\u094d\u0930'],
    ['N\xaa', '\u091b\u094d\u0930'],
    ['\xd8', '\u0915\u094d\u0930'],
    ['\xdd', '\u092b\u094d\u0930'],
    ['nzZ', '\u0930\u094d\u0926\u094d\u0930'],
    ['\xe6', '\u0926\u094d\u0930'],
    ['\xe7', '\u092a\u094d\u0930'],
    ['\xc1', '\u092a\u094d\u0930'],
    ['xz', '\u0917\u094d\u0930'],
    ['#', '\u0930\u0941'],
    [':', '\u0930\u0942'],
    ['v\u201a', '\u0911'],
    ['vks', '\u0913'],
    ['vkS', '\u0914'],
    ['vk', '\u0906'],
    ['v', '\u0905'],
    ['b\xb1', '\u0908\u0902'],
    ['\xc3', '\u0908'],
    ['bZ', '\u0908'],
    ['b', '\u0907'],
    ['m', '\u0909'],
    ['\xc5', '\u090a'],
    [',s', '\u0910'],
    [',', '\u090f'],
    ['_', '\u090b'],
    ['\xf4', '\u0915\u094d\u0915'],
    ['d', '\u0915'],
    ['Dk', '\u0915'],
    ['D', '\u0915\u094d'],
    ['[k', '\u0916'],
    ['[', '\u0916\u094d'],
    ['x', '\u0917'],
    ['Xk', '\u0917'],
    ['X', '\u0917\u094d'],
    ['\xc4', '\u0918'],
    ['?k', '\u0918'],
    ['?', '\u0918\u094d'],
    ['\xb3', '\u0919'],
    ['pkS', '\u091a\u0948'],
    ['p', '\u091a'],
    ['Pk', '\u091a'],
    ['P', '\u091a\u094d'],
    ['N', '\u091b'],
    ['t', '\u091c'],
    ['Tk', '\u091c'],
    ['T', '\u091c\u094d'],
    ['>', '\u091d'],
    ['\xf7', '\u091d\u094d'],
    ['\xa5', '\u091e'],
    ['\xea', '\u091f\u094d\u091f'],
    ['\xeb', '\u091f\u094d\u0920'],
    ['V', '\u091f'],
    ['B', '\u0920'],
    ['\xec', '\u0921\u094d\u0921'],
    ['\xef', '\u0921\u094d\u0922'],
    ['M', '\u0921'],
    ['<', '\u0922'],
    ['.k', '\u0923'],
    ['.', '\u0923\u094d'],
    ['r', '\u0924'],
    ['Rk', '\u0924'],
    ['R', '\u0924\u094d'],
    ['Fk', '\u0925'],
    ['F', '\u0925\u094d'],
    [')', '\u0926\u094d\u0927'],
    ['n', '\u0926'],
    ['/k', '\u0927'],
    ['/', '\u0927\u094d'],
    ['\xcb', '\u0927\u094d'],
    ['\xe8', '\u0927'],
    ['u', '\u0928'],
    ['Uk', '\u0928'],
    ['U', '\u0928\u094d'],
    ['i', '\u092a'],
    ['Ik', '\u092a'],
    ['I', '\u092a\u094d'],
    ['Q', '\u092b'],
    ['\xb6', '\u092b\u094d'],
    ['c', '\u092c'],
    ['Ck', '\u092c'],
    ['C', '\u092c\u094d'],
    ['Hk', '\u092d'],
    ['H', '\u092d\u094d'],
    ['e', '\u092e'],
    ['Ek', '\u092e'],
    ['E', '\u092e\u094d'],
    [';', '\u092f'],
    ['\xb8', '\u092f\u094d'],
    ['j', '\u0930'],
    ['y', '\u0932'],
    ['Yk', '\u0932'],
    ['Y', '\u0932\u094d'],
    ['G', '\u0933'],
    ['o', '\u0935'],
    ['Ok', '\u0935'],
    ['O', '\u0935\u094d'],
    ["'k", '\u0936'],
    ["'", '\u0936\u094d'],
    ['"k', '\u0937'],
    ['"', '\u0937\u094d'],
    ['l', '\u0938'],
    ['Lk', '\u0938'],
    ['L', '\u0938\u094d'],
    ['g', '\u0939'],
    ['\xc8', '\u0940\u0902'],
    ['saz', '\u094d\u0930\u0947\u0902'],
    ['z', '\u094d\u0930'],
    ['\xcc', '\u0926\u094d\u0926'],
    ['\xcd', '\u091f\u094d\u091f'],
    ['\xce', '\u091f\u094d\u0920'],
    ['\xcf', '\u0921\u094d\u0921'],
    ['\xd1', '\u0915\u0943'],
    ['\xd2', '\u092d'],
    ['\xd3', '\u094d\u092f'],
    ['\xd4', '\u0921\u094d\u0922'],
    ['\xd6', '\u091d\u094d'],
    ['\xdck', '\u0936'],
    ['\xdc', '\u0936\u094d'],
    ['\u201a', '\u0949'],
    ['kas', '\u094b\u0902'],
    ['ks', '\u094b'],
    ['kS', '\u094c'],
    ['\xa1k', '\u093e\u0901'],
    ['ak', 'k\u0902'],
    ['k', '\u093e'],
    ['ah', '\u0940\u0902'],
    ['h', '\u0940'],
    ['aq', '\u0941\u0902'],
    ['q', '\u0941'],
    ['aw', '\u0942\u0902'],
    ['\xa1w', '\u0942\u0901'],
    ['w', '\u0942'],
    ['`', '\u0943'],
    ['\u0300', '\u0943'],
    ['as', '\u0947\u0902'],
    ['\xb1s', 's\xb1'],
    ['s', '\u0947'],
    ['aS', '\u0948\u0902'],
    ['S', '\u0948'],
    ['a\xaa', '\u094d\u0930\u0902'],
    ['\xaa', '\u094d\u0930'],
    ['fa', '\u0902f'],
    ['a', '\u0902'],
    ['\xa1', '\u0901'],
    ['%', ':'],
    ['W', '\u0945'],
    ['\u2022', '\u093d'],
    ['\xb7', '\u093d'],
    ['\u2219', '\u093d'],
    ['~j', '\u094d\u0930'],
    ['~', '\u094d'],
    ['\\', '?'],
    ['+', '\u093c'],
    ['^', '\u2018'],
    ['*', '\u2019'],
    ['\xde', '\u201c'],
    ['\xdf', '\u201d'],
    ['(', ';'],
    ['\xbc', '('],
    ['\xbd', ')'],
    ['\xc0', '}'],
    ['\xbe', '='],
    ['A', '\u0964'],
    ['-', '.'],
    ['&', '-'],
    ['\u03bc', '-'],
    ['\u0152', '\u0970'],
    [']', ','],
    ['~ ', '\u094d '],
    ['@', '/'],
    ['\xae', '\u0948\u0902'],
];

// ── Vowels (Unicode) ─────────────────────────────────────────────────
const VOWELS_UNICODE = [
    '\u0905', '\u0906', '\u0907', '\u0908', '\u0909', '\u090a',
    '\u090f', '\u0910', '\u0913', '\u0914',
    '\u093e', '\u093f', '\u0940', '\u0941', '\u0942', '\u0943',
    '\u0947', '\u0948', '\u094b', '\u094c',
    '\u0902', '\u0903', '\u0901', '\u0945',
];

// ── Unattached matras (Unicode) ──────────────────────────────────────
const UNATTACHED_UNICODE = [
    '\u093e', '\u093f', '\u0940', '\u0941', '\u0942', '\u0943',
    '\u0947', '\u0948', '\u094b', '\u094c',
    '\u0902', '\u0903', '\u0901', '\u0945',
];

/**
 * Convert Krutidev text to Unicode Devanagari.
 */
function krutidevToUnicode(text) {
    if (!text) return text;

    let t = text;

    // Pre-processing: space + ्र → ्र
    t = replaceAll(t, ' \xaa', '\xaa');
    t = replaceAll(t, ' ~j', '~j');
    t = replaceAll(t, ' z', 'z');

    // Main dictionary replacements
    for (const [find, replace] of MAIN_MAP) {
        t = replaceAll(t, find, replace);
    }

    t = replaceAll(t, '\xb1', 'Z\u0902');
    t = replaceAll(t, '\xc6', '\u0930\u094df');

    // 'f' + next char → next char + ि (ि matra repositioning)
    let fResult;
    const fRegex = /f(.?)/g;
    while ((fResult = fRegex.exec(t)) !== null) {
        const match = fResult[1];
        t = t.replace('f' + match, match + '\u093f');
        fRegex.lastIndex = 0; // restart search
    }

    t = replaceAll(t, '\xc7', 'fa');
    t = replaceAll(t, '\xaf', 'fa');
    t = replaceAll(t, '\xc9', '\u0930\u094dfa');

    // 'fa' + next char → next char + िं
    let faResult;
    const faRegex = /fa(.?)/g;
    while ((faResult = faRegex.exec(t)) !== null) {
        const match = faResult[1];
        t = t.replace('fa' + match, match + '\u093f\u0902');
        faRegex.lastIndex = 0;
    }

    t = replaceAll(t, '\xca', '\u0940Z');

    // ि् + next → ् + next + ि
    let iResult;
    const iRegex = /\u093f\u094d(.?)/g;
    while ((iResult = iRegex.exec(t)) !== null) {
        const match = iResult[1];
        t = t.replace('\u093f\u094d' + match, '\u094d' + match + '\u093f');
        iRegex.lastIndex = 0;
    }

    t = replaceAll(t, '\u094dZ', 'Z');

    // Z (ref/र्) repositioning: place before matras
    let zResult;
    const zRegex = /(.?)Z/g;
    while ((zResult = zRegex.exec(t)) !== null) {
        let match = zResult[1];
        let index = t.indexOf(match + 'Z');
        if (index < 0) continue;
        while (index >= 0 && VOWELS_UNICODE.includes(t[index])) {
            index -= 1;
            match = t[index] + match;
        }
        t = t.replace(match + 'Z', '\u0930\u094d' + match);
        zRegex.lastIndex = 0;
    }

    // Clean up illegal characters before matras
    for (const matra of UNATTACHED_UNICODE) {
        t = replaceAll(t, ' ' + matra, matra);
        t = replaceAll(t, ',' + matra, matra + ',');
        t = replaceAll(t, '\u094d' + matra, matra + ',');
    }

    t = replaceAll(t, '\u094d\u094d\u0930', '\u094d\u0930');
    t = replaceAll(t, '\u094d\u0930\u094d', '\u0930\u094d');
    t = replaceAll(t, '\u094d\u094d', '\u094d');
    t = replaceAll(t, '\u094d ', ' ');

    return t.trim();
}

/**
 * Detect if a string is likely Krutidev-encoded.
 * Looks for common Krutidev word patterns that wouldn't occur in normal text.
 */
function isLikelyKrutidev(text) {
    if (!text || text.length < 5) return false;

    // If it already has significant Devanagari Unicode, it's not Krutidev
    const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
    if (devanagariCount > text.length * 0.3) return false;

    // Common Krutidev word patterns
    const krutiMarkers = /(?:fd;k|x;k|gSA|gS|dh|ds|dk|esa|vkSj|;g|ls|ij|dks|ugha|gks|;k|Fkk|Fkh|Fks|x;h|x;s|fd|vk|,d|Hkh)/;
    return krutiMarkers.test(text);
}

/**
 * Auto-convert: if it looks like Krutidev, convert it; otherwise return as-is.
 */
function autoConvert(text) {
    if (!text) return text;
    if (isLikelyKrutidev(text)) {
        return krutidevToUnicode(text);
    }
    return text;
}

module.exports = { krutidevToUnicode, isLikelyKrutidev, autoConvert };
