# html2json

`html2json(input)` converts an HTML string into a JSON-friendly array of nodes. It is implemented in plain JavaScript in `html2json.js` and does **not** use a DOM parser (no `DOMParser`, `innerHTML`, `document.createElement`, etc.). Everything is done by a hand-written tokenizer and tree builder.

## How to run

1. Open `index.html` in a browser.
2. Paste HTML into the left textarea (or use the two example buttons) and press **Convert to JSON**.
3. The result appears in the right textarea.

The function can also be called directly: `html2json("<p>Hello</p>")` returns an array of nodes.

## Tests

```
node test.js
```

`test.js` needs only Node.js (no dependencies) and `html2json.js` / `html_samples/` next to it. It exits with code 0 when everything passes and prints `N passed, M failed`. It checks four groups:

1. **Exact output cases** - about 60 small inputs (omitted end tags, entities, attributes, comments, raw text, whitespace, SVG, malformed input, ...) compared with the exact expected JSON. Each case must also finish without anything written to `console.error`.
2. **Invalid arguments** - `undefined`, `null`, numbers, objects, arrays and booleans must return `[]` without errors.
3. **Depth and size** - 5000 nested `div` elements (a `truncated` node must appear and the depth must stay bounded, and the result must be serializable), 100000 unclosed `span` elements, 200000 `<` characters and 200000 `&` characters (no crash, finished in under 2 seconds).
4. **Sample files** - every file in `html_samples/` must be processed without errors, the result must be serializable, and non-empty input must produce at least one node. `24_deep_nesting.html` and `25_deep_unclosed.html` must additionally contain a `truncated` node.

## Output format

The function returns an **array of top-level nodes**. A node is one of:

| `type`      | Fields                                  | Notes                                                    |
|-------------|-----------------------------------------|----------------------------------------------------------|
| `element`   | `tag`, `attributes`, `children`         | `attributes` is an object `{ name: value }`              |
| `text`      | `value`                                 | Entities decoded, whitespace collapsed (see below)       |
| `comment`   | `value`                                 | Comment text without `<!--` and `-->`                    |
| `doctype`   | `value`                                 | Text after `<!DOCTYPE`, e.g. `html`                      |
| `truncated` | `tag`, `reason`                         | Placeholder for elements nested deeper than the limit    |

Invalid input never throws: if something unexpected happens, `html2json` logs the error and returns `[]`. A non-string argument also returns `[]`.

## Approach

The work is split into small stages:

1. **Normalization** - strips a BOM and converts `\r\n` / `\r` to `\n`.
2. **Tokenizer** - walks the string once and produces tokens: `open`, `close`, `text`, `comment`, `doctype`. It handles quoted / unquoted / duplicate attributes, comments (including `<!-->`, `<!--->`, `--!>`), bogus comments (`<?...>`, `<![CDATA[...]]>`), and raw-text elements.
3. **Entity decoding** - named entities (with and without `;` for the legacy ones), decimal and hex numeric references, Windows-1252 remapping for `&#128;`-`&#159;`, and replacement of invalid code points with U+FFFD. In attributes, legacy entities without `;` followed by `=` or an alphanumeric character are left as is (as browsers do).
4. **Tree builder** - uses a stack of open elements and applies HTML-like recovery rules for real-world markup.
5. **Whitespace normalization** - collapses whitespace runs in text and trims whitespace next to block-level elements.

The tree builder and tokenizer are iterative (no recursion), so very deep documents cannot overflow the call stack.

## Edge cases that are handled

- **Omitted end tags**: `p`, `li`, `dt`, `dd`, `td`, `th`, `tr`, `thead`/`tbody`/`tfoot`, `caption`, `colgroup`, `option`, `optgroup`.
- **Void elements**: `br`, `img`, `input`, `meta`, `link`, `hr`, ... never get children; `<br/>` and `<br>` are equivalent.
- **Unmatched and stray end tags**: ignored, except `</p>` and `</br>`, which create an empty element like browsers do.
- **Raw text elements**: `script`, `style`, `xmp`, `iframe`, `noembed`, `noframes`, `plaintext` keep their content as text; `textarea` and `title` keep text but decode entities.
- **Whitespace-sensitive elements**: `pre`, `textarea`, `listing` keep whitespace; the first newline right after the opening tag is dropped.
- **Duplicate attributes**: the first one wins. Attribute names such as `__proto__` or `constructor` are stored safely (own properties, not prototype access).
- **Document structure**: repeated `<html>` / `<body>` / `<head>` tags are merged or ignored; `</html>` and `</body>` do not stop the parsing of later content.
- **SVG and MathML**: case-sensitive tag and attribute names are restored (`viewBox`, `linearGradient`, `foreignObject`, ...), self-closing syntax works inside them, and `foreignObject` content is parsed as HTML.
- **Unfinished input**: unclosed comments, unclosed tags at the end of input, a lone `<`, a lone `</`, empty input and whitespace-only input.
- **Large and deep input**: nesting deeper than 512 levels is cut and replaced by a `truncated` node instead of crashing; large documents are processed in linear time.
- **Unicode**: any text, attribute and tag names containing non-ASCII characters.

## Depth limit and `truncated` nodes

