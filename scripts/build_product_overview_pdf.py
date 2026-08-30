from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_PATH = OUTPUT_DIR / "adaptive-strength-app-product-overview.pdf"

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 42

CREAM = HexColor("#F5F3EE")
PAPER = HexColor("#FCFBF8")
INK = HexColor("#11110F")
MUTED = HexColor("#6F6A62")
GREEN = HexColor("#176B4C")
PALE_GREEN = HexColor("#E7F1EC")
LINE = HexColor("#D9D5CE")
WHITE = HexColor("#FFFFFF")


def draw_wrapped_text(c, text, x, y, max_width, font="Helvetica", size=11,
                      leading=16, color=INK, max_lines=None):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines is not None:
        lines = lines[:max_lines]

    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_kicker(c, text, x, y):
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x, y, text.upper())


def draw_page_header(c, section, title, page_no):
    draw_kicker(c, section, MARGIN, PAGE_H - 35)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(MARGIN, PAGE_H - 63, title)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, PAGE_H - 78, PAGE_W - MARGIN, PAGE_H - 78)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 35, f"PRODUCT OVERVIEW  /  {page_no}")


def draw_footer(c, page_no):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, 27, PAGE_W - MARGIN, 27)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(MARGIN, 15, "Confidential product concept - prepared for naming and brand research")
    c.drawRightString(PAGE_W - MARGIN, 15, str(page_no))


def image_size(path):
    reader = ImageReader(str(path))
    return reader, reader.getSize()


def draw_phone_image(c, path, x, y, max_w, max_h, shadow=True):
    reader, (iw, ih) = image_size(path)
    scale = min(max_w / iw, max_h / ih)
    w = iw * scale
    h = ih * scale
    px = x + (max_w - w) / 2
    py = y + (max_h - h) / 2
    if shadow:
        c.setFillColor(HexColor("#DDD9D1"))
        c.roundRect(px + 4, py - 4, w, h, 10, fill=1, stroke=0)
    c.drawImage(reader, px, py, width=w, height=h, preserveAspectRatio=True, mask="auto")
    return px, py, w, h


def draw_caption(c, title, body, x, y, width):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, title)
    return draw_wrapped_text(c, body, x, y - 17, width, size=8.5, leading=12, color=MUTED)


def draw_bullet_list(c, items, x, y, width, size=10, leading=16):
    for item in items:
        c.setFillColor(GREEN)
        c.circle(x + 3, y + 3, 2.2, fill=1, stroke=0)
        y = draw_wrapped_text(c, item, x + 14, y, width - 14, size=size,
                              leading=leading, color=INK) - 5
    return y


def draw_pair_page(c, page_no, section, title, left, right):
    draw_page_header(c, section, title, page_no)
    content_top = PAGE_H - 96
    image_h = 400
    card_w = 350
    gap = 36
    start_x = (PAGE_W - (2 * card_w + gap)) / 2

    for index, item in enumerate((left, right)):
        x = start_x + index * (card_w + gap)
        c.setFillColor(PAPER)
        c.setStrokeColor(LINE)
        c.roundRect(x, 55, card_w, content_top - 55, 14, fill=1, stroke=1)
        draw_phone_image(c, item[0], x + 10, 110, card_w - 20, image_h)
        draw_caption(c, item[1], item[2], x + 18, 91, card_w - 36)

    draw_footer(c, page_no)
    c.showPage()


