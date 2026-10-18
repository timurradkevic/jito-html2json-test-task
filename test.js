"use strict";

const fs = require("fs");
const path = require("path");

const { html2json } = require("./html2json.js");

const SAMPLES_DIR = path.join(__dirname, "html_samples");

const text = (value) => ({ type: "text", value });
const comment = (value) => ({ type: "comment", value });
const doctype = (value) => ({ type: "doctype", value });
const el = (tag, attributes = {}, children = []) => ({ type: "element", tag, attributes, children });

const CASES = [
  ["simple paragraph", "<p>Hello</p>", [el("p", {}, [text("Hello")])]],
  ["omitted </p>", "<p>one<p>two", [el("p", {}, [text("one")]), el("p", {}, [text("two")])]],
  ["omitted </li>", "<ul><li>a<li>b</ul>", [
    el("ul", {}, [el("li", {}, [text("a")]), el("li", {}, [text("b")])]),
  ]],
  ["void elements", "<br><br/>", [el("br"), el("br")]],
  ["attribute styles", "<div id=a class='b' data-x=\"c\" hidden>x</div>", [
    el("div", { id: "a", class: "b", "data-x": "c", hidden: "" }, [text("x")]),
  ]],
  ["duplicate attribute", "<a href=1 href=2>x</a>", [el("a", { href: "1" }, [text("x")])]],
  ["uppercase names", "<DIV CLASS=\"X\">y</DIV>", [el("div", { class: "X" }, [text("y")])]],
  ["__proto__ attribute", "<div __proto__=x>y</div>", [el("div", JSON.parse("{\"__proto__\":\"x\"}"), [text("y")])]],
  ["named and numeric entities", "<p>&amp; &lt; &copy; &#65; &#x41; &nbsp;</p>", [
    el("p", {}, [text("& < © A A  ")]),
  ]],
  ["legacy entity without semicolon", "<p>&copy 2026</p>", [el("p", {}, [text("© 2026")])]],
  ["legacy entity in attribute stays", "<a title=\"&copy=1\">x</a>", [el("a", { title: "&copy=1" }, [text("x")])]],
  ["invalid numeric entities", "<p>&#0;&#xD800;&#99999999999999999999;</p>", [
    el("p", {}, [text("���")]),
  ]],
  ["windows-1252 numeric entity", "<p>&#128;</p>", [el("p", {}, [text("€")])]],
  ["comment", "<!-- hi --><p>x</p>", [comment(" hi "), el("p", {}, [text("x")])]],
  ["empty comment forms", "<!-->a<!--->b<!---->c", [comment(""), text("a"), comment(""), text("b"), comment(""), text("c")]],
  ["comment ending with --!>", "<!-- a --!>", [comment(" a ")]],
  ["doctype", "<!DOCTYPE html><p>x</p>", [doctype("html"), el("p", {}, [text("x")])]],
  ["CDATA is a bogus comment", "<![CDATA[x]]>", [comment("[CDATA[x]]")]],
  ["processing instruction is a bogus comment", "<?php x ?>", [comment("?php x ?")]],
  ["script is raw text", "<script>if (a<b) {\"</p>\"}</script>", [el("script", {}, [text("if (a<b) {\"</p>\"}")])]],
  ["whitespace-only script", "<script>  </script>", [el("script")]],
  ["style is raw text", "<style>a > b { }</style>", [el("style", {}, [text("a > b { }")])]],
  ["xmp is raw text", "<xmp><b>x</b></xmp>", [el("xmp", {}, [text("<b>x</b>")])]],
  ["plaintext swallows the rest", "<plaintext><b>x", [el("plaintext", {}, [text("<b>x")])]],
  ["title decodes entities", "<title>a &amp; b</title>", [el("title", {}, [text("a & b")])]],
  ["textarea keeps whitespace, drops first newline", "<textarea>\n a  b</textarea>", [
    el("textarea", {}, [text(" a  b")]),
  ]],
  ["textarea decodes entities", "<textarea>&lt;b&gt;</textarea>", [el("textarea", {}, [text("<b>")])]],
  ["pre keeps whitespace, drops first newline", "<pre>\nx  y\n</pre>", [el("pre", {}, [text("x  y\n")])]],
  ["pre with CRLF", "<pre>\r\nx</pre>", [el("pre", {}, [text("x")])]],
  ["whitespace collapsing", "<p>  a   b  </p>", [el("p", {}, [text("a b")])]],
  ["whitespace around inline elements", "<p>a <b>b</b> c</p>", [
    el("p", {}, [text("a "), el("b", {}, [text("b")]), text(" c")]),
  ]],
  ["whitespace between inline siblings", "<span>a</span> <span>b</span>", [
    el("span", {}, [text("a")]), text(" "), el("span", {}, [text("b")]),
  ]],
  ["whitespace between blocks is dropped", "<p>a</p>\n<p>b</p>", [
    el("p", {}, [text("a")]), el("p", {}, [text("b")]),
  ]],
  ["unclosed elements", "<div><span>x", [el("div", {}, [el("span", {}, [text("x")])])]],
  ["stray closing tag", "</div><p>x</p>", [el("p", {}, [text("x")])]],
  ["stray </p> creates empty p", "</p>", [el("p")]],
  ["stray </br> creates br", "</br>", [el("br")]],
  ["table with omitted end tags", "<table><tr><td>a<td>b<tr><td>c</table>", [
    el("table", {}, [
      el("tr", {}, [el("td", {}, [text("a")]), el("td", {}, [text("b")])]),
      el("tr", {}, [el("td", {}, [text("c")])]),
    ]),
  ]],
  ["heading closes previous heading", "<h1>a<h2>b", [el("h1", {}, [text("a")]), el("h2", {}, [text("b")])]],
  ["mismatched heading end tag", "<h1>a</h3>b", [el("h1", {}, [text("a")]), text("b")]],
  ["nested links", "<a href=1>x<a href=2>y</a>", [
    el("a", { href: "1" }, [text("x")]), el("a", { href: "2" }, [text("y")]),
  ]],
  ["self-closing non-void tag stays open", "<p/>a", [el("p", {}, [text("a")])]],
  ["custom element", "<custom-element data-x=1>a</custom-element>", [
    el("custom-element", { "data-x": "1" }, [text("a")]),
  ]],
  ["non-ASCII tag name is text", "<привіт а=\"б\">я</привіт>", [text("<привіт а=\"б\">я"), comment("привіт")]],
  ["html and body", "<html a=1><body b=2>x</body></html>", [
    el("html", { a: "1" }, [el("body", { b: "2" }, [text("x")])]),
  ]],
  ["svg camel-case names", "<svg viewBox=\"0 0 1 1\"><linearGradient id=g /></svg>", [
    el("svg", { viewBox: "0 0 1 1" }, [el("linearGradient", { id: "g" })]),
  ]],
  ["svg foreignObject contains html", "<svg><foreignObject><p>x</p></foreignObject></svg>", [
    el("svg", {}, [el("foreignObject", {}, [el("p", {}, [text("x")])])]),
  ]],
  ["unclosed comment", "<p>a</p><!-- x", [el("p", {}, [text("a")]), comment(" x")]],
  ["unclosed tag at the end", "<p>a</p><div class=\"a", [el("p", {}, [text("a")])]],
  ["unclosed quote swallows the rest of the tag", "<p>a</p><a href=\"x>y</a><div>", [el("p", {}, [text("a")])]],
  ["empty unquoted attribute value", "<p class=>x</p>", [el("p", { class: "" }, [text("x")])]],
  ["space after equals sign", "<p class= >x</p>", [el("p", { class: "" }, [text("x")])]],
  ["equals signs as attribute name and value", "<div ===>x</div>", [el("div", { "=": "=" }, [text("x")])]],
  ["many slashes in a tag", "<div////>x</div>", [el("div", {}, [text("x")])]],
  ["slashes between attributes", "<div/ / /class=\"x\">y</div>", [el("div", { class: "x" }, [text("y")])]],
  ["lone <", "<", [text("<")]],
  ["< inside text", "<p>1 < 2</p>", [el("p", {}, [text("1 < 2")])]],
  ["empty input", "", []],
  ["whitespace-only input", "  \n\t ", []],
  ["text only", "just text", [text("just text")]],
  ["BOM is ignored", "﻿<p>x</p>", [el("p", {}, [text("x")])]],
];

