#!/usr/bin/env python3
"""
מוסיף כיתוב hook עברי על תמונת רילס 9:16
שימוש: python3 add_reel_text.py input.jpg output.jpg "הטקסט כאן"
"""
import sys
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

def reshape_hebrew(text):
    return get_display(text)

def wrap_rtl(text, max_chars=12):
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

def add_hook_text(input_path, output_path, hook_text, subtitle="Go London"):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size

    # gradient כהה בחלק העליון
    gradient = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_grad = ImageDraw.Draw(gradient)
    grad_height = int(h * 0.50)
    for y in range(grad_height):
        alpha = int(210 * (1 - y / grad_height))
        draw_grad.line([(0, y), (w, y)], fill=(0, 0, 0, alpha))

    img = Image.alpha_composite(img, gradient)
    draw = ImageDraw.Draw(img)

    font_heb = "/System/Library/Fonts/ArialHB.ttc"
    font_lat = "/System/Library/Fonts/Helvetica.ttc"
    font_size = max(72, w // 8)
    try:
        font_main = ImageFont.truetype(font_heb, font_size)
        font_sub = ImageFont.truetype(font_lat, int(font_size * 0.35))
    except:
        font_main = ImageFont.load_default()
        font_sub = font_main

    # שבירת שורות + תיקון RTL
    raw_lines = wrap_rtl(hook_text, max_chars=11)
    lines = [reshape_hebrew(l) for l in raw_lines]

    line_spacing = int(font_size * 1.3)
    start_y = int(h * 0.10)

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_main)
        text_w = bbox[2] - bbox[0]
        x = (w - text_w) // 2
        y = start_y + i * line_spacing

        # outline שחור
        for dx, dy in [(-4,0),(4,0),(0,-4),(0,4),(-3,-3),(3,-3),(-3,3),(3,3)]:
            draw.text((x+dx, y+dy), line, font=font_main, fill=(0, 0, 0, 230))
        # טקסט לבן
        draw.text((x, y), line, font=font_main, fill=(255, 255, 255, 255))

    # subtitle "Go London"
    sub_y = start_y + len(lines) * line_spacing + 8
    sub_bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_x = (w - sub_w) // 2
    draw.text((sub_x, sub_y), subtitle, font=font_sub, fill=(220, 220, 220, 210))

    result = img.convert("RGB")
    result.save(output_path, "JPEG", quality=95)
    print(f"✅ נשמר: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("שימוש: python3 add_reel_text.py input.jpg output.jpg 'הטקסט'")
        sys.exit(1)
    add_hook_text(sys.argv[1], sys.argv[2], sys.argv[3])
