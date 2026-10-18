function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

const ROOT_TAG = "#root";
const HEADING_SKIP_KEY = "#heading";
const TRUNCATED_TYPE = "truncated";
const TRUNCATED_REASON_DEPTH = "max-depth";
const MAX_STACK_DEPTH = 512;
const MAX_CODE_POINT = 0x10FFFF;
const MAX_ENTITY_LENGTH = 32;
const MAX_LEGACY_ENTITY_LENGTH = 6;

const WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f"]);
const WHITESPACE_RUN = /[ \t\n\r\f]+/g;
const WHITESPACE_ONLY = /^[ \t\n\r\f]*$/;
const COMMENT_END = /--!?>/g;
const UPPERCASE_RUN = /[A-Z]+/g;

const VOID = new Set([
  "area", "base", "basefont", "bgsound", "br", "col", "embed", "frame", "hr", "img", "input",
  "keygen", "link", "meta", "param", "source", "track", "wbr",
]);

const RAW_CONTENT_TAGS = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const DECODED_TEXT_TAGS = new Set(["textarea", "title"]);
const PRESERVE_WHITESPACE_TAGS = new Set(["pre", "textarea", "listing"]);
const DOCUMENT_TAGS = new Set(["html", "body"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const HEAD_CONTENT_TAGS = new Set(["base", "link", "meta", "noscript", "script", "style", "template", "title"]);

const CLOSES_P = new Set([
  "p", "div", "ul", "ol", "table", "pre", "blockquote", "section",
  "article", "header", "footer", "nav", "form", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "dl", "dt", "dd", "fieldset", "address", "main", "aside",
  "figure", "figcaption", "details", "summary", "hgroup", "menu",
  "listing", "center", "dir", "search", "xmp", "plaintext", "dialog",
]);

const BLOCK_TAGS = new Set([
  ...CLOSES_P,
  "html", "head", "body", "title", "meta", "link", "base", "script", "style",
  "tbody", "thead", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "select", "option", "optgroup", "br",
]);

const SCOPE_BOUNDARIES = new Set([
  "applet", "caption", "html", "marquee", "object", "table", "td", "template", "th",
]);
const TABLE_SCOPE_TAGS = new Set(["table", "caption", "colgroup", "tbody", "td", "tfoot", "th", "thead", "tr"]);
const TABLE_SCOPE_BOUNDARIES = new Set(["html", "table", "template"]);
const RECOVERABLE_CLOSE_TAGS = new Set(["p", "br"]);

const FORMATTING_STOPS = ["td", "th", "caption", "table", "applet", "object", "marquee", "template"];

const PARAGRAPH_RULE = {
  closes: ["p"],
  stops: ["table", "td", "th", "caption", "button", "object", "template", "marquee", "applet", "html"],
};

const CELL_RULE = { closes: ["td", "th"], stops: ["tr", "table"] };
const SECTION_RULE = {
  closes: ["td", "th", "tr", "tbody", "thead", "tfoot", "caption", "colgroup"],
  stops: ["table"],
};
const DEFINITION_RULE = { closes: ["dt", "dd"], stops: ["dl", "table", "td", "th"] };
const TABLE_PART_RULE = { closes: ["caption", "colgroup"], stops: ["table"] };
const FORMATTING_A_RULE = { closes: ["a"], stops: FORMATTING_STOPS };
const FORMATTING_BUTTON_RULE = { closes: ["button"], stops: FORMATTING_STOPS };

const IMPLIED_END_TAGS = new Map([
  ["li", { closes: ["li"], stops: ["ul", "ol", "menu", "table", "td", "th"] }],
  ["dt", DEFINITION_RULE],
  ["dd", DEFINITION_RULE],
  ["td", CELL_RULE],
  ["th", CELL_RULE],
  ["tr", {
    closes: ["td", "th", "tr", "caption", "colgroup"],
    stops: ["tbody", "thead", "tfoot", "table"],
  }],
  ["tbody", SECTION_RULE],
  ["thead", SECTION_RULE],
  ["tfoot", SECTION_RULE],
  ["caption", TABLE_PART_RULE],
  ["colgroup", TABLE_PART_RULE],
  ["option", { closes: ["option"], stops: ["select", "datalist", "optgroup"] }],
  ["optgroup", { closes: ["option", "optgroup"], stops: ["select", "datalist"] }],
  ["a", FORMATTING_A_RULE],
  ["button", FORMATTING_BUTTON_RULE],
]);

function indexedEntries(names, base) {
  return names.flatMap((name, offset) => (name ? [[name, base + offset]] : []));
}

const BASE_ENTITIES = [
  ["amp", 0x26], ["AMP", 0x26], ["lt", 0x3C], ["LT", 0x3C], ["gt", 0x3E], ["GT", 0x3E],
  ["quot", 0x22], ["QUOT", 0x22], ["apos", 0x27], ["COPY", 0xA9], ["REG", 0xAE],
];

const LATIN1_NAMES = [
  "nbsp", "iexcl", "cent", "pound", "curren", "yen", "brvbar", "sect",
  "uml", "copy", "ordf", "laquo", "not", "shy", "reg", "macr",
  "deg", "plusmn", "sup2", "sup3", "acute", "micro", "para", "middot",
  "cedil", "sup1", "ordm", "raquo", "frac14", "frac12", "frac34", "iquest",
  "Agrave", "Aacute", "Acirc", "Atilde", "Auml", "Aring", "AElig", "Ccedil",
  "Egrave", "Eacute", "Ecirc", "Euml", "Igrave", "Iacute", "Icirc", "Iuml",
  "ETH", "Ntilde", "Ograve", "Oacute", "Ocirc", "Otilde", "Ouml", "times",
  "Oslash", "Ugrave", "Uacute", "Ucirc", "Uuml", "Yacute", "THORN", "szlig",
  "agrave", "aacute", "acirc", "atilde", "auml", "aring", "aelig", "ccedil",
  "egrave", "eacute", "ecirc", "euml", "igrave", "iacute", "icirc", "iuml",
  "eth", "ntilde", "ograve", "oacute", "ocirc", "otilde", "ouml", "divide",
  "oslash", "ugrave", "uacute", "ucirc", "uuml", "yacute", "thorn", "yuml",
];

const GREEK_UPPER_NAMES = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
  "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", null, "Sigma", "Tau", "Upsilon",
  "Phi", "Chi", "Psi", "Omega",
];

const GREEK_LOWER_NAMES = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
  "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigmaf", "sigma", "tau", "upsilon",
  "phi", "chi", "psi", "omega",
];