const results = { passed: 0, failed: 0 };

function report(name, ok, details) {
  if (ok) {
    results.passed++;
    console.log(`  ok    ${name}`);

    return;
  }

  results.failed++;
  console.log(`  FAIL  ${name}`);

  if (details) {
    console.log(details);
  }
}

function withCapturedErrors(callback) {
  const original = console.error;
  const errors = [];

  console.error = (...args) => errors.push(args.join(" "));

  try {
    return { value: callback(), errors };
  } finally {
    console.error = original;
  }
}

function runExactCases() {
  console.log("\nExact output cases");

  for (const [name, input, expected] of CASES) {
    const { value: actual, errors } = withCapturedErrors(() => html2json(input));
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    const ok = actualJson === expectedJson && errors.length === 0;

    report(name, ok, `        input:    ${JSON.stringify(input)}\n        expected: ${expectedJson}\n        actual:   ${actualJson}`);
  }
}

function runInvalidArguments() {
  console.log("\nInvalid arguments");

  for (const value of [undefined, null, 42, {}, [], true]) {
    const { value: actual, errors } = withCapturedErrors(() => html2json(value));
    const ok = Array.isArray(actual) && actual.length === 0 && errors.length === 0;

    report(`argument ${String(JSON.stringify(value))}`, ok);
  }
}

