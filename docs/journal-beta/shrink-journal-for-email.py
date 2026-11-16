#!/usr/bin/env python3
"""
יומן המסע לילדים, בטא: הקטנת ה-PDF כדי לשלוח אותו כצרופה במייל (בלי קישור, בלי שירות)
=======================================================================================
היומן שיוצא מהמערכת שוקל 20 עד 75 MB, בעיקר בגלל תמונות רקע שכרום מכפיל בכל עמוד. הסקריפט הזה:
  1. ממזג תמונות כפולות (אותו תוכן בדיוק) כך שכל אחת נשמרת פעם אחת.
  2. מקטין תמונות עמוד גדולות ל-200 dpi (צילומים ל-JPEG; קווי צביעה ומדבקות נשארים ללא אובדן).
  3. מקודד מחדש את תמונות הרקע הגדולות (PNG עם שקיפות) כ-JPEG באותן מידות.
ואז מאמת מול המקור: אותו מספר עמודים, אותו טקסט בכל עמוד, ושינוי פיקסלים קטן בכל עמוד.
אם התוצאה עדיין מעל 18 MB (הגבול הבטוח לצרופה ב-Gmail), מנסה שוב ב-150 dpi, ואם גם זה לא מספיק
מפצל לשני חלקים. לא נוגע בטקסט, בפונטים, בווקטורים ובדפוסים.

שימוש (מתיקיית המאגר golondon-kids-journal, אחרי journal_job.py):
    python3 shrink-journal-for-email.py build/pdf/<request_id>.pdf
יוצר build/pdf/<request_id>-email.pdf (או -email-part1.pdf ו--email-part2.pdf). צריך pymupdf ו-Pillow.
"""
import hashlib, io, os, re, sys, time
import fitz
from PIL import Image

LIMIT = 18 * 1024 * 1024          # גבול בטוח לצרופה אחת ב-Gmail (המגבלה הרשמית 25 MB כוללת קידוד)
MAX_PAGE_DIFF = 8.0               # אחוז פיקסלים שהשתנו בעמוד, מעבר לזה הסקריפט מסרב
fitz.TOOLS.mupdf_display_errors(False)

REF = re.compile(r'\b(\d+) 0 R\b')
TOK = re.compile(r'<<|>>|\[|\]|/([^\s/<>\[\]()]+)|(\d+) 0 R|\S')


def ref_paths(text):
    """(path, xref) לכל הפניה שיושבת ישירות תחת מפתח במילון (לא בתוך מערך)."""
    stack, arr, pending = [], 0, None
    for m in TOK.finditer(text):
        t = m.group(0)
        if t == '<<':
            stack.append(pending); pending = None
        elif t == '>>':
            if stack: stack.pop()
            pending = None
        elif t == '[': arr += 1; pending = None
        elif t == ']': arr -= 1
        elif m.group(1) is not None:
            pending = m.group(1) if pending is None else None
        elif m.group(2) is not None:
            if pending is not None and arr == 0:
                yield '/'.join([s for s in stack[1:] if s] + [pending]), int(m.group(2))
            pending = None
        else:
            pending = None


def dedup_images(doc):
    """מיזוג תמונות זהות (זרם זהה ומילון זהה, כולל שרשרת SMask) על ידי הפניית כל המצביעים לעותק אחד."""
    keys = {}
    def key(x, depth=0):
        if x in keys: return keys[x]
        try:
            if depth > 4 or not doc.xref_is_stream(x): keys[x] = 'x%d' % x; return keys[x]
            obj = doc.xref_object(x, compressed=True)
        except Exception:
            keys[x] = 'x%d' % x; return keys[x]
        if '/Image' not in obj: keys[x] = 'x%d' % x; return keys[x]
        norm = REF.sub(lambda m: 'K(' + key(int(m.group(1)), depth + 1) + ')', obj)
        keys[x] = hashlib.sha1((norm + hashlib.sha1(doc.xref_stream_raw(x)).hexdigest()).encode()).hexdigest()
        return keys[x]
    canon, remap = {}, {}
    for x in range(1, doc.xref_length()):
        try:
            if not doc.xref_is_stream(x) or '/Image' not in doc.xref_object(x, compressed=True): continue
        except Exception: continue
        k = key(x)
        if k in canon: remap[x] = canon[k]
        else: canon[k] = x
    n = 0
    for x in range(1, doc.xref_length()):
        if x in remap: continue
        try: obj = doc.xref_object(x, compressed=True)
        except Exception: continue
        for path, ref in list(ref_paths(obj)):
            if ref in remap:
                doc.xref_set_key(x, path, '%d 0 R' % remap[ref]); n += 1
    return len(remap), n


