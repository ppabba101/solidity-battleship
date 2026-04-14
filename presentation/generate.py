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

Glyph policy
------------
We stick to ASCII and a small whitelist of unicode symbols with broad font
coverage across Inter / Helvetica Neue / Calibri / system defaults:

    ->          U+2192  right arrow
    *           bullet  (we use "-" instead)
    YES / NO    plain words instead of check/ballot

The play triangle U+25B6 is REPLACED with the text "LIVE DEMO ->" to
avoid glyph fallback boxes on default installs.
"""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree

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
BODY_FONT = "Inter"
CODE_FONT = "JetBrains Mono"

# ---------------------------------------------------------------------------
# Canvas
# ---------------------------------------------------------------------------
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN  = Inches(0.6)
TOTAL_SLIDES = 9

# Safe unicode we actually use
ARROW = "\u2192"   # ->  right arrow, nearly universal
MDASH = "\u2014"   # em dash
BULL  = "\u2022"   # bullet (middle dot is U+00B7 which also works)
MIDOT = "\u00b7"   # middle dot

# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def new_prs() -> Presentation:
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H
    # python-pptx defaults to type="screen4x3" even for 16:9 dimensions.
    # Google Slides / Goodnotes reject the mismatch; "custom" is safe for any size.
    sldSz = prs._element.find(qn("p:sldSz"))
    if sldSz is not None:
        sldSz.set("type", "custom")
    return prs


def blank_slide(prs: Presentation, bg=BG):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
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


def _apply_font_fallbacks(run, font_name: str):
    """Add ea/cs typeface references so Google Slides / Goodnotes can substitute
    the font gracefully when Inter or JetBrains Mono are unavailable.

    We also add panose/pitchFamily/charset attributes to the latin element so
    strict OOXML parsers (Google Slides, Goodnotes) can pick a good substitute
    from system fonts rather than erroring out.

    Inter  → sans-serif family (pitchFamily=34, panose for Helvetica-class)
    JetBrains Mono → monospace family (pitchFamily=49, panose for Courier-class)
    """
    rPr = run._r.get_or_add_rPr()
    # Remove any existing latin element so we can re-add with full attributes
    for old in rPr.findall(qn("a:latin")):
        rPr.remove(old)
    latin = etree.SubElement(rPr, qn("a:latin"))
    latin.set("typeface", font_name)
    if font_name == BODY_FONT:  # Inter — sans-serif
        latin.set("panose", "020B0604020202020204")
        latin.set("pitchFamily", "34")
        latin.set("charset", "0")
    else:  # JetBrains Mono — monospace
        latin.set("panose", "02070609020202020204")
        latin.set("pitchFamily", "49")
        latin.set("charset", "0")
    # Ensure ea/cs inherit from theme so non-Latin scripts don't break
    if not rPr.findall(qn("a:ea")):
        ea = etree.SubElement(rPr, qn("a:ea"))
        ea.set("typeface", "+mn-ea")
    if not rPr.findall(qn("a:cs")):
        cs = etree.SubElement(rPr, qn("a:cs"))
        cs.set("typeface", "+mn-cs")


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
        rPr = run._r.get_or_add_rPr()
        rPr.set("spc", str(tracking))
    _apply_font_fallbacks(run, font)
    return tb, tf


# ---------------------------------------------------------------------------
# Chrome
# ---------------------------------------------------------------------------

def add_wordmark(slide):
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
    _apply_font_fallbacks(r1, CODE_FONT)
    r2 = p.add_run()
    r2.text = ".zk"
    r2.font.name = CODE_FONT
    r2.font.size = Pt(10)
    r2.font.color.rgb = ORANGE
    r2.font.bold = True
    _apply_font_fallbacks(r2, CODE_FONT)


def add_progress_bar(slide, n, total=TOTAL_SLIDES):
    bar_top = Inches(7.35)
    bar_h   = Pt(3)
    bar_l   = MARGIN
    bar_w   = SLIDE_W - MARGIN * 2
    add_rect(slide, bar_l, bar_top, bar_w, bar_h, fill_color=HAIRLINE)
    frac = n / total
    add_rect(slide, bar_l, bar_top, Emu(int(bar_w * frac)), bar_h, fill_color=ORANGE)
    add_text(
        slide,
        SLIDE_W - MARGIN - Inches(1.2), Inches(7.0),
        Inches(1.2), Inches(0.3),
        f"{n:02d} / {total:02d}",
        font=CODE_FONT, size=10, color=MUTED, align=PP_ALIGN.RIGHT,
    )


def add_eyebrow(slide, text, top=Inches(0.9)):
    add_text(
        slide,
        MARGIN, top, Inches(12.0), Inches(0.35),
        text.upper(),
        font=BODY_FONT, size=11, bold=True, color=CYAN,
        tracking=300,
    )


def add_title(slide, text, top=Inches(1.25)):
    add_text(
        slide,
        MARGIN, top, Inches(12.0), Inches(0.9),
        text,
        font=BODY_FONT, size=36, bold=True, color=TEXT,
    )


def add_rule(slide, top=Inches(2.1), width=Inches(1.1)):
    add_rect(slide, MARGIN, top, width, Pt(3), fill_color=ORANGE)


def chrome(slide, n, eyebrow=None, title=None):
    if eyebrow:
        add_eyebrow(slide, eyebrow)
    if title:
        add_title(slide, title)
        add_rule(slide)
    add_wordmark(slide)
    add_progress_bar(slide, n)


# ---------------------------------------------------------------------------
# Flow helpers
# ---------------------------------------------------------------------------

def add_flow_station(slide, left, top, width, height,
                     glyph, title, subtitle,
                     fill=SURFACE, border=HAIRLINE, glyph_color=ORANGE):
    add_round_rect(slide, left, top, width, height,
                   fill_color=fill, line_color=border, line_width=Pt(1),
                   corner=0.22)
    add_text(
        slide, left + Inches(0.15), top + Inches(0.1),
        Inches(1.2), Inches(0.35),
        glyph,
        font=CODE_FONT, size=11, bold=True, color=glyph_color,
        tracking=150,
    )
    add_text(
        slide, left + Inches(0.15), top + Inches(0.45),
        width - Inches(0.3), Inches(0.45),
        title,
        font=BODY_FONT, size=15, bold=True, color=TEXT,
    )
    add_text(
        slide, left + Inches(0.15), top + Inches(0.92),
        width - Inches(0.3), Inches(0.35),
        subtitle,
        font=CODE_FONT, size=9, bold=False, color=MUTED,
    )


def add_arrow(slide, x1, y1, x2, y2, color=ORANGE):
    # Use connector type 1 (straightConnector1) instead of 2 (bentConnector3).
    # bentConnector3 with cy=0 (horizontal arrows) produces degenerate geometry
    # that strict parsers (Google Slides, Goodnotes) may reject.
    conn = slide.shapes.add_connector(1, x1, y1, x2, y2)
    conn.line.color.rgb = color
    conn.line.width = Pt(1.75)
    line_elem = conn.line._get_or_add_ln()
    tailEnd = etree.SubElement(line_elem, qn("a:tailEnd"))
    tailEnd.set("type", "triangle")
    tailEnd.set("w", "med")
    tailEnd.set("h", "med")
    return conn


def set_notes(slide, notes_text: str):
    tf = slide.notes_slide.notes_text_frame
    tf.text = notes_text


def _draw_bullets(slide, bullets, left, top, width,
                  mark_color=ORANGE, text_color=TEXT):
    row_h = Inches(0.6)
    for i, (mark, text) in enumerate(bullets):
        y = top + row_h * i
        add_text(
            slide, left, y, Inches(0.55), Inches(0.45),
            mark,
            font=BODY_FONT, size=16, bold=True, color=mark_color,
        )
        add_text(
            slide, left + Inches(0.6), y, width - Inches(0.6), Inches(0.5),
            text,
            font=BODY_FONT, size=16, bold=False, color=text_color,
        )


# ===========================================================================
# Slide 1 — Title
# ===========================================================================

def slide_1_title(prs):
    slide = blank_slide(prs)

    add_rect(slide, 0, 0, Inches(0.18), SLIDE_H, fill_color=ORANGE)

    add_text(
        slide,
        Inches(0.9), Inches(1.35),
        Inches(12.0), Inches(0.35),
        f"A ZERO-KNOWLEDGE DEMO   {MIDOT}   BLOCKCHAIN CLUB",
        font=BODY_FONT, size=12, bold=True, color=CYAN, tracking=350,
    )

    add_text(
        slide,
        Inches(0.85), Inches(1.95),
        Inches(12.0), Inches(1.8),
        "Battleship,",
        font=BODY_FONT, size=72, bold=True, color=TEXT,
    )
    add_text(
        slide,
        Inches(0.85), Inches(3.25),
        Inches(12.0), Inches(1.8),
        "proven.",
        font=BODY_FONT, size=72, bold=True, color=ORANGE,
    )

    add_text(
        slide,
        Inches(0.9), Inches(4.85),
        Inches(12.0), Inches(0.5),
        "A zk-SNARK demo with real on-chain verification.",
        font=BODY_FONT, size=18, bold=False, color=MUTED,
    )

    # Presenter chip — real names
    chip_w = Inches(5.6)
    chip_h = Inches(0.55)
    chip_l = Inches(0.85)
    chip_t = Inches(6.0)
    add_round_rect(slide, chip_l, chip_t, chip_w, chip_h,
                   fill_color=SURFACE, line_color=HAIRLINE,
                   line_width=Pt(0.75), corner=0.5)
    add_oval(slide, chip_l + Inches(0.22), chip_t + Inches(0.2),
             Inches(0.15), Inches(0.15), fill_color=ORANGE)
    add_text(
        slide,
        chip_l + Inches(0.48), chip_t + Inches(0.12),
        chip_w - Inches(0.6), chip_h,
        f"VIKRAM AKKALA    {MIDOT}    PRANAV PABBA",
        font=BODY_FONT, size=11, bold=True, color=TEXT, tracking=200,
    )

    add_text(
        slide,
        SLIDE_W - MARGIN - Inches(4.5), Inches(6.12),
        Inches(4.5), Inches(0.3),
        f"noir {ARROW} ultrahonk {ARROW} solidity",
        font=CODE_FONT, size=11, bold=False, color=MUTED,
        align=PP_ALIGN.RIGHT,
    )

    add_progress_bar(slide, 1)

    notes = """\