def build_pdf():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT_PATH), pagesize=(PAGE_W, PAGE_H))
    c.setTitle("Adaptive Strength Training App - Product Overview")
    c.setAuthor("Product Team")
    c.setSubject("Product brief and interface screenshots for naming research")

    landing = ROOT / "artifacts" / "landing-copy" / "390-landing.png"
    goal = ROOT / "artifacts" / "onboarding-option-cards" / "390-goal.png"
    split = ROOT / "artifacts" / "onboarding-split-preferences-4-days.png"
    today = ROOT / "artifacts" / "visual-v2" / "390-returning-today.png"
    active = ROOT / "artifacts" / "visual-v2" / "390-fresh-active.png"
    progress = ROOT / "artifacts" / "progress" / "f-real-progression.png"
    coach = ROOT / "artifacts" / "coach-ux" / "390-new-conversation.png"
    profile = ROOT / "artifacts" / "profile-logging" / "390-profile-personalized.png"

    # Page 1 - cover and product summary
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.rect(0, 0, 12, PAGE_H, fill=1, stroke=0)
    draw_kicker(c, "Adaptive strength training platform", 58, PAGE_H - 58)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 31)
    c.drawString(58, PAGE_H - 105, "A training plan that fits")
    c.drawString(58, PAGE_H - 141, "and keeps up.")
    intro = (
        "A mobile-first product that builds a personalized strength program around the "
        "user's goals, schedule, experience, equipment and preferences - then continues "
        "adapting through real workout history."
    )
    y = draw_wrapped_text(c, intro, 58, PAGE_H - 180, 390, size=12, leading=18, color=MUTED)

    c.setFillColor(PALE_GREEN)
    c.roundRect(58, 128, 390, 145, 14, fill=1, stroke=0)
    draw_kicker(c, "Core product promise", 77, 246)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(77, 216, "Personalized from day one.")
    c.drawString(77, 192, "Useful during every workout.")
    c.drawString(77, 168, "Smarter after every completed session.")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(58, 82, "Prepared for international naming, positioning and brand research")
    draw_phone_image(c, landing, 500, 45, 260, 500)
    c.showPage()

    # Page 2 - product system
    draw_page_header(c, "Product system", "From personal context to an evolving program", 2)
    columns = [58, 302, 546]
    cards = [
        ("01", "Understand the user", [
            "Goal, experience and training history",
            "Available days and session length",
            "Gym environment and equipment",
            "Priorities, effort and restrictions",
        ]),
        ("02", "Build the right plan", [
            "Frequency-aware workout split",
            "Exercises, sets, reps and rest",
            "A clear weekly schedule",
            "Manual creation or plan import",
        ]),
        ("03", "Learn and adapt", [
            "Fast workout logging",
            "Progressive-overload guidance",
            "Training history and consistency",
            "Context-aware coaching and changes",
        ]),
    ]
    for x, (number, heading, bullets) in zip(columns, cards):
        c.setFillColor(PAPER)
        c.setStrokeColor(LINE)
        c.roundRect(x, 145, 220, 315, 15, fill=1, stroke=1)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 28)
        c.drawString(x + 20, 412, number)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(x + 20, 370, heading)
        draw_bullet_list(c, bullets, x + 20, 330, 180, size=9.5, leading=15)

    c.setFillColor(PALE_GREEN)
    c.roundRect(58, 62, 708, 56, 12, fill=1, stroke=0)
    draw_kicker(c, "Key distinction", 76, 96)
    draw_wrapped_text(
        c,
        "The product is not only a program generator or a workout diary. It connects onboarding, planning, logging, progress and coaching into one continuous feedback loop.",
        76, 78, 670, size=9.5, leading=14, color=INK,
    )
    draw_footer(c, 2)
    c.showPage()

    draw_pair_page(
        c, 3, "Onboarding", "Personalization without unnecessary complexity",
        (goal, "Goal-led setup", "The user sees how each answer affects the resulting program."),
        (split, "Frequency-aware preferences", "Split choices are filtered to fit the selected number of training days."),
    )

    draw_pair_page(
        c, 4, "Training", "A clear plan and a focused workout experience",
        (today, "Today and weekly schedule", "The next workout, exercise list and recent performance stay easy to scan."),
        (active, "Fast set-by-set logging", "Weight, reps, added sets, exercise replacement and progression remain close at hand."),
    )

    draw_pair_page(
        c, 5, "Feedback loop", "Progress and coaching in the same system",
        (progress, "Progress that is understandable", "Working weights, consistency and meaningful improvements update as the user trains."),
        (coach, "A coach with real context", "The coach understands the current plan and training data before proposing useful changes."),
    )

    # Page 6 - profile screenshot and research context
    draw_page_header(c, "Audience and identity", "Built for trust, clarity and long-term use", 6)
    draw_phone_image(c, profile, 55, 48, 245, 465)

    x = 340
    draw_kicker(c, "Primary audience", x, 450)
    y = draw_bullet_list(c, [
        "International users interested in strength, muscle growth and structured improvement",
        "Beginners who want confident guidance without a complicated spreadsheet",
        "Experienced lifters who value personalization, history and adaptable programming",
        "People training in commercial gyms, home gyms or with limited equipment",
    ], x, 423, 425, size=9.5, leading=14)

    draw_kicker(c, "Brand personality", x, y - 5)
    y = draw_bullet_list(c, [
        "Minimal, premium and editorial",
        "Calm, confident and intelligent",
        "Evidence-informed without feeling clinical",
        "Serious without aggression or intimidation",
        "Typography-led with warm off-white, black and deep green",
    ], x, y - 30, 425, size=9.5, leading=14)

    c.setFillColor(PALE_GREEN)
    c.roundRect(x, 63, 425, 91, 13, fill=1, stroke=0)
    draw_kicker(c, "Research objective", x + 18, 128)
    draw_wrapped_text(
        c,
        "Select a memorable international brand identity that matches the product, the interface and its potential to grow into a complete training platform. Any branding visible in screenshots is temporary.",
        x + 18, 107, 389, size=9.5, leading=14, color=INK,
    )
    draw_footer(c, 6)
    c.showPage()

    c.save()
    print(OUTPUT_PATH)


if __name__ == "__main__":
    build_pdf()