def shrink_page_images(doc, target_dpi, quality):
    """תמונות שמונחות על עמודים: הקטנה ל-target_dpi לפי הגודל שלהן על הדף. PNG נשאר PNG, JPEG נשאר JPEG."""
    done, shrunk = set(), 0
    for page in doc:
        for info in page.get_images(full=True):
            xref = info[0]
            if xref in done: continue
            done.add(xref)
            rects = page.get_image_rects(xref)
            if not rects: continue
            w_pt = max(r.width for r in rects)
            base = doc.extract_image(xref)
            if not base or not w_pt: continue
            dpi = base['width'] / (w_pt / 72)
            if dpi <= target_dpi * 1.1: continue
            pix = fitz.Pixmap(doc, xref)
            if pix.colorspace is None or pix.colorspace.n not in (1, 3, 4): continue
            if pix.colorspace.n == 4: pix = fitz.Pixmap(fitz.csRGB, pix)
            mode = 'RGBA' if pix.alpha else ('RGB' if pix.n - pix.alpha == 3 else 'L')
            im = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
            scale = target_dpi / dpi
            im = im.resize((max(1, round(pix.width * scale)), max(1, round(pix.height * scale))), Image.LANCZOS)
            buf = io.BytesIO()
            if pix.alpha or base['ext'] == 'png': im.save(buf, format='PNG', optimize=True)
            else: im.save(buf, format='JPEG', quality=quality, optimize=True)
            data = buf.getvalue()
            if len(data) >= len(base['image']): continue
            page.replace_image(xref, stream=data); shrunk += 1
    return shrunk


def reencode_background_images(doc, quality, min_pixels=200000):
    """תמונות Flate גדולות בכל מקום במסמך (רקעים בתוך XObject ודפוסים): JPEG באותן מידות, כולל ה-SMask."""
    def to_jpeg(xref, gray):
        pix = fitz.Pixmap(doc, xref)
        if pix.alpha: pix = fitz.Pixmap(pix, 0)
        if gray:
            if pix.n != 1: pix = fitz.Pixmap(fitz.csGRAY, pix)
            im = Image.frombytes('L', (pix.width, pix.height), pix.samples)
        else:
            if pix.n != 3: pix = fitz.Pixmap(fitz.csRGB, pix)
            im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        buf = io.BytesIO(); im.save(buf, format='JPEG', quality=quality, optimize=True)
        return buf.getvalue()
    def set_jpeg(xref, data, gray):
        doc.update_stream(xref, data, compress=False)
        doc.xref_set_key(xref, 'Filter', '/DCTDecode')
        doc.xref_set_key(xref, 'DecodeParms', 'null')
        doc.xref_set_key(xref, 'ColorSpace', '/DeviceGray' if gray else '/DeviceRGB')
        doc.xref_set_key(xref, 'BitsPerComponent', '8')
        doc.xref_set_key(xref, 'Decode', 'null')
    done, n = set(), 0
    for x in range(1, doc.xref_length()):
        try:
            if x in done or not doc.xref_is_stream(x): continue
            obj = doc.xref_object(x, compressed=True)
            if '/Image' not in obj or '/ImageMask' in obj or '/Decode' in obj: continue
            if doc.xref_get_key(x, 'Filter')[1] != '/FlateDecode': continue
            if doc.xref_get_key(x, 'BitsPerComponent')[1] != '8': continue
            w = int(doc.xref_get_key(x, 'Width')[1]); h = int(doc.xref_get_key(x, 'Height')[1])
            if w * h < min_pixels: continue
            gray = doc.xref_get_key(x, 'ColorSpace')[1] == '/DeviceGray'
            smask = doc.xref_get_key(x, 'SMask')
            sm = int(smask[1].split()[0]) if smask[0] == 'xref' else None
            before = len(doc.xref_stream_raw(x)) + (len(doc.xref_stream_raw(sm)) if sm else 0)
            data = to_jpeg(x, gray); sdata = to_jpeg(sm, True) if sm else b''
            if len(data) + len(sdata) >= before * 0.9: continue
            set_jpeg(x, data, gray); done.add(x)
            if sm: set_jpeg(sm, sdata, True); done.add(sm)
            n += 1
        except Exception:
            continue
    return n