[Pranav]
Welcome everyone. I'm Pranav Pabba and this is my teammate Vikram Akkala. Over the next eight \
minutes we're going to show you Battleship -- the classic two-player board game -- rebuilt on \
zero-knowledge proofs with real on-chain verification. I'll drive the live demo; Vikram will \
carry you through the cryptography. By the time we're done you'll see exactly why a simple \
hash commitment fails, and why a single zk-SNARK is the piece that closes the gap.

[Vikram]
Thanks Pranav. My job is the crypto -- the problem, the gap, and the fix. Concrete and tied to \
Battleship the whole way. Let's go.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 2 — The Problem
# ===========================================================================

def slide_2_problem(prs):
    slide = blank_slide(prs)
    chrome(slide, 2, eyebrow=f"01  {MIDOT}  The Problem",
           title="A game built on hidden state.")

    add_text(
        slide,
        MARGIN, Inches(2.55),
        Inches(1.2), Inches(2.0),
        "\u201C",
        font=BODY_FONT, size=180, bold=True, color=ORANGE,
    )

    tb = slide.shapes.add_textbox(Inches(1.9), Inches(3.0),
                                  Inches(10.9), Inches(2.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate([
        "Each player knows their board.",
        "Neither player trusts the other.",
    ]):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_before = Pt(0)
        r = p.add_run()
        r.text = line
        r.font.name = BODY_FONT
        r.font.size = Pt(38)
        r.font.bold = True
        r.font.color.rgb = TEXT if i == 0 else ORANGE
        _apply_font_fallbacks(r, BODY_FONT)

    add_text(
        slide,
        Inches(1.9), Inches(5.55),
        Inches(10.9), Inches(0.4),
        f"{MDASH} standard trick: commit to your board with a hash so you can't change your mind later.",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
    )
    add_text(
        slide,
        Inches(1.9), Inches(5.95),
        Inches(10.9), Inches(0.4),
        "But a hash commitment only proves WHAT you committed to -- not whether what you committed is legal.",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
    )

    notes = """\
[Vikram]
Battleship is a game of hidden state. I place ships on my private ten-by-ten grid, you place \
ships on yours, and neither of us sees the other's layout. In a digital implementation nothing \
stops me from just lying about my board. So the standard cryptographic move is: commit to your \
board up front with a hash. Publish that hash on-chain, and now you can't silently change your \
ships mid-game. Great. But here's the catch -- and this is what the next slide is about -- a \
hash commitment only proves WHAT you committed to. It says absolutely nothing about whether \
what you committed is a legal fleet in the first place.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 3 — The Validity Gap
# ===========================================================================

def slide_3_validity_gap(prs):
    slide = blank_slide(prs)
    chrome(slide, 3, eyebrow=f"02  {MIDOT}  The Validity Gap",
           title="Commit to nothing. Win anyway.")

    # Left: a 10x10 mini grid — deliberately EMPTY
    grid_l = MARGIN
    grid_t = Inches(2.6)
    grid_side = Inches(3.7)
    cell = grid_side / 10

    add_round_rect(slide, grid_l - Inches(0.15), grid_t - Inches(0.15),
                   grid_side + Inches(0.3), grid_side + Inches(0.3),
                   fill_color=SURFACE, line_color=HAIRLINE,
                   line_width=Pt(1), corner=0.05)

    for r in range(10):
        for c in range(10):
            x = grid_l + cell * c
            y = grid_t + cell * r
            add_rect(slide, x, y, cell, cell,
                     fill_color=BG, line_color=HAIRLINE,
                     line_width=Pt(0.5))

    add_text(slide, grid_l, grid_t + grid_side + Inches(0.2),
             grid_side, Inches(0.4),
             "ALL-EMPTY BOARD",
             font=BODY_FONT, size=11, bold=True, color=WARN,
             align=PP_ALIGN.CENTER, tracking=250)
    add_text(slide, grid_l, grid_t + grid_side + Inches(0.55),
             grid_side, Inches(0.4),
             "hash(empty, salt) is still valid",
             font=CODE_FONT, size=10, bold=False, color=MUTED,
             align=PP_ALIGN.CENTER)

    # Right: the cheat narrative
    right_l = grid_l + grid_side + Inches(0.7)
    right_w = SLIDE_W - right_l - MARGIN

    add_text(slide, right_l, grid_t - Inches(0.05),
             right_w, Inches(0.4),
             "THE CHEAT",
             font=BODY_FONT, size=11, bold=True, color=WARN, tracking=250)

    steps = [
        ("1", "Commit to an all-empty board.",
         "hash is valid. nothing in the scheme says you need ships."),
        ("2", "Opponent fires at (3, 5).",
         "you answer MISS. truthfully. there is nothing there."),
        ("3", "Every shot is a miss.",
         "you never lose a cell. you never take damage."),
        ("4", "You win by elimination.",
         "hash commitments alone cannot stop this."),
    ]
    sy = grid_t + Inches(0.5)
    for i, (num, title, body) in enumerate(steps):
        y = sy + Inches(0.85) * i
        add_oval(slide, right_l, y + Inches(0.02),
                 Inches(0.45), Inches(0.45),
                 fill_color=WARN)
        add_text(slide, right_l, y + Inches(0.03),
                 Inches(0.45), Inches(0.45),
                 num,
                 font=BODY_FONT, size=16, bold=True, color=BG,
                 align=PP_ALIGN.CENTER)
        add_text(slide, right_l + Inches(0.7), y - Inches(0.01),
                 right_w - Inches(0.7), Inches(0.45),
                 title,
                 font=BODY_FONT, size=17, bold=True, color=TEXT)
        add_text(slide, right_l + Inches(0.7), y + Inches(0.4),
                 right_w - Inches(0.7), Inches(0.4),
                 body,
                 font=BODY_FONT, size=12, bold=False, color=MUTED)

    notes = """\
[Vikram]
Okay, feel this one. Imagine I'm the cheater. I commit to an all-empty board -- literally a \
grid with zero ships on it. The hash of that board is a perfectly valid hash. On-chain, my \
commitment looks identical to yours. The game starts. You fire at three-comma-five. I answer \
MISS. Completely truthfully, because there is nothing there. You fire at seven-comma-two. MISS. \
Again, not a lie. I never lose a single cell because I have no cells to lose. Meanwhile I'm \
sinking your actual ships. I win by elimination without ever making a dishonest statement. \
A plain hash commitment cannot stop this attack, because a hash only proves WHAT you committed \
to -- it is silent on whether that thing is a legal Battleship fleet. This is the validity \
gap, and every slide from here on is about closing it.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 4 — The Fix: zk-SNARKs
# ===========================================================================

def slide_4_fix(prs):
    slide = blank_slide(prs)
    chrome(slide, 4, eyebrow=f"03  {MIDOT}  The Fix",
           title="Prove legality, in zero knowledge.")

    add_text(
        slide, MARGIN, Inches(2.9),
        SLIDE_W - MARGIN * 2, Inches(1.2),
        "The proof IS the validity certificate.",
        font=BODY_FONT, size=40, bold=True, color=ORANGE,
        align=PP_ALIGN.CENTER,
    )

    add_text(
        slide, MARGIN, Inches(4.25),
        SLIDE_W - MARGIN * 2, Inches(0.5),
        "One zk-SNARK, generated in the browser before the first shot.",
        font=BODY_FONT, size=18, bold=False, color=TEXT,
        align=PP_ALIGN.CENTER,
    )
    add_text(
        slide, MARGIN, Inches(4.7),
        SLIDE_W - MARGIN * 2, Inches(0.5),
        "Verified once on-chain. No ship-count lies survive.",
        font=BODY_FONT, size=18, bold=False, color=MUTED,
        align=PP_ALIGN.CENTER,
    )

    # Bottom constraint strip
    strip_t = Inches(5.55)
    add_round_rect(slide, MARGIN, strip_t, SLIDE_W - MARGIN * 2, Inches(1.1),
                   fill_color=SURFACE, line_color=HAIRLINE,
                   line_width=Pt(1), corner=0.18)
    add_text(slide, MARGIN + Inches(0.35), strip_t + Inches(0.18),
             SLIDE_W - MARGIN * 2 - Inches(0.7), Inches(0.35),
             "THE FLEET CONSTRAINT",
             font=BODY_FONT, size=10, bold=True, color=CYAN, tracking=250)
    add_text(slide, MARGIN + Inches(0.35), strip_t + Inches(0.5),
             SLIDE_W - MARGIN * 2 - Inches(0.7), Inches(0.5),
             "17 cells  -  1x5  -  1x4  -  2x3  -  1x2  -  no overlaps  -  no diagonals",
             font=CODE_FONT, size=13, bold=True, color=TEXT,
             align=PP_ALIGN.CENTER)

    notes = """\
[Vikram]
Here is the move. Instead of just committing to a board, we commit AND prove -- in zero \
knowledge -- that what we committed to is a legal fleet. Exactly seventeen occupied cells. \
One five-cell carrier. One four-cell battleship. Two three-cell cruisers. One two-cell \
destroyer. No overlaps. No diagonals. All in bounds. That whole statement becomes a single \
zk-SNARK. The proof goes on-chain at commit time, before the first shot is ever fired. The \
all-empty-board attack you just saw? It literally cannot produce a valid proof, because the \
circuit's fleet constraint rejects it. The proof IS the validity certificate -- if the \
contract accepts it, the board is legal, full stop. And you learn absolutely nothing about \
where the ships actually are.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 5 — Noir + UltraHonk
# ===========================================================================

def slide_5_stack(prs):
    slide = blank_slide(prs)
    chrome(slide, 5, eyebrow=f"04  {MIDOT}  The Stack",
           title="Noir + UltraHonk.")

    # 2x2 tile grid
    grid_top = Inches(2.55)
    grid_h   = Inches(4.1)
    gap      = Inches(0.3)
    tile_w   = (SLIDE_W - MARGIN * 2 - gap) / 2
    tile_h   = (grid_h - gap) / 2

    tiles = [
        ("NOIR",
         "Rust-like zk DSL",
         ["Readable circuits.",
          "Compiles to arithmetic constraints.",
          "WASM prover runs in the browser."]),
        ("ULTRAHONK",
         "PLONK-family backend",
         ["Aztec's modern proof system.",
          "No trusted setup ceremony.",
          "No powers-of-tau, no toxic waste."]),
        ("PEDERSEN HASH",
         "In-circuit commitment",
         ["Cheap to compute inside zk.",
          "Binds 100 cells + salt.",
          "One field element, used as the board commit."]),
        ("HONKVERIFIER",
         "Auto-generated Solidity",
         ["~2,460 lines of verifier.",
          "~250k gas per verify call.",
          "Dropped straight into the repo."]),
    ]

    for i, (glyph, title, body) in enumerate(tiles):
        row, col = divmod(i, 2)
        x = MARGIN + (tile_w + gap) * col
        y = grid_top + (tile_h + gap) * row
        add_round_rect(slide, x, y, tile_w, tile_h,
                       fill_color=SURFACE, line_color=HAIRLINE,
                       line_width=Pt(1), corner=0.1)
        add_text(slide, x + Inches(0.3), y + Inches(0.25),
                 tile_w - Inches(0.6), Inches(0.45),
                 glyph,
                 font=CODE_FONT, size=13, bold=True, color=ORANGE, tracking=200)
        add_text(slide, x + Inches(0.3), y + Inches(0.6),
                 tile_w - Inches(0.6), Inches(0.5),
                 title,
                 font=BODY_FONT, size=20, bold=True, color=TEXT)
        tb = slide.shapes.add_textbox(x + Inches(0.3), y + Inches(1.05),
                                      tile_w - Inches(0.6), Inches(0.95))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        for bi, bline in enumerate(body):
            p = tf.paragraphs[0] if bi == 0 else tf.add_paragraph()
            p.alignment = PP_ALIGN.LEFT
            p.space_before = Pt(0)
            r = p.add_run()
            r.text = bline
            r.font.name = BODY_FONT
            r.font.size = Pt(12)
            r.font.bold = False
            r.font.color.rgb = MUTED
            _apply_font_fallbacks(r, BODY_FONT)

    notes = """\
[Vikram]
The concrete stack. Noir is Aztec's Rust-flavoured DSL for writing zk circuits -- it reads \
like normal code and compiles down to an arithmetic constraint system. UltraHonk is the \
proving backend, a modern PLONK-family scheme that needs no trusted setup ceremony, which \
means I don't have to spend five minutes of this talk explaining powers of tau. Pedersen \
hash is the commitment primitive we use inside the circuit -- cheap in zk and it binds all \
one hundred private cells plus a salt into a single public field element. And finally, Noir \
auto-generates a Solidity verifier contract -- HonkVerifier dot sol, about twenty-four \
hundred lines, roughly two hundred and fifty thousand gas per verify call. That is the whole \
cryptographic toolbox. No custom circuits hand-rolled in Circom, no Groth16 ceremony, no \
custom verifier math.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 6 — System Architecture
# ===========================================================================

def slide_6_architecture(prs):
    slide = blank_slide(prs)
    chrome(slide, 6, eyebrow=f"05  {MIDOT}  Architecture",
           title="Browser proves. Chain verifies.")

    stations = [
        ("FLEET",   "Fleet",        "private[100]"),
        ("PED",     "Pedersen",     f"hash {ARROW} commit"),
        ("NOIR",    "Noir circuit", "board_validity"),
        ("HONK",    "UltraHonk",    "proof blob"),
        ("SOL",     "HonkVerifier", "Solidity verify"),
        ("GAME",    "BattleshipGame", "settle on-chain"),
    ]

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

    for i in range(n - 1):
        _, x_end_prev, cy = centers[i]
        x_start_next, _, _ = centers[i + 1]
        y = int(cy)
        add_arrow(
            slide,
            x_end_prev + Emu(20000), y,
            x_start_next - Emu(20000), y,
            color=ORANGE,
        )

    cap_top = row_y + tile_h + Inches(0.45)
    add_text(
        slide, MARGIN, cap_top, usable_w, Inches(0.35),
        f"BROWSER  {ARROW}  WASM PROVER  {ARROW}  NOIR  {ARROW}  SOLIDITY VERIFIER  {ARROW}  CHAIN",
        font=BODY_FONT, size=10, bold=True, color=MUTED, tracking=250,
        align=PP_ALIGN.CENTER,
    )

    bul_top = Inches(5.55)
    bullets = [
        (f"{MIDOT}", "Browser proves, chain verifies", CYAN),
        (f"{MIDOT}", "Burner wallets sign, zero popups", ORANGE),
        (f"{MIDOT}", "Local Anvil for instant demo",    GOOD),
    ]
    col_w_b = usable_w / 3
    for i, (dot, text, color) in enumerate(bullets):
        x = MARGIN + col_w_b * i
        add_text(slide, x, bul_top, Inches(0.3), Inches(0.35),
                 dot,
                 font=BODY_FONT, size=18, bold=True, color=color)
        add_text(slide, x + Inches(0.3), bul_top - Inches(0.02),
                 col_w_b - Inches(0.3), Inches(0.4),
                 text,
                 font=BODY_FONT, size=14, bold=False, color=TEXT)

    notes = """\
[Pranav]
End-to-end data flow, and this is exactly what you're about to watch live. I open the React \
app. I drag my fleet onto the grid. I click Ready. The frontend pipes my private board into \
a Pedersen hash for the commitment and into the Noir board-validity circuit, and runs bb.js \
-- Aztec's WASM-compiled Barretenberg prover -- right there in the browser. Out comes a proof \
blob. I push it as calldata to BattleshipGame dot sol on a local Anvil chain. BattleshipGame \
calls the Noir-generated HonkVerifier, which accepts or rejects on-chain. Every shot response \
goes through the same pipeline with a separate shot-response circuit. Nothing trusts the \
frontend -- every single claim is verified by the contract. Two burner wallets derived from \
Anvil's deterministic test keys mean no MetaMask popups and no wallet switching. One laptop, \
hot-seat, zero trust.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 7 — Live Demo
# ===========================================================================

def slide_7_demo(prs):
    slide = blank_slide(prs)

    add_text(
        slide, MARGIN, Inches(0.9),
        Inches(12.0), Inches(0.35),
        f"06  {MIDOT}  SWITCH TO THE BROWSER",
        font=BODY_FONT, size=11, bold=True, color=CYAN, tracking=350,
    )

    add_text(
        slide, Inches(0.0), Inches(2.35),
        Inches(13.333), Inches(2.3),
        f"LIVE DEMO  {ARROW}",
        font=BODY_FONT, size=96, bold=True, color=ORANGE,
        align=PP_ALIGN.CENTER,
    )

    add_text(
        slide, Inches(0.0), Inches(4.75),
        Inches(13.333), Inches(0.55),
        "http://localhost:5173",
        font=CODE_FONT, size=20, bold=False, color=TEXT,
        align=PP_ALIGN.CENTER,
    )
    add_text(
        slide, Inches(0.0), Inches(5.25),
        Inches(13.333), Inches(0.45),
        f"two burner wallets  {MIDOT}  one laptop  {MIDOT}  zero trust",
        font=BODY_FONT, size=14, bold=False, color=MUTED,
        align=PP_ALIGN.CENTER, tracking=150,
    )

    add_wordmark(slide)
    add_progress_bar(slide, 7)

    notes = """\
[Pranav]
Alright, driving. I'm opening the app -- both players' grids side by side. Clicking the \
carrier in the palette, rotating with R, dropping it on the top row. Placing the rest fast. \
Hit Ready. Watch the spinner: "proving board legality" -- that is the Noir circuit running \
right now in the browser. Proof verified on-chain. Player two does the same. Now we fire -- \
I click on the enemy grid. Pending pulse. Hit confirmed, shot-response proof verified in \
about a second.

[Vikram]
Keep an eye on the Crypto Log panel on the right -- every on-chain event is narrated as it \
happens. Pedersen commit, board-validity proof, shot-response proof, sunk animation. This is \
a full cryptographic game loop running live with zero trust in the opponent.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 8 — What Was Proven On-Chain
# ===========================================================================

def slide_8_proven(prs):
    slide = blank_slide(prs)
    chrome(slide, 8, eyebrow=f"07  {MIDOT}  Recap",
           title="What was proven on-chain.")

    items = [
        ("1", "Board legality before the first shot",
         "Can't commit an all-empty board. The circuit rejects it."),
        ("2", "Every shot response consistent with the committed board",
         "Hit or miss, bound back to the original Pedersen commitment."),
        ("3", "Zero trust in the opponent's claims",
         "Every answer is a proof the contract verifies, not a promise."),
        ("4", "Zero trusted-setup ceremony",
         "UltraHonk means no multi-party ritual, no toxic waste."),
    ]
    row_top = Inches(2.55)
    row_h   = Inches(1.05)
    circle  = Inches(0.7)

    for i, (num, title, body) in enumerate(items):
        y = row_top + row_h * i
        add_oval(slide, MARGIN, y + Inches(0.02),
                 circle, circle,
                 fill_color=ORANGE)
        add_text(slide, MARGIN, y + Inches(0.08),
                 circle, Inches(0.6),
                 num,
                 font=BODY_FONT, size=24, bold=True, color=BG,
                 align=PP_ALIGN.CENTER)
        add_text(slide, MARGIN + circle + Inches(0.3), y + Inches(0.02),
                 Inches(11.5), Inches(0.5),
                 title,
                 font=BODY_FONT, size=20, bold=True, color=TEXT)
        add_text(slide, MARGIN + circle + Inches(0.3), y + Inches(0.5),
                 Inches(11.5), Inches(0.4),
                 body,
                 font=BODY_FONT, size=13, bold=False, color=MUTED)

    notes = """\
[Vikram]
Four things the cryptography actually guaranteed during that demo. One: before the first shot \
was fired, each player produced a zk-SNARK proving their board contained exactly the standard \
fleet -- seventeen cells, correct ship shapes, no overlaps, no diagonals. The all-empty-board \
cheat is impossible. Two: every shot response came with its own proof binding the answer back \
to the original Pedersen commitment, so a hit cannot be flipped to a miss. Three: zero trust \
-- every opponent claim is a proof the contract verifies, not a promise we take on faith. \
Four: zero trusted setup -- UltraHonk needs no multi-party ceremony, no powers of tau, no \
toxic waste to dispose of. That is the whole cryptographic contract of this demo.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Slide 9 — What's Next / Q&A
# ===========================================================================

def slide_9_next(prs):
    slide = blank_slide(prs)
    chrome(slide, 9, eyebrow=f"08  {MIDOT}  Next + Q&A",
           title="What's next.")

    left_l = MARGIN
    col_top = Inches(2.55)
    left_w = Inches(6.6)

    steps = [
        ("01", "Mainnet deployment path",    "Solidity verifier is deploy-ready."),
        ("02", "Circuit optimization",       "Shrink shot-response constraints."),
        ("03", "Multi-game lobby",           "Matchmaking plus state routing."),
    ]
    for i, (num, title, body) in enumerate(steps):
        y = col_top + Inches(1.0) * i
        add_text(slide, left_l, y, Inches(0.6), Inches(0.4),
                 num,
                 font=CODE_FONT, size=13, bold=True, color=ORANGE, tracking=150)
        add_text(slide, left_l + Inches(0.7), y - Inches(0.03),
                 left_w - Inches(0.7), Inches(0.45),
                 title,
                 font=BODY_FONT, size=18, bold=True, color=TEXT)
        add_text(slide, left_l + Inches(0.7), y + Inches(0.38),
                 left_w - Inches(0.7), Inches(0.4),
                 body,
                 font=BODY_FONT, size=12, bold=False, color=MUTED)

    div_x = Inches(7.55)
    add_rect(slide, div_x, Inches(2.55), Pt(1), Inches(3.9),
             fill_color=HAIRLINE)

    right_l = Inches(7.95)
    add_text(slide, right_l, Inches(2.6),
             Inches(5.0), Inches(0.4),
             "Q & A",
             font=BODY_FONT, size=11, bold=True, color=CYAN, tracking=350)
    add_text(slide, right_l, Inches(3.1),
             Inches(5.2), Inches(2.0),
             "Questions?",
             font=BODY_FONT, size=60, bold=True, color=ORANGE)
    add_text(slide, right_l, Inches(4.85),
             Inches(5.2), Inches(1.4),
             "Circuits, contracts, frontend -- everything is open source.",
             font=BODY_FONT, size=14, bold=False, color=MUTED)
    add_text(slide, right_l, Inches(5.7),
             Inches(5.2), Inches(0.4),
             "github.com/ battleship-zk",
             font=CODE_FONT, size=12, bold=False, color=TEXT)

    notes = """\
[Pranav]
Where does this go from here? Mainnet deployment is basically a deploy script away -- the \
Solidity verifier is already production-shaped. We want to prune the shot-response circuit to \
get proving time down further, and longer term stand up a multi-game lobby so this is not \
just a hot-seat demo. That's the pitch. Thanks for your time. We're happy to take questions \
on the circuits, the contract, Noir, bb.js, burner wallets -- anything you saw in the demo. \
The full stack is open source.
"""
    set_notes(slide, notes)
    return slide


# ===========================================================================
# Main
# ===========================================================================

def main():
    out_path = Path(__file__).parent / "battleship-zk-demo.pptx"

    prs = new_prs()
    slide_1_title(prs)
    slide_2_problem(prs)
    slide_3_validity_gap(prs)
    slide_4_fix(prs)
    slide_5_stack(prs)
    slide_6_architecture(prs)
    slide_7_demo(prs)
    slide_8_proven(prs)
    slide_9_next(prs)

    prs.save(str(out_path))
    print(f"Saved: {out_path}  ({out_path.stat().st_size:,} bytes)")
    print("Fonts referenced by name: Inter (body), JetBrains Mono (code).")
    print(f"  Fallbacks: Helvetica Neue {ARROW} Calibri (body), Menlo {ARROW} Consolas (code).")


if __name__ == "__main__":
    main()
