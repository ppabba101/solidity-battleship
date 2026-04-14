"""
generate.py — builds battleship-zk-demo.pptx via python-pptx.

Usage:
    python3 generate.py

Output:
    battleship-zk-demo.pptx  (same directory as this script)

Design system
-------------
Background:   #0A0F1A  (near-black navy)
Surface:      #1B2942  (elevated panels)
Hairline:     #273449
Primary text: #F8FAFC
Secondary:    #94A3B8
Accent:       #F97316  (orange)
Secondary accent: #38BDF8 (cyan)
Warning:      #F87171  (soft red)

Typography:   Inter (body) / JetBrains Mono (code), with OS fallbacks
Hero:         72pt bold
Slide title:  36pt bold
Eyebrow:      11pt tracked-out small-caps secondary
Body:         20-24pt
"""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
BG          = RGBColor(0x0A, 0x0F, 0x1A)
SURFACE     = RGBColor(0x1B, 0x29, 0x42)
SURFACE_HI  = RGBColor(0x22, 0x33, 0x52)
HAIRLINE    = RGBColor(0x27, 0x34, 0x49)
TEXT        = RGBColor(0xF8, 0xFA, 0xFC)
MUTED       = RGBColor(0x94, 0xA3, 0xB8)
ORANGE      = RGBColor(0xF9, 0x73, 0x16)
CYAN        = RGBColor(0x38, 0xBD, 0xF8)
WARN        = RGBColor(0xF8, 0x71, 0x71)
GOOD        = RGBColor(0x4A, 0xDE, 0x80)
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)

# ---------------------------------------------------------------------------
# Typography
# ---------------------------------------------------------------------------
BODY_FONT = "Inter"          # fallback: Helvetica Neue → Calibri
CODE_FONT = "JetBrains Mono" # fallback: Menlo → Consolas

# ---------------------------------------------------------------------------
# Canvas
# ---------------------------------------------------------------------------
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN  = Inches(0.6)
TOTAL_SLIDES = 8

# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def new_prs() -> Presentation:
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def blank_slide(prs: Presentation, bg=BG):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    # Solid background fill covering the whole canvas
    bgrect = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    bgrect.line.fill.background()
    bgrect.fill.solid()
    bgrect.fill.fore_color.rgb = bg
    return slide