const SYMBOL_ENTITIES = [
  ["OElig", 0x152], ["oelig", 0x153], ["Scaron", 0x160], ["scaron", 0x161], ["Yuml", 0x178],
  ["fnof", 0x192], ["circ", 0x2C6], ["tilde", 0x2DC],
  ["thetasym", 0x3D1], ["upsih", 0x3D2], ["piv", 0x3D6],
  ["ensp", 0x2002], ["emsp", 0x2003], ["thinsp", 0x2009], ["zwnj", 0x200C], ["zwj", 0x200D],
  ["lrm", 0x200E], ["rlm", 0x200F], ["ndash", 0x2013], ["mdash", 0x2014],
  ["lsquo", 0x2018], ["rsquo", 0x2019], ["sbquo", 0x201A], ["ldquo", 0x201C], ["rdquo", 0x201D],
  ["bdquo", 0x201E], ["dagger", 0x2020], ["Dagger", 0x2021], ["bull", 0x2022], ["hellip", 0x2026],
  ["permil", 0x2030], ["prime", 0x2032], ["Prime", 0x2033], ["lsaquo", 0x2039], ["rsaquo", 0x203A],
  ["oline", 0x203E], ["frasl", 0x2044], ["euro", 0x20AC], ["image", 0x2111], ["weierp", 0x2118],
  ["real", 0x211C], ["trade", 0x2122], ["alefsym", 0x2135],
  ["larr", 0x2190], ["uarr", 0x2191], ["rarr", 0x2192], ["darr", 0x2193], ["harr", 0x2194],
  ["crarr", 0x21B5], ["lArr", 0x21D0], ["uArr", 0x21D1], ["rArr", 0x21D2], ["dArr", 0x21D3],
  ["hArr", 0x21D4],
  ["forall", 0x2200], ["part", 0x2202], ["exist", 0x2203], ["empty", 0x2205], ["nabla", 0x2207],
  ["isin", 0x2208], ["notin", 0x2209], ["ni", 0x220B], ["prod", 0x220F], ["sum", 0x2211],
  ["minus", 0x2212], ["lowast", 0x2217], ["radic", 0x221A], ["prop", 0x221D], ["infin", 0x221E],
  ["ang", 0x2220], ["and", 0x2227], ["or", 0x2228], ["cap", 0x2229], ["cup", 0x222A],
  ["int", 0x222B], ["there4", 0x2234], ["sim", 0x223C], ["cong", 0x2245], ["asymp", 0x2248],
  ["ne", 0x2260], ["equiv", 0x2261], ["le", 0x2264], ["ge", 0x2265], ["sub", 0x2282],
  ["sup", 0x2283], ["nsub", 0x2284], ["sube", 0x2286], ["supe", 0x2287], ["oplus", 0x2295],
  ["otimes", 0x2297], ["perp", 0x22A5], ["sdot", 0x22C5],
  ["lceil", 0x2308], ["rceil", 0x2309], ["lfloor", 0x230A], ["rfloor", 0x230B],
  ["lang", 0x27E8], ["rang", 0x27E9], ["loz", 0x25CA],
  ["spades", 0x2660], ["clubs", 0x2663], ["hearts", 0x2665], ["diams", 0x2666],
];

