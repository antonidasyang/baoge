"use client";

import { useState, useEffect } from "react";
import { LeopardLogo } from "@/components/LeopardLogo";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export default function ChangelogPage() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/changelog")
      .then((res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.text();
      })
      .then(setContent)
      .catch(() => setError("无法加载 Changelog"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans">
      <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-black/40 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <LeopardLogo className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-sm">豹哥 · 更新日志</span>
          </a>
        </div>
        <a href="/" className="text-[10px] text-white/40 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">
          返回
        </a>
      </header>
      <div className="max-w-3xl mx-auto py-12 px-6">
        {loading && (
          <p className="text-white/40 py-12 text-center">加载中…</p>
        )}
        {error && (
          <p className="text-red-400/80 py-12 text-center">{error}</p>
        )}
        {!loading && !error && content && (
          <div className="pb-24">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </main>
  );
}
