"use client";

import React, { useMemo } from "react";

const VIDA_START_RE = /<\s*VIDA\s+INTERNA\s*>/i;
const VIDA_END_RE = /<\s*\/\s*VIDA\s+INTERNA\s*>/i;
const VIDA_TOKEN_RE = /(<\/?\s*VIDA\s+INTERNA\s*>)/gi;

function normalizeVidaMarkers(html = "") {
  if (!html) return "";
  return html
    .replace(/&lt;\s*VIDA\s+INTERNA\s*&gt;/gi, "<VIDA INTERNA>")
    .replace(/&lt;\s*\/\s*VIDA\s+INTERNA\s*&gt;/gi, "</VIDA INTERNA>");
}

function splitVidaInterna(html = "") {
  const normalized = normalizeVidaMarkers(html);
  const tokens = normalized.split(VIDA_TOKEN_RE);
  const segments = [];
  let buffer = "";
  let insideVida = false;

  const flush = () => {
    if (!buffer.trim()) {
      buffer = "";
      return;
    }
    segments.push({ type: insideVida ? "vida" : "html", content: buffer });
    buffer = "";
  };

  tokens.forEach((token) => {
    if (!token) return;
    if (VIDA_START_RE.test(token)) {
      flush();
      insideVida = true;
      return;
    }
    if (VIDA_END_RE.test(token)) {
      flush();
      insideVida = false;
      return;
    }
    buffer += token;
  });

  flush();
  return segments;
}

export default function ScriptPreview({ html }) {
  const segments = useMemo(() => splitVidaInterna(html || ""), [html]);

  if (!segments.length) {
    return <div dangerouslySetInnerHTML={{ __html: html || "" }} />;
  }

  return (
    <div className="space-y-4">
      {segments.map((segment, index) => {
        if (segment.type === "vida") {
          return (
            <div
              key={`vida-${index}`}
              className="rounded-2xl border border-black/60 bg-white p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-black/70">
                Vida interna
              </p>
              <div
                className="mt-2 text-sm leading-relaxed text-black"
                dangerouslySetInnerHTML={{ __html: segment.content }}
              />
            </div>
          );
        }
        return (
          <div
            key={`html-${index}`}
            className="text-sm leading-relaxed text-black"
            dangerouslySetInnerHTML={{ __html: segment.content }}
          />
        );
      })}
    </div>
  );
}
