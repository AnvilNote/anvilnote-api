// plain-note
// A Typst template that mimics the look of the cwTeX 5 guide
// (classic LaTeX/cwTeX `article`): Latin Modern + Ming serif body, justified
// text, a centered title block, a two-column table of contents, colored
// cross-references, and centered page numbers.
//
// This file is intentionally structured like a reusable project template:
// - Public entry macros are documented and stable.
// - Internal helpers are kept private by convention.
// - Styling is centralized through a configuration dictionary.
//
// Usage example:
//   #import "template.typ": plain-note, note-callout, hypersetup
//
//   #show: hypersetup.with(pdftitle: "Plain Note")
//   #show: plain-note.with(
//     title: "Plain Note",
//     author: "Anthony",
//     date: datetime.today().display("[year]-[month]-[day]"),
//   )
//
//   == Introduction
//   This note uses the plain-note template.

// Returns the default style configuration for the plain-note template.
//
// Users may override any field by passing `config:` into `plain-note`.
#let plain-note-config(
  // Title uses the rounded cwTeX Q Yuan face, with Roboto for any Latin glyphs.
  title-font: "cwTeX Q Yuan",
  title-fallback-font: "Roboto",
  // Body: New Computer Modern (the maintained Computer Modern / Latin Modern
  // successor that ships in the renderer font pool) with a Ming serif for CJK.
  body-font: "New Computer Modern",
  cjk-font: "cwTeX Q Ming",
  code-font: "CMU Typewriter Text",
  // Headings: Roboto (regular) with cwTeX Q Yuan for CJK.
  heading-2-font: "Roboto",
  heading-2-cjk-font: "cwTeX Q Yuan",
  page-paper: "a4",
  margin-top: 1.5in,
  margin-bottom: 1in,
  margin-left: 1.5in,
  margin-right: 1.5in,
  title-size: 16pt,
  heading-2-size: 14pt,
  heading-3-size: 13pt,
  heading-4-size: 12pt,
  body-size: 12pt,
  small-size: 10pt,
  // Distance between consecutive lines of text (Typst `leading`).
  line-spacing: 1.2em,
  // Vertical space between paragraphs.
  paragraph-spacing: 1em,
  first-indent: 2em,
  text-color: rgb("#1f2328"),
  muted-color: rgb("#6b7280"),
  accent-color: rgb("#111827"),
  // Color for the table of contents entries.
  toc-color: rgb("#0000ff"),
  // Font for the page numbers in the table of contents. Liberation Serif is
  // metric-compatible with Times New Roman (same glyph widths/line height)
  // but OFL-1.1 licensed, so it can be bundled and redistributed freely.
  toc-page-font: "Liberation Serif",
  rule-color: rgb("#d1d5db"),
  callout-fill: rgb("#f5f5f4"),
  callout-stroke: rgb("#d6d3d1"),
  // Fallback faces for scripts that are neither Latin nor Chinese (Japanese
  // kana, Korean hangul, Thai…). Headings reach for a sans family, body text
  // for a serif family, so the title/body contrast is kept across languages.
  sans-langs: ("Noto Sans JP", "Noto Sans KR", "Noto Sans Thai", "Noto Sans"),
  serif-langs: ("Noto Serif JP", "Noto Serif KR", "Noto Serif Thai", "Noto Serif"),
) = (
  title-font: title-font,
  title-fallback-font: title-fallback-font,
  body-font: body-font,
  cjk-font: cjk-font,
  code-font: code-font,
  heading-2-font: heading-2-font,
  heading-2-cjk-font: heading-2-cjk-font,
  page-paper: page-paper,
  margin-top: margin-top,
  margin-bottom: margin-bottom,
  margin-left: margin-left,
  margin-right: margin-right,
  title-size: title-size,
  heading-2-size: heading-2-size,
  heading-3-size: heading-3-size,
  heading-4-size: heading-4-size,
  body-size: body-size,
  small-size: small-size,
  line-spacing: line-spacing,
  paragraph-spacing: paragraph-spacing,
  first-indent: first-indent,
  text-color: text-color,
  muted-color: muted-color,
  accent-color: accent-color,
  toc-color: toc-color,
  toc-page-font: toc-page-font,
  rule-color: rule-color,
  callout-fill: callout-fill,
  callout-stroke: callout-stroke,
  sans-langs: sans-langs,
  serif-langs: serif-langs,
)

