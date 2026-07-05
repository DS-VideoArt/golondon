#!/usr/bin/env python3
import sys
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

def reshape_hebrew(text):
    return get_display(text)

def wrap_rtl(text, max_chars=10):
    words = text.split()
    lines = []
    current = []
    current_len = 0
    for word in words:
        if current_len + len(word) + (1 if current else 0) > max_chars and current:
            lines.append(" ".join(current))
            current = [word]
            current_len = len(word)
        else:
            current.append(word)
            current_len += len(word) + (1 if len(current) > 1 else 0)
    if current:
        lines.append(" ".join(current))
    return lines

def draw_text_with_glow(draw, pos, text, font, color, glow_color=(0,0,0,200), glow_radius=6):
    x, y = pos
    offsets = []
    for dx in range(-glow_radius, glow_radius+1, 2):
        for dy in range(-glow_radius, glow_radius+1, 2):
            if dx*dx + dy*dy <= glow_radius*glow_radius:
                offsets.append((dx, dy))
    for dx, dy in offsets:
        draw.text((x+dx, y+dy), text, font=font, fill=glow_color)
    draw.text((x, y), text, font=font, fill=color)

def add_hook_text(input_path, output_path, hook_text, subtitle="Go London"):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size

    # גרדיאנט כהה חזק בחלק העליון — 55% גובה
    gradient = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_grad = ImageDraw.Draw(gradient)
    grad_height = int(h * 0.55)
    for y in range(grad_height):
        t = y / grad_height
        alpha = int(230 * (1 - t * t))
        draw_grad.line([(0, y), (w, y)], fill=(0, 0, 0, alpha))

    img = Image.alpha_composite(img, gradient)
    draw = ImageDraw.Draw(img)

    font_heb = "/System/Library/Fonts/ArialHB.ttc"
    font_lat = "/System/Library/Fonts/Helvetica.ttc"

    # גופן גדול יותר
    font_size = max(90, w // 6)
    font_main = ImageFont.truetype(font_heb, font_size)
    font_sub  = ImageFont.truetype(font_lat, int(font_size * 0.28))
    font_badge= ImageFont.truetype(font_lat, int(font_size * 0.22))

    raw_lines = wrap_rtl(hook_text, max_chars=10)
    lines = [reshape_hebrew(l) for l in raw_lines]

    line_spacing = int(font_size * 1.25)
    start_y = int(h * 0.08)

    # כיתוב hook עם גלו
    AMBER = (255, 180, 40, 255)
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_main)
        text_w = bbox[2] - bbox[0]
        x = (w - text_w) // 2
        y = start_y + i * line_spacing
        draw_text_with_glow(draw, (x, y), line, font_main,
                            color=(255, 255, 255, 255),
                            glow_color=(0, 0, 0, 210),
                            glow_radius=7)

    text_bottom = start_y + len(lines) * line_spacing

    # קו זהוב
    line_y = text_bottom + 10
    line_x0 = w // 4
    line_x1 = 3 * w // 4
    draw.rectangle([(line_x0, line_y), (line_x1, line_y + 3)], fill=(255, 180, 40, 220))

    # "Go London" badge
    badge_y = line_y + 18
    badge_bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
    badge_w = badge_bbox[2] - badge_bbox[0]
    badge_h = badge_bbox[3] - badge_bbox[1]
    pad_x, pad_y = 28, 10
    bx = (w - badge_w) // 2 - pad_x
    by = badge_y
    # רקע שחור שקוף לבאדג
    badge_bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bb_draw = ImageDraw.Draw(badge_bg)
    bb_draw.rounded_rectangle(
        [(bx, by), (bx + badge_w + pad_x*2, by + badge_h + pad_y*2)],
        radius=12, fill=(0, 0, 0, 160)
    )
    img = Image.alpha_composite(img, badge_bg)
    draw = ImageDraw.Draw(img)
    draw.text((bx + pad_x, by + pad_y), subtitle, font=font_sub, fill=(255, 180, 40, 240))

    result = img.convert("RGB")
    result.save(output_path, "JPEG", quality=95)
    print(f"✅ נשמר: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("שימוש: python3 add_reel_text.py input.jpg output.jpg 'הטקסט'")
        sys.exit(1)
    add_hook_text(sys.argv[1], sys.argv[2], sys.argv[3])
