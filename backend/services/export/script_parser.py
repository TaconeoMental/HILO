import os
import re
import html as html_lib

from helpers import encode_image_base64, get_mime_type


VIDA_START_RE = re.compile(r"<\s*VIDA\s+INTERNA\s*>", re.IGNORECASE)
VIDA_END_RE = re.compile(r"<\s*/\s*VIDA\s+INTERNA\s*>", re.IGNORECASE)
IMAGE_RE = re.compile(r"!\[(.*?)\]\((.+?)\)")
STRONG_RE = re.compile(r"\*\*(.+?)\*\*")


def _parse_vida_blocks(vida_content):
    lines = (vida_content or "").split("\n")
    blocks = []
    buffer = []

    def flush_paragraph():
        if buffer:
            blocks.append({"type": "paragraph", "text": "\n".join(buffer)})
            buffer.clear()

    for line in lines:
        stripped = line.strip()
        img_match = IMAGE_RE.match(stripped)
        if img_match:
            flush_paragraph()
            blocks.append({
                "type": "image",
                "alt": img_match.group(1) or "Foto",
                "src": img_match.group(2)
            })
            continue

        buffer.append(line)

    flush_paragraph()
    return blocks


def parse_script(content):
    content = (content or "").strip()
    if not content:
        return []

    lines = content.split("\n")
    nodes = []
    inside_vida = False
    vida_lines = []

    def push_vida():
        vida_content = "\n".join(vida_lines)
        nodes.append({
            "type": "vida",
            "blocks": _parse_vida_blocks(vida_content)
        })

    for line in lines:
        if inside_vida:
            if VIDA_END_RE.search(line):
                inside_vida = False
                push_vida()
                vida_lines = []
                continue
            vida_lines.append(line)
            continue

        if VIDA_START_RE.search(line):
            inside_vida = True
            vida_lines = []
            continue

        if not line.strip():
            nodes.append({"type": "blank"})
            continue

        if line.startswith("# "):
            nodes.append({"type": "heading", "level": 1, "text": line[2:].strip()})
            continue

        if line.startswith("## "):
            nodes.append({"type": "heading", "level": 2, "text": line[3:].strip()})
            continue

        if line.strip() == "---":
            nodes.append({"type": "hr"})
            continue

        img_match = IMAGE_RE.match(line.strip())
        if img_match:
            nodes.append({
                "type": "image",
                "alt": img_match.group(1) or "Foto",
                "src": img_match.group(2)
            })
            continue

        nodes.append({"type": "paragraph", "text": line})

    if inside_vida:
        push_vida()

    return nodes


def _render_text(text):
    escaped = html_lib.escape(text or "")
    escaped = STRONG_RE.sub(r"<strong>\1</strong>", escaped)

    leading_spaces = len(text) - len(text.lstrip(" "))
    if leading_spaces > 0:
        nbsp = "&nbsp;" * leading_spaces
        escaped = nbsp + escaped.lstrip(" ")

    return escaped


def _render_multiline(text):
    lines = (text or "").split("\n")
    rendered_lines = []
    for line in lines:
        if line.strip():
            rendered_lines.append(_render_text(line))
        else:
            rendered_lines.append("&nbsp;")
    return "<br>".join(rendered_lines)


def _safe_image_tag(filename, photos_dir, embed_images):
    safe_name = os.path.basename(filename)
    img_path = os.path.join(photos_dir, safe_name)

    real_photos_dir = os.path.realpath(photos_dir)
    real_img_path = os.path.realpath(img_path)
    if not real_img_path.startswith(real_photos_dir + os.sep):
        return '<div style="text-align: center; margin: 1em 0; padding: 2em; background: #333; border-radius: 8px; color: #999;">[Ruta inválida]</div>'

    if not os.path.exists(img_path):
        return f'<div style="text-align: center; margin: 1em 0; padding: 2em; background: #333; border-radius: 8px; color: #999;">[Imagen no encontrada: {html_lib.escape(safe_name)}]</div>'

    if embed_images:
        b64_data = encode_image_base64(img_path)
        mime = get_mime_type(safe_name) or 'image/jpeg'
        src = f'data:{mime};base64,{b64_data}'
    else:
        src = os.path.join('photos', safe_name)

    return (
        '<div style="display: flex; justify-content: center; margin: 1em 0;">'
        f'<img src="{src}" alt="{html_lib.escape(safe_name)}" '
        'style="max-width: 55%; border-radius: 10px;" />'
        '</div>'
    )


def render_nodes_to_html(nodes, project_dir, embed_images=False):
    photos_dir = os.path.join(project_dir, "photos")
    html_parts = []
    prev_blank = False

    for node in nodes:
        n_type = node.get("type")

        if n_type == "blank":
            if not prev_blank:
                html_parts.append('<div style="height: 1em;"></div>')
            prev_blank = True
            continue

        prev_blank = False

        if n_type == "heading":
            level = node.get("level", 1)
            text = html_lib.escape(node.get("text", ""))
            if level == 1:
                html_parts.append(
                    f'<h1 style="text-align: center; margin: 0 0 0.5em 0; font-size: 26px;">{text}</h1>'
                )
            else:
                html_parts.append(
                    f'<h2 style="margin: 1em 0 0.5em 0; font-size: 20px;">{text}</h2>'
                )
            continue

        if n_type == "hr":
            html_parts.append('<hr style="margin: 1em 0;">')
            continue

        if n_type == "image":
            html_parts.append(_safe_image_tag(node.get("src", ""), photos_dir, embed_images))
            continue

        if n_type == "vida":
            vida_html_parts = []
            for block in node.get("blocks", []):
                b_type = block.get("type")
                if b_type == "image":
                    vida_html_parts.append(_safe_image_tag(block.get("src", ""), photos_dir, embed_images))
                elif b_type == "paragraph":
                    vida_html_parts.append(
                        f'<div style="margin: 0 0 0.75em 0; font-size: 16px; line-height: 1.7; color: #000; white-space: pre-wrap;">{_render_multiline(block.get("text", ""))}</div>'
                    )
            inner_html = "".join(vida_html_parts)
            html_parts.append(
                '<div style="border: 1px solid #111; background: #fff; border-radius: 16px; padding: 16px;">'
                '<p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(0,0,0,0.7);">Vida interna</p>'
                f'<div style="margin-top: 8px; font-size: 16px; line-height: 1.7; color: #000;">{inner_html}</div>'
                '</div>'
            )
            continue

        if n_type == "paragraph":
            text_html = _render_text(node.get("text", ""))
            html_parts.append(
                f'<div style="margin: 0; font-size: 16px; line-height: 1.7; color: #000; white-space: pre-wrap;">{text_html}</div>'
            )
            continue

    return "\n".join(html_parts)