The tree builder keeps at most 512 open elements. This is the same limit that Chromium uses for its HTML parser, and it protects the rest of the pipeline: `JSON.stringify` (used by `index.html`) and any recursive consumer of the result would overflow the call stack on a tree that is thousands of levels deep.

When an element would exceed the limit, it is replaced by a node `{ "type": "truncated", "tag": "...", "reason": "max-depth" }`. The whole content of that element (its text, comments and descendants) is dropped on purpose: attaching it to a shallower parent would silently change the structure of the document, while an explicit marker tells the consumer that something was cut. Parsing continues normally after the truncated element is closed, so content after it is not lost.

## Known limitations

- The goal is *browser-like* behaviour for common and broken markup, not a full implementation of the HTML5 parsing specification.
- Misnested formatting elements (`<b><i></b></i>`) are not repaired with the full "adoption agency" algorithm, so the resulting tree can differ from a browser's.
- No implicit `<tbody>` insertion and no "foster parenting" of content placed directly inside `<table>`.
- No implicit `<html>`, `<head>` or `<body>` elements are created when they are absent in the input.
- Only a subset of named entities is supported (Latin-1, Greek, common punctuation, arrows, math symbols and similar). Unknown entities are left as written.
- `<template>`, `<noscript>` and similar elements are parsed as ordinary elements.
- A `<!doctype>` in the middle of a document stays a `doctype` node, while browsers ignore it.
- A NUL character in text is not replaced with U+FFFD.
- A `<body>` tag that appears after content such as `<p>` (without an implicit body) is dropped together with its attributes (see `13_document_structure.html`).
- `<![CDATA[...]]>` inside SVG or MathML becomes a comment, while browsers treat it as character data there.
- Content inside a `truncated` element is dropped (see the section above).

## Design notes

- All helper functions (`isSpace`, `tokenize`, `buildTree`, ...) live in the global scope when the file is loaded with a `<script>` tag. This is a deliberate trade-off: `convertHtml2JsonAndSet`, `showExample1` and `showExample2` must be global because `index.html` calls them from `onclick` attributes, and a single plain script file keeps the project free of a build step. In Node.js the file only exports `html2json`.
- The tree builder uses an explicit stack instead of recursion, so depth never depends on the JavaScript call stack.
- For duplicate attributes the first one wins, as in browsers.
- `</p>` without an open `p` creates an empty `p`, and `</br>` creates a `br`, because browsers do the same.
- Full "adoption agency" handling of misnested formatting elements is not implemented: it needs the list of active formatting elements and is much larger than the rest of the parser, so the simpler stack rules were chosen.

## Samples

`html_samples/` contains the inputs used to exercise the function. They are plain HTML text files:

| File                              | What it covers                                                  |
|-----------------------------------|-----------------------------------------------------------------|
| `01_basic_page.html`              | Typical full page                                               |
| `02_lists_omitted_end_tags.html`  | Lists, definition lists, `p`, `select` without end tags         |
| `03_tables.html`                  | Tables with omitted end tags, nested tables, no `tbody`         |
| `04_void_and_selfclosing.html`    | Void elements and self-closing syntax                           |
| `05_entities.html`                | Named, numeric, invalid and attribute entities                  |
| `06_attributes.html`              | Quoting styles, duplicates, odd attribute syntax                |
| `07_comments_doctype_cdata.html`  | Comments, doctype variants, CDATA, processing instructions      |
| `08_raw_text_script_style.html`   | `script`, `style`, `xmp`, `iframe`, unclosed `script`           |
| `09_whitespace_pre_textarea.html` | Whitespace collapsing, `pre`, `listing`, `textarea`             |
| `10_svg_math.html`                | SVG, MathML, `foreignObject`                                    |
| `11_malformed_unclosed.html`      | Unclosed and stray tags                                         |
| `12_misnested_formatting.html`    | Misnested formatting tags                                       |
| `13_document_structure.html`      | Duplicate `html`/`head`/`body`, content after `</html>`         |
| `14_text_only.html`               | Text without tags                                               |
| `15_empty_file.html`              | Empty input                                                     |
| `16_whitespace_only.html`         | Whitespace-only input                                           |
| `17_unicode.html`                 | Cyrillic, emoji, CJK, Arabic, unicode tag/attribute names       |
| `18_eof_cases.html`               | Unclosed comment at the end                                     |
| `19_eof_unclosed_tag.html`        | Unclosed tag at the end                                         |
| `20_eof_misc.html`                | No trailing newline                                             |
| `21_single_characters.html`       | A single `<`                                                    |
| `22_closing_tag_only.html`        | A single closing tag                                            |
| `23_nasty_inputs.html`            | Many broken constructs in one file (odd attributes, `<!>`, `</`, `plaintext`) |
| `24_deep_nesting.html`            | 600 nested `div` elements (above the 512 limit, `truncated`)    |
| `25_deep_unclosed.html`           | 700 unclosed `span` elements (above the 512 limit, `truncated`) |
| `26_large_document.html`          | About 950 KB: 10 000 list items and 3 000 table rows            |
| `27_unclosed_attribute_quote.html`| Attribute quote that is never closed                            |

## AI usage

See `ai_help/ai_usage_note.txt`.