const PUNCTUATION_ENTITIES = [
  ["Tab", 0x9], ["NewLine", 0xA], ["excl", 0x21], ["num", 0x23], ["dollar", 0x24],
  ["percnt", 0x25], ["lpar", 0x28], ["rpar", 0x29], ["ast", 0x2A], ["plus", 0x2B],
  ["comma", 0x2C], ["period", 0x2E], ["sol", 0x2F], ["colon", 0x3A], ["semi", 0x3B],
  ["equals", 0x3D], ["quest", 0x3F], ["commat", 0x40], ["lsqb", 0x5B], ["bsol", 0x5C],
  ["rsqb", 0x5D], ["lowbar", 0x5F], ["lcub", 0x7B], ["verbar", 0x7C], ["rcub", 0x7D],
  ["check", 0x2713],
];

const NAMED_ENTITIES = new Map(
  [
    ...BASE_ENTITIES,
    ...indexedEntries(LATIN1_NAMES, 0xA0),
    ...indexedEntries(GREEK_UPPER_NAMES, 0x391),
    ...indexedEntries(GREEK_LOWER_NAMES, 0x3B1),
    ...SYMBOL_ENTITIES,
    ...PUNCTUATION_ENTITIES,
  ].map(([name, code]) => [name, String.fromCodePoint(code)]),
);

const LEGACY_ENTITIES = new Set([
  ...LATIN1_NAMES,
  "amp", "AMP", "lt", "LT", "gt", "GT", "quot", "QUOT", "COPY", "REG",
]);

const WINDOWS_1252 = new Map([
  [0x80, 0x20AC], [0x82, 0x201A], [0x83, 0x0192], [0x84, 0x201E], [0x85, 0x2026],
  [0x86, 0x2020], [0x87, 0x2021], [0x88, 0x02C6], [0x89, 0x2030], [0x8A, 0x0160],
  [0x8B, 0x2039], [0x8C, 0x0152], [0x8E, 0x017D], [0x91, 0x2018], [0x92, 0x2019],
  [0x93, 0x201C], [0x94, 0x201D], [0x95, 0x2022], [0x96, 0x2013], [0x97, 0x2014],
  [0x98, 0x02DC], [0x99, 0x2122], [0x9A, 0x0161], [0x9B, 0x203A], [0x9C, 0x0153],
  [0x9E, 0x017E], [0x9F, 0x0178],
]);

const SVG_CAMEL_TAGS = [
  "altGlyph", "altGlyphDef", "altGlyphItem", "animateColor", "animateMotion", "animateTransform",
  "clipPath", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
  "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
  "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge",
  "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotLight", "feTile", "feTurbulence", "foreignObject", "glyphRef", "linearGradient",
  "radialGradient", "textPath",
];

