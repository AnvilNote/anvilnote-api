// plain-note adapter.
//
// plain-note ships as a self-contained template package. The renderer only
// feeds it metadata and a small set of behavior toggles.
#import "upstream.typ": plain-note, hypersetup

#let anvil-template(meta: (:), options: (:), fonts: (:), body) = {
  let colorlinks = options.at("colorlinks", default: true)
  let link-color = if colorlinks {
    rgb(options.at("linkColor", default: "#0000ff"))
  } else {
    rgb("#1f2328")
  }
  show: hypersetup.with(
    colorlinks: colorlinks,
    linkcolor: link-color,
    filecolor: link-color,
    urlcolor: link-color,
    pdftitle: meta.at("title", default: none),
    pdfauthor: meta.at("author", default: ()),
  )
  show: plain-note.with(
    title: meta.at("title", default: none),
    author: meta.at("author", default: none),
    date: meta.at("date", default: none),
    toc: options.at("toc", default: true),
    // upstream's toc-color is independent of hypersetup's colorlinks (it
    // paints the TOC via a local `set text` before the link is drawn, so
    // colorlinks: false alone doesn't reach it) — wire it here so turning
    // off colored links also un-colors the table of contents, and so the
    // user's custom link color also applies to the table of contents.
    config: (toc-color: link-color),
  )
  body
}