function maxDepth(nodes) {
  let depth = 0;
  let level = nodes;

  while (level.length > 0) {
    depth++;
    level = level.flatMap((node) => node.children ?? []);
  }

  return depth;
}

function hasTruncatedNode(nodes) {
  let level = nodes;

  while (level.length > 0) {
    if (level.some((node) => node.type === "truncated")) {
      return true;
    }

    level = level.flatMap((node) => node.children ?? []);
  }

  return false;
}

function runDepthAndSize() {
  console.log("\nDepth and size");

  const deep = `${"<div>".repeat(5000)}x${"</div>".repeat(5000)}`;
  const deepResult = withCapturedErrors(() => html2json(deep));

  report(
    "5000 nested divs: no crash, truncated marker, bounded depth",
    deepResult.errors.length === 0 && hasTruncatedNode(deepResult.value) && maxDepth(deepResult.value) <= 600,
  );

  const deepSerialized = withCapturedErrors(() => JSON.stringify(deepResult.value, null, 2));

  report("deep result can be serialized", deepSerialized.errors.length === 0 && deepSerialized.value.length > 0);

  const unclosed = "<span>".repeat(100000);
  const unclosedResult = withCapturedErrors(() => html2json(unclosed));

  report("100000 unclosed spans: no crash", unclosedResult.errors.length === 0 && unclosedResult.value.length === 1);

  const lessThans = "<".repeat(200000);
  const start = Date.now();
  const lessThanResult = withCapturedErrors(() => html2json(lessThans));

  report(
    "200000 '<' characters: no crash, fast",
    lessThanResult.errors.length === 0 && Date.now() - start < 2000,
  );

  const ampersands = "&".repeat(200000) + "&#" + "9".repeat(100000);
  const ampStart = Date.now();
  const ampResult = withCapturedErrors(() => html2json(ampersands));

  report("200000 '&' characters: no crash, fast", ampResult.errors.length === 0 && Date.now() - ampStart < 2000);
}

const EXPECT_TRUNCATED = new Set(["24_deep_nesting.html", "25_deep_unclosed.html"]);

function runSamples() {
  console.log("\nSample files (no crash, serializable, not swallowed by the catch block)");

  if (!fs.existsSync(SAMPLES_DIR) || !fs.statSync(SAMPLES_DIR).isDirectory()) {
    report("html_samples folder exists", false, `        not found: ${SAMPLES_DIR}\n        Put the html_samples folder next to test.js (check that it is not nested like html_samples/html_samples).`);

    return;
  }

  const files = fs.readdirSync(SAMPLES_DIR).filter((file) => file.endsWith(".html")).sort();

  if (files.length === 0) {
    report("html_samples contains .html files", false, `        no .html files in ${SAMPLES_DIR}`);

    return;
  }

  for (const file of files) {
    const input = fs.readFileSync(path.join(SAMPLES_DIR, file), "utf8");
    const start = Date.now();
    const { value: result, errors } = withCapturedErrors(() => html2json(input));
    const elapsed = Date.now() - start;
    let serializable = true;

    try {
      JSON.stringify(result, null, 2);
    } catch {
      serializable = false;
    }

    const emptyAllowed = /^\s*(<\/[a-z]+>)?\s*$/i.test(input);
    const truncatedOk = !EXPECT_TRUNCATED.has(file) || hasTruncatedNode(result);
    const ok = Array.isArray(result) && errors.length === 0 && serializable && truncatedOk && (emptyAllowed || result.length > 0);

    const details = truncatedOk ? errors.join("\n") : "        expected a truncated node but none was found";

    report(`${file} (${elapsed} ms, ${result.length} top-level nodes)`, ok, details);
  }
}

runExactCases();
runInvalidArguments();
runDepthAndSize();
runSamples();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
process.exitCode = results.failed === 0 ? 0 : 1;