const SVG_CAMEL_ATTRIBUTES = [
  "attributeName", "attributeType", "baseFrequency", "baseProfile", "calcMode", "clipPathUnits",
  "diffuseConstant", "edgeMode", "filterUnits", "glyphRef", "gradientTransform", "gradientUnits",
  "kernelMatrix", "kernelUnitLength", "keyPoints", "keySplines", "keyTimes", "lengthAdjust",
  "limitingConeAngle", "markerHeight", "markerUnits", "markerWidth", "maskContentUnits",
  "maskUnits", "numOctaves", "pathLength", "patternContentUnits", "patternTransform",
  "patternUnits", "pointsAtX", "pointsAtY", "pointsAtZ", "preserveAlpha", "preserveAspectRatio",
  "primitiveUnits", "refX", "refY", "repeatCount", "repeatDur", "requiredExtensions",
  "requiredFeatures", "specularConstant", "specularExponent", "spreadMethod", "startOffset",
  "stdDeviation", "stitchTiles", "surfaceScale", "systemLanguage", "tableValues", "targetX",
  "targetY", "textLength", "viewBox", "viewTarget", "xChannelSelector", "yChannelSelector",
  "zoomAndPan",
];

const toCaseMap = (names) => new Map(names.map((name) => [name.toLowerCase(), name]));

const SVG_TAG_CASE = toCaseMap(SVG_CAMEL_TAGS);
const SVG_ATTRIBUTE_CASE = toCaseMap(SVG_CAMEL_ATTRIBUTES);
const MATH_ATTRIBUTE_CASE = toCaseMap(["definitionURL"]);
const FOREIGN_ROOTS = new Set(["svg", "math"]);
const HTML_NAMESPACE = "html";

function isSpace(char) {
  return WHITESPACE.has(char);
}