// Merges user configuration into the default plain-note configuration.
#let _merge-config(config) = plain-note-config() + config

// Heading numbering function. The visible structure starts at `==` (level 2),
// so the level-1 slot is always 0; this strips those leading zeros to produce
// `1`, `1.1`, `1.1.1` instead of `0.1`, `0.1.1`.
#let _heading-numbering(..parts) = {
  let nums = parts.pos()
  while nums.len() > 1 and nums.first() == 0 {
    nums = nums.slice(1)
  }
  nums.map(str).join(".")
}

// Public link/metadata setup, modeled on LaTeX's `\hypersetup`.
//
// Apply it BEFORE `plain-note` so the PDF metadata is set before any content:
//   #show: hypersetup.with(colorlinks: true, linkcolor: blue, pdftitle: "...")
//   #show: plain-note.with(...)
//
// Parameters:
// - `colorlinks`: master switch for coloring links and references.
// - `linkcolor`: internal links and cross-references (`@label`, `link(<l>)`).
// - `filecolor`: links to local files (string targets without `://`).
// - `urlcolor`:  external URLs (string targets containing `://`).
// - `pdftitle`, `pdfauthor`, `pdfkeywords`: written into the PDF metadata.
// - `pdfpagemode`: accepted for API parity with LaTeX, but Typst's PDF export
//   has no viewer page-mode control, so it currently has no effect.
#let hypersetup(
  colorlinks: true,
  linkcolor: rgb("#0000ff"),
  filecolor: rgb("#0000ff"),
  urlcolor: rgb("#0000ff"),
  pdftitle: none,
  pdfauthor: (),
  pdfkeywords: (),
  pdfpagemode: none,
  body,
) = {
  // Must run before any content is emitted, hence apply hypersetup first.
  set document(title: pdftitle, author: pdfauthor, keywords: pdfkeywords)

  show ref: it => if colorlinks { text(fill: linkcolor, it) } else { it }
  show link: it => {
    if not colorlinks {
      it
    } else {
      let dest = it.dest
      let color = if type(dest) == str {
        if dest.contains("://") { urlcolor } else { filecolor }
      } else {
        linkcolor
      }
      text(fill: color, it)
    }
  }

  body
}

// Draws the centered title block, in the style of a LaTeX `\maketitle`.
#let _title-block(
  cfg,
  title: none,
  author: none,
  date: none,
) = {
  if title == none and author == none and date == none {
    return
  }

  v(0.5em)

  if title != none {
    align(center, text(
      font: (cfg.title-font, cfg.title-fallback-font) + cfg.sans-langs,
      fallback: true,
      fill: cfg.text-color,
      size: cfg.title-size,
      title,
    ))
  }

  if author != none {
    v(0.9em)
    align(center, text(
      font: (cfg.body-font, cfg.cjk-font) + cfg.serif-langs,
      fallback: true,
      fill: cfg.text-color,
      size: cfg.body-size,
      author,
    ))
  }

  if date != none {
    v(0.3em)
    align(center, text(
      font: (cfg.body-font, cfg.cjk-font) + cfg.serif-langs,
      fallback: true,
      fill: cfg.text-color,
      size: cfg.body-size,
      date,
    ))
  }

  v(1.4em)
}

// Public section heading helper for note-style documents.
//
// This is useful when the user prefers function-style section calls instead of
// Typst's built-in heading markup.
#let note-section(title) = block[
  #text(
    font: (
      "Roboto",
      "cwTeX Q Yuan",
    ),
    fallback: true,
    fill: rgb("#111827"),
    size: 14pt,
    title,
  )
  #v(0.45em)
]

// Public subsection heading helper for smaller breaks inside notes.
#let note-subsection(title) = block[
  #text(
    font: (
      "Roboto",
      "cwTeX Q Yuan",
    ),
    fallback: true,
    fill: rgb("#1f2937"),
    size: 13pt,
    title,
  )
  #v(0.3em)
]