def add_rect(slide, left, top, width, height,
             fill_color=None, line_color=None, line_width=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    if fill_color is not None:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if line_color is not None:
        shape.line.color.rgb = line_color
        if line_width is not None:
            shape.line.width = line_width
    else:
        shape.line.fill.background()
    return shape


def add_round_rect(slide, left, top, width, height,
                   fill_color=None, line_color=None, line_width=None,
                   corner=0.12):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    # python-pptx rounded-rect corner adjustment
    try:
        shape.adjustments[0] = corner
    except Exception:
        pass
    if fill_color is not None:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if line_color is not None:
        shape.line.color.rgb = line_color
        if line_width is not None:
            shape.line.width = line_width
    else:
        shape.line.fill.background()
    return shape


def add_oval(slide, left, top, width, height, fill_color=None, line_color=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, width, height)
    if fill_color is not None:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if line_color is not None:
        shape.line.color.rgb = line_color
    else:
        shape.line.fill.background()
    return shape


def add_text(slide, left, top, width, height, text,
             font=BODY_FONT, size=18, bold=False, color=TEXT,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             tracking=0):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    if tracking:
        # Character spacing via XML attribute (hundredths of a point)
        from pptx.oxml.ns import qn
        rPr = run._r.get_or_add_rPr()
        rPr.set("spc", str(tracking))
    return tb, tf


# ---------------------------------------------------------------------------
# Chrome: wordmark, eyebrow, title, progress bar
# ---------------------------------------------------------------------------

def add_wordmark(slide):
    """Bottom-left wordmark: battleship.zk"""
    tb = slide.shapes.add_textbox(MARGIN, Inches(7.0), Inches(3.0), Inches(0.3))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    r1 = p.add_run()
    r1.text = "battleship"
    r1.font.name = CODE_FONT
    r1.font.size = Pt(10)
    r1.font.color.rgb = MUTED
    r1.font.bold = False
    r2 = p.add_run()
    r2.text = ".zk"
    r2.font.name = CODE_FONT
    r2.font.size = Pt(10)
    r2.font.color.rgb = ORANGE
    r2.font.bold = True


def add_progress_bar(slide, n, total=TOTAL_SLIDES):
    """Slim bottom progress bar with N/total filled in orange."""
    bar_top = Inches(7.35)
    bar_h   = Pt(3)
    bar_l   = MARGIN
    bar_w   = SLIDE_W - MARGIN * 2
    # Track
    add_rect(slide, bar_l, bar_top, bar_w, bar_h, fill_color=HAIRLINE)
    # Fill
    frac = n / total
    add_rect(slide, bar_l, bar_top, Emu(int(bar_w * frac)), bar_h, fill_color=ORANGE)
    # Slide counter on the right
    add_text(
        slide,
        SLIDE_W - MARGIN - Inches(1.2), Inches(7.0),
        Inches(1.2), Inches(0.3),
        f"{n:02d} / {total:02d}",
        font=CODE_FONT, size=10, color=MUTED, align=PP_ALIGN.RIGHT,
    )


def add_eyebrow(slide, text, top=Inches(0.9)):
    """Small-caps tracked-out eyebrow label above a title."""
    add_text(
        slide,
        MARGIN, top, Inches(12.0), Inches(0.35),
        text.upper(),
        font=BODY_FONT, size=11, bold=True, color=CYAN,
        tracking=300,  # ~3pt tracked out
    )


def add_title(slide, text, top=Inches(1.25)):
    """Slide title — 36pt bold white."""
    add_text(
        slide,
        MARGIN, top, Inches(12.0), Inches(0.9),
        text,
        font=BODY_FONT, size=36, bold=True, color=TEXT,
    )


def add_rule(slide, top=Inches(2.1), width=Inches(1.1)):
    """Short orange accent rule."""
    add_rect(slide, MARGIN, top, width, Pt(3), fill_color=ORANGE)


def chrome(slide, n, eyebrow=None, title=None):
    """Apply standard non-title-slide chrome."""
    if eyebrow:
        add_eyebrow(slide, eyebrow)
    if title:
        add_title(slide, title)
        add_rule(slide)
    add_wordmark(slide)
    add_progress_bar(slide, n)


# ---------------------------------------------------------------------------
# Flow-diagram helpers
# ---------------------------------------------------------------------------

def add_flow_station(slide, left, top, width, height,
                     glyph, title, subtitle,
                     fill=SURFACE, border=HAIRLINE, glyph_color=ORANGE):
    add_round_rect(slide, left, top, width, height,
                   fill_color=fill, line_color=border, line_width=Pt(1),
                   corner=0.22)
    # Glyph (3-letter) top-left
    add_text(
        slide, left + Inches(0.15), top + Inches(0.1),
        Inches(1.2), Inches(0.35),
        glyph,
        font=CODE_FONT, size=11, bold=True, color=glyph_color,
        tracking=150,
    )
    # Title
    add_text(
        slide, left + Inches(0.15), top + Inches(0.45),
        width - Inches(0.3), Inches(0.45),
        title,
        font=BODY_FONT, size=15, bold=True, color=TEXT,
    )
    # Subtitle (monospace, one line, truncated)
    add_text(
        slide, left + Inches(0.15), top + Inches(0.92),
        width - Inches(0.3), Inches(0.35),
        subtitle,
        font=CODE_FONT, size=9, bold=False, color=MUTED,
    )


def add_arrow(slide, x1, y1, x2, y2, color=ORANGE):
    conn = slide.shapes.add_connector(2, x1, y1, x2, y2)  # STRAIGHT
    conn.line.color.rgb = color
    conn.line.width = Pt(1.75)
    # Arrow end
    line_elem = conn.line._get_or_add_ln()
    from pptx.oxml.ns import qn
    from lxml import etree
    tailEnd = etree.SubElement(line_elem, qn("a:tailEnd"))
    tailEnd.set("type", "triangle")
    tailEnd.set("w", "med")
    tailEnd.set("h", "med")
    return conn


# ---------------------------------------------------------------------------
# Speaker notes
# ---------------------------------------------------------------------------

def set_notes(slide, notes_text: str):
    tf = slide.notes_slide.notes_text_frame
    tf.text = notes_text


# ---------------------------------------------------------------------------
# Slide 1 — Title
# ---------------------------------------------------------------------------

def slide_1_title(prs):
    slide = blank_slide(prs)

    # Ambient orange accent bar (left edge)
    add_rect(slide, 0, 0, Inches(0.18), SLIDE_H, fill_color=ORANGE)

    # Eyebrow
    add_text(
        slide,
        Inches(0.9), Inches(1.35),
        Inches(12.0), Inches(0.35),
        "A ZERO-KNOWLEDGE DEMO  \u2022  BLOCKCHAIN CLUB",
        font=BODY_FONT, size=12, bold=True, color=CYAN, tracking=350,
    )

    # Hero line 1 — "Battleship,"
    add_text(
        slide,
        Inches(0.85), Inches(1.95),
        Inches(12.0), Inches(1.8),
        "Battleship,",
        font=BODY_FONT, size=72, bold=True, color=TEXT,
    )
    # Hero line 2 — "proven."
    add_text(
        slide,
        Inches(0.85), Inches(3.25),
        Inches(12.0), Inches(1.8),
        "proven.",
        font=BODY_FONT, size=72, bold=True, color=ORANGE,
    )

    # Subtitle
    add_text(
        slide,
        Inches(0.9), Inches(4.85),
        Inches(12.0), Inches(0.5),
        "Eight minutes on how a single zk-SNARK turns a game of hidden state into a trustless one.",
        font=BODY_FONT, size=18, bold=False, color=MUTED,
    )

    # Presenter chip (pill) bottom
    chip_w = Inches(4.6)
    chip_h = Inches(0.55)
    chip_l = Inches(0.85)
    chip_t = Inches(6.0)
    add_round_rect(slide, chip_l, chip_t, chip_w, chip_h,
                   fill_color=SURFACE, line_color=HAIRLINE,
                   line_width=Pt(0.75), corner=0.5)
    # Orange dot
    add_oval(slide, chip_l + Inches(0.22), chip_t + Inches(0.2),
             Inches(0.15), Inches(0.15), fill_color=ORANGE)
    add_text(
        slide,
        chip_l + Inches(0.48), chip_t + Inches(0.12),
        chip_w - Inches(0.6), chip_h,
        "PRESENTER A    \u00b7    PRESENTER B",
        font=BODY_FONT, size=11, bold=True, color=TEXT, tracking=200,
    )

    # Tiny monospace signature bottom-right
    add_text(
        slide,
        SLIDE_W - MARGIN - Inches(4.0), Inches(6.12),
        Inches(4.0), Inches(0.3),
        "noir \u2192 ultraplonk \u2192 solidity",
        font=CODE_FONT, size=11, bold=False, color=MUTED,
        align=PP_ALIGN.RIGHT,
    )

    # Progress bar only (no wordmark on title)
    add_progress_bar(slide, 1)

    notes = """\
[Presenter A]
Welcome, everyone. What you're about to see is Battleship — the classic two-player board game — \
reimagined with zero-knowledge proofs. My name is Presenter A, and I'll be walking you through \
the problem we set out to solve. In about eight minutes, you'll understand why a cryptographic \
commitment alone isn't enough to make this game trustworthy, and how a single zk-SNARK changes \
everything. By the end we'll show you a live demo running entirely in the browser.

[Presenter B]
And I'm Presenter B. I'll take over for the technical deep-dive and the architecture walkthrough. \
Let's get started.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 2 — Problem (pull quote)
# ---------------------------------------------------------------------------

def slide_2_problem(prs):
    slide = blank_slide(prs)
    chrome(slide, 2, eyebrow="01  \u00b7  The Problem", title="A game built on hidden state.")

    # Large orange quotation mark
    add_text(
        slide,
        MARGIN, Inches(2.6),
        Inches(1.2), Inches(2.0),
        "\u201C",
        font=BODY_FONT, size=180, bold=True, color=ORANGE,
    )

    # Pull quote — broken into two lines for tight control
    tb = slide.shapes.add_textbox(Inches(1.9), Inches(3.05),
                                  Inches(10.9), Inches(2.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate([
        "How do you prove your board",
        "is legal\u2014without revealing it?",
    ]):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(0)
        r = p.add_run()
        r.text = line
        r.font.name = BODY_FONT
        r.font.size = Pt(42)
        r.font.bold = True
        r.font.color.rgb = TEXT if i == 0 else ORANGE

    # Attribution line
    add_text(
        slide,
        Inches(1.9), Inches(5.55),
        Inches(10.9), Inches(0.4),
        "\u2014 the central cryptographic puzzle",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
    )

    notes = """\
[Presenter A]
At its core, Battleship is a game of hidden information. You place your ships on a private board \
and your opponent can't see them. But here's the problem: in a digital implementation, how does \
your opponent know you placed ships at all? You could claim every shot is a miss, never admit a \
hit, and coast to victory. The rules don't enforce themselves. We need a way to commit to a \
board\u2014prove it's a legal fleet\u2014without showing anyone where the ships actually are. \
That's the central cryptographic puzzle we're solving.

[Presenter B]
Exactly. And the naive solution\u2014Merkle trees\u2014turns out to be insufficient. I'll show you why \
on the next slide.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 3 — Why Merkle Isn't Enough (two columns)
# ---------------------------------------------------------------------------

def slide_3_merkle(prs):
    slide = blank_slide(prs)
    chrome(slide, 3, eyebrow="02  \u00b7  Commitment schemes", title="Why Merkle isn't enough.")

    col_top = Inches(2.55)
    col_h   = Inches(3.7)
    gap     = Inches(0.4)
    col_w   = (SLIDE_W - MARGIN * 2 - gap) / 2

    # --- Left column: what Merkle proves ---
    left_l = MARGIN
    add_round_rect(slide, left_l, col_top, col_w, col_h,
                   fill_color=SURFACE, line_color=HAIRLINE,
                   line_width=Pt(1), corner=0.08)
    add_text(
        slide, left_l + Inches(0.4), col_top + Inches(0.3),
        col_w - Inches(0.8), Inches(0.4),
        "WHAT MERKLE PROVES",
        font=BODY_FONT, size=11, bold=True, color=CYAN, tracking=250,
    )
    add_text(
        slide, left_l + Inches(0.4), col_top + Inches(0.7),
        col_w - Inches(0.8), Inches(0.55),
        "Commitment \u2713",
        font=BODY_FONT, size=24, bold=True, color=TEXT,
    )
    left_bullets = [
        ("\u2713", "You committed to some 100 values."),
        ("\u2713", "You can't change them later."),
        ("\u2713", "You can reveal any single cell."),
    ]
    _draw_bullets(slide, left_bullets, left_l + Inches(0.4),
                  col_top + Inches(1.55), col_w - Inches(0.8),
                  mark_color=GOOD, text_color=TEXT)

    # --- Right column: what Merkle can't prove ---
    right_l = left_l + col_w + gap
    add_round_rect(slide, right_l, col_top, col_w, col_h,
                   fill_color=RGBColor(0x2A, 0x18, 0x20),
                   line_color=RGBColor(0x5A, 0x29, 0x33),
                   line_width=Pt(1), corner=0.08)
    add_text(
        slide, right_l + Inches(0.4), col_top + Inches(0.3),
        col_w - Inches(0.8), Inches(0.4),
        "WHAT MERKLE CAN'T PROVE",
        font=BODY_FONT, size=11, bold=True, color=WARN, tracking=250,
    )
    add_text(
        slide, right_l + Inches(0.4), col_top + Inches(0.7),
        col_w - Inches(0.8), Inches(0.55),
        "Constraints \u2717",
        font=BODY_FONT, size=24, bold=True, color=WARN,
    )
    right_bullets = [
        ("\u2717", "That those values form a legal fleet."),
        ("\u2717", "No overlaps, no diagonals, correct shapes."),
        ("\u2717", "Deferred reveal catches cheaters too late."),
    ]
    _draw_bullets(slide, right_bullets, right_l + Inches(0.4),
                  col_top + Inches(1.55), col_w - Inches(0.8),
                  mark_color=WARN, text_color=TEXT)

    # Exploit callout
    callout_t = Inches(6.45)
    add_rect(slide, MARGIN, callout_t, Inches(0.06), Inches(0.45),
             fill_color=ORANGE)
    add_text(
        slide, MARGIN + Inches(0.2), callout_t - Inches(0.02),
        Inches(12.0), Inches(0.55),
        "Exploit  \u2192  commit an empty board, answer 'miss' forever, win.",
        font=CODE_FONT, size=12, bold=False, color=MUTED,
    )

    notes = """\
[Presenter A]
A Merkle tree lets you commit to a set of values and later prove membership. It sounds perfect\u2014 \
put your board in a Merkle tree, hand over the root. But here's the fatal flaw: the Merkle root \
proves you committed to *some* set of values. It does not prove those values constitute a legal \
fleet. An attacker commits to an all-empty 10-by-10 grid. That's a perfectly valid Merkle tree. \
They respond "miss" to every single shot. At game end, you'd need to verify the reveal\u2014but by \
then the game is already over and the attacker has "won." The deferred-reveal path that was \
supposed to catch cheaters is essentially dead code in our original contract\u2014both branches of \
the legality check assigned the same winner.

[Presenter B]
So the whole deferred-reveal scheme is theatre. We need validity proven *upfront*, before a \
single shot is fired. That's what zero-knowledge SNARKs give us.
"""
    set_notes(slide, notes)
    return slide


def _draw_bullets(slide, bullets, left, top, width,
                  mark_color=ORANGE, text_color=TEXT):
    """Helper: draw a stack of (mark, text) bullet rows."""
    row_h = Inches(0.6)
    for i, (mark, text) in enumerate(bullets):
        y = top + row_h * i
        add_text(
            slide, left, y, Inches(0.4), Inches(0.45),
            mark,
            font=BODY_FONT, size=18, bold=True, color=mark_color,
        )
        add_text(
            slide, left + Inches(0.45), y, width - Inches(0.45), Inches(0.5),
            text,
            font=BODY_FONT, size=16, bold=False, color=text_color,
        )


# ---------------------------------------------------------------------------
# Slide 4 — Enter zk-SNARKs (2x2 tile grid)
# ---------------------------------------------------------------------------

def slide_4_zksnarks(prs):
    slide = blank_slide(prs)
    chrome(slide, 4, eyebrow="03  \u00b7  The primitive", title="Enter zk-SNARKs.")

    grid_top = Inches(2.55)
    grid_h   = Inches(3.9)
    gap      = Inches(0.3)
    tile_w   = (SLIDE_W - MARGIN * 2 - gap) / 2
    tile_h   = (grid_h - gap) / 2

    tiles = [
        ("\u03BB", "Expressive predicates",
         "Prove 'my board has exactly 1\u00d75, 1\u00d74, 2\u00d73, 1\u00d72.'"),
        ("\u03C0", "Succinct proof",
         "A single blob of bytes. Constant-size, fast to verify."),
        ("#",     "No trusted setup",
         "UltraPlonk\u2014no ceremony, no toxic waste."),
        ("\u2713", "On-chain verify",
         "\u2248250k gas. Solidity verifier auto-generated by Noir."),
    ]

    for i, (glyph, title, body) in enumerate(tiles):
        row, col = divmod(i, 2)
        x = MARGIN + (tile_w + gap) * col
        y = grid_top + (tile_h + gap) * row
        add_round_rect(slide, x, y, tile_w, tile_h,
                       fill_color=SURFACE, line_color=HAIRLINE,
                       line_width=Pt(1), corner=0.1)
        # Glyph — big orange character top-left
        add_text(
            slide, x + Inches(0.35), y + Inches(0.18),
            Inches(1.0), Inches(0.9),
            glyph,
            font=BODY_FONT, size=44, bold=True, color=ORANGE,
        )
        # Title
        add_text(
            slide, x + Inches(1.35), y + Inches(0.32),
            tile_w - Inches(1.6), Inches(0.5),
            title,
            font=BODY_FONT, size=20, bold=True, color=TEXT,
        )
        # Body
        add_text(
            slide, x + Inches(1.35), y + Inches(0.82),
            tile_w - Inches(1.6), Inches(0.8),
            body,
            font=BODY_FONT, size=13, bold=False, color=MUTED,
        )

    notes = """\
[Presenter B]
This is where Noir comes in. Noir is a Rust-inspired domain-specific language for writing \
zero-knowledge circuits. We wrote a circuit that takes your 100 private board cells plus some \
random salts, and proves\u2014without revealing anything\u2014that those cells form exactly one carrier, \
one battleship, two cruisers, and one destroyer: 17 occupied cells, no overlaps, no diagonals, \
nothing out of bounds. The proof is a single blob of bytes that the on-chain verifier checks for \
around 250,000 gas. Critically, Noir's UltraPlonk backend requires no trusted setup ceremony. \
That's a big deal for a demo narrative: you never have to explain why you trust the setup.

[Presenter A]
And the proof is generated right in the browser using the @aztec/bb.js WASM prover. No server, \
no backend, no cheating.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 5 — System Architecture (flow diagram)
# ---------------------------------------------------------------------------

def slide_5_architecture(prs):
    slide = blank_slide(prs)
    chrome(slide, 5, eyebrow="04  \u00b7  Stack", title="System architecture.")

    # 6 stations in a horizontal flow
    stations = [
        ("BRD", "Board",            "private[100]"),
        ("PSD", "Poseidon",         "hash \u2192 commit"),
        ("NOR", "Noir circuit",     "board_validity"),
        ("UPL", "UltraPlonk",       "proof \u03C0"),
        ("VER", "Verifier",         "HonkVerifier.sol"),
        ("GME", "BattleshipGame",   "settle on-chain"),
    ]

    # Layout: 6 rounded tiles across 12.133 in usable width
    usable_w = SLIDE_W - MARGIN * 2
    tile_w   = Inches(1.85)
    tile_h   = Inches(1.4)
    n = len(stations)
    gap_w    = (usable_w - tile_w * n) / (n - 1)
    row_y    = Inches(2.75)

    centers = []
    for i, (glyph, title, sub) in enumerate(stations):
        x = MARGIN + (tile_w + gap_w) * i
        add_flow_station(slide, x, row_y, tile_w, tile_h, glyph, title, sub)
        centers.append((x, x + tile_w, row_y + tile_h / 2))

    # Arrows between stations (small gap arrows)
    for i in range(n - 1):
        _, x_end_prev, cy = centers[i]
        x_start_next, _, _ = centers[i + 1]
        y = int(cy)
        # Inset arrows slightly for breathing room
        add_arrow(
            slide,
            x_end_prev + Emu(20000), y,
            x_start_next - Emu(20000), y,
            color=ORANGE,
        )

    # Caption row under the flow
    cap_top = row_y + tile_h + Inches(0.45)
    add_text(
        slide, MARGIN, cap_top, usable_w, Inches(0.35),
        "BROWSER  \u2192  WASM PROVER  \u2192  NOIR  \u2192  BACKEND  \u2192  CHAIN",
        font=BODY_FONT, size=10, bold=True, color=MUTED, tracking=250,
        align=PP_ALIGN.CENTER,
    )

    # Three bullets below
    bul_top = Inches(5.55)
    bullets = [
        ("\u25CF", "Browser proves, chain verifies", CYAN),
        ("\u25CF", "Burner wallets, zero popups",    ORANGE),
        ("\u25CF", "Local Anvil for instant demo",   GOOD),
    ]
    col_w_b = usable_w / 3
    for i, (dot, text, color) in enumerate(bullets):
        x = MARGIN + col_w_b * i
        add_text(
            slide, x, bul_top, Inches(0.3), Inches(0.35),
            dot,
            font=BODY_FONT, size=14, bold=True, color=color,
        )
        add_text(
            slide, x + Inches(0.3), bul_top - Inches(0.02),
            col_w_b - Inches(0.3), Inches(0.4),
            text,
            font=BODY_FONT, size=14, bold=False, color=TEXT,
        )

    notes = """\
[Presenter B]
Let me walk you through the data flow. A player opens the React app in their browser. When they \
click Ready, bb.js\u2014Aztec's WASM-compiled Barretenberg prover\u2014runs the Noir board-validity \
circuit locally. That produces a proof, which is sent as calldata to BattleshipGame.sol on a local \
Anvil chain. The contract calls the Noir-generated Solidity verifier, which either accepts or \
rejects the proof on-chain. Every shot response goes through the same pipeline with the \
shot-response circuit. Nothing trusts the frontend\u2014every claim is verified by the contract.

[Presenter A]
Two burner wallets derived from Anvil's deterministic test keys mean no MetaMask popups, no \
wallet switching, no friction. It's genuinely a one-laptop, two-player demo.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 6 — Live Demo (typographically dominant)
# ---------------------------------------------------------------------------

def slide_6_demo(prs):
    slide = blank_slide(prs)

    # Top eyebrow
    add_text(
        slide, MARGIN, Inches(0.9),
        Inches(12.0), Inches(0.35),
        "05  \u00b7  SWITCH TO THE BROWSER",
        font=BODY_FONT, size=11, bold=True, color=CYAN, tracking=350,
    )

    # Huge "LIVE DEMO" centered
    add_text(
        slide, Inches(0.0), Inches(2.25),
        Inches(13.333), Inches(2.3),
        "\u25B6  LIVE DEMO",
        font=BODY_FONT, size=96, bold=True, color=ORANGE,
        align=PP_ALIGN.CENTER,
    )

    # Subtitle
    add_text(
        slide, Inches(0.0), Inches(4.65),
        Inches(13.333), Inches(0.55),
        "http://localhost:5173",
        font=CODE_FONT, size=20, bold=False, color=TEXT,
        align=PP_ALIGN.CENTER,
    )
    add_text(
        slide, Inches(0.0), Inches(5.15),
        Inches(13.333), Inches(0.45),
        "two burner wallets  \u00b7  one laptop  \u00b7  zero trust",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
        align=PP_ALIGN.CENTER, tracking=150,
    )

    add_wordmark(slide)
    add_progress_bar(slide, 6)

    notes = """\
[Presenter A]
Alright, let's see it in action. I'm opening the app now\u2014you can see both players' grids \
side-by-side. I'm dragging the carrier\u2014the five-cell ship\u2014onto the board here... rotating \
it with R... and dropping it. I'll place the rest quickly. Now I hit Ready. Watch the spinner: \
"Proving your board\u2026"\u2014this is the Noir circuit running in the browser right now.

[Presenter B]
And you can see the crypto log on the right: "Board legality proven in 4.2 seconds." That proof \
just landed on-chain. Player 2 does the same. Now we start shooting\u2014I'll click (3, 5) on the \
enemy grid. There's the pending pulse animation, and\u2014explosion! Hit confirmed on-chain. The \
proof for that shot response verified in under two seconds. Watch the sunk animation when the \
last cell of a ship goes down. This is cryptographic proof, running live.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 7 — What Was Proven (numbered rows)
# ---------------------------------------------------------------------------

def slide_7_proven(prs):
    slide = blank_slide(prs)
    chrome(slide, 7, eyebrow="06  \u00b7  Recap", title="What was proven.")

    items = [
        ("1", "Board legality",      "Before a single shot is fired."),
        ("2", "Every shot response", "Hit or miss, without revealing the board."),
        ("3", "Zero opponent trust", "No claim is taken at face value."),
        ("4", "Zero trusted setup",  "No ceremony, no toxic waste."),
    ]
    row_top = Inches(2.6)
    row_h   = Inches(0.95)
    circle  = Inches(0.7)

    for i, (num, title, body) in enumerate(items):
        y = row_top + row_h * i
        # Orange circle with white number
        add_oval(
            slide, MARGIN, y + Inches(0.02),
            circle, circle,
            fill_color=ORANGE,
        )
        add_text(
            slide, MARGIN, y + Inches(0.08),
            circle, Inches(0.6),
            num,
            font=BODY_FONT, size=24, bold=True, color=BG,
            align=PP_ALIGN.CENTER,
        )
        # Title
        add_text(
            slide, MARGIN + circle + Inches(0.3), y + Inches(0.02),
            Inches(5.5), Inches(0.5),
            title,
            font=BODY_FONT, size=22, bold=True, color=TEXT,
        )
        # Subtitle
        add_text(
            slide, MARGIN + circle + Inches(0.3), y + Inches(0.45),
            Inches(10.5), Inches(0.4),
            body,
            font=BODY_FONT, size=14, bold=False, color=MUTED,
        )

    notes = """\
[Presenter B]
Let me recap what the cryptography actually guaranteed during that demo. Before the first shot, \
each player produced a zk-SNARK proving their board contained exactly the standard fleet\u201417 \
cells, correct ship shapes, no overlaps. The contract rejected that proof or stored it; there was \
no way to cheat at commit time. Then, for every single shot, the responding player produced a \
second proof: 'given my committed board, the response to coordinate (x,y) is honestly hit or \
miss.' Neither player ever revealed their full board. The opponent's claims about hit and miss \
were not taken on trust\u2014they were verified by the Solidity contract on every response. And \
none of this required a trusted setup ceremony.

[Presenter A]
That's the full cryptographic story in four bullets. No trust, no reveal, no ceremony.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Slide 8 — What's Next / Q&A (60/40 split)
# ---------------------------------------------------------------------------

def slide_8_next(prs):
    slide = blank_slide(prs)
    chrome(slide, 8, eyebrow="07  \u00b7  Roadmap", title="What's next.")

    # Left column (60%)
    left_l = MARGIN
    col_top = Inches(2.55)
    left_w = Inches(6.6)

    steps = [
        ("01", "Mainnet deployment path",    "Solidity verifier is deploy-ready."),
        ("02", "Shot-response optimization", "Target <1s proving time."),
        ("03", "Multi-game lobby",           "Matchmaking + state routing."),
        ("04", "Tournament mode",            "Trustless brackets, auditable replays."),
    ]
    for i, (num, title, body) in enumerate(steps):
        y = col_top + Inches(0.95) * i
        add_text(
            slide, left_l, y, Inches(0.6), Inches(0.4),
            num,
            font=CODE_FONT, size=13, bold=True, color=ORANGE, tracking=150,
        )
        add_text(
            slide, left_l + Inches(0.7), y - Inches(0.03),
            left_w - Inches(0.7), Inches(0.45),
            title,
            font=BODY_FONT, size=18, bold=True, color=TEXT,
        )
        add_text(
            slide, left_l + Inches(0.7), y + Inches(0.38),
            left_w - Inches(0.7), Inches(0.4),
            body,
            font=BODY_FONT, size=12, bold=False, color=MUTED,
        )

    # Divider between columns
    div_x = Inches(7.55)
    add_rect(slide, div_x, Inches(2.55), Pt(1), Inches(3.9),
             fill_color=HAIRLINE)

    # Right column (40%): "Questions?"
    right_l = Inches(7.95)
    add_text(
        slide, right_l, Inches(2.6),
        Inches(5.0), Inches(0.4),
        "Q & A",
        font=BODY_FONT, size=11, bold=True, color=CYAN, tracking=350,
    )
    add_text(
        slide, right_l, Inches(3.1),
        Inches(5.2), Inches(2.0),
        "Questions?",
        font=BODY_FONT, size=60, bold=True, color=ORANGE,
    )
    add_text(
        slide, right_l, Inches(4.85),
        Inches(5.2), Inches(1.4),
        "Circuits, contracts, frontend\u2014 everything is open source.",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
    )
    add_text(
        slide, right_l, Inches(5.7),
        Inches(5.2), Inches(0.4),
        "github.com/\u2009battleship-zk",
        font=CODE_FONT, size=12, bold=False, color=TEXT,
    )

    notes = """\
[Presenter A]
So where does this go from here? The most obvious next step is a mainnet deployment path\u2014the \
verifier contract is already Solidity, so it's essentially a deploy script away from running on \
any EVM chain. We also want to optimize the shot-response circuit: right now proving time is a \
few seconds, but with constraint pruning and a faster proving key we can get that below one \
second. Longer term, a multi-game lobby and tournament mode would make this a real product\u2014 \
imagine trustless Battleship tournaments where every move is cryptographically auditable. \
That's the vision. Thank you for your time today.

[Presenter B]
We're happy to take questions\u2014on the circuits, the contract architecture, the frontend choices, \
or anything you saw in the demo. The code is all open source and we can point you to any part \
of the stack.
"""
    set_notes(slide, notes)
    return slide


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    out_path = Path(__file__).parent / "battleship-zk-demo.pptx"

    prs = new_prs()
    slide_1_title(prs)
    slide_2_problem(prs)
    slide_3_merkle(prs)
    slide_4_zksnarks(prs)
    slide_5_architecture(prs)
    slide_6_demo(prs)
    slide_7_proven(prs)
    slide_8_next(prs)

    prs.save(str(out_path))
    print(f"Saved: {out_path}  ({out_path.stat().st_size:,} bytes)")
    print("Fonts referenced by name: Inter (body), JetBrains Mono (code).")
    print("  Fallbacks: Helvetica Neue \u2192 Calibri (body), Menlo \u2192 Consolas (code).")


if __name__ == "__main__":
    main()