function isLetter(char) {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isNameEnd(char) {
  return isSpace(char) || char === "/" || char === ">";
}

function isWhitespaceOnly(value) {
  return WHITESPACE_ONLY.test(value);
}

function isTextOnly(tag) {
  return RAW_CONTENT_TAGS.has(tag) || DECODED_TEXT_TAGS.has(tag);
}

function toAsciiLower(value) {
  return value.replace(UPPERCASE_RUN, (run) => run.toLowerCase());
}

function skipKey(tag) {
  return HEADINGS.has(tag) ? HEADING_SKIP_KEY : tag;
}

function readUntil(input, start, terminator) {
  const end = input.indexOf(terminator, start);

  if (end === -1) {
    return { value: input.slice(start), index: input.length };
  }

  return { value: input.slice(start, end), index: end + terminator.length };
}

function readTagName(input, start) {
  let end = start;

  while (end < input.length && !isNameEnd(input[end])) {
    end++;
  }

  return { tag: toAsciiLower(input.slice(start, end)), index: end };
}

function readComment(input, index) {
  const start = index + 4;

  if (input.startsWith(">", start)) {
    return { token: { type: "comment", value: "" }, index: start + 1 };
  }

  if (input.startsWith("->", start)) {
    return { token: { type: "comment", value: "" }, index: start + 2 };
  }

  COMMENT_END.lastIndex = start;

  const match = COMMENT_END.exec(input);

  if (match === null) {
    return { token: { type: "comment", value: input.slice(start) }, index: input.length };
  }

  return {
    token: { type: "comment", value: input.slice(start, match.index) },
    index: match.index + match[0].length,
  };
}

function readDeclaration(input, index) {
  const start = index + (input[index + 1] === "!" ? 2 : 1);
  const { value, index: next } = readUntil(input, start, ">");

  if (toAsciiLower(value.slice(0, 7)) === "doctype") {
    return { token: { type: "doctype", value: value.slice(7).trim() }, index: next };
  }

  return { token: { type: "comment", value }, index: next };
}

function readClosingTag(input, index) {
  const { tag, index: tagEnd } = readTagName(input, index + 2);
  const end = input.indexOf(">", tagEnd);

  if (end === -1) {
    return { token: null, index: input.length };
  }

  return { token: { type: "close", tag }, index: end + 1 };
}

function readInvalidClosingTag(input, index) {
  if (input.startsWith("</>", index)) {
    return { token: null, index: index + 3 };
  }

  if (index + 2 >= input.length) {
    return { token: { type: "text", value: "</" }, index: input.length };
  }

  const { value, index: next } = readUntil(input, index + 2, ">");

  return { token: { type: "comment", value }, index: next };
}

function setAttribute(attributes, name, value) {
  if (!Object.prototype.hasOwnProperty.call(attributes, name)) {
    Object.defineProperty(attributes, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
}

function readAttributeValue(input, index) {
  const quote = input[index];

  if (quote === "\"" || quote === "'") {
    const { value, index: next } = readUntil(input, index + 1, quote);

    return { value: decodeEntities(value, true), index: next };
  }

  let end = index;

  while (end < input.length && !isSpace(input[end]) && input[end] !== ">") {
    end++;
  }

  return { value: decodeEntities(input.slice(index, end), true), index: end };
}

function readAttributes(input, start) {
  const attributes = {};
  let index = start;
  let selfClosing = false;

  while (index < input.length) {
    const char = input[index];

    if (char === ">") {
      return { attributes, index: index + 1, closed: true, selfClosing };
    }

    if (char === "/") {
      selfClosing = input[index + 1] === ">";
      index++;

      continue;
    }

    if (isSpace(char)) {
      index++;

      continue;
    }

    const nameStart = index;

    index++;

    while (index < input.length && !isSpace(input[index]) && !"=/>".includes(input[index])) {
      index++;
    }

    const name = toAsciiLower(input.slice(nameStart, index));

    while (isSpace(input[index])) {
      index++;
    }

    let value = "";

    if (input[index] === "=") {
      index++;

      while (isSpace(input[index])) {
        index++;
      }

      const result = readAttributeValue(input, index);

      value = result.value;
      index = result.index;
    }

    setAttribute(attributes, name, value);
  }

  return { attributes, index, closed: false, selfClosing: false };
}

function readOpeningTag(input, index) {
  const { tag, index: tagEnd } = readTagName(input, index + 1);
  const { attributes, index: next, closed, selfClosing } = readAttributes(input, tagEnd);

  if (!closed) {
    return { token: null, index: next };
  }

  return { token: { type: "open", tag, attributes, selfClosing }, index: next };
}

function findClosingTag(input, start, tag) {
  let position = input.indexOf("</", start);

  while (position !== -1) {
    const nameEnd = position + 2 + tag.length;
    const boundary = input[nameEnd];

    if (
      toAsciiLower(input.slice(position + 2, nameEnd)) === tag &&
      (boundary === undefined || isNameEnd(boundary))
    ) {
      return position;
    }

    position = input.indexOf("</", position + 2);
  }

  return -1;
}

function readTextOnlyContent(input, index, tag) {
  const closeIndex = tag === "plaintext" ? -1 : findClosingTag(input, index, tag);
  const end = closeIndex === -1 ? input.length : closeIndex;
  const raw = input.slice(index, end);
  const value = DECODED_TEXT_TAGS.has(tag) ? decodeEntities(raw) : raw;

  return {
    token: value === "" ? null : { type: "text", value, newline: raw.startsWith("\n") },
    index: end,
  };
}

function isMarkupStart(input, index) {
  const next = input[index + 1];

  return input[index] === "<" && (
    isLetter(next) ||
    next === "!" ||
    next === "?" ||
    next === "/"
  );
}

function readText(input, index) {
  let end = input.indexOf("<", index + 1);

  while (end !== -1 && !isMarkupStart(input, end)) {
    end = input.indexOf("<", end + 1);
  }

  if (end === -1) {
    end = input.length;
  }

  return {
    token: {
      type: "text",
      value: decodeEntities(input.slice(index, end)),
      newline: input[index] === "\n",
    },
    index: end,
  };
}

function digitValue(char) {
  return Number.parseInt(char, 16);
}

function codePointToString(code) {
  if (code === 0 || code > MAX_CODE_POINT || (code >= 0xD800 && code <= 0xDFFF)) {
    return "\uFFFD";
  }

  return String.fromCodePoint(WINDOWS_1252.get(code) ?? code);
}

function readNumericReference(text, start) {
  const isHex = text[start] === "x" || text[start] === "X";
  const radix = isHex ? 16 : 10;
  const digitsStart = isHex ? start + 1 : start;
  let end = digitsStart;
  let code = 0;

  while (end < text.length && digitValue(text[end]) < radix) {
    code = Math.min(code * radix + digitValue(text[end]), MAX_CODE_POINT + 1);
    end++;
  }

  if (end === digitsStart) {
    return null;
  }

  return { value: codePointToString(code), end: text[end] === ";" ? end + 1 : end };
}

function readNamedReference(text, start, inAttribute) {
  let end = start;

  while (
    end < text.length &&
    end - start < MAX_ENTITY_LENGTH &&
    (isLetter(text[end]) || isDigit(text[end]))
  ) {
    end++;
  }

  if (end === start) {
    return null;
  }

  if (text[end] === ";") {
    const value = NAMED_ENTITIES.get(text.slice(start, end));

    if (value !== undefined) {
      return { value, end: end + 1 };
    }
  }

  for (let length = Math.min(end - start, MAX_LEGACY_ENTITY_LENGTH); length >= 2; length--) {
    const name = text.slice(start, start + length);

    if (LEGACY_ENTITIES.has(name)) {
      const next = text[start + length];

      if (inAttribute && (next === "=" || isLetter(next) || isDigit(next))) {
        return null;
      }

      return { value: NAMED_ENTITIES.get(name), end: start + length };
    }
  }

  return null;
}

function readReference(text, start, inAttribute) {
  if (text[start] === "#") {
    return readNumericReference(text, start + 1);
  }

  return readNamedReference(text, start, inAttribute);
}

function decodeEntities(text, inAttribute = false) {
  let ampersand = text.indexOf("&");

  if (ampersand === -1) {
    return text;
  }

  let result = "";
  let copied = 0;

  while (ampersand !== -1) {
    const reference = readReference(text, ampersand + 1, inAttribute);

    if (reference === null) {
      ampersand = text.indexOf("&", ampersand + 1);
    } else {
      result += text.slice(copied, ampersand) + reference.value;
      copied = reference.end;
      ampersand = text.indexOf("&", copied);
    }
  }

  return result + text.slice(copied);
}

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    let result;

    if (input.startsWith("<!--", i)) {
      result = readComment(input, i);
    } else if (input.startsWith("<!", i) || input.startsWith("<?", i)) {
      result = readDeclaration(input, i);
    } else if (input.startsWith("</", i) && isLetter(input[i + 2])) {
      result = readClosingTag(input, i);
    } else if (input.startsWith("</", i)) {
      result = readInvalidClosingTag(input, i);
    } else if (input[i] === "<" && isLetter(input[i + 1])) {
      result = readOpeningTag(input, i);
    } else {
      result = readText(input, i);
    }

    i = result.index;

    if (!result.token) {
      continue;
    }

    tokens.push(result.token);

    if (result.token.type === "open" && isTextOnly(result.token.tag)) {
      const content = readTextOnlyContent(input, i, result.token.tag);

      i = content.index;

      if (content.token) {
        tokens.push(content.token);
      }
    }
  }

  return tokens;
}

function currentNode(stack) {
  return stack[stack.length - 1];
}

function appendText(parent, value) {
  const last = parent.children[parent.children.length - 1];

  if (last?.type === "text") {
    last.value += value;
  } else {
    parent.children.push({ type: "text", value });
  }
}

function closeHeadForText(stack, value) {
  if (currentNode(stack).tag === "head" && !isWhitespaceOnly(value)) {
    stack.pop();
  }
}

function makeElementNode(token) {
  return {
    type: "element",
    tag: token.tag,
    attributes: token.attributes,
    children: [],
  };
}

function makeTruncatedNode(token) {
  return {
    type: TRUNCATED_TYPE,
    tag: token.tag,
    reason: TRUNCATED_REASON_DEPTH,
  };
}

function closeUpTo(stack, rule) {
  let target = -1;

  for (let i = stack.length - 1; i >= 1; i--) {
    const tag = stack[i].tag;

    if (rule.closes.includes(tag)) {
      target = i;
    } else if (rule.stops.includes(tag)) {
      break;
    }
  }

  if (target !== -1) {
    stack.length = target;
  }
}

function closeImpliedElements(stack, tag) {
  if (currentNode(stack).tag === "head" && !HEAD_CONTENT_TAGS.has(tag)) {
    stack.pop();
  }

  if (HEADINGS.has(tag) && HEADINGS.has(currentNode(stack).tag)) {
    stack.pop();
  }

  if (CLOSES_P.has(tag)) {
    closeUpTo(stack, PARAGRAPH_RULE);
  }

  const rule = IMPLIED_END_TAGS.get(tag);

  if (rule) {
    closeUpTo(stack, rule);
  }
}

function mergeIntoOpenElement(stack, token) {
  if (!DOCUMENT_TAGS.has(token.tag)) {
    return false;
  }

  const existing = stack.find((node) => node.tag === token.tag);

  if (!existing) {
    return false;
  }

  for (const [name, value] of Object.entries(token.attributes)) {
    setAttribute(existing.attributes, name, value);
  }

  return true;
}

function isStrayDocumentTag(stack, tag) {
  if (tag !== "html" && tag !== "head" && tag !== "body") {
    return false;
  }

  let parent = currentNode(stack);

  if (tag === "body" && parent.tag === "head") {
    parent = stack[stack.length - 2];
  }

  if (tag === "html") {
    return parent.tag !== ROOT_TAG;
  }

  if (parent.tag !== ROOT_TAG && parent.tag !== "html") {
    return true;
  }

  const hasHead = parent.children.some((child) => child.type === "element" && child.tag === "head");
  const hasBody = parent.children.some((child) => child.type === "element" && child.tag === "body");

  return tag === "head" ? hasHead || hasBody : hasBody;
}

function foreignNamespace(token, parentNamespace) {
  if (FOREIGN_ROOTS.has(token.tag)) {
    return token.tag;
  }

  return FOREIGN_ROOTS.has(parentNamespace) ? parentNamespace : undefined;
}

function containerNamespace(token, namespace) {
  const isHtmlIntegration = namespace === "svg" && token.tag === "foreignobject";

  return isHtmlIntegration ? HTML_NAMESPACE : namespace;
}

function adjustForeignToken(token, namespace) {
  const attributeCase = namespace === "svg" ? SVG_ATTRIBUTE_CASE : MATH_ATTRIBUTE_CASE;
  const attributes = {};

  for (const [name, value] of Object.entries(token.attributes)) {
    setAttribute(attributes, attributeCase.get(name) ?? name, value);
  }

  const tag = namespace === "svg" ? SVG_TAG_CASE.get(token.tag) ?? token.tag : token.tag;

  return { tag, attributes };
}

function lastSkippedNamespace(skipped) {
  return skipped.namespaces[skipped.namespaces.length - 1];
}

function skipElement(skipped, token, namespace) {
  const key = skipKey(token.tag);

  skipped.order.push(key);
  skipped.namespaces.push(containerNamespace(token, namespace));
  skipped.counts.set(key, (skipped.counts.get(key) ?? 0) + 1);
}

function clearSkipped(skipped) {
  skipped.order.length = 0;
  skipped.namespaces.length = 0;
  skipped.counts.clear();
}

function handleOpen(state, token) {
  const { stack, skipped, foreign } = state;
  const skipping = skipped.order.length > 0;

  if (!skipping) {
    if (mergeIntoOpenElement(stack, token)) {
      return;
    }

    if (isStrayDocumentTag(stack, token.tag)) {
      return;
    }

    closeImpliedElements(stack, token.tag);
  }

  const parent = currentNode(stack);
  const parentNamespace = skipping ? lastSkippedNamespace(skipped) : foreign.get(parent);
  const namespace = foreignNamespace(token, parentNamespace);
  const isLeaf = VOID.has(token.tag) || (token.selfClosing && namespace !== undefined);

  if (skipping && isLeaf) {
    return;
  }

  if (!isLeaf && stack.length >= MAX_STACK_DEPTH) {
    if (!skipping) {
      parent.children.push(makeTruncatedNode(token));
    }

    skipElement(skipped, token, namespace);

    return;
  }

  const node = makeElementNode(namespace ? adjustForeignToken(token, namespace) : token);

  parent.children.push(node);

  if (isLeaf) {
    return;
  }

  if (namespace) {
    foreign.set(node, containerNamespace(token, namespace));
  }

  stack.push(node);
  state.stripNewline = PRESERVE_WHITESPACE_TAGS.has(token.tag);
}

function handleUnmatchedClose(state, token) {
  if (state.skipped.order.length > 0 || !RECOVERABLE_CLOSE_TAGS.has(token.tag)) {
    return;
  }

  currentNode(state.stack).children.push(
    makeElementNode({ tag: token.tag, attributes: {} }),
  );
}

function isSameElement(nodeTag, closeTag) {
  return (
    nodeTag === closeTag ||
    (HEADINGS.has(nodeTag) && HEADINGS.has(closeTag)) ||
    SVG_TAG_CASE.get(closeTag) === nodeTag
  );
}

function handleClose(state, token) {
  const { stack, skipped } = state;
  const key = skipKey(token.tag);

  if (skipped.counts.get(key) > 0) {
    let popped;

    do {
      popped = skipped.order.pop();
      skipped.namespaces.pop();
      skipped.counts.set(popped, skipped.counts.get(popped) - 1);
    } while (popped !== key);

    return;
  }

  if (DOCUMENT_TAGS.has(token.tag)) {
    return;
  }

  const boundaries = TABLE_SCOPE_TAGS.has(token.tag) ? TABLE_SCOPE_BOUNDARIES : SCOPE_BOUNDARIES;

  for (let i = stack.length - 1; i >= 1; i--) {
    if (isSameElement(stack[i].tag, token.tag)) {
      stack.length = i;

      if (skipped.order.length > 0) {
        clearSkipped(skipped);
      }

      return;
    }

    if (boundaries.has(stack[i].tag)) {
      break;
    }
  }

  handleUnmatchedClose(state, token);
}

function buildTree(tokens) {
  const root = {
    type: "element",
    tag: ROOT_TAG,
    attributes: {},
    children: [],
  };

  const state = {
    stack: [root],
    skipped: { order: [], namespaces: [], counts: new Map() },
    foreign: new WeakMap(),
    stripNewline: false,
  };

  for (const token of tokens) {
    const strip = state.stripNewline;

    state.stripNewline = false;

    switch (token.type) {
      case "text": {
        if (state.skipped.order.length > 0) {
          break;
        }

        const value = strip && token.newline ? token.value.slice(1) : token.value;

        if (value === "") {
          break;
        }

        closeHeadForText(state.stack, value);
        appendText(currentNode(state.stack), value);
        break;
      }
      case "open":
        handleOpen(state, token);
        break;
      case "close":
        handleClose(state, token);
        break;
      default:
        if (state.skipped.order.length === 0) {
          currentNode(state.stack).children.push(token);
        }
    }
  }

  return root;
}

function findNeighbor(siblings, index, step) {
  let position = index + step;

  while (siblings[position]?.type === "comment" || siblings[position]?.type === "doctype") {
    position += step;
  }

  return siblings[position];
}

function trimsAgainst(sibling, edgeIsBlock) {
  if (sibling === undefined) {
    return edgeIsBlock;
  }

  return sibling.type === "element" && BLOCK_TAGS.has(sibling.tag);
}

function collapseText(node) {
  const siblings = node.children;
  const edgeIsBlock = node.tag === ROOT_TAG || BLOCK_TAGS.has(node.tag);
  const result = [];

  siblings.forEach((child, index) => {
    if (child.type !== "text") {
      result.push(child);

      return;
    }

    let value = child.value.replace(WHITESPACE_RUN, " ");

    if (value.startsWith(" ") && trimsAgainst(findNeighbor(siblings, index, -1), edgeIsBlock)) {
      value = value.slice(1);
    }

    if (value.endsWith(" ") && trimsAgainst(findNeighbor(siblings, index, 1), edgeIsBlock)) {
      value = value.slice(0, -1);
    }

    const previous = findNeighbor(result, result.length, -1);

    if (previous?.type === "text" && previous.value.endsWith(" ") && value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (value !== "") {
      result.push({ type: "text", value });
    }
  });

  return result;
}

function normalizeChildren(node) {
  if (RAW_CONTENT_TAGS.has(node.tag)) {
    return node.children.filter((child) => !(child.type === "text" && isWhitespaceOnly(child.value)));
  }

  return collapseText(node);
}

function normalizeText(root) {
  const pending = [{ node: root, preserve: false }];

  while (pending.length > 0) {
    const { node, preserve } = pending.pop();
    const keep = preserve || PRESERVE_WHITESPACE_TAGS.has(node.tag);

    if (!keep) {
      node.children = normalizeChildren(node);
    }

    for (const child of node.children) {
      if (child.type === "element") {
        pending.push({ node: child, preserve: keep });
      }
    }
  }
}

function normalizeInput(input) {
  const withoutBom = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;

  return withoutBom.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function html2json(input) {
  if (typeof input !== "string") {
    return [];
  }

  try {
    const root = buildTree(tokenize(normalizeInput(input)));

    normalizeText(root);

    return root.children;
  } catch (error) {
    console.error("html2json failed:", error);

    return [];
  }
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;

  document.getElementById("html").value = htmlExample;
  convertHtml2JsonAndSet();
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;

  document.getElementById("html").value = htmlExample;
  convertHtml2JsonAndSet();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { html2json };
}