def build(src, dst, target_dpi, quality):
    doc = fitz.open(src)
    d1 = dedup_images(doc)
    doc.subset_fonts()
    tmp = dst + '.tmp'
    doc.save(tmp, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True); doc.close()
    doc = fitz.open(tmp)
    s = shrink_page_images(doc, target_dpi, quality)
    r = reencode_background_images(doc, quality)
    doc.save(dst, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True); doc.close()
    os.remove(tmp)
    return {'duplicates_merged': d1[0], 'page_images_shrunk': s, 'backgrounds_reencoded': r}


def verify(src, dst):
    """אותו מספר עמודים, אותו טקסט, ושינוי פיקסלים קטן בכל עמוד (רינדור גס בגווני אפור)."""
    o, c = fitz.open(src), fitz.open(dst)
    if len(o) != len(c): return False, 'page count %d != %d' % (len(o), len(c))
    worst = 0.0
    for i in range(len(o)):
        if o[i].get_text() != c[i].get_text(): return False, 'text differs on page %d' % (i + 1)
        a = o[i].get_pixmap(dpi=40, colorspace=fitz.csGRAY).samples
        b = c[i].get_pixmap(dpi=40, colorspace=fitz.csGRAY).samples
        if len(a) != len(b): return False, 'page size differs on page %d' % (i + 1)
        diff = 100.0 * sum(abs(a[k] - b[k]) > 40 for k in range(len(a))) / len(a)
        worst = max(worst, diff)
        if diff > MAX_PAGE_DIFF: return False, 'page %d changed %.1f%% of pixels' % (i + 1, diff)
    w = fitz.TOOLS.mupdf_warnings()
    if 'error' in w.lower(): return False, 'render errors: ' + w[:200]
    return True, 'worst page diff %.1f%%' % worst


def split(dst):
    doc = fitz.open(dst); half = (len(doc) + 1) // 2
    base = dst[:-4]
    parts = []
    for n, (a, b) in enumerate(((0, half - 1), (half, len(doc) - 1)), 1):
        part = fitz.open(); part.insert_pdf(doc, from_page=a, to_page=b)
        name = '%s-part%d.pdf' % (base, n)
        part.save(name, garbage=4, deflate=True); part.close(); parts.append(name)
    doc.close(); os.remove(dst)
    return parts


def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else re.sub(r'\.pdf$', '', src) + '-email.pdf'
    t = time.time()
    for dpi, q in ((200, 85), (150, 80)):
        stats = build(src, dst, dpi, q)
        size = os.path.getsize(dst)
        ok, why = verify(src, dst)
        print('dpi %d: %.1f MB, %s, %s' % (dpi, size / 1048576, 'verified' if ok else 'REJECTED', why), stats)
        if not ok:
            os.remove(dst); print('FAILED: the shrunk journal does not match the original. Do not send it.'); sys.exit(1)
        if size <= LIMIT: break
    out = [dst]
    if os.path.getsize(dst) > LIMIT:
        out = split(dst); print('still above %d MB: split into two attachments' % (LIMIT // 1048576))
    print('READY %.0f s:' % (time.time() - t), ', '.join('%s (%.1f MB)' % (p, os.path.getsize(p) / 1048576) for p in out))


if __name__ == '__main__':
    main()