// Public callout box helper, modeled on Obsidian's callout types.
//
// Usage:
//   #note-callout(kind: "tip", title: "提示")[body…]
//   #note-callout[body…]                 // "note" type, no title
//
// `kind` selects the colour scheme (accent bar + background fill); aliases such
// as "summary", "hint", "warn" map onto their canonical type. When `title` is
// given it is rendered above the body in the accent colour using cwTeX Q Hei.
#let _callout-palette = (
  note:     (accent: rgb("#3882FF"), bg: rgb("#E5ECF8")),
  abstract: (accent: rgb("#00AAFF"), bg: rgb("#DEF0F8")),
  info:     (accent: rgb("#03B5D2"), bg: rgb("#DEF1F4")),
  tip:      (accent: rgb("#00BBA0"), bg: rgb("#DEF1EF")),
  success:  (accent: rgb("#00C549"), bg: rgb("#DEF2E6")),
  question: (accent: rgb("#58DB06"), bg: rgb("#E8F5E0")),
  warning:  (accent: rgb("#FF8B00"), bg: rgb("#F8EDDE")),
  failure:  (accent: rgb("#FF4747"), bg: rgb("#F8E6E6")),
  danger:   (accent: rgb("#FF0838"), bg: rgb("#F8E0E5")),
  bug:      (accent: rgb("#F5004D"), bg: rgb("#F7DEE7")),
  example:  (accent: rgb("#7441FF"), bg: rgb("#EBE6F8")),
  quote:    (accent: rgb("#989998"), bg: rgb("#EEEEEE")),
)

// Alias → canonical type name.
#let _callout-aliases = (
  summary: "abstract", tldr: "abstract",
  todo: "info",
  hint: "tip", important: "tip",
  check: "success", done: "success",
  help: "question", faq: "question",
  caution: "warning", attention: "warning", warn: "warning",
  fail: "failure", missing: "failure",
  error: "danger",
  cite: "quote",
)

#let callout(body, kind: "note", title: none) = {
  let key = _callout-aliases.at(lower(kind), default: lower(kind))
  let style = _callout-palette.at(key, default: _callout-palette.note)

  block(
    fill: style.bg,
    stroke: (left: 3pt + style.accent),
    // Tighten the top padding when a title is present so the title sits a
    // little higher against the top edge.
    inset: (top: if title != none { 7pt } else { 10pt }, bottom: 10pt, x: 10pt),
    width: 100%,
    {
      if title != none {
        block(
          below: 0.7em,
          text(font: "cwTeX Q Hei", fill: style.accent, size: 1.05em, title),
        )
      }
      body
    },
  )
}

// Backward-compatible alias for the original name.
#let note-callout = callout

// --- Tables -----------------------------------------------------------------
// Two table modes, both with a bold cwTeX Q Hei header row:
//   #ntable(columns: 2, header: ([A], [B]), [a], [b], ...)   // full ruled grid
//   #ttable(columns: 2, header: ([A], [B]), [a], [b], ...)   // 三線表 (booktabs)

#let _hei-cell(c) = text(font: "cwTeX Q Hei", c)

// Normal table: full ruled grid, bold header.
#let ntable(columns: auto, header: (), align: left + horizon, ..body) = table(
  columns: columns,
  inset: (x: 0.6em, y: 0.45em),
  align: align,
  table.header(..header.map(_hei-cell)),
  ..body.pos(),
)

// Three-line (booktabs) table: horizontal rules only at the top, below the
// header, and at the bottom — no vertical or interior lines. Bold header.
#let ttable(columns: auto, header: (), align: left + horizon, ..body) = table(
  columns: columns,
  stroke: none,
  inset: (x: 0.7em, y: 0.5em),
  align: align,
  table.hline(stroke: 1pt),
  table.header(..header.map(_hei-cell)),
  table.hline(stroke: 0.5pt),
  ..body.pos(),
  table.hline(stroke: 1pt),
)

// Public document template for plain-note.
//
// This macro is designed to be used with `#show: plain-note.with(...)`.
// It applies page setup, typography, heading styling, a title block, and an
// optional table of contents.
//
// Parameters:
// - `title`, `author`, `date`: metadata rendered above the body.
// - `toc`: whether to print a two-column table of contents (default true).
// - `config`: dictionary overrides merged onto `plain-note-config()`.
// - `body`: the document body injected by Typst's show rule.
//
// Link coloring and PDF metadata are handled by `hypersetup`, which should be
// applied before this template.
//
// Heading rules in this template are intentionally mapped like this:
// - `==` -> level 2 -> `1` style numbering at 14pt
// - `===` -> level 3 -> `1.1` style numbering at 13pt
// - `====` -> level 4 -> `1.1.1` style numbering at 12pt
#let plain-note(
  title: none,
  author: none,
  date: none,
  toc: true,
  config: (:),
  body,
) = {
  let cfg = _merge-config(config)
  let show-outline = toc

  set page(
    paper: cfg.page-paper,
    margin: (
      top: cfg.margin-top,
      bottom: cfg.margin-bottom,
      left: cfg.margin-left,
      right: cfg.margin-right,
    ),
    numbering: "1",
    number-align: center + bottom,
  )

  set par(
    justify: true,
    leading: cfg.line-spacing,
    spacing: cfg.paragraph-spacing,
    // First-line indent for every paragraph except the first one after a
    // heading, following LaTeX `article` convention.
    first-line-indent: (amount: cfg.first-indent, all: false),
  )

  set text(
    font: (
      cfg.body-font,
      cfg.cjk-font,
    ) + cfg.serif-langs + (cfg.code-font,),
    fallback: true,
    fill: cfg.text-color,
    size: cfg.body-size,
    lang: "en",
  )

  show raw: set text(font: (cfg.code-font, cfg.cjk-font))

  // Display (block) equations get 1em of space above and below the body text.
  show math.equation.where(block: true): set block(spacing: 1em)

  // Lists (both bulleted/unnumbered and numbered/enumerate) get 1em of space
  // above and below the surrounding body text.
  show list: it => block(above: 1em, below: 1em, it)
  show enum: it => block(above: 1em, below: 1em, it)

  // Figures and tables: number as "圖 N" / "表 N". In the caption the label
  // ("圖 N" / "表 N") is set in cwTeX Q Yuan and the descriptive text in
  // cwTeX Q Ming. The same supplement drives cross-references (@label → 圖 N).
  show figure.where(kind: image): set figure(supplement: [圖])
  show figure.where(kind: table): set figure(supplement: [表])
  show figure.caption: it => context {
    text(font: "cwTeX Q Yuan", fill: cfg.text-color)[#it.supplement #it.counter.display(it.numbering)]
    text(font: "cwTeX Q Ming", fill: cfg.text-color)[#h(0.4em)#it.body]
  }

  set heading(numbering: _heading-numbering)

  // Shared heading renderer: Roboto regular, manual gap between number and title.
  let styled-heading(it, size, before, after) = {
    v(before, weak: true)
    context {
      let nums = counter(heading).at(it.location())
      block(text(
        font: (cfg.heading-2-font, cfg.heading-2-cjk-font) + cfg.sans-langs,
        fallback: true,
        fill: cfg.text-color,
        size: size,
        weight: "regular",
        [#numbering(_heading-numbering, ..nums)#h(0.6em)#it.body],
      ))
    }
    v(after, weak: true)
  }

  show heading.where(level: 2): it => styled-heading(it, cfg.heading-2-size, 1.0em, 1em)
  show heading.where(level: 3): it => styled-heading(it, cfg.heading-3-size, 0.8em, 1em)
  show heading.where(level: 4): it => styled-heading(it, cfg.heading-4-size, 0.6em, 1em)

  _title-block(
    cfg,
    title: title,
    author: author,
    date: date,
  )

  if show-outline {
    // Table of contents. Stays a single column while short; only splits into
    // two columns — breaking every 25 entries — once it exceeds 25 lines.
    context {
      let entries = query(heading).filter(it => it.outlined)
      let render-entry(hd) = {
        let nums = counter(heading).at(hd.location())
        let pg = counter(page).at(hd.location()).first()
        block(spacing: 1.2em, {
          set text(fill: cfg.toc-color)
          link(hd.location(), {
            h((hd.level - 2) * 1.4em)
            text(
              font: (cfg.heading-2-font, cfg.heading-2-cjk-font) + cfg.sans-langs,
              [#numbering(_heading-numbering, ..nums)#h(0.5em)#hd.body],
            )
            box(width: 1fr, inset: (x: 0.4em), repeat[.])
            text(font: cfg.toc-page-font, [#pg])
          })
        })
      }
      if entries.len() <= 25 {
        for hd in entries { render-entry(hd) }
      } else {
        columns(2, {
          for (i, hd) in entries.enumerate() {
            if i > 0 and calc.rem(i, 25) == 0 { colbreak() }
            render-entry(hd)
          }
        })
      }
    }
    v(1.2em)
  }

  body
}
